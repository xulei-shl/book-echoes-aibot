import { normalizeText, tokenize, STOPWORDS } from './tokenize';

/** 句式降噪：剥离疑问/请求套话与语气词（双语清单，取自 Jev Search 的短语表，含中文分支） */
const NOISE_PATTERNS: RegExp[] = [
  /有没有(什么|哪些|哪本|几本|一本)?/g,
  /有哪(些|本|几本|一部)?/g,
  /请问/g,
  /帮我(找|推荐|看看|搜)?/g,
  /给我(推荐|找|看看)?/g,
  /想(要|找|看|读)/g,
  /寻找?/g,
  /推荐(一些|几本|一下|下)?/g,
  /介绍(一下|下)?/g,
  /讲(述|的是|了|的|什么)/g,
  /关于/g,
  /适合/g,
  /类似(的|于)?/g,
  /一些/g,
  /一本/g,
  /那种(感觉|书)?/g,
  /这样(的|的?书)?/g,
  /看看(书|吗)?/g,
  /读起来/g,
  /最近/g,
  /有没有/g,
  /怎么样/g,
  /好不好/g,
  /是吧/g,
  /[吗呢吧啊哦呀嘛咯哈]+/g
];

export interface ExplicitConstraints {
  /** 出版年下限 */
  year?: number;
  /** 评分下限 */
  rating?: number;
  /** 明确排斥虚构类 */
  excludeFiction?: boolean;
}

export interface NormalizedQuery {
  /** 用户原句 → 稠密 lane */
  raw: string;
  /** 降噪后的核心文本 → 词法 lane */
  core: string;
  /** 降噪 + IDF 截断后的 term → 词法 lane */
  terms: string[];
  explicit: ExplicitConstraints;
}

const YEAR_PATTERN = /((?:19|20)\d{2})\s*年?\s*(?:以后|之后|以来|后|起)/;
const RATING_PATTERN = /(?:评分|豆瓣评分|打分)?\s*([0-9](?:\.[0-9])?)\s*分\s*(?:以上|以上|起|\+)?/;
const RATING_GT_PATTERN = /(?:高于|大于|超过)\s*([0-9](?:\.[0-9])?)\s*分?/;
const EXCLUDE_FICTION_PATTERN = /不要(小说|虚构|文学|故事)|非虚构/;

function extractExplicit(normalized: string): ExplicitConstraints {
  const explicit: ExplicitConstraints = {};
  const yearMatch = normalized.match(YEAR_PATTERN);
  if (yearMatch) {
    explicit.year = Number(yearMatch[1]);
  }
  const ratingMatch = normalized.match(RATING_GT_PATTERN) ?? normalized.match(RATING_PATTERN);
  if (ratingMatch) {
    const value = Number(ratingMatch[1]);
    if (Number.isFinite(value) && value > 0 && value <= 10) {
      explicit.rating = value;
    }
  }
  if (EXCLUDE_FICTION_PATTERN.test(normalized)) {
    explicit.excludeFiction = true;
  }
  return explicit;
}

export interface NormalizeOptions {
  /** 提供时按 IDF 截断：保留 IDF 最高的前 maxTerms 个 term（§4.2.1 第 ③ 步） */
  idf?: (term: string) => number;
  maxTerms?: number;
}

const DEFAULT_MAX_TERMS = 16;

/**
 * 查询侧确定性处理（0 次 Jev）：句式降噪 → 显式约束抽取 → IDF 截断。
 *
 * 必须同时产出 `raw`（→ 稠密）与 `core`/`terms`（→ 词法）：降噪会剥掉语义，
 * 对稠密检索是有害的（§5.4.3）。
 */
export function normalizeQuery(raw: string, options: NormalizeOptions = {}): NormalizedQuery {
  const original = raw.trim();
  let core = normalizeText(original);
  for (const pattern of NOISE_PATTERNS) {
    core = core.replace(pattern, ' ');
  }
  core = core.replace(/\s+/g, ' ').trim();

  const explicit = extractExplicit(normalizeText(original));

  // 先从降噪后的文本取 term；降噪过头（如整句都是套话）时回退到原句
  let terms = dedupe(tokenize(core));
  if (terms.length === 0) {
    terms = dedupe(tokenize(original));
  }
  // 显式约束里的数字不应作为检索 term（避免把「2015」当主题词）
  terms = terms.filter(term => !STOPWORDS.has(term));

  const maxTerms = options.maxTerms ?? DEFAULT_MAX_TERMS;
  if (options.idf && terms.length > maxTerms) {
    const idf = options.idf;
    const scored = terms.map((term, index) => ({ term, index, weight: idf(term) }));
    scored.sort((a, b) => b.weight - a.weight || a.index - b.index);
    terms = scored.slice(0, maxTerms).map(entry => entry.term);
  } else {
    terms = terms.slice(0, maxTerms);
  }

  return { raw: original, core, terms, explicit };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
