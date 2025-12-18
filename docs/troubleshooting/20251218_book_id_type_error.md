# 故障复盘报告
- **日期**: 2025-12-18
- **严重级别**: Medium

## 1. 问题现象
- 前端请求 /api/local-aibot/search-only 时返回 500，日志显示 TypeError: book.id.startsWith is not a function
- aibot.retrieval 记录“API 响应既没有 context_plain_text 也没有有效的结构化数据”，导致界面无图书结果

## 2. 根本原因 (Root Cause)
因为后端检索 API 有时返回数值类型的 ook_id，而 deduplicateBooks 在去重时未对 ook.id 做类型判断，直接调用 startsWith，所以在 ook.id 非字符串时抛出异常，解析流程终止，最终 structuredData 为空。

## 3. 解决方案
- 在 parseJsonResultsToBooks 中统一将 ook_id/id 规范为字符串，避免数值类型继续向下游传播
- 在 deduplicateBooks 中增加 ook.id 的类型检查与字符串化处理，并在退化到“书名+作者”分支时对空值做保护
- 在 	est_book_deduplication.js 新增“数字 ID”用例覆盖该场景，验证去重逻辑稳定

## 4. 预防措施
- 保留新增的测试用例，作为回归检测
- 后续如引入新的检索源，需在接入测试阶段确认 ID 字段类型并更新映射函数，防止类似类型错误
