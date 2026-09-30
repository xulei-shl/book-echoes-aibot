import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET as getBookDetail, OPTIONS as optionsBookDetail } from '@/app/api/books/[id]/route';
import { GET as getExportSearch } from '@/app/api/semantic-search/export/route';
import { POST as postSemanticSearch } from '@/app/api/semantic-search/route';
import * as pipelineModule from '@/lib/search/pipeline';

// Mock runSemanticSearch
vi.mock('@/lib/search/pipeline', () => ({
  runSemanticSearch: vi.fn()
}));

// Mock config
vi.mock('@/lib/search/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search/config')>();
  return {
    ...actual,
    isSemanticSearchEnabled: () => true,
    readJevConfig: () => ({ apiKey: 'mock-key', model: 'mock-model', timeoutMs: 1000 }),
    LIMIT_DEFAULT: 5,
    LIMIT_MAX: 24
  };
});

// Mock corpus for book detail
vi.mock('@/lib/search/corpus', () => ({
  getSearchCorpus: vi.fn().mockResolvedValue([
    {
      id: 'B1001',
      sourceId: '2025-08',
      book: {
        id: 'B1001',
        title: '西西弗神话',
        author: '阿尔贝·加缪',
        summary: '加缪的哲学随笔，讨论荒诞与自杀……',
        catalog: '第一章 荒诞与自杀\n第二章 荒诞人……',
        rating: '9.0',
        pubYear: '2020',
        callNumber: 'B565.59/1'
      },
      exact: { isbn: '9787000000001', barcode: 'B1001', callNumber: 'B565.59/1' },
      clc: { primary: 'B', level1: 'B', level2: 'B5' },
      numeric: { rating: 9.0, pubYear: 2020, pages: 200 }
    }
  ])
}));

const mockSearchResult = {
  query: '加缪',
  mode: 'fast' as const,
  basedOn: 'retrieval' as const,
  intent: {} as any,
  results: [
    {
      book: {
        id: 'B1001',
        title: '西西弗神话',
        author: '阿尔贝·加缪',
        summary: '加缪的哲学随笔，讨论荒诞与自杀……',
        catalog: '第一章 荒诞与自杀\n第二章 荒诞人……',
        rating: '9.0',
        pubYear: '2020',
        callNumber: 'B565.59/1'
      },
      sourceId: '2025-08',
      relevancePct: 98,
      matchPct: 90,
      rankScore: 0.95,
      fit: 0.98,
      ranked: true,
      passedGate: true,
      deepLink: '/2025-08?focus=B1001',
      lanes: ['dense'],
      laneScores: { dense: 0.98 },
      why: {} as any
    }
  ],
  more: [],
  abstained: false,
  abstainReason: null,
  degraded: [],
  tuning: { effective: {} as any, overridden: [], rejected: [] },
  timing: { totalMs: 120 } as any,
  judge: {} as any
};

describe('API routes for external project calling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pipelineModule.runSemanticSearch).mockResolvedValue(mockSearchResult as any);
  });

  describe('GET /api/books/[id]', () => {
    it('返回指定图书的全量详情数据', async () => {
      const req = new Request('http://localhost:3000/api/books/B1001');
      const res = await getBookDetail(req, { params: Promise.resolve({ id: 'B1001' }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('B1001');
      expect(data.book.title).toBe('西西弗神话');
      expect(data.book.catalog).toContain('第一章 荒诞与自杀'); // 全量字段完整下发
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('查无此书时返回 404', async () => {
      const req = new Request('http://localhost:3000/api/books/UNKNOWN');
      const res = await getBookDetail(req, { params: Promise.resolve({ id: 'UNKNOWN' }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('未找到指定图书');
    });
  });

  describe('POST /api/semantic-search', () => {
    it('默认不传 limit 时取默认值 5，默认采用 compact 视图', async () => {
      const req = new Request('http://localhost:3000/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '加缪' })
      });

      const res = await postSemanticSearch(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // 验证 pipeline 收到的 limit 为 5
      expect(pipelineModule.runSemanticSearch).toHaveBeenCalledWith(
        expect.objectContaining({ query: '加缪', limit: 5 }),
        expect.any(Object),
        expect.any(Object)
      );

      // 验证默认 compact 视图：包含精简定位字段 + detailUrl，剔除目录等重字段
      expect(data.results[0].id).toBe('B1001');
      expect(data.results[0].title).toBe('西西弗神话');
      expect(data.results[0].detailUrl).toBe('/api/books/B1001');
      expect(data.results[0].catalog).toBeUndefined();
      expect(data.results[0].summary).toBeUndefined();
      expect(data.exportUrl).toContain('/api/semantic-search/export?query=%E5%8A%A0%E7%BC%AA');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('显式传入 limit 和 view: "summary" 时生效', async () => {
      const req = new Request('http://localhost:3000/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '加缪', limit: 10, view: 'summary' })
      });

      const res = await postSemanticSearch(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(pipelineModule.runSemanticSearch).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
        expect.any(Object),
        expect.any(Object)
      );

      // summary 视图包含 summary
      expect(data.results[0].summary).toContain('加缪的哲学随笔');
      expect(data.results[0].catalog).toBeUndefined();
    });

    it('支持 fields 字段裁剪自定义投影', async () => {
      const req = new Request('http://localhost:3000/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '加缪',
          fields: ['title', 'rating']
        })
      });

      const res = await postSemanticSearch(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.results[0].title).toBe('西西弗神话');
      expect(data.results[0].rating).toBe('9.0');
      expect(data.results[0].detailUrl).toBe('/api/books/B1001');
      expect(data.results[0].author).toBeUndefined();
    });
  });

  describe('GET /api/semantic-search/export', () => {
    it('下载全量检索结果 JSON 文件', async () => {
      const req = new Request('http://localhost:3000/api/semantic-search/export?query=%E5%8A%A0%E7%BC%AA&limit=5');
      const res = await getExportSearch(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="semantic-search-');
      const data = await res.json();
      expect(data.results[0].book.catalog).toBeDefined(); // 未裁剪的原始全量数据
    });
  });
});
