import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { getSearchCorpus } from '@/lib/search/corpus';
import type { SearchDoc } from '@/lib/search/types';
import { generateCases } from './lib/generate';
import { metricsFor } from './lib/report';
import { runCase } from './lib/run';
import type { CaseOutcome } from './lib/types';

/**
 * 阈值扫描（度量工具，**不做断言**）：`npm run eval:sweep`
 *
 * 它回答的问题是「参数怎么影响指标」，**不改任何默认值**。改 `tuning.ts` 里的默认值是另一步决策，
 * 需要：① 曲线单调且幅度超过噪声；② 在**留出集**上复核（拿同一批用例调参等于过拟合）。
 *
 * ⚠️ 阅读这份报表前必须知道的一件事：自动真值层用的是**中性 stub**（`fit` 恒定），
 * 因此 `FIT_GATE_POSITION` / facet 权重这类「排序质量」参数的曲线是**退化的**——
 * 它只能证明「哪一端会让本该有答案的查询变空」，无法回答「哪个值排得更好」。
 * 要得到有分辨力的曲线，先要 P1：人工档次标注（`npm run eval:worksheet`）+ 真实答卷 cassette。
 */

interface ParamSpec {
  env: string;
  label: string;
  values: (number | string)[];
}

const PARAMS: ParamSpec[] = [
  {
    env: 'SEMANTIC_SEARCH_FIT_GATE_POSITION',
    label: '门控位置（档位）',
    values: [0, 0.9, 1.5, 1.8, 2.1, 2.6]
  },
  { env: 'SEMANTIC_SEARCH_W_FACET', label: 'W_FACET', values: [0, 0.2, 0.5, 1] },
  { env: 'SEMANTIC_SEARCH_FACET_WEIGHT_RECENT', label: 'facet.recent', values: [0, 0.25, 0.5] },
  { env: 'SEMANTIC_SEARCH_FACET_WEIGHT_THEORY', label: 'facet.theory', values: [0, 0.2, 0.5] },
  { env: 'SEMANTIC_SEARCH_RRF_K', label: 'RRF_K', values: [1, 10, 60, 200] },
  { env: 'SEMANTIC_SEARCH_UNSEEN_TERM_IDF', label: 'unseenTermIdf', values: [0.1, 1, 5] }
];

const RUNS_DIR = path.join(process.cwd(), 'evals', 'runs');

const fmt = (value: number | null, digits = 3): string =>
  value === null ? '—' : value.toFixed(digits);
const pct = (value: number | null, digits = 1): string =>
  value === null ? '—' : `${(value * 100).toFixed(digits)}%`;

async function sweepParam(
  spec: ParamSpec,
  corpus: SearchDoc[],
  cases: ReturnType<typeof generateCases>
): Promise<string[]> {
  const previous = process.env[spec.env];
  const rows: string[] = [`| ${spec.label} | 取值 | nDCG@10 | Recall@40 | Top1 | 弃权准确 | 误弃权 | 硬条件违规 | 平均Jev |`];
  rows.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const value of spec.values) {
    process.env[spec.env] = String(value);
    const outcomes: CaseOutcome[] = [];
    for (const testCase of cases) {
      outcomes.push(await runCase(testCase, corpus));
    }
    const metrics = metricsFor(outcomes, 'all');
    rows.push(
      `| ${spec.label} | \`${String(value)}\` | ${fmt(metrics.nDCG10)} | ${pct(metrics.recall40)} | ${pct(
        metrics.top1,
        0
      )} | ${pct(metrics.abstainAccuracy, 0)} | ${pct(metrics.falseAbstainRate, 0)} | ${pct(
        metrics.constraintViolationRate
      )} | ${fmt(metrics.meanJudgeCalls, 1)} |`
    );
  }

  if (previous === undefined) delete process.env[spec.env];
  else process.env[spec.env] = previous;
  return rows;
}

describe('阈值扫描', () => {
  it('逐参数逐取值跑全量用例并输出报表', async () => {
    const corpus = await getSearchCorpus();
    const cases = generateCases(corpus);

    const sections: string[] = [
      '# 阈值扫描报表',
      '',
      `> 生成于 ${new Date().toISOString()}｜用例 ${cases.length} 条｜judge = 中性 stub`,
      '>',
      '> **本报表不做断言**：自动层的相关性标签是结构真值（「正确书就是这一本」），',
      '> 排序质量指标天然饱和；`fit` 恒定时门控曲线是**阶跃**而非曲线。',
      '> 结论只在 P1（人工档次标注 + 真实答卷）之后才可用于调整 `tuning.ts` 的默认值。',
      ''
    ];

    for (const spec of PARAMS) {
      sections.push(`## ${spec.label}（\`${spec.env}\`）`, '');
      sections.push(...(await sweepParam(spec, corpus, cases)));
      sections.push('');
    }

    await fs.mkdir(RUNS_DIR, { recursive: true });
    await fs.writeFile(path.join(RUNS_DIR, 'sweep.md'), sections.join('\n'), 'utf8');
    console.log(`\n${sections.join('\n')}`);
  }, 300_000);
});
