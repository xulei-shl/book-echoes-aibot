# 开发变更记录
- **日期**: 2026-04-02
- **对应需求**: 本地 AIBot LLM 配置统一与失败切换重构

## 1. 变更摘要
- 统一本地 AIBot 所有 LLM 调用配置来源，改为优先从 `.env.local` 读取 primary / secondary 模型配置，不再让简单检索、深度检索、分类器各自走不同选型逻辑。
- 新增共享 LLM 调用层，支持 `generateText`、`streamText`、`/chat/completions` 三类调用在主模型失败时自动切换备用模型重试。
- 保留现有业务层降级行为：分类失败仍回退规则默认结果；查询扩展失败仍回退原始 query；关键词 JSON 解析失败仍回退用户原始输入。
- 清理了多个路由内重复的 `createModel` / `resolveLLMConfig` / 直接调用模型逻辑，减少后期维护时的漂移风险。

## 2. 背景与问题
在本次重构前，本地 AIBot 的 LLM 选型逻辑存在明显分叉：

- `src/core/aibot/classifier.ts` 对分类器模型做了硬编码覆盖（曾固定为 `gemini-flash-latest`）。
- `src/core/aibot/researchWorkflow.ts` 在聊天主回答路径会读取 retrieval 返回的 `llm_hint`，可能覆盖 `.env.local` 中的默认模型配置。
- `app/api/local-aibot/deep-search-analysis/route.ts`、`deep-interpretation/route.ts`、`generate-keywords/route.ts` 等其他接口则直接使用 `AIBOT_LLM_*`。

这导致线上排查问题时会出现“简单检索正常、深度检索失败，但两边并没有走同一套 LLM 配置”的情况，配置来源不透明，维护成本高。

## 3. 设计目标
本次重构的目标有两个：

1. **统一配置来源**：本地 AIBot 的所有 LLM 调用统一由 `.env.local` 控制。
2. **增加失败切换**：某一步的 LLM 调用失败时，不立即报错，而是切换到备用模型重试一次。

注意：本次采用的是**步骤级 fallback**，不是整条工作流重跑。也就是说，如果 deep-search-analysis 在“关键词生成”这一步失败，只会重试这一小步，不会重做已完成的搜索或前置分析。

## 4. 新增与调整的环境变量
### 推荐配置（双模型）
```env
AIBOT_LLM_PRIMARY_BASE_URL=http://XXXX/v1
AIBOT_LLM_PRIMARY_API_KEY=sk-XXXX
AIBOT_LLM_PRIMARY_MODEL=gpt-4.1-mini

AIBOT_LLM_SECONDARY_BASE_URL=http://XXXX/v1
AIBOT_LLM_SECONDARY_API_KEY=sk-XXXX
AIBOT_LLM_SECONDARY_MODEL=gpt-4.1-mini
```

### 兼容旧配置（单模型）
```env
AIBOT_LLM_BASE_URL=http://XXXX/v1
AIBOT_LLM_API_KEY=sk-XXXX
AIBOT_LLM_MODEL=gpt-4.1-mini
```

### 当前解析规则
- 优先读取 `AIBOT_LLM_PRIMARY_*`
- 如果配置了 `AIBOT_LLM_SECONDARY_*`，则作为备用候选模型
- 如果没有配置 `PRIMARY_*`，则自动回退到旧的 `AIBOT_LLM_*` 作为 primary
- 本地模式下不再允许 retrieval 的 `llm_hint` 改写 LLM 选型

## 5. 关键实现变更
### 5.1 `src/utils/aibot-env.ts`
- 新增 `resolveLLMCandidates()`，用于统一解析主/备模型候选列表。
- `resolveLLMConfig()` 语义收敛为“返回 primary 配置”，不再让 `hint` 改写本地 LLM 配置。
- 保留旧变量兼容逻辑，避免已有环境立即失效。

### 5.2 `src/core/aibot/llmClient.ts`（新增）
新增统一的 LLM 调用入口，集中封装：

- `generateTextWithFallback(...)`
- `streamTextWithFallback(...)`
- `postChatCompletionsWithFallback(...)`
- `getLLMConfigSummary()`

该模块负责：
- 基于候选配置创建模型实例
- 依次尝试 primary / secondary
- 对 retryable 错误执行切换重试
- 记录 candidate index、model、baseURL、失败原因

### 5.3 重试触发条件
当前会触发备用模型切换的错误包括：
- timeout / timed out
- network / fetch failed / socket / ECONNRESET
- HTTP 408 / 409 / 429
- HTTP 5xx
- provider bad response 等上游异常

当前不会重试的情况：
- 本地环境变量缺失
- 请求参数校验错误
- 明确的非可恢复 4xx 业务错误

