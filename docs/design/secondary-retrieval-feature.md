# 二次检索功能设计方案

**版本**: 1.0
**作者**: Claude Code
**日期**: 2025-12-18
**状态**: 待审批

---

## 1. 需求概述

### 1.1 功能目标
在检索结果页面增加「二次检索」按钮，实现基于已选图书的迭代检索流程。用户可以根据第一轮检索结果中的图书信息，细化或调整检索方向，持续优化检索结果。

### 1.2 用户故事
> 作为一个图书搜索用户，我希望在看到检索结果后，能够选择几本相关图书，并基于这些图书的信息继续深入检索，以便找到更精准的图书推荐。

### 1.3 操作流程
1. 用户执行第一次简单检索 → 显示图书结果列表
2. 用户勾选部分图书（可选1本或多本）
3. 点击「二次检索」按钮
4. 系统自动将：勾选图书信息（题名、作者、摘要等）+ 用户原始输入文本 → 格式化填充到输入框
5. 用户可编辑输入框内容
6. 点击发送 → 执行完整检索流程（问题分类→检索词扩展→平行检索→去重）
7. **新结果追加显示在下方（不删除之前的结果）**
8. 可循环重复此流程

---

## 2. 技术设计

### 2.1 架构分析

**现有代码流程**：
```
用户输入 → handleSubmit() → performSimpleSearchWithClassification()
    → 问题分类 (classifyIntent)
    → 检索扩展 + 并行检索 (/api/local-aibot/search-only)
    → 结果合并去重
    → 显示结果 (appendMessage + setRetrievalResult)
    → 进入选择模式 (setRetrievalPhase('selection'))
```

**关键组件**：
- `AIBotOverlay.tsx` - 主控制器，管理输入框和消息流
- `MessageStream.tsx` - 消息列表渲染
- `RetrievalResultDisplay.tsx` - 检索结果展示（含现有按钮：生成解读、自动筛选、清空选择）
- `useAIBotStore.ts` - 全局状态管理

### 2.2 设计方案

#### 2.2.1 新增回调函数

在 `RetrievalResultDisplay` 组件中新增 `onSecondaryRetrieval` 回调：

```typescript
interface RetrievalResultDisplayProps {
    // ... 现有props
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], originalQuery: string) => void;
}
```

#### 2.2.2 图书信息格式化

创建工具函数，将选中图书信息格式化为输入文本：

```typescript
// src/utils/format-book-for-search.ts
export function formatBooksForSecondarySearch(
    books: BookInfo[],
    originalQuery: string
): string {
    const bookInfoList = books.map((book, index) => {
        const parts = [
            `【${index + 1}】《${book.title}》`,
            book.author ? `作者: ${book.author}` : '',
            book.description ? `简介: ${book.description.slice(0, 100)}...` : ''
        ].filter(Boolean);
        return parts.join('\n');
    });

    return `基于以下图书继续检索：

${bookInfoList.join('\n\n')}

原始需求：${originalQuery}

请基于以上图书信息，`;
}
```

#### 2.2.3 回调链路设计

```
RetrievalResultDisplay
    → onSecondaryRetrieval(selectedBooks, originalQuery)
        → AIBotOverlay.handleSecondaryRetrieval()
            → formatBooksForSecondarySearch()
            → setInputValue(formattedText)  // 填充输入框
            → clearSelection()              // 清空选择状态
            → setRetrievalPhase('search')   // 回到检索模式
```

#### 2.2.4 追加显示逻辑

**关键点**：现有实现已支持追加显示！
- `appendMessage()` 是追加操作，不会删除已有消息
- `retrievalResults` Map 按 messageId 存储，支持多轮结果

**无需修改的现有逻辑**：
- `performSimpleSearchWithClassification()` 会创建新的 assistant message
- 新消息自然追加到 `messages` 数组末尾
- 日志会被 `clearSimpleSearchLogs()` 清空后重新记录

---

## 3. 文件修改清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/utils/format-book-for-search.ts` | 新增 | 图书信息格式化工具函数 |
| `components/aibot/RetrievalResultDisplay.tsx` | 修改 | 新增「二次检索」按钮及回调 |
| `components/aibot/AIBotOverlay.tsx` | 修改 | 实现 handleSecondaryRetrieval 回调 |
| `components/aibot/MessageStream.tsx` | 修改 | 传递新增的 onSecondaryRetrieval 回调 |

---

## 4. 详细实现

### 4.1 新增工具函数

**文件**: `src/utils/format-book-for-search.ts`

