# AIBot Overlay UI 重构交接文档
- **日期**: 2026-04-02
- **类型**: handoff / UI 样式重构总结
- **范围**: 仅前端样式与交互呈现层，不涉及后端逻辑、API 协议、状态机流程改造

## 1. 本次重构目标
本次工作聚焦于 `components/aibot/AIBotOverlay.tsx` 及其关联 UI 组件的视觉重构，核心目标如下：

1. 让本地 AI 对话弹窗与站点现有设计语言保持一致，避免“像另一个系统”的割裂感。
2. 统一按钮、卡片、滚动条、状态 chip、过程性卡片的风格，提升高级感与可维护性。
3. 在不修改业务流程的前提下，降低“层层嵌套、状态很多”的主观复杂度，保留 human-in-the-loop 的交互友好性。
4. 强化进度反馈、流式生成、草稿确认、图书选择等过程性状态的视觉层次与动态感。

## 2. 设计原则与约束
### 2.1 本次明确遵守的约束
- **不修改后端逻辑**：未调整 `/api/local-aibot/*` 相关接口逻辑。
- **不修改消息流机制**：保留现有 `appendMessage` / `updateMessageContent` / 流式更新方式。
- **不重写状态机**：保留 simple search / deep search / document analysis 的现有阶段流转。
- **不新增复杂抽象**：主要通过共享样式类和局部结构整理来降噪，而不是大规模重构组件职责。

### 2.2 主要视觉策略
- 复用站点现有暗色弹层语言，参考 `components/AboutOverlay.tsx`
- 复用全局品牌变量与字体体系，来自 `app/globals.css`
- 统一为一套 AIBot 专用的样式语义层：shell / panel / workflow card / button / chip / scrollbar

## 3. 本次完成的改动

### 3.1 新增全局 AIBot 视觉语义层
文件：`app/globals.css`

新增或补充了以下样式能力：
- `aibot-scroll`
- `aibot-shell`
- `aibot-panel`
- `aibot-workflow-card`
- `aibot-workflow-header`
- `aibot-workflow-body`
- `aibot-workflow-footer`
- `aibot-chip`
- `aibot-chip--active`
- `aibot-chip--success`
- `aibot-chip--error`
- `aibot-btn`
- `aibot-btn--primary`
- `aibot-btn--secondary`
- `aibot-btn--ghost`
- `aibot-fade-top`
- `aibot-fade-bottom`

意义：
- 修复了此前 `aibot-scroll` 缺失定义的问题。
- 给 AIBot 组件群提供了一套共享样式基础，后续新增流程卡片不需要继续各写一套视觉规则。

### 3.2 重做 Overlay 外壳和输入区
文件：`components/aibot/AIBotOverlay.tsx`

已完成：
- 重做外层 modal shell，使其更接近 `AboutOverlay` 的高级暗色弹层气质。
- 增加轻微噪点/氛围光斑，降低纯平面黑盒感。
- 重整 header，强化标题层次与“本地工作台”语义。
- 重做输入区卡片、提交按钮、清空/复制/深度模式开关等底部控制区。
- 为消息区增加顶部/底部 fade，改善滚动内容的边界感。

未改：
- 未触碰 `handleSubmit`、deep/document/simple search 相关流程逻辑。
- 未处理 `generateUUID()` 中的递归问题，因为该问题属于逻辑层，不在本次 style-only 范围内。

### 3.3 统一 MessageStream 的消息层次
文件：`components/aibot/MessageStream.tsx`

已完成：
- 调整消息容器节奏、间距和左右对齐逻辑。
- 用户消息与助手消息进行了更明确的视觉分层。
- 普通 assistant markdown、deep report、document report 统一纳入更一致的 workflow/card 体系。
- 引入 `clsx`，避免 message bubble 继续使用散乱的条件 class 拼接。

意义：
- 不改消息类型判断逻辑，只改呈现层，让 mixed content（文本、报告、草稿、图书列表）更统一。

### 3.4 优化消息 markdown 排版
文件：`lib/markdownComponents.tsx`

已完成：
- 重写 `messageMarkdownComponents` 的视觉规则。
- 调整标题、正文、列表、表格、blockquote、code block 的字体层次、颜色和间距。
- 让消息内长文更接近 editorial 阅读感，而不是默认技术 markdown 风格。

### 3.5 重做过程性卡片样式
#### 进度卡片
文件：
- `components/aibot/ProgressLogDisplay.tsx`
- `components/aibot/DeepSearchProgressMessage.tsx`

已完成：
- 统一头部为活动状态卡样式。
- 增强当前阶段、完成数量、日志层次的可读性。
- 将进度条调整为更平滑、更有动态感的样式。
- 将日志 item 的完成/运行/错误状态视觉统一。

#### 草稿与确认卡片
文件：
- `components/aibot/DeepSearchDraftMessage.tsx`
- `components/aibot/DraftConfirmationDisplay.tsx`
- `components/aibot/DocumentAnalysisDraftMessage.tsx`

已完成：
- 统一 header / body / footer 结构。
- 统一草稿编辑区、源数据展开区、确认按钮、取消/重试按钮风格。
- 统一流式生成状态、完成状态、等待确认状态的 chip 表达。

### 3.6 重做检索结果与图书选择区域
文件：
- `components/aibot/RetrievalResultDisplay.tsx`
- `components/aibot/DeepSearchBookListMessage.tsx`
- `components/aibot/BookItem.tsx`

已完成：
- 统一检索结果头部信息层级。
- 去掉旧 tooltip 主导的说明方式，改为更克制的按钮与 chip 表达。
- 统一“生成解读 / 二次检索 / 自动筛选 / 清空选择 / 重新选择”等按钮体系。
- 重做图书卡片：
  - 突出书名、作者、选中状态
  - 将评分/相似度/融合分/最终分等降为 chip
  - 优化摘要展开区样式

