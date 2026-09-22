import { NextResponse } from 'next/server';
import { JevDisabledError, jevFailureMessage } from '@/lib/jev/errors';
import { LIMIT_MAX, QUERY_MAX_CHARS, isSemanticSearchEnabled, readJevConfig } from '@/lib/search/config';
import { runSemanticSearch } from '@/lib/search/pipeline';
import type { SearchFilters, SearchInput, SearchMode } from '@/lib/search/types';
import { getLogger } from '@/src/utils/logger';

const logger = getLogger('search.api');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(timestamp => now - timestamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

function clientKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
}

/**
 * 同源校验。带 Origin / Sec-Fetch-Site 时必须一致；两者都缺失（curl、服务端调用）放行。
 * README 式诚实标注：这不是认证。
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';
  return true;
}

interface ParseResult {
  ok: true;
  input: SearchInput;
}

interface ParseFailure {
  ok: false;
  message: string;
}

function parseRequest(body: unknown): ParseResult | ParseFailure {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: '请求体必须是 JSON 对象' };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.query !== 'string' || raw.query.trim().length === 0) {
    return { ok: false, message: 'query 必填且不能为空' };
  }
  if (raw.query.length > QUERY_MAX_CHARS) {
    return { ok: false, message: `query 最长 ${QUERY_MAX_CHARS} 字符` };
  }

  let mode: SearchMode | undefined;
  if (raw.mode !== undefined) {
    if (raw.mode !== 'fast' && raw.mode !== 'deep') {
      return { ok: false, message: 'mode 只能是 fast 或 deep' };
    }
    mode = raw.mode;
  }

  let limit: number | undefined;
  if (raw.limit !== undefined) {
    const value = Number(raw.limit);
    if (!Number.isInteger(value) || value < 1 || value > LIMIT_MAX) {
      return { ok: false, message: `limit 必须是 1–${LIMIT_MAX} 的整数` };
    }
    limit = value;
  }

  let filters: SearchFilters | undefined;
  if (raw.filters !== undefined) {
    if (typeof raw.filters !== 'object' || raw.filters === null) {
      return { ok: false, message: 'filters 必须是对象' };
    }
    const source = raw.filters as Record<string, unknown>;
    filters = {};
    if (source.minRating !== undefined) {
      const value = Number(source.minRating);
      if (!Number.isFinite(value) || value < 0 || value > 10) {
        return { ok: false, message: 'filters.minRating 必须在 0–10 之间' };
      }
      filters.minRating = value;
    }
    if (source.pubYearFrom !== undefined) {
      const value = Number(source.pubYearFrom);
      if (!Number.isInteger(value) || value < 1900 || value > 2100) {
        return { ok: false, message: 'filters.pubYearFrom 必须在 1900–2100 之间' };
      }
      filters.pubYearFrom = value;
    }
    // SearchFilters 声明了 excludeFiction（types.ts），解析层不能默默丢掉它
    if (source.excludeFiction !== undefined) {
      if (typeof source.excludeFiction !== 'boolean') {
        return { ok: false, message: 'filters.excludeFiction 必须是布尔值' };
      }
      if (source.excludeFiction) filters.excludeFiction = true;
    }
  }

  return {
    ok: true,
    input: {
      query: raw.query.trim(),
      ...(mode ? { mode } : {}),
      ...(limit ? { limit } : {}),
      ...(filters ? { filters } : {})
    }
  };
}

export async function POST(request: Request) {
  if (!isSemanticSearchEnabled()) {
    return NextResponse.json({ message: 'Not Found' }, { status: 404 });
  }

  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { error: '检索过于频繁，请稍后再试' },
      { status: 429 }
    );
  }

  // key 缺失时明确报错，不静默降级为纯词法（避免「看起来能用但其实是关键词检索」）
  if (!readJevConfig()) {
    logger.error('语义检索已开启但缺少 TYPESAFE_API_KEY');
    return NextResponse.json(
      { error: '语义检索服务未配置：缺少 TYPESAFE_API_KEY' },
      { status: 503 }
    );
  }

  let parsed: ParseResult | ParseFailure;
  try {
    parsed = parseRequest(await request.json());
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }

  try {
    const result = await runSemanticSearch(parsed.input, {}, request.signal);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    if (error instanceof JevDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    logger.error('语义检索失败', {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: jevFailureMessage(error) }, { status: 502 });
  }
}
