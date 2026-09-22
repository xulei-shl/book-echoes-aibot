import { FIT_LEVELS } from '@/lib/search/levels';
import {
  abstainScore,
  constraintViolationRate,
  formatNum,
  formatPct,
  gradeError,
  mean,
  nDCGAt,
  recallAt,
  top1IsRelevant,
  type AbstainPair,
  type GradePair
} from './metrics';
import type { CaseOutcome, Stratum } from './types';

/**
 * 报表：把 60–100 条用例压成「一眼能看出哪一层退化了」的表。
 *
 * 两条纪律：
 * - **无样本计入 null 而非 0** —— 「无解查询」的 nDCG 不该被算成全错；
 * - **确定性断言（failures）与排序质量（metrics）分开呈现** —— 前者是回归门，后者需要基线比较。
 */

export interface StratumMetrics {
  stratum: Stratum | 'all';
  cases: number;
  nDCG10: number | null;
  recall40: number | null;
  top1: number | null;
  gradeMae: number | null;
  gradeWithinOne: number | null;
  gradeSamples: number;
  abstainAccuracy: number | null;
  falseAbstainRate: number | null;
  constraintViolationRate: number | null;
  meanJudgeCalls: number | null;
  p50Ms: number | null;
}

const STDDEV_LABEL = (stratum: Stratum | 'all'): string => (stratum === 'all' ? '全部' : stratum);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function metricsFor(outcomes: CaseOutcome[], stratum: Stratum | 'all'): StratumMetrics {
  const gradePairs: GradePair[] = [];
  const abstainPairs: AbstainPair[] = [];
  const ndcg: (number | null)[] = [];
  const recall: (number | null)[] = [];
  const top1: (boolean | null)[] = [];
  const violation: (number | null)[] = [];
  const calls: number[] = [];
  const timings: number[] = [];

  for (const outcome of outcomes) {
    const { case: testCase } = outcome;
    ndcg.push(nDCGAt(outcome.ranked, testCase.labels, 10));
    recall.push(recallAt(outcome.ranked, testCase.labels, 40));
    top1.push(top1IsRelevant(outcome.ranked, testCase.labels));
    violation.push(constraintViolationRate(outcome.violations, outcome.ranked));
    calls.push(outcome.judgeCalls);
    timings.push(outcome.timingMs);
    abstainPairs.push({
      expectAbstain: testCase.expectAbstain ?? false,
      abstained: outcome.abstained
    });
    for (const [docId, level] of Object.entries(testCase.labels)) {
      const fit = outcome.fits[docId];
      gradePairs.push({
        fitPosition: fit === undefined || fit === null ? null : fit * (FIT_LEVELS.length - 1),
        level
      });
    }
  }

  const grades = gradeError(gradePairs);
  const abstain = abstainScore(abstainPairs);
  return {
    stratum,
    cases: outcomes.length,
    nDCG10: mean(ndcg),
    recall40: mean(recall),
    top1: mean(top1.map(value => (value === null ? null : value ? 1 : 0))),
    gradeMae: grades.mae,
    gradeWithinOne: grades.withinOne,
    gradeSamples: grades.count,
    abstainAccuracy: abstain.accuracy,
    falseAbstainRate: abstain.falseAbstainRate,
    constraintViolationRate: mean(violation),
    meanJudgeCalls: mean(calls),
    p50Ms: median(timings)
  };
}

const COLUMNS: { key: keyof StratumMetrics; label: string; format: (value: number | null) => string }[] = [
  { key: 'nDCG10', label: 'nDCG@10', format: value => formatNum(value) },
  { key: 'recall40', label: 'Recall@40', format: value => formatPct(value) },
  { key: 'top1', label: 'Top1 相关', format: value => formatPct(value, 0) },
  { key: 'gradeMae', label: '档位MAE', format: value => formatNum(value, 2) },
  { key: 'gradeWithinOne', label: '±1档', format: value => formatPct(value, 0) },
  { key: 'abstainAccuracy', label: '弃权准确', format: value => formatPct(value, 0) },
  { key: 'falseAbstainRate', label: '误弃权', format: value => formatPct(value, 0) },
  { key: 'constraintViolationRate', label: '硬条件违规', format: value => formatPct(value) },
  { key: 'meanJudgeCalls', label: '平均Jev', format: value => formatNum(value, 1) },
  { key: 'p50Ms', label: 'P50ms', format: value => formatNum(value, 0) }
];

