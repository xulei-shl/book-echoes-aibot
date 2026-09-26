import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSearchCorpus } from '@/lib/search/corpus';
import { systemOne } from '@/lib/jev/client';
import { resetPipelineState } from '@/lib/search/judge-cache';
import type { JudgeFn, SearchDoc } from '@/lib/search/types';
import { generateCases } from './lib/generate';
import { recordJudge, type Cassette } from './lib/judge';
import { runCase } from './lib/run';

/**
 * 录制真实答卷 cassette（P1 的前置）：`npm run eval:record`
 *
 * 为什么需要它：自动层的 stub `fit` 恒定，排序质量指标（nDCG@10）对排序参数**没有分辨力**
 * （见 sweep.eval.ts 的警告与 §12.2 Q5）。录一次真实模型答卷后，门控、facet 权重、
 * 软先验排序这类参数都能**离线**用同一份答卷反复评测，零 Jev 成本、可复现。
 *
 * 成本：43 条用例 × 3 次 Jev 请求（① / ①b / ③）≈ 130 次请求，fast 模式，单次检索延迟 ~1–3 s。
 * 产物：`evals/runs/cassette.json`（已被 .gitignore 忽略 —— 模型答案会随语料与模型版本漂移，
 * 不适合当作仓库内容提交；要共享时手动传）。
 *
 * 幂等性：cassette 按「题目集合 + 选项集合 + 档位数」指纹去重（`requestKey`），
 * 同一指纹只录一次；重跑只会补录缺失的指纹。
 *
 * ⚠️ 网络抖动容忍：远端 Jev 偶发 `fetch failed`（实测 ~3% 请求），管线会按设计降级
 * （`understand` / `rerank` 等降级码）。这不是录制脚本的问题，也不该让整个录制红掉 ——
 * 补救方式是**重跑本脚本**：cassette 按指纹增量补录，已录到的答案不会重花钱。
 * 因此降级不进断言，只打印提醒；用例本身的**错误**仍然失败（那说明链路真的断了）。
 */

const CASSETTE_PATH = path.join(process.cwd(), 'evals', 'runs', 'cassette.json');
const MIN_CORPUS_SIZE = 50;

/** 每分钟 Jev 预算默认 60；录制时显式抬高，避免 43 条用例的 wide/rerank 撞预算降级 */
process.env.SEMANTIC_SEARCH_JEV_BUDGET_PER_MIN = '600';

describe('录制真实答卷 cassette', () => {
  it('跑全部用例（fast）并把真实答案写进 cassette.json', async () => {
    const corpus: SearchDoc[] = await getSearchCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(MIN_CORPUS_SIZE);

    let cassette: Cassette;
    try {
      cassette = JSON.parse(await fs.readFile(CASSETTE_PATH, 'utf8')) as Cassette;
    } catch {
      cassette = { version: 1, recordedAt: new Date().toISOString(), entries: [] };
    }
    const before = cassette.entries.length;

    const inner: JudgeFn = (request, signal) => systemOne(request, { signal });
    const recording: JudgeFn = recordJudge(inner, cassette);

    const cases = generateCases(corpus).filter(testCase => testCase.mode !== 'deep');
    const failures: string[] = [];
    const degradedCodes = new Map<string, number>();
    for (const testCase of cases) {
      // 录制同样要逐条清缓存：否则后续用例复用前面的模型结论，录到的指纹变少、回放时反而缺失
      resetPipelineState();
      const outcome = await runCase(testCase, corpus, { judge: recording });
      if (outcome.error) {
        failures.push(`${testCase.id}: ${outcome.error}`);
      }
      for (const code of outcome.degraded) {
        // 降级多为远端抖动（重跑即补录），不进断言；但必须可见，否则「为什么指纹少了」无从排查
        degradedCodes.set(code, (degradedCodes.get(code) ?? 0) + 1);
      }
    }

    cassette.recordedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(CASSETTE_PATH), { recursive: true });
    await fs.writeFile(CASSETTE_PATH, JSON.stringify(cassette, null, 2), 'utf8');

    console.log(
      `\ncassette：录制前 ${before} 条指纹 → 录制后 ${cassette.entries.length} 条（+${cassette.entries.length - before}）\n` +
        `用例 ${cases.length} 条｜错误 ${failures.length} 条\n` +
        (degradedCodes.size > 0
          ? `降级（网络抖动所致，重跑可补录）：${[...degradedCodes.entries()].map(([code, count]) => `${code}×${count}`).join('、')}\n`
          : '')
    );

    expect(failures, `录制失败：\n${failures.join('\n')}`).toEqual([]);
    // 每条非 exact 用例至少要产生 3 类指纹（意图 / 类目 / 精排），否则回放会缺
    expect(cassette.entries.length).toBeGreaterThan(before);
  }, 600_000);
});
