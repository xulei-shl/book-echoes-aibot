# 查询扩展技术实现规范

## 1. 核心文件修改清单

### 1.1 新增文件
```
src/core/aibot/
├── queryExpansionService.ts      # 查询扩展服务
├── types.ts                      # 类型定义(扩展)
└── constants.ts                  # 常量定义(扩展)
```

### 1.2 修改文件
```
src/core/aibot/
├── retrievalService.ts           # 检索服务(主要修改)

app/api/local-aibot/
└── search-only/
    └── route.ts                  # API接口(小幅修改)

components/aibot/
├── AIBotOverlay.tsx             # 前端组件(接口调用调整)
└── SearchResults.tsx            # 结果展示(可选优化)
```

## 2. 详细实现规范

### 2.1 类型定义扩展 (`src/core/aibot/types.ts`)

```typescript
// 新增：查询扩展响应类型
export interface ExpandedProbes {
  original_query: string;
  expanded_probes: Array<{
    type: "definitional" | "contextual" | "associative";
    label: string;
    text: string;
  }>;
}

// 新增：搜索请求扩展
export interface SearchRequest {
  query: string;
  enableExpansion?: boolean;
  maxQueries?: number;
}

// 新增：搜索元数据
export interface SearchMetadata {
  total: number;
  expansionEnabled: boolean;
  originalQuery: string;
  expandedQueries?: string[];
  deduplicationStats?: {
    originalCount: number;
    finalCount: number;
  };
  performanceStats?: {
    expansionTime: number;
    searchTime: number;
    totalTime: number;
  };
}

// 修改：搜索响应
export interface SearchResponse {
  results: SearchResult[];
  metadata: SearchMetadata;
}
```

### 2.2 查询扩展服务 (`src/core/aibot/queryExpansionService.ts`)

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ExpandedProbes } from './types';
import fs from 'fs/promises';
import path from 'path';

export class QueryExpansionService {
  private systemPrompt: string = '';

  constructor() {
    this.loadSystemPrompt();
  }

  private async loadSystemPrompt(): Promise<void> {
    try {
      const promptPath = path.join(process.cwd(), 'public', 'prompts', 'simple_expanded_probes.md');
      this.systemPrompt = await fs.readFile(promptPath, 'utf-8');
    } catch (error) {
      console.error('Failed to load system prompt:', error);
      this.systemPrompt = 'Expand the user query with semantic variations.';
    }
  }

  async expandQuery(query: string): Promise<ExpandedProbes> {
    const startTime = Date.now();

    try {
      const { text } = await generateText({
        model: openai('gpt-3.5-turbo'),
        temperature: 0.3,
        maxTokens: 1000,
        system: this.systemPrompt,
        prompt: query,
      });

      // 解析JSON响应
      const result = JSON.parse(text.trim());

      // 验证响应格式
      if (!result.expanded_probes || !Array.isArray(result.expanded_probes)) {
        throw new Error('Invalid response format from LLM');
      }

      return result;
    } catch (error) {
      console.error('Query expansion failed:', error);
      // 返回原始查询作为降级方案
      return {
        original_query: query,
        expanded_probes: []
      };
    }
  }
}
```

### 2.3 检索服务修改 (`src/core/aibot/retrievalService.ts`)

```typescript
import { QueryExpansionService } from './queryExpansionService';
import { SearchRequest, SearchResponse, SearchResult, SearchMetadata } from './types';

export class RetrievalService {
  private queryExpander: QueryExpansionService;

  constructor() {
    this.queryExpander = new QueryExpansionService();
  }

  // 原有方法保持不变
  async simpleTextSearch(query: string): Promise<SearchResult[]> {
    // ... 现有实现
  }

  // 新增：扩展搜索主方法
  async performExpandedSearch(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    const { query, enableExpansion = false, maxQueries = 4 } = request;

    // 1. 收集所有查询词
    let allQueries: string[] = [query];
    let expansionTime = 0;

    if (enableExpansion) {
      const expansionStart = Date.now();
      try {
        const expanded = await this.queryExpander.expandQuery(query);
        expansionTime = Date.now() - expansionStart;

        // 提取扩展查询文本
        const expandedTexts = expanded.expanded_probes
          .map(probe => probe.text)
          .slice(0, maxQueries - 1); // 限制查询数量

        allQueries = [...allQueries, ...expandedTexts];
      } catch (error) {
        console.error('Query expansion failed, using original query only:', error);
      }
    }

    // 2. 并行执行搜索
    const searchStart = Date.now();
    const searchPromises = allQueries.map(q => this.simpleTextSearch(q));
    const searchResults = await Promise.allSettled(searchPromises);
    const searchTime = Date.now() - searchStart;

    // 3. 合并结果
    const allResults: SearchResult[] = [];
    for (const result of searchResults) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      } else {
        console.error('Search failed:', result.reason);
      }
    }

    // 4. 去重处理
    const { originalCount, deduplicatedResults } = this.deduplicateResults(allResults);

    // 5. 构建响应
    const metadata: SearchMetadata = {
      total: deduplicatedResults.length,
      expansionEnabled: enableExpansion,
      originalQuery: query,
      expandedQueries: enableExpansion ? allQueries.slice(1) : undefined,
      deduplicationStats: {
        originalCount,
        finalCount: deduplicatedResults.length
      },
      performanceStats: {
        expansionTime,
        searchTime,
        totalTime: Date.now() - startTime
      }
    };

    return {
      results: deduplicatedResults,
      metadata
    };
  }

  // 新增：结果去重
  private deduplicateResults(results: SearchResult[]): {
    originalCount: number;
    deduplicatedResults: SearchResult[];
  } {
    const seen = new Set<string>();
    const deduplicated: SearchResult[] = [];

    for (const result of results) {
      const key = result.call_no; // 基于call_no去重
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(result);
      }
    }

    return {
      originalCount: results.length,
      deduplicatedResults: deduplicated
    };
  }
}
```

### 2.4 API接口修改 (`app/api/local-aibot/search-only/route.ts`)

```typescript
import { NextRequest } from 'next/server';
import { RetrievalService } from '@/core/aibot/retrievalService';
import { SearchRequest } from '@/core/aibot/types';

