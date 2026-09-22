import { getTuning } from './tuning';
import type { SearchFilters } from './types';
import { normalizeText, tokenize, STOPWORDS } from './tokenize';

/** 句式降噪：剥离疑问/请求套话（清单取自 Jev Search 的短语表）。
 *
 * 铁律：只删「整段成词」的请求套话。**不碰正文里的字** —— 语气词单独处理（见 TONE_PARTICLES），
 * 否则「酒吧」「哈耶克」「哈姆雷特」会被切碎成「酒」「耶克」「姆雷特」，
 * 词法 lane 于是命中完全无关的书。 */
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
  /有没有/g,
  /怎么样/g,
  /好不好/g,
  /是吧/g
];

/**
 * 语气词只在**独立成词**时剥离：前面必须是串首、空白或标点。
 *
 * 取舍：正则无法区分「酒吧」「哈耶克」里的字与句末语气词，把语气词字符一律删除会切碎真词
 * （「酒吧」→「酒」、「哈耶克」→「耶克」，词法 lane 因而命中无关的书）。
 * 所以采用**宁可留下、也不切错**的策略：句末紧跟正文的「…的书吗」不会在这里被删除，
 * 它留下的垃圾 bigram（「书吗」）匹配不到任何倒排项，也会被 termIdf 的未知词降权沉下去；
 * 单字语气词另有 STOPWORDS 兜底。
 */
const TONE_PARTICLES = /(^|[\s，。！？、；：,.!?;:…·"'（）()《》])[吗呢吧啊哦呀嘛咯哈啦哟呗]+(?=[\s，。！？、；：,.!?;:…·"'（）()《》]|$)/g;

export interface ExplicitConstraints {
  /** 出版年下限 */
  year?: number;
  /** 评分下限 */
  rating?: number;
  /** 明确排斥虚构类 */
  excludeFiction?: boolean;
}

/**
 * 解析出的显式约束转成统一过滤器（§4.2.1「交给 deterministic filters」的落地）。
 * 纯代码转换，无默认值：条件只在用户明确说出时才生效。
 */
export function explicitToFilters(explicit: ExplicitConstraints): SearchFilters {
  const filters: SearchFilters = {};
  if (explicit.year !== undefined) filters.pubYearFrom = explicit.year;
  if (explicit.rating !== undefined) filters.minRating = explicit.rating;
  if (explicit.excludeFiction) filters.excludeFiction = true;
  return filters;
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
/** 「不」直接前缀时不算上界表达：「不超过 8 分」的「超过」是上界的一半，不能当「高于」用。 */
const RATING_GT_PATTERN = /(?<!不)(?:高于|大于|超过)\s*([0-9](?:\.[0-9])?)\s*分?/;
const EXCLUDE_FICTION_PATTERN = /不要(小说|虚构|文学|故事)|非虚构/;
/** 「近三年」「过去五年」这类相对时间（仅支持 1–10，超出则不解析而非猜）。 */
const RELATIVE_YEAR_PATTERN = /(?:近|最近|过去|这)([一二三四五六七八九十两]|[0-9]{1,2})\s*年/;

const CN_NUMERALS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
};

/** 否定/排除表达：让「不要 2015 年以后」不会反过来变成「只要 2015 年以后」。 */
const NEGATION_BEFORE = /(不要|不想要|不需要|不想看|不看|不用|别|除了|排除|没有)/;
/** 上界表达：「低于 8 分」「8 分以下」在本模块的过滤器里表达不了，宁可不设条件也不反向执行。 */
const CEILING_BEFORE = /(低于|少于|小于|以下|不超过|最多|至多|不多于)/;

/**
 * 锚点前的**同一子句**内是否存在否定/上界表达。
 * 取子句而不是整句：`不要小说，2015 年以后的书` 里的「不要」不应否决年份条件。
 *
 * 上界判定要把**匹配自身的前三个字符**拼回来：`不超过 8 分` 里被 `超过` 吃掉的那一段
 * 正是上界词的后半截。否定判定**不拼**——`不要小说` 的「不要」就是意图本身。
 */
function guardedAnchor(normalized: string, index: number, matched = ''): boolean {
  const clause = normalized.slice(0, index).split(/[，。；！？,;!?]/).pop() ?? '';
  const ceilingProbe = `${clause.slice(-8)}${matched.slice(0, 3)}`;
  return !NEGATION_BEFORE.test(clause.slice(-6)) && !CEILING_BEFORE.test(ceilingProbe);
}

function extractExplicit(normalized: string, now?: Date): ExplicitConstraints {
  const explicit: ExplicitConstraints = {};

  const yearMatch = normalized.match(YEAR_PATTERN);
  if (yearMatch && guardedAnchor(normalized, yearMatch.index ?? 0, yearMatch[0])) {
    explicit.year = Number(yearMatch[1]);
  } else if (!yearMatch && now) {
    const relative = normalized.match(RELATIVE_YEAR_PATTERN);
    const amount = relative ? Number(relative[1]) || CN_NUMERALS[relative[1]] : undefined;
    if (relative && amount !== undefined && amount >= 1 && amount <= 10) {
      explicit.year = now.getFullYear() - amount;
    }
  }

  const ratingMatch = normalized.match(RATING_GT_PATTERN) ?? normalized.match(RATING_PATTERN);
  if (ratingMatch && guardedAnchor(normalized, ratingMatch.index ?? 0, ratingMatch[0])) {
    const value = Number(ratingMatch[1]);
    if (Number.isFinite(value) && value > 0 && value <= 10) {
      explicit.rating = value;
    }
  }

  const fictionMatch = normalized.match(EXCLUDE_FICTION_PATTERN);
  // 「不要非虚构」这类反向表达：宁可只当软偏好，也不硬删（模型侧的 genre_preference 会兜住）
  if (fictionMatch && guardedAnchor(normalized, fictionMatch.index ?? 0, fictionMatch[0])) {
    explicit.excludeFiction = true;
  }

  return explicit;
}

export interface NormalizeOptions {
  /** 提供时按 IDF 截断：保留 IDF 最高的前 maxTerms 个 term（§4.2.1 第 ③ 步） */
  idf?: (term: string) => number;
  maxTerms?: number;
  /** 用于解析「近三年」这类相对时间；缺省时不解析相对时间（不猜）。 */
  now?: Date;
}

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
  core = core.replace(TONE_PARTICLES, '$1');
  core = core.replace(/\s+/g, ' ').trim();

  const explicit = extractExplicit(normalizeText(original), options.now);

  // 先从降噪后的文本取 term；降噪过头（如整句都是套话）时回退到原句
  let terms = dedupe(tokenize(core));
  if (terms.length === 0) {
    terms = dedupe(tokenize(original));
  }
  // 显式约束里的数字不作为检索 term（避免把「2015」「8」当主题词占掉前 16 个位置）
  terms = terms.filter(term => !STOPWORDS.has(term) && !/^\d+$/.test(term));

  const maxTerms = options.maxTerms ?? getTuning().effective.defaultMaxTerms;
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
