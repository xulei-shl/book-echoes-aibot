# 开发变更记录
- **日期**: 2025-12-21
- **对应设计文档**: docs/design/document-upload-feature_20251220.md

## 1. 变更摘要
- 文档上传流程在生成解读报告时新增 `document-analysis-report` 消息结构，支持 Markdown 内容流式实时渲染。
- MessageStream 增加文档解读报告的渲染容器，实时展示 Markdown 片段及流式指示。

## 2. 文件清单
- `components/aibot/AIBotOverlay.tsx`: 修改
- `components/aibot/MessageStream.tsx`: 修改
- `docs/changelog/20251221_文档解读实时渲染.md`: 新增

## 3. 测试结果
- [ ] 单元测试通过
- [ ] 核心路径验证通过
