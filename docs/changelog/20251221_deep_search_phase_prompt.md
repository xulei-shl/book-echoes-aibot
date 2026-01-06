# 开发变更记录
- **日期**: 2025-12-21
- **对应设计文档**: docs/design/deep_search_phase_prompt_20251221.md

## 1. 变更摘要
- 深度检索草稿组件复用 `deepSearchPhase` 状态，在交叉分析区域底部展示与文档模式一致的图书检索提示。
- 提示在 `book-search` 与 `book-selection` 阶段动态切换，保证“确认检索”后的进度反馈。

## 2. 文件清单
- `components/aibot/DeepSearchDraftMessage.tsx`: 引入 `useAIBotStore` 并渲染提示。

## 3. 测试结果
- [ ] 单元测试通过
- [x] 核心路径验证通过（手动模拟 `book-search` 与 `book-selection` 状态，确认提示切换）