```typescript
import type { BookInfo } from '@/src/core/aibot/types';

/**
 * 将选中的图书信息格式化为二次检索的输入文本
 * @param books 选中的图书列表
 * @param originalQuery 原始查询文本
 * @returns 格式化后的文本，用于填充输入框
 */
export function formatBooksForSecondarySearch(
    books: BookInfo[],
    originalQuery: string
): string {
    if (books.length === 0) {
        return originalQuery;
    }

    const bookInfoList = books.map((book, index) => {
        const parts = [
            `【${index + 1}】《${book.title}》`
        ];

        if (book.author) {
            parts.push(`作者: ${book.author}`);
        }

        if (book.description) {
            // 限制描述长度，避免输入框文本过长
            const shortDesc = book.description.length > 100
                ? book.description.slice(0, 100) + '...'
                : book.description;
            parts.push(`简介: ${shortDesc}`);
        }

        return parts.join('\n');
    });

    return `基于以下图书继续检索：

${bookInfoList.join('\n\n')}

原始需求：${originalQuery}

请继续深入检索相关图书`;
}
```

### 4.2 修改 RetrievalResultDisplay

**新增 Props**:
```typescript
interface Props {
    // ... 现有props
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], originalQuery: string) => void;
    originalQuery?: string;  // 新增：原始查询文本
}
```

**新增按钮**（放在"生成解读"按钮旁边）：
```tsx
<button
    onClick={handleSecondaryRetrieval}
    className="px-4 py-2 border border-[#C9A063] text-[#C9A063] rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[rgba(201,160,99,0.1)] transition-colors"
    disabled={selectedCount === 0}
>
    二次检索 {selectedCount > 0 && `(${selectedCount}本)`}
</button>
```

### 4.3 修改 AIBotOverlay

**新增回调函数**:
```typescript
const handleSecondaryRetrieval = useCallback((selectedBooks: BookInfo[], query: string) => {
    // 格式化图书信息并填充输入框
    const formattedText = formatBooksForSecondarySearch(selectedBooks, query);
    setInputValue(formattedText);

    // 清空选择状态，回到检索模式
    clearSelection();
    setRetrievalPhase('search');
}, [clearSelection, setRetrievalPhase]);
```

**传递给 MessageStream**:
```tsx
<MessageStream
    // ... 现有props
    onSecondaryRetrieval={handleSecondaryRetrieval}
    originalQuery={originalQuery}
/>
```

### 4.4 修改 MessageStream

**新增 Props**:
```typescript
interface MessageStreamProps {
    // ... 现有props
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], originalQuery: string) => void;
    originalQuery?: string;
}
```

**传递给 RetrievalResultDisplay**:
```tsx
<RetrievalResultDisplay
    // ... 现有props
    onSecondaryRetrieval={onSecondaryRetrieval}
    originalQuery={originalQuery}
/>
```

---

## 5. UI 设计

### 5.1 按钮布局

选择模式下的按钮顺序调整为：

```
┌─────────────────────────────────────────────────────────┐
│  [生成解读 (N本)]  [二次检索 (N本)]  [自动筛选]  [清空选择]  │
└─────────────────────────────────────────────────────────┘
```

- 「生成解读」：主按钮样式（金色背景）
- 「二次检索」：次要按钮样式（金色边框，透明背景）
- 「自动筛选」「清空选择」：辅助按钮样式（灰色边框）

### 5.2 按钮状态

| 状态 | 生成解读 | 二次检索 | 自动筛选 | 清空选择 |
|-----|---------|---------|---------|---------|
| 未选择任何图书 | 可点击（自动筛选）| 禁用 | 可点击 | 禁用 |
| 已选择图书 | 可点击 | 可点击 | 可点击 | 可点击 |

---

## 6. 边界情况处理

| 场景 | 处理方式 |
|-----|---------|
| 未选择任何图书点击二次检索 | 按钮禁用状态，不可点击 |
| 选择大量图书（>5本） | 正常处理，但格式化时每本只显示100字符摘要 |
| 图书缺少描述信息 | 只显示题名和作者 |
| 输入框已有内容 | 直接覆盖（用户可手动编辑） |

---

## 7. 非目标（Out of Scope）

以下功能不在本次迭代范围内：
1. 检索历史记录持久化
2. 多轮检索结果的对比视图
3. 检索结果的导出功能
4. 图书信息的展开/收起交互

---

## 8. 测试计划

### 8.1 功能测试
- [ ] 勾选1本图书后点击二次检索，验证输入框内容
- [ ] 勾选多本图书后点击二次检索，验证格式化效果
- [ ] 执行二次检索，验证新结果追加显示
- [ ] 验证原有检索结果不被删除
- [ ] 验证日志进度正确显示

### 8.2 边界测试
- [ ] 未选择图书时按钮禁用状态
- [ ] 图书缺少描述时的格式化效果
- [ ] 连续执行3轮以上检索

---

## 9. 风险评估

| 风险 | 级别 | 缓解措施 |
|-----|-----|---------|
| 输入框文本过长影响用户体验 | 低 | 限制每本图书描述长度100字符 |
| 多轮检索导致消息列表过长 | 低 | 现有滚动机制可处理 |

---

## 审批确认

**请确认以上设计方案是否符合预期。确认后我将开始编码实现。**

如有调整意见，请指出需要修改的部分。
