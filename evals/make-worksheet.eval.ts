import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { getSearchCorpus } from '@/lib/search/corpus';
import type { SearchDoc } from '@/lib/search/types';
import { generateCases } from './lib/generate';
import { runCase } from './lib/run';

/**
 * 人工标注工作表（P1 的准备）：`npm run eval:worksheet`
 *
 * 自动层只覆盖结构真值；**「这本书到底有没有回答这个问题」只能由人判**。
 * 本脚本把每条用例的候选池（含模型档位预判）摊成一张可勾选的表：
 * 人工只需给每行填 0–3（与生产 `FIT_LEVELS` 同一把尺子），再回填成 `labels`。
 *
 * 输出：`evals/runs/worksheet.md`（给人看）+ `worksheet.json`（给下一步程序读）。
 */

const RUNS_DIR = path.join(process.cwd(), 'evals', 'runs');
const CANDIDATES_PER_CASE = 12;
const CONCEPT_SLOTS = 20;

const clip = (text: string, max = 80): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

const LEVEL_HINT = ['不相关', '主题邻接', '部分相关', '直接回应'];

describe('人工标注工作表', () => {
  it('生成候选池与空档位表', async () => {
    const corpus = await getSearchCorpus();
    const docs = new Map(corpus.map(doc => [doc.id, doc]));
    const cases = generateCases(corpus);

    const lines: string[] = [
      '# 相关性标注工作表',
      '',
      '对每个候选按 0–3 打分（与生产 `FIT_LEVELS` 完全同一把尺子）：',
      ...LEVEL_HINT.map((hint, level) => `- **${level}** ${hint}`),
      '',
      '> 先独立判，再看 `预判` 一列 —— 被预判带偏会让指标虚高。',
      '> 候选池 = 本用例「结果 + 加载更多」的全量已判分候选（即融合后的 top-40）。',
      ''
    ];

    const worksheet: Record<string, unknown>[] = [];

    for (const testCase of cases) {
      const outcome = await runCase(testCase, corpus);
      const candidates = outcome.ranked.slice(0, CANDIDATES_PER_CASE);
      lines.push(`## ${testCase.id}｜${testCase.query}`, '', `- 分层：\`${testCase.stratum}\``, '');
      lines.push('| 档位 | 条码 | 书名 | 作者 | 年份 | 中图法 | 预判 | 摘要 |');
      lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');

      const rows = candidates.map(docId => {
        const doc: SearchDoc | undefined = docs.get(docId);
        if (!doc) {
          return { docId, title: '（语料中已消失）', level: null };
        }
        const fit = outcome.fits[docId];
        const predicted = fit === null || fit === undefined ? null : Math.round(fit * 3);
        lines.push(
          `| ☐ | ${doc.id} | ${clip(doc.book.title, 30)} | ${clip(doc.book.author, 12)} | ${
            doc.numeric.pubYear || '—'
          } | ${doc.exact.callNumber || '—'} | ${predicted === null ? '—' : `${predicted} ${LEVEL_HINT[predicted]}`} | ${clip(
            doc.fields.reason || doc.fields.summary,
            46
          )} |`
        );
        return {
          docId: doc.id,
          title: doc.book.title,
          hash: doc.hash,
          predictedLevel: predicted,
          label: null
        };
      });

      worksheet.push({
        id: testCase.id,
        stratum: testCase.stratum,
        query: testCase.query,
        mode: testCase.mode,
        frozenNow: testCase.frozenNow,
        truthSource: testCase.truthSource,
        candidates: rows
      });
      lines.push('');
    }

    lines.push('## 待补：概念 / 情绪 / 场景类查询（自动层覆盖不到）', '');
    lines.push('这些查询的相关性真值只能由人判。填好 query 后重跑本脚本即可生成对应候选池。', '');
    for (let i = 0; i < CONCEPT_SLOTS; i += 1) {
      lines.push(`- [ ] \`concept-${String(i + 1).padStart(3, '0')}\`：______`);
    }
    lines.push('');

    await fs.mkdir(RUNS_DIR, { recursive: true });
    await fs.writeFile(path.join(RUNS_DIR, 'worksheet.md'), lines.join('\n'), 'utf8');
    await fs.writeFile(
      path.join(RUNS_DIR, 'worksheet.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), cases: worksheet }, null, 2),
      'utf8'
    );
  }, 180_000);
});