### 3.7 重做文档上传区域
文件：
- `components/aibot/DocumentUploadButton.tsx`
- `components/aibot/DocumentUploadWorkflow.tsx`
- `components/aibot/DocumentListDisplay.tsx`

已完成：
- 统一上传按钮与整体控制区风格。
- 重做文档列表卡片，增强状态和可读性。
- 统一“上传中 / 已就绪 / 错误”状态为 chip 表达。
- 错误提示改为更统一的 inline panel 风格。

## 4. 受影响文件清单
### 样式基础
- `app/globals.css`
- `lib/markdownComponents.tsx`

### Overlay 与消息流
- `components/aibot/AIBotOverlay.tsx`
- `components/aibot/MessageStream.tsx`

### 进度与草稿
- `components/aibot/ProgressLogDisplay.tsx`
- `components/aibot/DeepSearchProgressMessage.tsx`
- `components/aibot/DeepSearchDraftMessage.tsx`
- `components/aibot/DraftConfirmationDisplay.tsx`
- `components/aibot/DocumentAnalysisDraftMessage.tsx`

### 图书结果与选择
- `components/aibot/RetrievalResultDisplay.tsx`
- `components/aibot/DeepSearchBookListMessage.tsx`
- `components/aibot/BookItem.tsx`

### 文档上传相关
- `components/aibot/DocumentUploadButton.tsx`
- `components/aibot/DocumentUploadWorkflow.tsx`
- `components/aibot/DocumentListDisplay.tsx`

## 5. 验证结果
### 5.1 已完成验证
- `npm run build`：**通过**

### 5.2 lint 结果说明
- `npm run lint`：**仓库存在大量历史问题，未作为本次改动阻塞项**
- 当前 lint 输出中包含大量与本次任务无关的旧问题，例如：
  - 多处 `no-explicit-any`
  - 多处 hook dependency / setState-in-effect
  - 其他遗留 warning/error

结论：
- 本次 UI 改动在构建层面可用。
- lint 当前不能直接作为本次交付的 clean gate，需要单独治理历史债务。

## 6. 当前已知问题 / 风险点
### 6.1 非本次处理范围但值得关注
1. `components/aibot/AIBotOverlay.tsx` 的 `generateUUID()` 仍存在递归问题风险
   - 当前代码中：
     - 若存在 `crypto.randomUUID`，应返回 `crypto.randomUUID()`
     - 但目前实现是 `return generateUUID()`
   - 这是逻辑 bug，不属于这次 style-only 范围
   - 建议后续单独修复

2. 部分 AIBot 组件仍可能残留旧色值或旧 class 体系
   - 本次覆盖了主链路核心组件，但如果后续再出现“某块样式风格不一致”，优先检查是否还有未纳入统一样式系统的边角组件

3. 文档上传按钮内仍使用 `alert()` 提示非法文件
   - 这属于交互逻辑/错误提示机制层面
   - 本次未改，因为它不只是样式问题
   - 后续建议替换为 store 驱动的 inline error message

## 7. 后续建议
### 7.1 建议优先做的收口工作
1. **移动端与窄屏密度检查**
   - 重点看：
     - 底部按钮是否换行过密
     - 图书卡片 chip 是否挤压
     - draft card footer 在小屏是否拥挤

2. **AIBot 子组件样式收敛第二轮**
   - 检查是否还有组件仍使用：
     - `border-[#343434]`
     - `bg-[#1B1B1B]`
     - 旧的 `rounded-lg/rounded-xl` 组合
   - 能替换为 `aibot-*` 共享类的尽量替换

3. **统一空状态体验**
   - 当前主要完成了流程卡片的统一
   - 建议补一轮 empty state 优化：
     - 首次打开 overlay 时的引导
     - 无检索结果时的说明
     - 无文档时的轻提示

### 7.2 建议后续单独开的逻辑修复项
1. 修复 `AIBotOverlay.tsx` 中的 `generateUUID()` 递归问题
2. 将文档上传非法文件提示从 `alert()` 改为 overlay 内联错误提示
3. 如果后续希望进一步降复杂度，可考虑：
   - 将 `AIBotOverlay.tsx` 的纯 UI 壳层与流程 orchestration 分离
   - 例如拆成：
     - shell / layout 层
     - input/control bar 层
     - flow controller hooks
   - 但这属于结构重构，不建议和视觉优化混在一次提交里做

### 7.3 设计系统化建议
如果 AIBot 模块后续还会继续扩展，建议把本次新增的 AIBot 样式语义层继续沉淀：
- 对 `aibot-btn*`、`aibot-chip*`、`aibot-workflow-*` 做文档化
- 后续新增“卡片型流程组件”时，优先复用这些类，避免再回到局部堆 class 的状态

## 8. 接手建议
如果下一位接手人要继续做这块，建议顺序如下：

1. 先运行项目，手动走三条主链路：
   - simple search
   - deep search
   - document analysis
2. 对照本文件第 6、7 节确认哪些属于视觉收口，哪些属于逻辑修复
3. 若只做 UI 收尾：优先在现有 `aibot-*` 样式体系内完成，不要重新发明新 class
4. 若要做结构重构：
   - 先冻结当前视觉结果
   - 再拆 `AIBotOverlay.tsx` 的职责，避免视觉与逻辑同时波动

## 9. 交付结论
本次重构已经完成 AIBot 本地对话弹窗的**主视觉升级**：
- 外壳更统一
- 按钮更高级
- 滚动区更完整
- 过程性卡片更清晰
- human-in-the-loop 的交互流程更容易理解

当前状态适合作为下一阶段的基线版本，后续可以在此基础上继续做小范围收口或单独处理逻辑债务。