const retrievalService = new RetrievalService();

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json();
    const { query, enableExpansion = false } = body;

    if (!query?.trim()) {
      return Response.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // 根据是否启用扩展选择不同的处理方式
    const result = enableExpansion
      ? await retrievalService.performExpandedSearch({ query, enableExpansion })
      : {
          results: await retrievalService.simpleTextSearch(query),
          metadata: {
            total: 0,
            expansionEnabled: false,
            originalQuery: query
          }
        };

    return Response.json(result);
  } catch (error) {
    console.error('Search API error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2.5 前端组件修改 (`components/aibot/AIBotOverlay.tsx`)

```typescript
// 修改 performSimpleSearch 方法
const performSimpleSearch = async (query: string) => {
  setIsLoading(true);

  try {
    // 检查是否启用查询扩展
    const enableExpansion = process.env.AIBOT_QUERY_EXPANSION_ENABLED === '1';

    const response = await fetch('/api/local-aibot/search-only', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        enableExpansion // 传递扩展开关
      }),
    });

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json();

    // 可选：记录性能统计
    if (data.metadata.expansionEnabled) {
      console.log('Query expansion stats:', {
        queries: data.metadata.expandedQueries?.length || 0,
        deduplication: data.metadata.deduplicationStats,
        performance: data.metadata.performanceStats
      });
    }

    setPhase('selection');
    setSearchResults(data.results);

  } catch (error) {
    console.error('Search error:', error);
    // 错误处理逻辑...
  } finally {
    setIsLoading(false);
  }
};
```

## 3. 环境配置

### 3.1 环境变量 (`.env.local`)
```env
# 查询扩展功能开关
AIBOT_QUERY_EXPANSION_ENABLED=1

# 扩展查询配置
AIBOT_EXPANSION_MAX_QUERIES=4
AIBOT_EXPANSION_TIMEOUT=10000

# LM配置（如果尚未配置）
AIBOT_LLM_API_KEY=your_openai_api_key
AIBOT_LLM_MODEL=gpt-3.5-turbo
AIBOT_LLM_BASE_URL=https://api.openai.com/v1
```

## 4. 错误处理策略

### 4.1 分层降级机制
1. **LM调用失败** → 使用原始查询继续
2. **部分查询失败** → 忽略失败的查询，使用成功的结果
3. **全部查询失败** → 返回空结果，显示错误信息

### 4.2 超时控制
- LM调用超时：10秒
- 单个搜索查询超时：5秒
- 整体请求超时：30秒

## 5. 性能优化建议

### 5.1 缓存策略（可选）
```typescript
// 查询扩展结果缓存
const expansionCache = new Map<string, ExpandedProbes>();

const getCachedExpansion = (query: string) => {
  const cacheKey = query.toLowerCase().trim();
  return expansionCache.get(cacheKey);
};
```

### 5.2 并发控制
- 使用信号量限制并发数量
- 实现请求取消机制
- 添加加载状态反馈

## 6. 测试计划

### 6.1 单元测试
- QueryExpansionService 各方法
- RetrievalService 去重逻辑
- API 接口参数验证

### 6.2 集成测试
- 端到端搜索流程
- 错误场景处理
- 性能基准测试

### 6.3 用户测试
- 搜索结果质量评估
- 响应时间可接受性
- 功能易用性反馈

## 7. 监控和日志

### 7.1 关键指标
```typescript
// 性能监控示例
const metrics = {
  expansionSuccessRate: 0.95,
  averageExpansionTime: 1200, // ms
  averageTotalTime: 3500, // ms
  deduplicationRatio: 0.15 // 15%的结果被去重
};
```

### 7.2 日志记录
- 查询扩展成功/失败
- 性能指标记录
- 用户查询模式分析