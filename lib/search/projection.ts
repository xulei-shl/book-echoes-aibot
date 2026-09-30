import type { SearchResultItem, SemanticSearchResponse } from './types';

export type ResultView = 'compact' | 'summary' | 'full';

export interface ProjectionOptions {
  view?: ResultView;
  fields?: string[];
  baseUrl?: string;
}

/** 紧凑视图字段：专为 Agent 优化，Token 消耗极低 */
const COMPACT_BOOK_FIELDS = ['id', 'title', 'author', 'pubYear', 'rating', 'callNumber'] as const;

/** 摘要视图补充字段 */
const SUMMARY_BOOK_FIELDS = [
  ...COMPACT_BOOK_FIELDS,
  'summary',
  'recommendation',
  'reason',
  'isbn',
  'publisher'
] as const;

/**
 * 构造单书完整数据的 API 直链
 */
export function buildDetailUrl(id: string, baseUrl = ''): string {
  const normalizedBase = baseUrl ? baseUrl.replace(/\/+$/, '') : '';
  return `${normalizedBase}/api/books/${encodeURIComponent(id)}`;
}

/**
 * 单条检索结果投影与裁剪
 */
export function projectResultItem(
  item: SearchResultItem,
  options: ProjectionOptions
): Record<string, unknown> | SearchResultItem {
  const { view = 'compact', fields, baseUrl = '' } = options;
  const detailUrl = buildDetailUrl(item.book.id, baseUrl);

  // full 视图且没有自定义字段：返回原对象，并补上 detailUrl
  if (view === 'full' && (!fields || fields.length === 0)) {
    return {
      ...item,
      detailUrl
    };
  }

  // 自定义字段集优先
  if (fields && fields.length > 0) {
    const projected: Record<string, unknown> = {};
    const fieldSet = new Set(fields.map(f => f.trim()));

    // 自动携带 detailUrl 方便二次拉取详情
    projected.detailUrl = detailUrl;

    for (const key of fieldSet) {
      if (key === 'detailUrl') continue;

      if (key in item) {
        projected[key] = (item as unknown as Record<string, unknown>)[key];
      } else if (key in item.book) {
        projected[key] = (item.book as unknown as Record<string, unknown>)[key];
      }
    }
    return projected;
  }

  // summary 视图
  if (view === 'summary') {
    const bookData: Record<string, unknown> = {};
    for (const field of SUMMARY_BOOK_FIELDS) {
      if (field in item.book) {
        bookData[field] = (item.book as unknown as Record<string, unknown>)[field];
      }
    }
    return {
      ...bookData,
      relevancePct: item.relevancePct,
      matchPct: item.matchPct,
      deepLink: item.deepLink,
      detailUrl
    };
  }

  // compact 视图（默认，Agent 友好型）
  return {
    id: item.book.id,
    title: item.book.title,
    author: item.book.author,
    pubYear: item.book.pubYear,
    rating: item.book.rating,
    callNumber: item.book.callNumber,
    relevancePct: item.relevancePct,
    deepLink: item.deepLink,
    detailUrl
  };
}

/**
 * 全量检索响应投影
 */
export function projectSearchResponse(
  response: SemanticSearchResponse,
  options: ProjectionOptions,
  exportUrl?: string
): Record<string, unknown> | SemanticSearchResponse {
  const { view = 'compact', fields } = options;

  // full 视图且无 fields：保留完整结构，附加 exportUrl 与 detailUrl
  if (view === 'full' && (!fields || fields.length === 0)) {
    return {
      ...response,
      results: response.results.map(item => projectResultItem(item, options) as SearchResultItem),
      more: response.more.map(item => projectResultItem(item, options) as SearchResultItem),
      ...(exportUrl ? { exportUrl } : {})
    };
  }

  const projectedResults = response.results.map(item => projectResultItem(item, options));
  const projectedMore = response.more && response.more.length > 0
    ? response.more.map(item => projectResultItem(item, options))
    : undefined;

  return {
    query: response.query,
    mode: response.mode,
    total: projectedResults.length,
    results: projectedResults,
    ...(projectedMore ? { more: projectedMore } : {}),
    abstained: response.abstained,
    abstainReason: response.abstainReason,
    ...(exportUrl ? { exportUrl } : {}),
    metadata: {
      totalMs: response.timing.totalMs,
      basedOn: response.basedOn
    }
  };
}
