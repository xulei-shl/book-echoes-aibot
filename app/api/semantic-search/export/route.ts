import { NextResponse } from 'next/server';
import { isKnownClcCode } from '@/lib/search/clc';
import { LIMIT_MAX, QUERY_MAX_CHARS, isSemanticSearchEnabled, readJevConfig } from '@/lib/search/config';
import { runSemanticSearch } from '@/lib/search/pipeline';
import type { SearchFilters, SearchInput, SearchMode } from '@/lib/search/types';
import { getLogger } from '@/src/utils/logger';

const logger = getLogger('search.export.api');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function GET(request: Request) {
  if (!isSemanticSearchEnabled()) {
    return NextResponse.json({ message: 'Not Found' }, { status: 404, headers: CORS_HEADERS });
  }

  if (!readJevConfig()) {
    logger.error('语义检索导出已开启但缺少 TYPESAFE_API_KEY');
    return NextResponse.json(
      { error: '语义检索服务未配置：缺少 TYPESAFE_API_KEY' },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query')?.trim() ?? searchParams.get('q')?.trim() ?? '';

  if (!query) {
    return NextResponse.json(
      { error: 'query 必填且不能为空' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (query.length > QUERY_MAX_CHARS) {
    return NextResponse.json(
      { error: `query 最长 ${QUERY_MAX_CHARS} 字符` },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const modeParam = searchParams.get('mode');
  const mode: SearchMode | undefined =
    modeParam === 'fast' || modeParam === 'deep' ? modeParam : undefined;

  let limit: number | undefined;
  const limitParam = searchParams.get('limit');
  if (limitParam !== null) {
    const value = Number(limitParam);
    if (Number.isInteger(value) && value >= 1 && value <= LIMIT_MAX) {
      limit = value;
    }
  }

  const filters: SearchFilters = {};
  const minRatingParam = searchParams.get('minRating');
  if (minRatingParam !== null) {
    const val = Number(minRatingParam);
    if (Number.isFinite(val) && val >= 0 && val <= 10) filters.minRating = val;
  }

  const pubYearFromParam = searchParams.get('pubYearFrom');
  if (pubYearFromParam !== null) {
    const val = Number(pubYearFromParam);
    if (Number.isInteger(val) && val >= 1900 && val <= 2100) filters.pubYearFrom = val;
  }

  const excludeFictionParam = searchParams.get('excludeFiction');
  if (excludeFictionParam === 'true' || excludeFictionParam === '1') {
    filters.excludeFiction = true;
  }

  const callClassesParam = searchParams.get('callClasses');
  if (callClassesParam) {
    const codes = callClassesParam
      .split(',')
      .map(c => c.trim().toUpperCase())
      .filter(c => isKnownClcCode(c));
    if (codes.length > 0) filters.callClasses = codes;
  }

  const input: SearchInput = {
    query,
    ...(mode ? { mode } : {}),
    ...(limit ? { limit } : {}),
    ...(Object.keys(filters).length > 0 ? { filters } : {})
  };

  try {
    const result = await runSemanticSearch(input, {}, request.signal);
    const jsonStr = JSON.stringify(result, null, 2);

    return new Response(jsonStr, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="semantic-search-${encodeURIComponent(query)}.json"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    logger.error('全量导出检索失败', {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { error: '检索导出失败' },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
