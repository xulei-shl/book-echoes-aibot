import { normalizeText } from '@/lib/search/tokenize';
import type { SearchDoc } from '@/lib/search/types';
import type { QueryCase } from './types';

/**
 * 自动生成「真值可从语料本身算出来」的用例。
 *
 * 四层（+ 一个确定性陷阱层）都不需要人的判断，因此可以进 CI 当回归门：
 * - `exact`：查询 = 该书的完整书名 / ISBN / 条码 → 正确答案就是这一本，且必须走本地权威分支（0 次 Jev）。
 * - `work`：查询 = 作者名 → 作者名下的全部馆藏都是正确候选（recall@40 必须为 1）。
 * - `constraint`：查询由书籍数值字段反向生成 → 真值由 `numeric` 直接推出（满足条件的留下、不满足的出局）。
 * - `constraint-trap`：否定 / 上界表达 → 条件必须被守卫拦下（宁可不过滤，也不能反向执行）。
 * - `trap`：用「几乎是通用词」的书名查询 → 不得被误当成精确命中。
 *
 * `concept` 层（「提不起劲、找不到意义」这类）的档次真值只能由人标注，不在本文件生成。
 */

export interface GenerateOptions {
  /** 冻结的「今天」：相对时间用例（「近三年」）靠它保持可复现 */
  frozenNow?: string;
  seed?: number;
}

const FROZEN_NOW = '2026-09-22';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const norm = (text: string): string => normalizeText(text).trim();

// ── exact：本地权威直通 ─────────────────────────────────────────────────────
function exactCases(corpus: SearchDoc[], rand: () => number, frozenNow: string): QueryCase[] {
  const cases: QueryCase[] = [];
  const seenTitles = new Set<string>();

  const titled = shuffled(corpus, rand).filter(doc => {
    const title = norm(doc.book.title);
    if (title.length < 5 || seenTitles.has(title)) return false;
    seenTitles.add(title);
    return true;
  });
  titled.slice(0, 8).forEach((doc, index) => {
    cases.push({
      id: `exact-title-${index + 1}`,
      stratum: 'exact',
      query: doc.book.title,
      mode: 'fast',
      frozenNow,
      expectBasedOnExact: true,
      labels: { [doc.id]: 3 },
      truthSource: '查询 = 该书的完整书名 → 正确答案就是这一本，且必须走本地权威分支（0 次 Jev）',
      observations: ['judgeCalls 必须为 0', 'results 只含这一本']
    });
  });

  const withIsbn = shuffled(corpus, rand).filter(doc => Boolean(doc.exact.isbn));
  withIsbn.slice(0, 2).forEach((doc, index) => {
    cases.push({
      id: `exact-isbn-${index + 1}`,
      stratum: 'exact',
      query: doc.exact.isbn,
      mode: 'fast',
      frozenNow,
      expectBasedOnExact: true,
      labels: { [doc.id]: 3 },
      truthSource: '查询 = ISBN → 正确答案就是这一本（0 次 Jev）'
    });
  });

  shuffled(corpus, rand)
    .slice(0, 2)
    .forEach((doc, index) => {
      cases.push({
        id: `exact-barcode-${index + 1}`,
        stratum: 'exact',
        query: doc.id,
        mode: 'fast',
        frozenNow,
        expectBasedOnExact: true,
        labels: { [doc.id]: 3 },
        truthSource: '查询 = 馆藏条码 → 正确答案就是这一本（0 次 Jev）'
      });
    });

  return cases;
}

// ── work：作者名下全部馆藏 ─────────────────────────────────────────────────
function workCases(corpus: SearchDoc[], rand: () => number, frozenNow: string): QueryCase[] {
  const byAuthor = new Map<string, SearchDoc[]>();
  for (const doc of corpus) {
    const author = doc.fields.author.trim();
    if (!author) continue;
    const list = byAuthor.get(author) ?? [];
    list.push(doc);
    byAuthor.set(author, list);
  }

  const titles = new Set(corpus.map(doc => norm(doc.book.title)));
  const eligible = [...byAuthor.entries()].filter(([author, docs]) => {
    if (author.length < 2 || author.length > 12) return false;
    if (/未知|佚名|编|著|等|社/.test(author)) return false;
    if (titles.has(norm(author))) return false;
    // 作者名过于常见（出现在多本不相关书里）会污染真值；本馆藏里只取小产量的作者
    return docs.length >= 1 && docs.length <= 3;
  });

  return shuffled(eligible, rand)
    .slice(0, 10)
    .map(([author, docs], index) => {
      const wrapped = index % 2 === 1;
      const query = wrapped ? `有没有${author}的书` : author;
      return {
        id: `work-${index + 1}`,
        stratum: 'work' as const,
        query,
        mode: 'fast' as const,
        frozenNow,
        expectBasedOnExact: false,
        labels: Object.fromEntries(docs.map(doc => [doc.id, 3])),
        truthSource: `查询 = 作者名「${author}」→ 该作者名下全部馆藏（${docs.length} 本）都是正确候选，recall@40 必须为 1`,
        observations: ['不得走精确命中分支']
      };
    });
}

