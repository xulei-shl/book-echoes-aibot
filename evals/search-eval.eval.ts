import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getSearchCorpus } from '@/lib/search/corpus';
import { generateCases } from './lib/generate';
import { buildReport, type EvalReport } from './lib/report';
import { assertCase, runCase } from './lib/run';
import type { CaseOutcome } from './lib/types';

/**
 * 检索评测（P0）：全部自动真值、离线、不需要 Jev key。
 *
 * 跑法：`npm run eval`
 * - 输出：`evals/runs/latest.json`（逐条观测）+ 时间戳 markdown 报表；
 * - 断言：**确定性行为**（硬条件是否生效、否定守卫、精确命中 0 次 Jev、非预期降级、条件违规）
 *   —— 任何一条红都说明回归，不依赖阈值基线。
 * - 排序质量指标（nDCG@10 / Recall@40）**只记录不断言**：没有人工相关性标注之前，
 *   对它们设阈值等于把噪声写进 CI。
 */

const RUNS_DIR = path.join(process.cwd(), 'evals', 'runs');
const MIN_CORPUS_SIZE = 50;

const outcomes: CaseOutcome[] = [];
let report: EvalReport | null = null;

describe('检索评测集（自动真值层）', () => {
  it('语料可用（否则评测是空转，必须响亮失败）', async () => {
    const corpus = await getSearchCorpus();
    expect(
      corpus.length,
      `public/content 只读到 ${corpus.length} 本馆藏；评分与召回都建立在真实语料上，低于 ${MIN_CORPUS_SIZE} 本视为语料缺失`
    ).toBeGreaterThanOrEqual(MIN_CORPUS_SIZE);
  });

  it(
    '全部用例的确定性断言通过（硬条件 / 否定守卫 / 精确命中 / 降级 / 违规）',
    async () => {
      const corpus = await getSearchCorpus();
      const cases = generateCases(corpus);

      const failures: string[] = [];
      for (const testCase of cases) {
        const outcome = await runCase(testCase, corpus);
        outcomes.push(outcome);
        failures.push(...assertCase(outcome));
      }

      report = buildReport(outcomes, failures);

      // 报表始终写出：红了也要能看到逐条观测，而不是只看到一句 "expected 0 to be 1"
      await fs.mkdir(RUNS_DIR, { recursive: true });
      await fs.writeFile(path.join(RUNS_DIR, 'latest.json'), JSON.stringify(report.json, null, 2), 'utf8');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(path.join(RUNS_DIR, `${stamp}.md`), report.markdown, 'utf8');

      // 控制台里只打表，不打 100 行明细
      console.log(`\n${report.markdown}`);

      expect(failures, `确定性断言失败：\n${failures.join('\n')}`).toEqual([]);
    },
    180_000
  );
});

afterAll(() => {
  if (!report) return;
  console.log(
    `\n用例 ${report.caseCount} 条｜nDCG@10 ${report.overall.nDCG10?.toFixed(3) ?? '—'}｜Recall@40 ${
      report.overall.recall40 === null ? '—' : `${(report.overall.recall40 * 100).toFixed(1)}%`
    }｜平均 Jev ${report.overall.meanJudgeCalls?.toFixed(1) ?? '—'} 次\n`
  );
});
