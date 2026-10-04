import { describe, expect, it } from 'vitest';
import { contentHash, dedupeByBarcode as corpusDedupe, type SearchDoc } from '@/lib/search/corpus';
import { FIELD_WEIGHTS } from '@/lib/search/tuning';
import {
  buildEncodedText,
  contentHash as buildScriptHash,
  dedupeByBarcode as scriptDedupe
} from '../../../scripts/build-search-vectors.mjs';

/**
 * 建库脚本（`scripts/build-search-vectors.mjs`）与运行期约定之间的**一致性守卫**。
 *
 * 这两侧只能靠注释口头同步，而任何一侧改动时另一侧都不会报错：
 * 脚本按内容哈希做增量复用，运行期按 `FIELD_WEIGHTS` 建 BM25 索引。
 * 一旦字段取舍分叉，症状是「向量文件里的书和 BM25 索引的书不是同一批内容」，
 * 且现有测试全都不会失败 —— 这条测试就是为这种情况存在的。
 */

/** 一份最小但字段齐全的原始 metadata 条目（键名即 `public/content` 里的中文键）。 */
const RAW_ITEM = {
  书目条码: '54121111126000',
  豆瓣书名: '焦虑的意义',
  豆瓣副标题: '存在主义与心理治疗',
  豆瓣作者: '罗洛·梅',
  豆瓣译者: '朱侃如',
  豆瓣出版社: '广西师范大学出版社',
  豆瓣出版年: '2010',
  索书号: 'B842.6/4895',
  初评理由: '从存在主义角度理解焦虑',
  豆瓣内容简介: '本书把焦虑当作一种存在处境来讨论，而不是待消除的症状。',
  豆瓣作者简介: '罗洛·梅（1909—1994），美国存在主义心理学家。',
  豆瓣目录: '第一章 焦虑的意义'
};

/** `SearchFields` 的每个字段在原始条目里对应哪个值；`subjects` 由索书号拼成。 */
const VECTOR_FIELD_VALUES: Record<string, string> = {
  title: RAW_ITEM.豆瓣书名,
  subtitle: RAW_ITEM.豆瓣副标题,
  author: RAW_ITEM.豆瓣作者,
  translator: RAW_ITEM.豆瓣译者,
  publisher: RAW_ITEM.豆瓣出版社,
  subjects: RAW_ITEM.索书号,
  reason: RAW_ITEM.初评理由,
  summary: RAW_ITEM.豆瓣内容简介
};

const encoded = (authorBio = true): string =>
  buildEncodedText(RAW_ITEM as unknown as Record<string, string>, { authorBio });

describe('build-search-vectors / 与运行期的一致性', () => {
  it('contentHash 与语料侧是同一个 FNV-1a（脚本注释承诺「相同的 FNV-1a」）', () => {
    const samples = [
      '',
      'a',
      '焦虑的意义',
      'B842.6/4895',
      '罗洛·梅（1909—1994）',
      'x'.repeat(1000)
    ];
    for (const sample of samples) {
      expect(buildScriptHash(sample)).toBe(contentHash(sample));
    }
  });

  it('contentHash 的取值被钉住（改算法会让增量复用与指纹同时失真，必须是有意为之）', () => {
    // 空串 = FNV 偏移基数，用于确认种子没被改过
    expect(contentHash('')).toBe('811c9dc5');
    expect(contentHash('a')).toBe('e40c292c');
    expect(contentHash('焦虑的意义')).toBe('08f7ced8');
    expect(contentHash('B842.6/4895')).toBe('45ca06f8');
  });

  it('编码文本覆盖全部参与检索的字段（书名/副标题/作者/译者/出版社/年份/索书号/理由/简介）', () => {
    const text = encoded();
    for (const value of [
      RAW_ITEM.豆瓣书名,
      RAW_ITEM.豆瓣副标题,
      RAW_ITEM.豆瓣作者,
      RAW_ITEM.豆瓣译者,
      RAW_ITEM.豆瓣出版社,
      RAW_ITEM.豆瓣出版年,
      RAW_ITEM.索书号,
      RAW_ITEM.初评理由,
      RAW_ITEM.豆瓣内容简介
    ]) {
      expect(text).toContain(value);
    }
  });

  it('两侧字段取舍的差异只有「目录」一项：BM25 收录、向量不收录（§5.4.1）', () => {
    const text = encoded();
    const missing = Object.keys(FIELD_WEIGHTS).filter(
      field => !(field in VECTOR_FIELD_VALUES) || !text.includes(VECTOR_FIELD_VALUES[field])
    );
    // 新增检索字段时这里会变长 —— 那正是要你做决定（进向量还是只进 BM25）的时刻
    expect(missing).toEqual(['toc']);
  });

  it('作者简介是可选开关：默认编入，--no-author-bio 时不编入', () => {
    expect(encoded(true)).toContain(RAW_ITEM.豆瓣作者简介);
    expect(encoded(false)).not.toContain(RAW_ITEM.豆瓣作者简介);
  });
});