### 5.4 `src/core/aibot/classifier.ts`
- 删除了分类器硬编码 Gemini 模型的逻辑。
- 分类调用改为使用 `generateTextWithFallback(...)`。
- 若 primary / secondary 都失败，仍保留原有 rule fallback，默认回到 `search`。

### 5.5 `src/core/aibot/researchWorkflow.ts`
- `runDraftWorkflow()` 两步 LLM 调用都切到共享 fallback helper。
- `buildChatWorkflowContext()` 不再使用 retrieval `llm_hint` 改写模型配置。
- 聊天/简单检索主回答的模型配置现在与深度检索一致，统一由 `.env.local` 控制。

### 5.6 `src/core/aibot/queryExpansionService.ts`
- 原先手写 `fetch(${baseURL}/chat/completions)` 的逻辑改为走 `postChatCompletionsWithFallback(...)`。
- 查询扩展失败后仍保留“只使用原始 query”的降级行为。

### 5.7 API Route 层清理
以下路由已接入共享 helper，移除 route 内重复建模逻辑：

- `app/api/local-aibot/chat/route.ts`
- `app/api/local-aibot/deep-search-analysis/route.ts`
- `app/api/local-aibot/deep-interpretation/route.ts`
- `app/api/local-aibot/document-analysis/route.ts`
- `app/api/local-aibot/generate-keywords/route.ts`
- `app/api/local-aibot/generate-interpretation/route.ts`

其中：
- 非流式调用改为 `generateTextWithFallback(...)`
- 流式调用改为 `streamTextWithFallback(...)`
- 深度检索分析保留并增强了配置/错误透出能力，便于现场排查当前实际使用的候选模型

## 6. 对运行行为的影响
### 6.1 简单检索
重构前：
- 分类器可能走硬编码 Gemini
- 主回答可能被 retrieval `llm_hint` 改写

重构后：
- 分类、查询扩展、主回答全部统一走 `.env.local`
- 主模型失败后可自动切备用模型

### 6.2 深度检索
重构前：
- 默认只走一套 `AIBOT_LLM_*`
- 某一步失败直接报错

重构后：
- 关键词生成、单篇分析、交叉分析统一走 `.env.local`
- 每一步都支持 primary -> secondary 切换
- 错误透出仍保留阶段信息，便于判断失败发生在 `keyword` / `analysis` / `cross-analysis`

### 6.3 查询扩展
重构前：
- 单模型调用失败直接进入降级

重构后：
- 先尝试 secondary
- 两个候选都失败后，才退回“仅原始 query”

## 7. 文件清单
- `src/utils/aibot-env.ts`: 修改，新增候选 LLM 配置解析
- `src/core/aibot/llmClient.ts`: 新增，统一 LLM 调用与 fallback
- `src/core/aibot/researchWorkflow.ts`: 修改，移除 hint 改模型逻辑，接入 fallback helper
- `src/core/aibot/classifier.ts`: 修改，移除硬编码 Gemini，接入 fallback helper
- `src/core/aibot/queryExpansionService.ts`: 修改，接入 `/chat/completions` fallback
- `app/api/local-aibot/chat/route.ts`: 修改
- `app/api/local-aibot/deep-search-analysis/route.ts`: 修改
- `app/api/local-aibot/deep-interpretation/route.ts`: 修改
- `app/api/local-aibot/document-analysis/route.ts`: 修改
- `app/api/local-aibot/generate-keywords/route.ts`: 修改
- `app/api/local-aibot/generate-interpretation/route.ts`: 修改
- `.env.local.example`: 修改，补充 primary / secondary 配置样例
- `tests/aibot/env.test.ts`: 修改
- `tests/core/aibot/classifier.spec.ts`: 修改

## 8. 维护建议
1. 后续新增本地 AIBot 接口时，**不要在 route 内重新实现 `createOpenAICompatible` / `generateText` / `streamText`**，优先复用 `src/core/aibot/llmClient.ts`。
2. 如果以后需要支持第三个候选模型，建议扩展 `resolveLLMCandidates()` 的解析规则，而不是在 route 内临时加 fallback。
3. 若要把“切换到备用模型”的信息显示到前端 UI，可继续基于 `LLMCallFailure.attempts` 或 `getLLMConfigSummary()` 做阶段提示。
4. 若要区分“可重试 403”和“不可重试 403”，建议在 `llmClient.ts` 内增加更细的 provider error 分类，不要把逻辑散落到各路由里。

## 9. 测试结果
- [x] 构建通过（`npm run build`）
- [ ] 单元测试通过（当前仓库未安装本地 `vitest`，执行测试时会因 `vitest/config` 缺失而失败，需要补齐测试依赖后再跑）
- [ ] 核心路径手工验证通过
