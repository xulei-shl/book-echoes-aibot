import { NextResponse } from 'next/server';
import { JevDisabledError, jevFailureMessage } from '@/lib/jev/errors';
import { isKnownClcCode } from '@/lib/search/clc';
import {
  LIMIT_DEFAULT,
  LIMIT_MAX,
  QUERY_MAX_CHARS,
  isSemanticSearchEnabled,
  readJevConfig
} from '@/lib/search/config';
import { runSemanticSearch } from '@/lib/search/pipeline';
import { projectSearchResponse, type ResultView } from '@/lib/search/projection';
import type { SearchFilters, SearchInput, SearchMode, SearchProgressEvent } from '@/lib/search/types';
import { getLogger } from '@/src/utils/logger';
import { sameOrigin } from '@/src/utils/same-origin';

const logger = getLogger('search.api');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_LIMIT = 30; // 放宽给外部 API 与流式调用
const RATE_WINDOW_MS = 60_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
};

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
  const authHeader = request.headers.get('authorization');
  if (authHeader) return `auth:${authHeader.slice(-12)}`;
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) return `key:${xApiKey.slice(-12)}`;
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
}

function checkAuth(request: Request): { authorized: boolean } {
  const configuredKey = process.env.SEARCH_API_KEY?.trim();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const xApiKey = request.headers.get('x-api-key')?.trim();
  const providedKey = token || xApiKey;

  // 1. 若配置了 SEARCH_API_KEY，且提供了有效 Key，通过
  if (configuredKey && providedKey && providedKey === configuredKey) {
    return { authorized: true };
  }

  // 2. 本站同源请求放行
  if (sameOrigin(request)) {
    return { authorized: true };
  }

  // 3. 若未配置 SEARCH_API_KEY，开放跨源调用
  if (!configuredKey) {
    return { authorized: true };
  }

  return { authorized: false };
}

interface ParseResult {
  ok: true;
  input: SearchInput;
  view: ResultView;
  fields?: string[];
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

  // 默认返回 5 条数据，除非显式传入数量参数
  let limit: number = LIMIT_DEFAULT;
  if (raw.limit !== undefined) {
    const value = Number(raw.limit);
    if (!Number.isInteger(value) || value < 1 || value > LIMIT_MAX) {
      return { ok: false, message: `limit 必须是 1–${LIMIT_MAX} 的整数` };
    }
    limit = value;
  }

  let view: ResultView = 'compact';
  if (raw.view !== undefined) {
    if (raw.view !== 'compact' && raw.view !== 'summary' && raw.view !== 'full') {
      return { ok: false, message: 'view 只能是 compact、summary 或 full' };
    }
    view = raw.view;
  }

  let fields: string[] | undefined;
  if (raw.fields !== undefined) {
    if (Array.isArray(raw.fields)) {
      fields = raw.fields.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim());
    } else if (typeof raw.fields === 'string') {
      fields = raw.fields.split(',').map(f => f.trim()).filter(Boolean);
    } else {
      return { ok: false, message: 'fields 必须是字符串数组或逗号分隔的字符串' };
    }
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
    if (source.excludeFiction !== undefined) {
      if (typeof source.excludeFiction !== 'boolean') {
        return { ok: false, message: 'filters.excludeFiction 必须是布尔值' };
      }
      if (source.excludeFiction) filters.excludeFiction = true;
    }
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
    view,
    ...(fields ? { fields } : {}),
    input: {
      query: raw.query.trim(),
      limit,
      ...(mode ? { mode } : {}),
      ...(filters ? { filters } : {})
    }
  };
}

function buildExportUrl(input: SearchInput): string {
  const params = new URLSearchParams();
  params.set('query', input.query);
  if (input.mode) params.set('mode', input.mode);
  if (input.limit) params.set('limit', String(input.limit));
  if (input.filters?.minRating !== undefined) params.set('minRating', String(input.filters.minRating));
  if (input.filters?.pubYearFrom !== undefined) params.set('pubYearFrom', String(input.filters.pubYearFrom));
  if (input.filters?.excludeFiction) params.set('excludeFiction', 'true');
  if (input.filters?.callClasses && input.filters.callClasses.length > 0) {
    params.set('callClasses', input.filters.callClasses.join(','));
  }
  return `/api/semantic-search/export?${params.toString()}`;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function POST(request: Request) {
  if (!isSemanticSearchEnabled()) {
    return NextResponse.json({ message: 'Not Found' }, { status: 404, headers: CORS_HEADERS });
  }

  const auth = checkAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: CORS_HEADERS });
  }

  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { error: '检索过于频繁，请稍后再试' },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  if (!readJevConfig()) {
    logger.error('语义检索已开启但缺少 TYPESAFE_API_KEY');
    return NextResponse.json(
      { error: '语义检索服务未配置：缺少 TYPESAFE_API_KEY' },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  let parsed: ParseResult | ParseFailure;
  try {
    parsed = parseRequest(await request.json());
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400, headers: CORS_HEADERS });
  }
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400, headers: CORS_HEADERS });
  }

  const exportUrl = buildExportUrl(parsed.input);
  const wantsStream = request.headers.get('accept')?.includes('application/x-ndjson');

  if (wantsStream) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const emit = (event: SearchProgressEvent) => {
      writer.write(encoder.encode(JSON.stringify(event) + '\n'));
    };

    runSemanticSearch(parsed.input, {}, request.signal, emit)
      .then(result => {
        const projected = projectSearchResponse(
          result,
          { view: parsed.view, fields: parsed.fields },
          exportUrl
        );
        emit({ event: 'done', data: projected as any });
        writer.close();
      })
      .catch(error => {
        const msg = error instanceof JevDisabledError ? error.message : jevFailureMessage(error);
        logger.error('语义检索失败（流式）', { message: msg });
        emit({ event: 'error', data: { message: msg } });
        writer.close();
      });

    return new Response(readable, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  try {
    const result = await runSemanticSearch(parsed.input, {}, request.signal);
    const projected = projectSearchResponse(
      result,
      { view: parsed.view, fields: parsed.fields },
      exportUrl
    );
    return NextResponse.json(projected, {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    if (error instanceof JevDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: CORS_HEADERS });
    }
    logger.error('语义检索失败', {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: jevFailureMessage(error) }, { status: 502, headers: CORS_HEADERS });
  }
}