describe('build-search-vectors / 重复条码的去重与语料侧一致', () => {
  /** 真实存在的碰撞：同一本书被策展进月份牌和主题牌，两份 metadata 各有一行且初评理由不同。 */
  const monthRow = { id: '54121109513336', sourceId: '2025-11', hash: 'f109dfd3', text: '月份牌理由' };
  const subjectRow = { id: '54121109513336', sourceId: '2025-subject-digital-heritage-dance', hash: '9f577e10', text: '主题牌理由' };
  const otherRow = { id: '54121111126000', sourceId: '2025-12', hash: 'aaaaaaaa', text: '别的书' };

  it('同一条码只留一行，且保留来源优先级更高的一侧（subject 胜过 month）', () => {
    // 遍历顺序是 month 在前、subject 在后，与 collectEntries 的目录顺序一致
    const deduped = scriptDedupe([monthRow, subjectRow, otherRow]);
    expect(deduped).toHaveLength(2);
    const merged = deduped.find(entry => entry.id === '54121109513336');
    expect(merged?.sourceId).toBe('2025-subject-digital-heritage-dance');
    expect(merged?.alsoIn).toEqual(['2025-11']);
  });

  it('留下的那行用的是胜者自己的 hash 与文本（否则向量编码的是被丢弃的那份初评理由）', () => {
    const merged = scriptDedupe([monthRow, subjectRow]).find(
      entry => entry.id === '54121109513336'
    );
    expect(merged?.hash).toBe('9f577e10');
    expect(merged?.text).toBe('主题牌理由');
  });

  it('去重结果与 lib/search/corpus.ts 的 dedupeByBarcode 逐条一致', () => {
    // 两侧只能靠注释同步：不一致时向量文件会比运行期语料多出行，
    // 而按 docId 融合（lib/search/fusion.ts）会把重复行静默合并掉 —— 不会有任何报错。
    const rows = [
      monthRow,
      { id: '54121111298497', sourceId: '2025-literature-Wrong-Turn', hash: 'bbbbbbbb', text: '文学' },
      { id: '54121112060567', sourceId: '2026-sleeping-2026-01', hash: 'cccccccc', text: '睡美人' },
      subjectRow,
      otherRow,
      { id: '54121111298497', sourceId: '2025-10', hash: 'dddddddd', text: '同书在月份牌' }
    ];
    const fromScript = scriptDedupe(rows);
    // dedupeByBarcode 只读 id / sourceId 并写 alsoIn，不碰 SearchDoc 的其余字段，
    // 因此这里可以只借用去重相关的形状来比较。
    const fromCorpus = corpusDedupe(rows as unknown as SearchDoc[]);
    expect(fromScript.map(({ id, sourceId, alsoIn }) => ({ id, sourceId, alsoIn }))).toEqual(
      fromCorpus.map(({ id, sourceId, alsoIn }) => ({ id, sourceId, alsoIn }))
    );
  });

  it('同优先级的两份保留先到的那条（与 corpus.ts 的 incomingRank < existingRank 一致）', () => {
    const first = { id: '54121111111111', sourceId: '2025-03', hash: '11111111', text: '先' };
    const second = { id: '54121111111111', sourceId: '2025-04', hash: '22222222', text: '后' };
    const [merged] = scriptDedupe([first, second]);
    expect(merged.text).toBe('先');
    expect(merged.alsoIn).toEqual(['2025-04']);
  });
});
