import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getSearchCorpus } from '@/lib/search/corpus';
import type { JudgeFn, SearchDoc } from '@/lib/search/types';
import { generateCases } from './lib/generate';
import { replayJudge, type Cassette } from './lib/judge';
import { buildReport, type EvalReport } from './lib/report';
import { assertCase, runCase } from './lib/run';
import type { CaseOutcome } from './lib/types';

/**
 * 回放评测（P1）：`npm run eval:replay`
 *
 * 用 `eval:record` 录下的**真实模型答卷**离线复跑全部用例 —— 与 `npm run eval`（中性 stub）
 * 的差别在于 `fit` 是真实的逐本档位：此时 nDCG@10 / Top1 / 档位 MAE 才开始度量
 * 「排序参数到底排得好不好」（门控位置、facet 权重、软先验是否入排序，见 §12.2 Q5）。
 *
 * 三条纪律继承自 run.ts：
 * 1. 每个用例前清空管线缓存（测的不是缓存）；
 * 2. 冻结 `now`（相对时间用例可复现）；
 * 3. 回放 judge 未命中指纹**直接报错**（replayJudge 的行为）—— 不静默编造答案。
 *    出现该错误说明语料或题型变了，需要重新 `npm run eval:record`。
 *
 * 确定性断言照常生效（硬条件 / 否定守卫 / 精确命中 / 降级）—— 真实模型同样不许违反纪律；
 * 排序指标**只记录不断言**：没有人工档次标注（worksheet）前设阈值等于把噪声写进 CI。
 */

const CASSETTE_PATH = path.join(process.cwd(), 'evals', 'runs', 'cassette.json');
const RUNS_DIR = path.join(process.cwd(), 'evals', 'runs');

const outcomes: CaseOutcome[] = [];
let report: EvalReport | null = null;

describe('回放评测（真实答卷 cassette）', () => {
  it('读取 cassette 并用真实答案复跑全部用例', async () => {
    let cassette: Cassette;
    try {
      cassette = JSON.parse(await fs.readFile(CASSETTE_PATH, 'utf8')) as Cassette;
    } catch {
      throw new Error(
        `未找到 cassette（${CASSETTE_PATH}）。请先运行 \`npm run eval:record\` 录制真实答卷。`
      );
    }
    expect(cassette.version).toBe(1);
    expect(cassette.entries.length).toBeGreaterThan(0);

    const corpus: SearchDoc[] = await getSearchCorpus();
    const cases = generateCases(corpus);
    const replay: JudgeFn = replayJudge(cassette).judge;

    const failures: string[] = [];
    for (const testCase of cases) {
      const outcome = await runCase(testCase, corpus, { judge: replay });
      outcomes.push(outcome);
      failures.push(...assertCase(outcome));
    }

    report = buildReport(outcomes, failures);

    await fs.mkdir(RUNS_DIR, { recursive: true });
    await fs.writeFile(path.join(RUNS_DIR, 'replay-latest.json'), JSON.stringify(report.json, null, 2), 'utf8');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(path.join(RUNS_DIR, `replay-${stamp}.md`), report.markdown, 'utf8');

    console.log(`\n${report.markdown}`);

    expect(failures, `回放的确定性断言失败：\n${failures.join('\n')}`).toEqual([]);
  }, 300_000);
});

afterAll(() => {
  if (!report) return;
  console.log(
    `\n[回放] 用例 ${report.caseCount} 条｜nDCG@10 ${report.overall.nDCG10?.toFixed(3) ?? '—'}｜Recall@40 ${
      report.overall.recall40 === null ? '—' : `${(report.overall.recall40 * 100).toFixed(1)}%`
    }｜档位 MAE ${report.overall.gradeMae?.toFixed(2) ?? '—'}（真实 fit，可据此评排序参数）\n`
  );
});
