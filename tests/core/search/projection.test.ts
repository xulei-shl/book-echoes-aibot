import { describe, expect, it } from 'vitest';
import { projectResultItem, projectSearchResponse } from '@/lib/search/projection';
import type { SearchResultItem, SemanticSearchResponse } from '@/lib/search/types';

const mockBook = {
  id: '0012345',
  month: '2025-08',
  title: '存在与时间',
  subtitle: '哲学经典',
  author: '海德格尔',
  translator: '陈嘉映',
  publisher: '三联书店',
  pubYear: '2016',
  pages: '450',
  rating: '9.2',
  callNumber: 'B516.54/1',
  callNumberLink: '',
  doubanLink: 'https://douban.com/book/123',
  isbn: '9787108000000',
  recommendation: '划时代的存在论转向。',
  reason: '初评理由：深入剖析此在与时间性。',
  summary: '《存在与时间》是海德格尔最核心的著作，篇幅宏大……（千字长文省略）',
  authorIntro: '马丁·海德格尔（1889-1976）德国哲学家。',
  catalog: '第一章 论此在\n第二章 时间性与日常性……（百行目录省略）',
  coverUrl: 'https://cdn.example.com/cover.jpg',
  coverImageUrl: 'https://cdn.example.com/cover_large.jpg'
};

const mockResultItem: SearchResultItem = {
  book: mockBook,
  sourceId: '2025-08',
  relevancePct: 95,
  matchPct: 88,
  rankScore: 0.92,
  fit: 0.95,
  ranked: true,
  passedGate: true,
  deepLink: '/2025-08?focus=0012345',
  lanes: ['dense', 'lexical'],
  laneScores: { dense: 0.85, lexical: 0.9 },
  why: {
    lanes: ['dense', 'lexical'],
    laneScores: { dense: 0.85, lexical: 0.9 },
    matched: ['存在', '时间'],
    recallRank: 1,
    fit: 0.95,
    fitLevel: 3,
    fitLevelLabel: '极高度契合',
    fitConfidence: 0.98,
    matchPct: 88,
    rankScore: 0.92,
    pNone: 0.02
  }
};

const mockResponse: SemanticSearchResponse = {
  query: '哲学 存在',
  mode: 'fast',
  basedOn: 'retrieval',
  intent: {
    type: 'concept',
    confidence: 0.9,
    needsWiderRecall: 0,
    retrieval: { lanes: ['dense'], lexicalHits: 5, denseHits: 5, fusedCandidates: 5 },
    facets: { wantsFiction: 0, wantsRecent: 0.5, avoidTheory: 0, wantsVerified: 0.8 },
    plan: { terms: ['存在'], applied: [], dropped: [] }
  },
  results: [mockResultItem],
  more: [],
  abstained: false,
  abstainReason: null,
  degraded: [],
  tuning: {
    effective: {} as any,
    overridden: [],
    rejected: []
  },
  timing: {
    lexicalMs: 10,
    denseMs: 20,
    denseCacheHit: false,
    understandMs: 50,
    classMs: 50,
    wideMs: 0,
    rerankMs: 100,
    rankMs: 5,
    totalMs: 235
  },
  judge: {
    requestedModel: 'jev',
    returnedModel: 'jev',
    attempts: 1,
    usage: { inputTokens: 500, outputTokens: 50 }
  }
};

describe('search projection (Field Masking)', () => {
  it('默认 compact 视图：仅保留核心定位字段并包含 detailUrl', () => {
    const projected = projectResultItem(mockResultItem, { view: 'compact' }) as Record<string, unknown>;

    expect(projected.id).toBe('0012345');
    expect(projected.title).toBe('存在与时间');
    expect(projected.author).toBe('海德格尔');
    expect(projected.rating).toBe('9.2');
    expect(projected.pubYear).toBe('2016');
    expect(projected.relevancePct).toBe(95);
    expect(projected.detailUrl).toBe('/api/books/0012345');
    expect(projected.deepLink).toBe('/2025-08?focus=0012345');

    // 繁重的长字段与诊断字段均被剔除
    expect(projected.catalog).toBeUndefined();
    expect(projected.summary).toBeUndefined();
    expect(projected.why).toBeUndefined();
    expect(projected.coverUrl).toBeUndefined();
  });

  it('summary 视图：包含 compact 字段及内容简介和推荐理由', () => {
    const projected = projectResultItem(mockResultItem, { view: 'summary' }) as Record<string, unknown>;

    expect(projected.id).toBe('0012345');
    expect(projected.title).toBe('存在与时间');
    expect(projected.summary).toContain('《存在与时间》');
    expect(projected.reason).toContain('深入剖析');
    expect(projected.isbn).toBe('9787108000000');
    expect(projected.detailUrl).toBe('/api/books/0012345');

    // 目录与作者介绍等仍被裁剪
    expect(projected.catalog).toBeUndefined();
    expect(projected.authorIntro).toBeUndefined();
  });

  it('自定义 fields：仅返回指定字段与 detailUrl', () => {
    const projected = projectResultItem(mockResultItem, {
      fields: ['title', 'rating', 'callNumber']
    }) as Record<string, unknown>;

    expect(projected.title).toBe('存在与时间');
    expect(projected.rating).toBe('9.2');
    expect(projected.callNumber).toBe('B516.54/1');
    expect(projected.detailUrl).toBe('/api/books/0012345');

    expect(projected.author).toBeUndefined();
    expect(projected.summary).toBeUndefined();
  });

  it('full 视图：保留所有原始数据且注入 detailUrl', () => {
    const projected = projectResultItem(mockResultItem, { view: 'full' }) as SearchResultItem;

    expect(projected.book.catalog).toBeDefined();
    expect(projected.why.fitLevelLabel).toBe('极高度契合');
    expect((projected as any).detailUrl).toBe('/api/books/0012345');
  });

  it('projectSearchResponse 生成精简响应并携带 exportUrl', () => {
    const res = projectSearchResponse(
      mockResponse,
      { view: 'compact' },
      '/api/semantic-search/export?query=test'
    ) as Record<string, unknown>;

    expect(res.query).toBe('哲学 存在');
    expect(res.total).toBe(1);
    expect((res.results as any[])[0].title).toBe('存在与时间');
    expect((res.results as any[])[0].catalog).toBeUndefined();
    expect(res.exportUrl).toBe('/api/semantic-search/export?query=test');
    expect(res.metadata).toEqual({
      totalMs: 235,
      basedOn: 'retrieval'
    });
  });
});
