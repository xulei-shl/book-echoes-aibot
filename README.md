# 书海回响 · Book Echoes

> 基于上海图书馆借阅数据的书目推荐项目 —— 那些被悄悄归还的一本好书。

把每月入选的书目做成可翻阅的数字刊物：**月份牌**、**睡美人**（新书推荐）、**主题卡**、**文学 FM** 四种内容形态，外加**往期回顾**、**随机漫步**，以及两个可选的智能模块 —— **AIBot 对话助手**与**语义检索**。两个智能模块默认关闭，开启前不影响任何现有页面。

---

## 目录

- [1. 功能一览](#1-功能一览)
- [2. 技术栈](#2-技术栈)
- [3. 快速开始](#3-快速开始)
- [4. 环境变量](#4-环境变量)
- [5. 内容数据与构建流水线](#5-内容数据与构建流水线)
- [6. 语义检索](#6-语义检索)
- [7. AIBot 对话助手](#7-aibot-对话助手)
- [8. 测试](#8-测试)
- [9. 部署](#9-部署)
- [10. 目录结构](#10-目录结构)
- [11. 相关文档](#11-相关文档)

---

## 1. 功能一览

| 路径 | 说明 | 开关 |
|---|---|---|
| `/` | 首页：最新一期的封面轮播与站内导航 | — |
| `/[month]` | 内容页，Canvas 卡片交互；`month` 即 `sourceId`（见 [5.1](#51-目录约定)） | — |
| `/archive` | 往期回顾：按年份归档全部期刊与专题 | — |
| `/random` | 随机漫步：从全库随机抽一本书 | — |
| `/search` | 语义检索：自然语言找书，结果带相关度与「为什么」 | `NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH=1` |
| 右下角悬浮入口 | AIBot：检索、深度解读、文档分析、深度检索 | `NEXT_PUBLIC_ENABLE_AIBOT_LOCAL=1` |

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router，`force-static` + `revalidate = 3600` 为主） |
| UI | React 19、TypeScript、Tailwind CSS 4、framer-motion |
| 状态 | zustand（`store/`） |
| AI | Vercel AI SDK（`ai` + `@ai-sdk/openai-compatible`）、MCP SDK |
| 资源 | Cloudflare R2（书目图片与 Web 字体），`sharp` 处理图片 |
| 数据 | 构建期从 Excel 生成 `public/content/**/metadata.json` |
| 测试 | Vitest（`tests/`） |

## 3. 快速开始

### 3.1 环境要求

- **Node.js** ≥ 20.9（`next@16` 的 `engines` 要求；`vitest` 要求 20 / 22 / ≥ 24，所以推荐 **v22 LTS 或 v24**；本仓库开发环境为 v24）
  > ⚠️ 旧的 [`docs/deploy-ubuntu.md`](docs/deploy-ubuntu.md) 里写的是「≥ 18.18」，那是升级到 Next 16 之前的说法，已不适用。
- **npm**（使用 `package-lock.json` 锁定版本）

> `npm run build:vectors` 依赖 Node 内置的 `--env-file-if-exists` 自动加载 `.env` / `.env.local`。若你的 Node 版本较旧、不认识这个 flag，直接用 `EMBEDDING_API_KEY=sk-xxx node scripts/build-search-vectors.mjs` 手传环境变量即可。

### 3.2 安装与配置

```bash
npm install

cp .env.example .env                 # 公共 / 服务端配置（R2、开关、TYPESAFE_API_KEY）
cp .env.local.example .env.local     # 敏感配置（LLM key、embedding key、代理）
```

两个模板里的值都需要按实际环境替换。**只有 `.env.example` 与 `.env.local.example` 会进 Git，真正的 `.env` / `.env.local` 已被忽略。**

### 3.3 启动

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器，http://localhost:3000 |
| `npm run build` / `npm run start` | 生产构建 / 生产运行 |
| `npm test` / `npm run test:watch` | Vitest 单次 / 监听 |
| `npm run lint` | ESLint |
| `npm run init-fonts` | 初始化 Web 字体并上传到 R2 |
| `npm run build:vectors` | 生成 / 增量更新语义检索的向量索引 |
| `npm run eval` | 语义检索评测（离线、无需 Jev key），报表写到 `evals/runs/` |
| `npm run eval:worksheet` | 生成人工标注工作表 `evals/runs/worksheet.md`（相关性档次真值） |

## 4. 环境变量

### 4.1 `.env.example` → `.env`（公共 / 服务端）

| 变量 | 默认 | 说明 |
|---|---|---|
| `R2_ENDPOINT` | — | R2 的 S3 兼容端点 |
| `R2_BUCKET_NAME` | — | 存储桶名 |
| `R2_BASE_PATH` | `data` | 对象前缀 |
| `R2_FONTS_PATH` | `fonts` | 字体对象前缀 |
| `R2_PUBLIC_URL` | — | 服务端读取素材用的公开地址 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | — | R2 凭据（服务端需要，故在 `.env`） |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | — | 前端直连地址；同时用于 `app/layout.tsx` 拼字体 CSS |
| `TYPESAFE_API_KEY` | — | Jev / TypeSafe 鉴权，**语义检索必需** |
| `SEMANTIC_SEARCH_ENABLED` | `0` | 服务端开关；`0` 时 `/api/semantic-search` 一律返回 404 |
| `NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH` | `0` | 前端入口开关；`0` 时首页与顶栏不渲染「语义检索」入口 |

> 两个开关都是 **`0` 关、`1` 开，且都要设成 `1` 才真正可用**（一个管接口、一个管入口）。`NEXT_PUBLIC_*` 在构建期内联，改完需重启 dev server 或重新 build。
>
> 另见 `UPLOAD_TO_R2`（默认 `true`）：设为 `false` 时三个 R2 相关脚本只做本地处理、不真正上传。
>
> **检索质量阈值**默认写在 `lib/search/tuning.ts`（签名与不变量见同目录 `tests/core/search/tuning.test.ts`）；需要线上应急调参时，可用 `SEMANTIC_SEARCH_*` 环境变量**临时覆盖**（白名单与取值范围见 `.env.example`）。非法值会被拒绝并随响应回传原因，本次生效值也在响应的 `tuning` 字段里 —— 不存在「线上为什么和本地不一样」这种悬案。结构上限（分片/预算/TTL/截断长度）在 `config.ts`，不建议用环境变量改。

### 4.2 `.env.local.example` → `.env.local`（敏感）

| 变量 | 默认 | 说明 |
|---|---|---|
| `AIBOT_LOCAL_ENABLED` | `1` | 服务端开关；必须为 `1`，否则 AIBot 接口直接拒绝 |
| `NEXT_PUBLIC_ENABLE_AIBOT_LOCAL` | `1` | 前端入口开关；必须为 `1` 才显示悬浮按钮 |
| `AIBOT_LLM_PRIMARY_BASE_URL` / `_API_KEY` / `_MODEL` | — | 主模型（OpenAI 兼容接口） |
| `AIBOT_LLM_SECONDARY_*` | — | 可选备用模型，主模型失败时自动切换 |
| `AIBOT_LLM_TEMPERATURE` | — | 全局温度，可被 `<prefix>_TEMPERATURE` 覆盖 |
| `USE_JINA_SEARCH` / `JINA_API_KEY` | — | 正文抽取；未配 Jina key 时回退 DuckDuckGo |
| `HTTP_PROXY` / `HTTPS_PROXY` | — | 可选外网代理，**必须带协议头**；Docker 部署时别假设 `127.0.0.1` 指向宿主机 |
| `BOOK_API_BASE_URL` | `http://127.0.0.1:8001` | 外部书库服务（AIBot 检索用，**代码不在本仓库内**）；代码兜底值是 `127.0.0.1:8001`，模板里预填的是内网地址 |
| `EMBEDDING_BASE_URL` | `https://api.siliconflow.cn/v1` | embedding 服务端点，OpenAI 兼容 |
| `EMBEDDING_API_KEY` | — | **查询期必需**；未配置则稠密向量 lane 降级为纯词法 |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | 建库与查询必须同一模型 |
| `EMBEDDING_DIM` | `1024` | 维度，与向量文件 header 做硬校验 |
| `EMBEDDING_TIMEOUT_MS` | `1500` | 查询期 embed 超时，超时即退纯词法 |

> AIBot 深度检索的网络搜索还读 `TAVILY_API_KEY` / `EXA_API_KEY`（配了 Tavily 就用 Tavily，否则用 Exa）。这两个变量目前未写进模板，需要时自行加到 `.env.local`，细节见 `src/utils/aibot-env.ts` 与 `src/core/aibot/searchConfig.ts`。

### 4.3 语义检索调参（都可选，代码里有默认值）

| 变量 | 默认 | 说明 |
|---|---|---|
| `SEMANTIC_SEARCH_DEFAULT_MODE` | `fast` | 设为 `deep` 时默认走宽召回 |
| `JEV_MODEL` | `jev-latest` | Jev 模型名 |
| `JEV_TIMEOUT_MS` | `20000` | Jev 请求超时 |
| `SEMANTIC_SEARCH_WIDE_SHARD` | `50` | `deep` 模式分片大小 |
| `SEMANTIC_SEARCH_MAX_SHARDS` | `16` | 分片数量上限 |
| `SEMANTIC_SEARCH_FORCE_FAST_ABOVE` | `3000` | 语料超过这个规模就强制 `fast` |
| `SEMANTIC_SEARCH_JEV_BUDGET_PER_MIN` | `60` | 每分钟 Jev 请求预算 |

## 5. 内容数据与构建流水线

### 5.1 目录约定

`sources_data/` 与 `public/content/` 结构一致，前者放 Excel 原表与图片，后者是构建产物：

```
sources_data/          # 构建输入：Excel 原表 + 图片
  2025/
    2025-09/           # 月份牌
    new/新书推荐/       # 睡美人
    subject/科幻/        # 主题卡
    literature/Survival-Literature-for-Metro/

public/content/        # 构建产物：页面直接读取
  2025/
    2025-09/metadata.json
    new/新书推荐/metadata.json
    subject/科幻/metadata.json
    literature/Survival-Literature-for-Metro/metadata.json
```

四种形态与 `sourceId` 的对应关系（`sourceId` 就是 `/[month]` 的路径段）：

| 形态 | `sourceId` | 目录 |
|---|---|---|
| 月份牌 | `2025-09` | `public/content/2025/2025-09/` |
| 睡美人 | `2025-sleeping-新书推荐` | `public/content/2025/new/新书推荐/` |
| 主题卡 | `2025-subject-<URL 编码后的名称>` | `public/content/2025/subject/科幻/` |
| 文学 FM | `2025-literature-<URL 编码后的名称>` | `public/content/2025/literature/…/` |

每个叶子目录里的 `metadata.json` 是一个**图书对象数组**（字段为中文键：`书目条码`、`豆瓣书名`、`豆瓣作者`、`豆瓣内容简介`、`初评理由`、`索书号` 等）；同目录下的 Markdown 文件会成为该期的文案，`public/About.md` 是「关于」浮层的内容。

### 5.2 内容构建：`scripts/build-content.mjs`

只处理 Excel 中 **`人工评选` 列等于 `通过`** 的书目。执行顺序：

| 步骤 | 动作 |
|---|---|
| Step 1 | 清空目标目录（只清 JSON，图片走 R2） |
| Step 2 | 读取并筛选 Excel |
| Step 3 | 上传图片到 R2（失败时复制到本地兜底） |
| Step 3.5 | 复制同目录的 Markdown 文案 |
| Step 4 | 生成 `metadata.json` |
| Step 5 | 调用 `buildRandomIndex()` 刷新 `random_index.json` |
| Step 6 | 调用 `buildSearchVectors()` 刷新 `search_vectors.bin` |

Step 5 与 Step 6 都是**派生索引**，向量与随机索引都从同一份语料算出，因此必须排在 Step 4 之后。

```bash
node scripts/build-content.mjs 2025-08                                    # 兼容旧写法，月份牌
node scripts/build-content.mjs month 2025-09
node scripts/build-content.mjs sleeping 2025 "2025-06"                    # 名称含空格要加引号
node scripts/build-content.mjs subject 2025 middle-class-status
node scripts/build-content.mjs literature 2025 Survival-Literature-for-Metro
node scripts/build-content.mjs month 2025-09 --skip-vectors               # 跳过 Step 6
```

**关于 Step 6 的失败处理**：向量化需要外网与付费配额。Step 4 / Step 5 的产物已经落盘、页面立即可用，向量只是检索增强，所以这一步**失败只提示、不让整个内容构建失败**（此时语义检索会降级为纯词法，UI 会明示）。缺 `EMBEDDING_API_KEY` 时直接跳过并说明原因；事后可随时单独补跑 `npm run build:vectors`。

`build-search-vectors.mjs` 自带增量：按文本 `hash` 比对复用已有向量，所以挂在内容构建后只会编码**本次新增/变更**的书目，不会重算全库。`--force` 才是整库重编码。

### 5.3 脚本与产物

| 脚本 | 运行方式 | 作用 |
|---|---|---|
| `scripts/build-content.mjs` | 手动，带类型参数 | Excel + 图片 → `metadata.json`，并联动 Step 5 / Step 6 |
| `scripts/build-random-index.mjs` | 被 Step 5 调用，也可单独跑；`--with-images` 才生成原图 WebP 显示图 | 汇总全库为扁平的 `random_index.json`（含原图尺寸与等比占位图）；`--with-images` 时额外把原图重编码为 WebP 并写回索引（需可写 R2） |
| `scripts/build-search-vectors.mjs` | `npm run build:vectors` 或被 Step 6 调用 | 语料 → `search_vectors.bin` |
| `scripts/clean-r2-content.mjs` | 手动，支持 `--dry-run` | 删除 R2 上指定路径的对象 |
| `scripts/init-fonts.mjs` | `npm run init-fonts` | 处理并上传 Web 字体，输出 CSS 片段 |

| 产物 | 位置 | 是否入库 |
|---|---|---|
| `metadata.json` × N | `public/content/**/` | 是 |
| `random_index.json` | `public/content/` | 是 |
| `search_vectors.bin` | `public/content/` | 是 |

三个产物都提交进仓库，因此**构建与部署都不需要 `EMBEDDING_API_KEY`** —— 只有重建向量时才需要。

```bash
# 重建向量（key 放在 .env / .env.local，由 npm script 自动加载）
npm run build:vectors
npm run build:vectors -- --force          # 忽略增量，整库重编码
npm run build:vectors -- --model=BAAI/bge-m3 --dim=1024 --batch=32
```

### 5.4 字体

```bash
npm run init-fonts
```

按脚本输出的 CSS 示例更新 `app/globals.css`，把字体 URL 换成 R2 地址即可完成字体 Web 化。`app/layout.tsx` 会依据 `NEXT_PUBLIC_R2_PUBLIC_URL || R2_PUBLIC_URL` 注入 `--font-*-src` 变量。

### 5.5 修改内容后

改了 `public/content/` 下的内容（或用上面的脚本重建过）之后，页面是 `force-static` + ISR，需要：

```bash
npm run build
# 生产环境再重启服务
systemctl restart book-echoes.service
```

## 6. 语义检索

用自然语言描述想找的书（「适合通勤读的短篇推理」「讲数字遗产的社科书」），返回带相关度百分比、命中原因和原文依据的书目。

**链路**：词法 BM25 + 稠密向量双 lane 召回 → RRF 融合取 top-K → Jev 逐本独立精排 → 本地门控与排序。馆藏规模只有几百本且元数据完整，因此**不需要向量数据库**，向量检索就是进程内暴力余弦。

**四条设计原则**：

1. **代码算，Jev 判** —— 召回、去重、分片、排序、门控、降级都在确定性代码里；模型只回答「这本相关吗」这类有界判断。
2. **模型不写字符串，只挑 id** —— 候选项由代码构造并带不透明 id，模型不可能编出一本不存在的书。
3. **概率即产品** —— 同一个概率既当召回阈值、排序键，也当 UI 百分比；量化到 1% 后再排序，保证屏幕上显示的数字就是排序键。
4. **失败是降级不是中断** —— 保留已召回结果、`ranked=false` 沉底，`degraded[]` 与 UI 都明示，绝不返回 0 结果、也不伪装成正常结果。

### 6.1 开关与前置条件

```bash
SEMANTIC_SEARCH_ENABLED=1              # 服务端：否则接口 404
NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH=1   # 前端：否则不显示入口
TYPESAFE_API_KEY=...                   # 必需，缺失时接口返回 503
```

`EMBEDDING_API_KEY` 是**可选**的：不配也能用，只是稠密 lane 降级为纯词法。

### 6.2 向量文件

`public/content/search_vectors.bin` 是构建期产物，格式为 `"BKVS"` 魔数 + 4 字节 little-endian header 长度 + JSON header + `Float32Array` 向量体（已 L2 归一化，余弦即点积）。

加载时会做一致性**硬校验**：`header.model` / `header.dim` / `header.count` 必须分别等于 `EMBEDDING_MODEL` / `EMBEDDING_DIM` / 语料本数，任一不符就抛 `DenseIndexMismatch` 并降级为纯词法 —— 绝不允许拿旧文件去和不同模型的 query 算余弦。所以**建库与查询必须用同一套 embedding 配置**，这也是 `build:vectors` 从环境变量读取模型与维度的原因。

### 6.3 API

`POST /api/semantic-search`（同源校验；每 IP 每分钟 10 次，限流计数在**进程内存**里，重启即清零、多实例不共享）

```jsonc
// 请求
{
  "query": "适合通勤读的短篇推理",     // 必填，≤ 300 字符
  "mode": "fast",                    // 可选：fast | deep
  "limit": 12,                       // 可选：1–24
  "filters": {                       // 可选（硬条件，与查询句解析出的条件取更强约束）
    "minRating": 8,                  //   0–10
    "pubYearFrom": 2015,             //   1900–2100
    "excludeFiction": true           //   排除中图法 I 类（虚构类）
  }
}
```

```jsonc
// 响应（节选）
{
  "query": "…",
  "mode": "fast",
  "basedOn": "exact",                // exact = 显式命中，retrieval = 走召回
  "intent": {
    "type": "concept",
    "facets": { "wantsFiction": 0.5, "wantsRecent": 0.67, … },   // 连续量，0.5 = 中性
    "plan": {                          // 本次真正生效的硬条件与被丢弃的模型约束
      "terms": ["焦虑", "情绪"],       //   送去词法 lane 的 term（已降噪 + IDF 截断）
      "applied": [{ "field": "pubYearFrom", "value": 2015, "source": "rule" }],
      "dropped": [{ "field": "pubYearFrom", "value": 2000, "reason": "rule-conflict" }]
    }
  },
  "results": [{
    "book": { … },
    "sourceId": "2025-09",
    "relevancePct": 82,              // 显示值 == 排序键（fit 量化到 1%）
    "matchPct": 47,                  // choice(best) 的概率百分比
    "rankScore": 0.44,
    "fit": 0.82,                     // 档位归一化适配度 ∈ [0,1]
    "ranked": true,                  // false = 召回成功但语义排序不可用，沉底但仍返回
    "deepLink": "/2025-09?focus=<条码>",
    "lanes": ["lexical", "dense"],
    "why": { "lanes": […], "matched": […], "recallRank": 1, "fitLevel": 3, "fitLevelLabel": "直接回应 query 描述的主题…", "fitConfidence": 0.52, "matchPct": 47, "pNone": 0.12 }
  }],
  "abstained": false,                // 首屏为空 == true；只描述首屏，不代表「馆藏里没有相关的书」
  "abstainReason": null,             // 'hard-filter' | 'fit' | 'batch'；abstained = false 时为 null
  "degraded": [],                    // 如 dense-unavailable / dense-timeout / rerank / understand
  "tuning": {                        // 本次生效的阈值，以及被 env 覆盖/拒绝的项
    "effective": { "fitGate": 0.3, "rrfK": 60, … },
    "overridden": [],                 // 如 [{ "env": "SEMANTIC_SEARCH_RRF_K", "field": "rrfK", "value": 30 }]
    "rejected": []                    // 如 [{ "env": "…", "raw": "abc", "reason": "不是有限数字" }]
  },
  "timing": { "totalMs": 1830, … },
  "judge": { "requestedModel": "jev-latest", "returnedModel": "…", "attempts": 1, … }
}
```

状态码：`404` 模块未开启 · `403` 跨源 · `429` 触发限流 · `503` 缺 `TYPESAFE_API_KEY` · `400` 入参不合法 · `502` Jev 失败。

结果卡上的「为什么」直接来自 `why` 字段；点击结果会跳到 `/[month]?focus=<条码>`，内容页读到 `focus` 后会把那本书设为焦点卡片。

### 6.4 代码位置

| 目录 | 内容 |
|---|---|
| `lib/search/` | 分词、BM25（CSR + TypedArray）、查询理解、向量 lane、RRF 融合、Jev 精排编排、门控与排序 |
| `lib/jev/` | Jev 客户端、响应解码与严格校验、问答组装 |
| `app/api/semantic-search/route.ts` | 接口层：开关、同源、限流、入参校验 |
| `app/search/page.tsx`、`components/search/` | 检索页与结果 UI |

### 6.5 评测集

调参（§4.3 的环境变量）只有在能**测出好坏**时才有意义，所以仓库里带一套离线评测：

```bash
npm run eval            # 自动真值层：硬条件 / 否定守卫 / 精确命中 / 降级 / 条件违规
npm run eval:worksheet  # 摊开候选池，人工填 0–3 档（P1 的前置）
```

- **自动层**（`evals/lib/generate.ts`）真值由语料本身推出，因此可以直接进 CI 当回归门：
  `exact`（书名 / ISBN / 条码 → 0 次 Jev）、`work`（作者名下全部馆藏必须被召回）、
  `constraint`（「2015 年以后」「8 分以上」必须真正过滤）、`constraint-trap`（「不要 2015 年以后」
  「评分不超过 8 分」必须被守卫拦下，而不是反向执行）、`trap`（通用书名不等于精确请求）。
- **排序质量**（nDCG@10 / Recall@40 / 档位 MAE）只记录不断言：没有人工相关性标注之前，
  对它们设阈值等于把噪声写进 CI。自动层跑的是**中性 stub**，量的是结构正确性而非模型水平。
- 真值需要人判的是 `concept` / `similar` / `list` 三层，工作表生成后人工约 1–2 小时；
  录好的真实答卷可用 cassette 回放（`evals/lib/judge.ts`），离线扫阈值零 Jev 成本。
- 产物（`evals/runs/`）不进仓库。

## 7. AIBot 对话助手

右下角悬浮入口，提供书目检索、深度解读、文档分析与深度检索（关键词扩展 → 多轮网络搜索 → 交叉验证 → 生成草稿）。

```bash
AIBOT_LOCAL_ENABLED=1
NEXT_PUBLIC_ENABLE_AIBOT_LOCAL=1
```

服务端接口统一用 `assertAIBotEnabled()` 做门禁，未开启时直接拒绝；前端入口同样受开关控制。需要至少一套完整的 LLM 配置（`AIBOT_LLM_PRIMARY_*` 或旧版 `AIBOT_LLM_*`），否则会明确报配置缺失而不是静默失败。

相关代码：`app/api/local-aibot/*`、`src/core/aibot/`、`components/aibot/`、`store/aibot/`。

## 8. 测试

```bash
npm test              # 全量
npm run test:watch    # 监听
```

测试集中在 `tests/`：`tests/core/search/`（分词、查询、BM25、向量、融合、排序、端到端链路）、`tests/core/jev/`（客户端与解码）、`tests/core/random-index.test.ts`、`tests/core/aibot/` 与 `tests/aibot/`。

`docs/` 下的参考资料自带一套测试（部分依赖 `bun:test`），已在 `vitest.config.ts` 中排除，不参与本项目的 `npm test`。

## 9. 部署

完整步骤见 **[`docs/deploy-ubuntu.md`](docs/deploy-ubuntu.md)**，这里只列要点。

### 9.1 首次部署

```bash
git clone <仓库地址> /opt/book-echoes-aibot
cd /opt/book-echoes-aibot
cp .env.example .env
cp .env.local.example .env.local          # 按实际环境填写
npm install
npm run build
```

### 9.2 systemd

`/etc/systemd/system/book-echoes.service`：

```ini
[Unit]
Description=Book Echoes Aibot Next.js App
After=network.target

[Service]
User=xulei
Group=xulei
WorkingDirectory=/opt/book-echoes-aibot
ExecStart=/usr/local/bin/node node_modules/next/dist/bin/next start
Environment=PORT=3000
Environment=NODE_ENV=production
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=book-echoes

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable book-echoes.service
systemctl start book-echoes.service
```

### 9.3 更新内容

```bash
npm run build                          # 重新构建静态页面
systemctl restart book-echoes.service  # 重启使新构建生效
```

### 9.4 常用命令

```bash
systemctl status book-echoes.service    # 查看状态
systemctl restart book-echoes.service   # 重启
journalctl -u book-echoes -n 50         # 查看日志
```

### 9.5 注意事项

- `.env` 与 `.env.local` 含敏感密钥，已在 `.gitignore` 中，**不要提交**；仓库里只保留两个 `.example` 模板
- `search_vectors.bin` **需要提交**（约 1.8 MiB / 443 本）。它与 `random_index.json` 同级：构建与部署都不需要 embedding key，只有重建向量时才需要
- 内容重建涉及 R2 写操作，别对着生产桶试手；`UPLOAD_TO_R2=false` 可让脚本只做本地处理

## 10. 目录结构

```
app/                    页面与 API 路由
  [month]/              内容页（月份牌 / 睡美人 / 主题卡 / 文学 FM）
  archive/  random/  search/
  api/                  images / random / list-md-files / local-aibot/* / semantic-search
components/             页面组件
  aibot/  search/  BookCard/  MagazineCover/
lib/                    内容读取与检索核心
  content.ts            读取 public/content 与 random_index.json
  search/  jev/         语义检索链路与 Jev 客户端
src/core/aibot/         AIBot 检索引擎（LLM、网络搜索、文档分析）
src/utils/              日志与 AIBot 环境解析
store/                  zustand 状态
scripts/                构建期脚本（内容、索引、向量、字体、R2 清理）
public/content/         内容产物（metadata.json / random_index.json / search_vectors.bin）
sources_data/           Excel 原表与图片（构建输入，不参与页面渲染）
tests/                  Vitest
docs/                   设计文档、部署指南与参考资料
```

## 11. 相关文档

| 文档 | 内容 |
|---|---|
| [`docs/deploy-ubuntu.md`](docs/deploy-ubuntu.md) | Ubuntu 部署与维护、故障排查 |
| [`docs/jev-docs/需求/语义检索-设计方案.md`](docs/jev-docs/需求/语义检索-设计方案.md) | 语义检索完整设计：召回、门控、降级、验收 |
| [`docs/jev-docs/需求/UI-UX设计方案.md`](docs/jev-docs/需求/UI-UX设计方案.md) | 检索页交互与视觉方案 |
| [`docs/jev-docs/官方资料/API reference.md`](docs/jev-docs/官方资料/API%20reference.md) | Jev / TypeSafe 接口资料 |
| [`AGENTS.md`](AGENTS.md) | 本仓库的协作与改动约定 |
| [`docs/DESIGN.md`](docs/DESIGN.md)、[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | 视觉与设计系统 |
| [`docs/random_walk_design.md`](docs/random_walk_design.md) | 随机漫步设计 |

参考网站：<https://goodbooks.io/>
