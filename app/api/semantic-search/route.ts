import { NextResponse } from 'next/server';
import { JevDisabledError, jevFailureMessage } from '@/lib/jev/errors';
import { isKnownClcCode } from '@/lib/search/clc';
import { LIMIT_MAX, QUERY_MAX_CHARS, isSemanticSearchEnabled, readJevConfig } from '@/lib/search/config';
import { runSemanticSearch } from '@/lib/search/pipeline';
import type { SearchFilters, SearchInput, SearchMode } from '@/lib/search/types';
import { getLogger } from '@/src/utils/logger';
import { sameOrigin } from '@/src/utils/same-origin';

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
    // 中图法类号过滤：一级（K）/ 二级（K81）/ T 类三级（TP3）都可传，去重后取大写
    if (source.callClasses !== undefined) {
      if (!Array.isArray(source.callClasses)) {
        return { ok: false, message: 'filters.callClasses 必须是类号数组' };
      }
      const codes: string[] = [];
      for (const entry of source.callClasses) {
        if (typeof entry !== 'string' || entry.trim().length === 0) {
          return { ok: false, message: 'filters.callClasses 的每一项都必须是非空字符串类号' };
        }
        const code = entry.trim().toUpperCase();
        // 未知类号必须报错而不是放行：它永远匹配不上，只会静默滤空，
        // 用户看到的是「馆藏里没有」这种没法排查的结论（clc.ts 的表是唯一权威）
        if (!isKnownClcCode(code)) {
          return { ok: false, message: `filters.callClasses 含未知中图法类号：${code}` };
        }
        if (!codes.includes(code)) codes.push(code);
      }
      if (codes.length > 0) filters.callClasses = codes;
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
