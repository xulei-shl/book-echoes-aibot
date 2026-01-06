# 查询扩展功能设计文档

## 1. 需求概述

### 1.1 背景与问题
当前简单检索流程直接使用用户原始文本进行搜索，存在以下问题：
- 用户查询往往简短、模糊，语义信息不足
- 错过大量相关但表述不同的图书内容
- 检索召回率有限，用户体验有待提升

### 1.2 解决方案
在简单检索API执行前，增加大模型查询扩展环节：
1. 使用预设的系统提示词（`simple_expanded_probes.md`）
2. 将用户原始文本作为输入，生成多个语义丰富的扩展查询
3. 并行执行原始查询和扩展查询
4. 基于`call_no`对结果去重合并

### 1.3 预期收益
- 提升检索召回率，覆盖更多相关图书
- 改善用户查询体验，减少查询次数
- 保持现有接口兼容性，平滑升级

## 2. 现有系统分析

### 2.1 当前简单检索流程
```
用户输入 → performSimpleSearch()
          ↓
      simpleTextSearch()
          ↓
    POST /api/books/text-search
          ↓
      图书结果列表
          ↓
      去重并展示
```

### 2.2 关键文件位置
- **前端入口**: `components/aibot/AIBotOverlay.tsx:375-419`
- **检索服务**: `src/core/aibot/retrievalService.ts`
- **API接口**: `app/api/local-aibot/search-only/route.ts`

## 3. 技术方案设计

### 3.1 整体架构
```
用户输入 → 意图分类(简单)
          ↓
    查询扩展(LLM) ← 新增
          ↓
    并行检索(原始+扩展) ← 新增
          ↓
      结果去重合并 ← 修改
          ↓
      图书结果展示
```

### 3.2 核心组件设计

#### 3.2.1 查询扩展服务 (新增)
**文件**: `src/core/aibot/queryExpansionService.ts`

```typescript
interface ExpandedProbes {
  original_query: string;
  expanded_probes: Array<{
    type: "definitional" | "contextual" | "associative";
    label: string;
    text: string;
  }>;
}

class QueryExpansionService {
  async expandQuery(query: string): Promise<ExpandedProbes>
}
```

#### 3.2.2 检索服务修改
**文件**: `src/core/aibot/retrievalService.ts`

新增方法：
- `performExpandedSearch()` - 执行扩展检索
- `deduplicateResults()` - 结果去重
- `mergeSearchResults()` - 结果合并

#### 3.2.3 API接口修改
**文件**: `app/api/local-aibot/search-only/route.ts`

增加查询参数：
```typescript
interface SearchRequest {
  query: string;
  enableExpansion?: boolean; // 新增，默认false
}
```

### 3.3 实现细节

#### 3.3.1 LM调用集成
- 使用现有的`generateText`函数（Vercel AI SDK）
- 系统提示词：读取`public/prompts/simple_expanded_probes.md`
- 温度参数：0.3（保证输出稳定性）
- 超时控制：10秒

#### 3.3.2 并发控制
- 使用`Promise.allSettled`并行执行检索
- 最多支持4个并发查询（原始+3个扩展）
- 每个查询独立处理错误

#### 3.3.3 结果去重策略
- 基于`call_no`字段去重
- 保留首次出现的记录
- 记录去重统计信息

## 4. 接口设计

### 4.1 API接口变更
```typescript
// 原有接口保持兼容
POST /api/local-aibot/search-only
{
  "query": "用户查询",
  "enableExpansion": true  // 新增可选参数
}

// 响应格式扩展
interface SearchResponse {
  results: SearchResult[];
  metadata: {
    total: number;
    expansionEnabled: boolean;
    originalQuery: string;
    expandedQueries?: string[];  // 新增
    deduplicationStats?: {       // 新增
      originalCount: number;
      finalCount: number;
    }
  };
}
```

### 4.2 配置选项
**环境变量**：
```env
AIBOT_QUERY_EXPANSION_ENABLED=1  # 默认关闭，需显式启用
AIBOT_EXPANSION_MAX_QUERIES=4    # 最大并发查询数
AIBOT_EXPANSION_TIMEOUT=10000    # 扩展超时时间(ms)
```

## 5. 实施计划

### 5.1 Phase 1: 核心功能实现
1. 创建查询扩展服务
2. 集成LM调用逻辑
3. 实现基础并发检索

### 5.2 Phase 2: 优化与集成
1. 完善错误处理
2. 添加性能监控
3. 更新前端组件

### 5.3 Phase 3: 测试与调优
1. 单元测试覆盖
2. 性能基准测试
3. 用户体验验证

## 6. 风险评估

### 6.1 性能风险
- **风险**: 并发查询可能增加响应时间
- **缓解**: 设置合理超时，添加loading状态

### 6.2 成本风险
- **风险**: LM调用增加API成本
- **缓解**: 可配置开关，监控使用量

### 6.3 质量风险
- **风险**: 扩展查询可能偏离原意
- **缓解**: 调优提示词，添加结果验证

## 7. 监控指标

### 7.1 性能指标
- 平均响应时间
- 并发查询成功率
- 去重效率（原始结果数 vs 最终结果数）

### 7.2 业务指标
- 用户查询成功率
- 图书点击率变化
- 用户满意度反馈

## 8. 附录

### 8.1 系统提示词示例
详见：`public/prompts/simple_expanded_probes.md`

### 8.2 相关文档
- [Vercel AI SDK文档](https://sdk.vercel.ai/)
- [Next.js App Router指南](https://nextjs.org/docs/app)
- [项目现有API文档](./api-documentation.md)