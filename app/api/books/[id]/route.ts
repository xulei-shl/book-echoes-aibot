import { NextResponse } from 'next/server';
import { getSearchCorpus } from '@/lib/search/corpus';

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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id || '').trim();

  if (!decodedId) {
    return NextResponse.json(
      { error: 'id 必填且不能为空' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const corpus = await getSearchCorpus();
  const found = corpus.find(
    doc => doc.id === decodedId || doc.exact.isbn === decodedId || doc.exact.barcode === decodedId
  );

  if (!found) {
    return NextResponse.json(
      { error: '未找到指定图书', id: decodedId },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    {
      id: found.id,
      book: found.book,
      sourceId: found.sourceId,
      clc: found.clc,
      alsoIn: found.alsoIn,
      exact: found.exact,
      numeric: found.numeric
    },
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
      }
    }
  );
}