// ── constraint：条件必须真正执行 ────────────────────────────────────────────
function constraintCases(frozenNow: string): QueryCase[] {
  const cases: QueryCase[] = [];
  const years = [2000, 2010, 2015, 2020];
  years.forEach((year, index) => {
    cases.push({
      id: `constraint-year-${year}-a`,
      stratum: 'constraint',
      query: `${year} 年以后出版的书`,
      mode: 'fast',
      frozenNow,
      expectApplied: { pubYearFrom: year },
      labels: {},
      truthSource: '真值 = 出版年 ≥ 该年；出版年未知的书豁免（不误删）'
    });
    if (index >= 2) {
      cases.push({
        id: `constraint-year-${year}-b`,
        stratum: 'constraint',
        query: `${year}年之后的书`,
        mode: 'fast',
        frozenNow,
        expectApplied: { pubYearFrom: year },
        labels: {},
        truthSource: '同上的另一种措辞（「年之后」）'
      });
    }
  });

  [7, 8, 9].forEach(rating => {
    cases.push({
      id: `constraint-rating-${rating}`,
      stratum: 'constraint',
      query: `评分 ${rating} 分以上的书`,
      mode: 'fast',
      frozenNow,
      expectApplied: { minRating: rating },
      labels: {},
      truthSource: '真值 = 评分 ≥ 该分；评分为 0（未知）的书豁免'
    });
  });
  cases.push({
    id: 'constraint-rating-gt-8',
    stratum: 'constraint',
    query: '评分高于 8 分',
    mode: 'fast',
    frozenNow,
    expectApplied: { minRating: 8 },
    labels: {},
    truthSource: '「高于 8 分」是下限表达（不是上界），应正常生效'
  });

  cases.push(
    {
      id: 'constraint-fiction-no',
      stratum: 'constraint',
      query: '不要小说的书',
      mode: 'fast',
      frozenNow,
      expectApplied: { excludeFiction: true },
      labels: {},
      truthSource: '真值 = 中图法 I 类必须全部出局'
    },
    {
      id: 'constraint-fiction-non',
      stratum: 'constraint',
      query: '非虚构的书',
      mode: 'fast',
      frozenNow,
      expectApplied: { excludeFiction: true },
      labels: {},
      truthSource: '「非虚构」等价于排除虚构类'
    }
  );

  // 相对时间：依赖注入的冻结日期（2026-09-22）
  const nowYear = Number(frozenNow.slice(0, 4));
  [
    { id: 'relative-3', query: '近三年出版的书', amount: 3 },
    { id: 'relative-5', query: '最近五年的书', amount: 5 },
    { id: 'relative-2', query: '过去两年出版的书', amount: 2 }
  ].forEach(({ id, query, amount }) => {
    cases.push({
      id: `constraint-${id}`,
      stratum: 'constraint',
      query,
      mode: 'fast',
      frozenNow,
      expectApplied: { pubYearFrom: nowYear - amount },
      labels: {},
      truthSource: `相对时间按冻结日期 ${frozenNow} 换算 → ${nowYear - amount} 年以后`
    });
  });

  return cases;
}

// ── constraint-trap：宁可不过滤，也不能反向执行 ─────────────────────────────
function constraintTrapCases(frozenNow: string): QueryCase[] {
  const specs: { id: string; query: string; field: 'pubYearFrom' | 'minRating' }[] = [
    { id: 'trap-neg-year-a', query: '不要 2015 年以后出版的书', field: 'pubYearFrom' },
    { id: 'trap-neg-year-b', query: '不需要 2015 年之后出版的书', field: 'pubYearFrom' },
    { id: 'trap-neg-year-c', query: '别要 2010 年以后出版的书', field: 'pubYearFrom' },
    { id: 'trap-ceil-rating-a', query: '评分低于 8 分的书', field: 'minRating' },
    { id: 'trap-ceil-rating-b', query: '评分不超过 7 分的书', field: 'minRating' },
    { id: 'trap-ceil-rating-c', query: '低于 8 分', field: 'minRating' }
  ];
  return specs.map(spec => ({
    id: spec.id,
    stratum: 'constraint-trap' as const,
    query: spec.query,
    mode: 'fast' as const,
    frozenNow,
    expectNotApplied: [spec.field],
    labels: {},
    truthSource: '句中含否定 / 上界表达 → 守卫必须拦下该条件（不过滤 ≠ 反向过滤）'
  }));
}

// ── trap：通用书名不等于精确请求 ────────────────────────────────────────────
function trapCases(corpus: SearchDoc[], rand: () => number, frozenNow: string): QueryCase[] {
  // 「术语密度」低的书名（如《活着》《工作》）——它们是真实书名，但作为查询极易被当成泛问
  const generic = shuffled(corpus, rand)
    .filter(doc => {
      const title = norm(doc.book.title);
      if (title.length === 0 || title.length > 4) return false;
      // 至少 2 本馆藏共享这个词才算「通用」（确实容易混淆）
      const shared = corpus.filter(other => norm(other.book.title).includes(title)).length;
      return shared >= 3;
    })
    .slice(0, 6);

  return generic.map((doc, index) => ({
    id: `trap-generic-${index + 1}`,
    stratum: 'trap' as const,
    query: doc.book.title,
    mode: 'fast' as const,
    frozenNow,
    labels: {},
    truthSource: `书名「${doc.book.title}」是馆藏里的通用词 → 可以精确命中这一本，但不得只靠词面把同名无关的书排到前面`,
    observations: ['本层只做观察，排序真值留待人工标注（P1）']
  }));
}

export function generateCases(corpus: SearchDoc[], options: GenerateOptions = {}): QueryCase[] {
  const rand = mulberry32(options.seed ?? 20260922);
  const frozenNow = options.frozenNow ?? FROZEN_NOW;
  return [
    ...exactCases(corpus, rand, frozenNow),
    ...workCases(corpus, rand, frozenNow),
    ...constraintCases(frozenNow),
    ...constraintTrapCases(frozenNow),
    ...trapCases(corpus, rand, frozenNow)
  ];
}

export const GENERATED_STRATA = [
  'exact',
  'work',
  'constraint',
  'constraint-trap',
  'trap'
] as const;