function renderTable(rows: StratumMetrics[]): string {
  const header = ['分层', '用例', ...COLUMNS.map(column => column.label)];
  const separator = header.map(() => '---');
  const body = rows.map(row => [
    STDDEV_LABEL(row.stratum),
    String(row.cases),
    ...COLUMNS.map(column => column.format(row[column.key] as number | null))
  ]);
  return [header, separator, ...body]
    .map(cells => `| ${cells.join(' | ')} |`)
    .join('\n');
}

export interface EvalReport {
  generatedAt: string;
  caseCount: number;
  overall: StratumMetrics;
  strata: StratumMetrics[];
  failures: string[];
  markdown: string;
  json: Record<string, unknown>;
}

export function buildReport(outcomes: CaseOutcome[], failures: string[]): EvalReport {
  const strata = [...new Set(outcomes.map(outcome => outcome.case.stratum))].sort();
  const rows: StratumMetrics[] = [
    metricsFor(outcomes, 'all'),
    ...strata.map(stratum => metricsFor(outcomes.filter(o => o.case.stratum === stratum), stratum))
  ];
  const overall = rows[0];

  const failureSection =
    failures.length === 0
      ? '✅ 确定性断言全部通过（硬条件、精确命中、否定守卫、降级、违规）'
      : `❌ ${failures.length} 条断言失败：\n${failures.map(item => `- ${item}`).join('\n')}`;

  const notes: string[] = [
    '- 自动层用**中性 stub**（`fit` 恒定），所以 nDCG / Top1 只验证「候选结构对不对」，',
    '  **不代表模型的排序质量**；档位 MAE 在这里量的是 stub 而非模型。',
    '- 真实排序质量需要：`evals/runs/worksheet.md` 的人工档次标注（P1）+ 回放的真实答卷（cassette）。'
  ];
  if (overall.falseAbstainRate !== null && overall.falseAbstainRate > 0) {
    notes.push(
      `- 误弃权 ${formatPct(overall.falseAbstainRate)}：门控（\`fitGatePosition\`）偏严时这一项先涨。`
    );
  }
  notes.push(
    '- `concept` / `similar` / `list` 层未纳入自动评测：它们的档次真值只能由人标注，见 `npm run eval:worksheet`。'
  );

  const markdown = [
    `# 检索评测报表（${new Date().toISOString()}）`,
    '',
    `用例数：**${outcomes.length}**`,
    '',
    renderTable(rows),
    '',
    '## 确定性断言',
    '',
    failureSection,
    '',
    '## 读法',
    '',
    ...notes,
    ''
  ].join('\n');

  return {
    generatedAt: new Date().toISOString(),
    caseCount: outcomes.length,
    overall,
    strata: rows.slice(1),
    failures,
    markdown,
    json: {
      generatedAt: new Date().toISOString(),
      caseCount: outcomes.length,
      overall,
      strata: rows.slice(1),
      failures,
      perCase: outcomes.map(outcome => ({
        id: outcome.case.id,
        stratum: outcome.case.stratum,
        query: outcome.case.query,
        basedOn: outcome.basedOn,
        abstained: outcome.abstained,
        applied: outcome.applied,
        droppedCount: outcome.droppedCount,
        rankedTop10: outcome.ranked.slice(0, 10),
        violations: outcome.violations.length,
        judgeCalls: outcome.judgeCalls,
        degraded: outcome.degraded
      }))
    }
  };
}
