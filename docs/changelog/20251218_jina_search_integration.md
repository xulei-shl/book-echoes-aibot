# 深度检索集成 Jina AI Search API 变更记录

- **Date**: 2025-12-18
- **Author**: Claude Code
- **Related Design**: [jina-search-integration_20251218.md](../design/jina-search-integration_20251218.md)

## 变更概述

将深度检索流程中的网络搜索服务从 DuckDuckGo MCP 替换为 Jina AI Search API，同时保留 DuckDuckGo 作为后备方案。

## 变更文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/core/aibot/jina/jinaResearcher.ts` | Jina AI Search API 和 Reader API 封装模块 |
| `src/core/aibot/webSearchService.ts` | 统一的网络搜索入口，支持 Jina/DuckDuckGo 切换和自动回退 |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `src/core/aibot/types.ts` | 新增 `JinaSearchOptions`、`WebSearchSnippet` 类型定义 |
| `src/core/aibot/constants.ts` | 新增 `JINA_SEARCH_PER_KEYWORD`、`JINA_API_TIMEOUT` 常量 |
| `app/api/local-aibot/deep-search-analysis/route.ts` | 将搜索调用切换为统一的 `performWebSearch()` |
| `.env.local` | 新增 Jina AI 配置项 |

## 新增配置项

```bash
# Jina AI API Key（必须配置）
JINA_API_KEY=your_jina_api_key_here

# 是否使用 Jina 搜索（可选，默认 true）
USE_JINA_SEARCH=true

# 是否启用全文获取（可选，默认 false）
JINA_FETCH_CONTENT=false
```

## 核心功能

### 1. Jina Search API 调用

- 端点：`https://s.jina.ai/`
- 每个关键词返回 3 条结果
- 超时时间：30 秒

### 2. 自动回退机制

```
Jina 搜索 → 成功 → 返回结果
    ↓ 失败
DuckDuckGo 搜索 → 成功 → 返回结果
    ↓ 失败
返回错误占位结果
```

### 3. Reader API（预留接口）

- 当前默认不启用
- 可通过 `JINA_FETCH_CONTENT=true` 开启
- 用于获取网页全文内容

## 使用说明

1. 从 https://jina.ai/?sui=apikey 获取免费 API Key
2. 在 `.env.local` 中配置 `JINA_API_KEY`
3. 重启开发服务器

## 回滚方案

如需回滚到 DuckDuckGo：
```bash
USE_JINA_SEARCH=false
```

## 测试验证

- [x] TypeScript 编译通过
- [ ] 深度检索流程端到端测试
- [ ] Jina 搜索结果质量验证
- [ ] 回退机制验证
