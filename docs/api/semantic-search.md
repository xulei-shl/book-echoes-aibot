# 图书语义检索 API 使用说明文档

本文档介绍《书目回响》图书语义检索模块（`search`）的对外开放 API。  
本套 API 采用**双路混合检索**（BM25 词法 + 稠密向量余弦）与**大模型意图理解与精排**机制，并专为 **LLM Agent 工具调用** 设计了“渐进式披露”（Progressive Disclosure）能力。

---

## 目录
- [一、全局说明与认证](#一全局说明与认证)
- [二、接口清单](#二接口清单)
- [三、核心接口详解](#三核心接口详解)
  - [1. 图书语义检索 (`POST /api/semantic-search`)](#1-图书语义检索-post-apisemantic-search)
  - [2. 单书全量详情 (`GET /api/books/{id}`)](#2-单书全量详情-get-apibooksid)
  - [3. 全量检索结果导出 (`GET /api/semantic-search/export`)](#3-全量检索结果导出-get-apisemantic-searchexport)
- [四、Agent 工具调用最佳实践](#四agent-工具调用最佳实践)
- [五、代码调用示例](#五代码调用示例)
  - [cURL](#curl)
  - [Python](#python)
  - [TypeScript / Node.js](#typescript--nodejs)
- [六、状态码与错误处理](#六状态码与错误处理)

---

## 一、全局说明与认证

### 1. 基础地址 (Base URL)
- 本地开发：`http://localhost:3000`
- 生产环境：`https://<your-domain>`

### 2. 跨域支持 (CORS)
所有开放接口均已默认配置 CORS 响应头，支持来自任意域名的客户端、小程序及外部后端调用：
```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key
```

### 3. API 鉴权 (Authentication)
服务端通过环境变量 `SEARCH_API_KEY` 控制鉴权：
- **已配置 `SEARCH_API_KEY` 时**：调用方须在请求 Header 中携带 API Key，支持以下两种形式之一：
  - `Authorization: Bearer <YOUR_API_KEY>`
  - `x-api-key: <YOUR_API_KEY>`
- **未配置 `SEARCH_API_KEY` 时**：开放访问，同源前端与外部请求均可直接调用。

---

## 二、接口清单

| 接口名称 | 请求方式 | 路径 | 核心用途 |
| :--- | :--- | :--- | :--- |
| **图书语义检索** | `POST` | `/api/semantic-search` | 执行混合语义检索，支持字段裁剪与视图预设（默认仅返回 5 条核心字段） |
| **单书全量详情** | `GET` | `/api/books/{id}` | 按条码或 ISBN 获取图书无损全量数据（含千字目录与长摘要） |
| **全量结果包导出** | `GET` | `/api/semantic-search/export` | 将单次检索的所有候选图书以 JSON 文件形式一键打包下载 |

---

## 三、核心接口详解

### 1. 图书语义检索 (`POST /api/semantic-search`)

执行高精度自然语言语义搜索。默认已针对 Agent 上下文进行极简压缩，**单次请求仅返回前 5 条结果**。

#### 请求参数 (JSON Body)

| 字段名 | 类型 | 必填 | 默认值 | 描述 |
| :--- | :--- | :---: | :---: | :--- |
| `query` | `string` | **是** | - | 自然语言检索语句（最长 300 字符），如 `"探讨存在主义与荒谬感的小说"` |
| `limit` | `number` | 否 | `5` | 返回结果数量（范围：`1 ~ 24`，默认 5 条） |
| `view` | `string` | 否 | `"compact"` | 视图预设，枚举值：<br>• `compact`：**（默认）** 极简定位视图，约 30~50 Tokens/条<br>• `summary`：摘要视图，包含内容简介、初评理由等<br>• `full`：全量视图，保留完整目录与大模型诊断面板 |
| `fields` | `string[]` | 否 | - | 自定义字段集。若传入此项，则覆盖 `view` 预设，仅返回指定字段（如 `["title", "author", "rating"]`） |
| `mode` | `string` | 否 | `"fast"` | 检索模式：`"fast"`（两路召回+单批精排）或 `"deep"`（分片召回+深度候选池） |
| `filters` | `object` | 否 | - | 硬筛选条件过滤对象（详见下表） |

##### `filters` 过滤对象支持属性：
- `minRating` (`number`): 豆瓣最低评分（0 ~ 10）
- `pubYearFrom` (`number`): 出版年份下限（1900 ~ 2100）
- `excludeFiction` (`boolean`): 是否排除虚构类作品（小说类）
- `callClasses` (`string[]`): 中图法分类号列表，如 `["I", "B5", "TP3"]`

---

#### 响应格式

##### 1.1 默认紧凑视图 (`view: "compact"`)
专为 Agent 设计，严格剥离目录、长文本与图片，10 本书耗费 Token 通常小于 500。

**请求示例**：
```bash
curl -X POST "http://localhost:3000/api/semantic-search" \
  -H "Content-Type: application/json" \
  -d '{"query": "加缪 存在主义"}'
```

**响应示例**：
```json
{
  "query": "加缪 存在主义",
  "mode": "fast",
  "total": 1,
  "results": [
    {
      "id": "11029384",
      "title": "局外人",
      "author": "阿尔贝·加缪",
      "pubYear": "2020",
      "rating": "9.1",
      "callNumber": "I565.45/123",
      "relevancePct": 96,
      "deepLink": "/2025-08?focus=11029384",
      "detailUrl": "/api/books/11029384"
    }
  ],
  "abstained": false,
  "abstainReason": null,
  "exportUrl": "/api/semantic-search/export?query=%E5%8A%A0%E7%BC%AA+%E5%AD%98%E5%9C%A8%E4%B8%BB%E4%B9%89&limit=5",
  "metadata": {
    "totalMs": 280,
    "basedOn": "retrieval"
  }
}
```

##### 1.2 摘要视图 (`view: "summary"`)
在 `compact` 基础上补充中等长度的关键文本（`summary` 内容简介、`reason` 初评理由、`recommendation` 推荐语、`isbn` 等）。

##### 1.3 自定义字段裁剪 (`fields: ["title", "rating", "summary"]`)
仅返回调用方关心的字段组合，始终保留 `detailUrl` 作为全量数据指针。

##### 1.4 NDJSON 流式进度事件
若请求头包含 `Accept: application/x-ndjson`，服务端将以流式输出检索进度：
- `{"event": "stage", "data": {"stage": "preparing"}}`
- `{"event": "stage", "data": {"stage": "scanning"}}`
- `{"event": "stage", "data": {"stage": "reranking"}}`
- `{"event": "done", "data": { ...最终裁剪后的搜索结果... }}`

---

### 2. 单书全量详情 (`GET /api/books/{id}`)

获取单本图书的完整结构化数据。本接口由内存高速缓存驱动，$O(1)$ 极速响应。

#### 请求路径
- `GET /api/books/{id}`
- 参数 `id`：图书条码（Barcode，如 `11029384`）或 ISBN 均可。

#### 响应示例
```json
{
  "id": "11029384",
  "sourceId": "2025-08",
  "book": {
    "id": "11029384",
    "month": "2025-08",
    "title": "局外人",
    "author": "阿尔贝·加缪",
    "translator": "柳鸣九",
    "publisher": "上海译文出版社",
    "pubYear": "2020",
    "pages": "168",
    "rating": "9.1",
    "callNumber": "I565.45/123",
    "isbn": "9787532785000",
    "recommendation": "荒诞哲学的文学代表作。",
    "reason": "初评理由：深入揭示个体面对荒诞世界时的疏离与坚守。",
    "summary": "《局外人》讲述了主人公默尔索在母亲去世后的生活经历……（完整千字正文）",
    "authorIntro": "阿尔贝·加缪（1913-1960），法国著名作家、哲学家，诺贝尔文学奖获得者。",
    "catalog": "第一部\n第一章 今天，妈妈死了……\n第二章 星期天……\n第二部\n……（完整目录）",
    "coverUrl": "https://...",
    "doubanLink": "https://book.douban.com/subject/..."
  },
  "clc": {
    "primary": "I",
    "level1": "I",
    "level2": "I5"
  },
  "numeric": {
    "rating": 9.1,
    "pubYear": 2020,
    "pages": 168
  }
}
```

---

### 3. 全量检索结果导出 (`GET /api/semantic-search/export`)

直接生成并下载包含本次检索命中全部图书全量字段的 JSON 文件。

#### 请求参数 (Query Parameters)
- `query` / `q`（必填）：检索关键词
- `mode`（可选）：`fast` 或 `deep`
- `limit`（可选）：数量上限（默认 5，最高 24）
- `minRating` / `pubYearFrom` / `excludeFiction` / `callClasses`（可选）：同检索筛选条件

#### 响应
- `Content-Type`: `application/json; charset=utf-8`
- `Content-Disposition`: `attachment; filename="semantic-search-<query>.json"`

---

## 四、Agent 工具调用最佳实践

当使用 LLM（如 OpenAI、Claude、Gemini 等）构建 Agent 时，推荐使用**两阶段工具调用（渐进式披露）**模式：

```
[Agent 思考] 
      │
      ▼
1. 阶段一：调用 `search_books` (默认返回 compact 视图)
   - 输入 query: "存在主义"
   - 输出: 5 本图书的精简概要 + 每本书的 detailUrl (消耗 ~200 Tokens)
      │
      ▼
2. 阶段二：Agent 自主挑选最契合的 1 本书，调用 `get_book_detail`
   - 输入 detailUrl 或 id: "11029384"
   - 输出: 该书的完整章节目录与长简介 (按需消耗 ~1000 Tokens)
```

### Tool / Function Calling 定义示例 (JSON Schema)

```json
[
  {
    "name": "search_books",
    "description": "语义检索图书馆藏。返回匹配度最高的前5本图书列表（紧凑字段，节省上下文）。",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "自然语言查询词，如：'关于数字游民与空间漫游的书'"
        },
        "limit": {
          "type": "integer",
          "description": "返回条数，默认 5，最大 24"
        }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get_book_detail",
    "description": "获取指定图书的完整全量数据（包含章节长目录、详细内容介绍等）。仅在确定需要深读某本书时调用。",
    "parameters": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "图书条码 ID（由 search_books 返回中的 id 或 detailUrl 提供）"
        }
      },
      "required": ["id"]
    }
  }
]
```

---

## 五、代码调用示例

### cURL

```bash
# 1. 默认紧凑检索（返回前 5 条）
curl -X POST "http://localhost:3000/api/semantic-search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"query": "现代性危机与社会规训"}'

# 2. 携带筛选条件，获取前 3 条摘要视图
curl -X POST "http://localhost:3000/api/semantic-search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "社会学经典",
    "limit": 3,
    "view": "summary",
    "filters": {
      "minRating": 8.5,
      "pubYearFrom": 2015
    }
  }'

# 3. 按条码获取单书全量详情
curl -X GET "http://localhost:3000/api/books/11029384"
```

### Python

```python
import requests

BASE_URL = "http://localhost:3000"
HEADERS = {
    "Content-Type": "application/json",
    # "Authorization": "Bearer YOUR_API_KEY"  # 若配置了鉴权
}

# 1. 检索图书（默认紧凑输出）
search_res = requests.post(
    f"{BASE_URL}/api/semantic-search",
    headers=HEADERS,
    json={"query": "人工智能伦理与机器意识", "limit": 5}
)
search_data = search_res.json()
print(f"找到 {search_data['total']} 本书:")
for item in search_data["results"]:
    print(f"- 《{item['title']}》 ({item['author']}) | 匹配度: {item['relevancePct']}%")
    print(f"  详情直链: {item['detailUrl']}")

# 2. 按需拉取第一本书的完整目录与长简介
if search_data["results"]:
    first_book_id = search_data["results"][0]["id"]
    detail_res = requests.get(f"{BASE_URL}/api/books/{first_book_id}", headers=HEADERS)
    full_book = detail_res.json()["book"]
    print(f"\n《{full_book['title']}》全书目录:")
    print(full_book["catalog"])
```

### TypeScript / Node.js

```typescript
const BASE_URL = 'http://localhost:3000';

async function search() {
  // 1. 检索
  const res = await fetch(`${BASE_URL}/api/semantic-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
      query: '博尔赫斯风格的奇幻小说',
      view: 'compact',
      limit: 5
    })
  });

  const data = await res.json();
  console.log(`检索完成，命中 ${data.total} 条：`);

  // 2. 获取单书全量详情
  if (data.results.length > 0) {
    const detailRes = await fetch(`${BASE_URL}${data.results[0].detailUrl}`);
    const detailData = await detailRes.json();
    console.log('第一本书全量元数据：', detailData.book);
  }
}

search();
```

---

## 六、状态码与错误处理

| HTTP 状态码 | 含义 | 常见原因与处理方案 |
| :---: | :--- | :--- |
| `200` | 成功 | 请求成功完成，正常返回结果。 |
| `400` | 参数错误 | `query` 缺失或超过 300 字符；`limit` 超出范围；`filters.callClasses` 含有未知类号。 |
| `401` | 未授权 | 服务端配置了 `SEARCH_API_KEY`，但请求未携带有效的 Bearer 令牌或 `x-api-key`。 |
| `403` | 禁止访问 | 凭证不匹配，或者在未授权状态下触发跨源安全保护。 |
| `404` | 资源未找到 | 语义检索功能未启用（环境变量 `SEMANTIC_SEARCH_ENABLED !== '1'`），或单书详情不存在。 |
| `429` | 频控超限 | 短时间内调用过于频繁（默认超过 30次/分钟），请稍作重试。 |
| `502` / `503` | 上游/服务未就绪 | 缺少大模型配置（`TYPESAFE_API_KEY` 缺失）或远程大模型超时。 |
