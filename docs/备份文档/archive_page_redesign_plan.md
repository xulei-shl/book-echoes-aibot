# 往期回顾页面重构设计方案

## 1. 目标概述
在现有的按年份分组显示月份的基础上，增加"睡美人"和"主题"维度。用户点击左侧年份后，右侧内容区域提供"月份牌"、"睡美人"和"主题卡"三个Tab切换。
- **月份牌视图**：保持现有逻辑，显示该年份下的按月归档内容。
- **睡美人视图**：显示该年份下的新书推荐内容。
- **主题卡视图**：显示该年份下的按主题归档内容。

## 2. 数据结构变更
为了支持新的层级结构，文件目录结构已调整如下：

### 旧结构
```text
public/content/
  ├── 2025-08/
  ├── 2025-09/
  └── ...
```

### 新结构（已实施）
```text
public/content/
  ├── 2025/                  # 年份文件夹
  │   ├── 2025-08/           # 月份归档（月份牌）
  │   │   ├── metadata.json
  │   │   └── ...
  │   ├── 2025-09/
  │   ├── 2025-10/
  │   ├── new/               # 睡美人归档文件夹
  │   │   ├── 新书推荐1/     # 睡美人主题名称
  │   │   │   ├── metadata.json
  │   │   │   └── ...
  │   │   └── ...
  │   └── subject/           # 主题归档文件夹
  │       ├── 科幻/          # 主题名称
  │       │   ├── metadata.json
  │       │   └── ...
  │       ├── 历史/
  │       └── ...
  ├── 2024/
  └── ...
```

## 3. 三个Tab的数据路径与ID格式

### 3.1 月份牌（Month Card）
- **数据路径**：`public/content/{year}/{year-month}/metadata.json`
  - 示例：`public/content/2025/2025-08/metadata.json`
- **ID格式**：`{year}-{month}`
  - 示例：`2025-08`
- **显示名称**：繁体中文年月
  - 示例：`二零二五年 八月`

### 3.2 睡美人（Sleeping Beauty）
- **数据路径**：`public/content/{year}/new/{name}/metadata.json`
  - 示例：`public/content/2025/new/新书推荐1/metadata.json`
- **ID格式**：`{year}-sleeping-{name}`
  - 示例：`2025-sleeping-新书推荐1`
- **显示名称**：文件夹名称
  - 示例：`新书推荐1`

### 3.3 主题卡（Subject Card）
- **数据路径**：`public/content/{year}/subject/{name}/metadata.json`
  - 示例：`public/content/2025/subject/科幻/metadata.json`
- **ID格式**：`{year}-subject-{name}`
  - 示例：`2025-subject-科幻`
- **显示名称**：文件夹名称
  - 示例：`科幻`

## 4. 代码层改造方案（已实施）

### 4.1 数据获取层 (`lib/content.ts`)

**新增/修改接口定义：**
```typescript
// 基础归档数据接口（月份、睡美人和主题通用）
export interface ArchiveItem {
  id: string;          // 文件夹名称，如 "2025-08" 或 "2025-subject-科幻" 或 "2025-sleeping-新书推荐1"
  label: string;       // 显示名称，如 "二零二五年 八月" 或 "科幻" 或 "新书推荐1"
  type: 'month' | 'subject' | 'sleeping_beauty';
  previewCards: string[];
  bookCount: number;
  books: Book[];
  vol?: string;        // 月份特有，如 "Vol. 12"
}

export interface YearArchiveData {
  year: string;
  months: ArchiveItem[];
  subjects: ArchiveItem[];
  sleepingBeauties: ArchiveItem[];
}
```

**核心函数逻辑 (`getArchiveData`)：**
1. 遍历 `public/content` 下的所有年份文件夹（如 `2025`）。
2. 对于每个年份文件夹：
   - **获取月份数据**：扫描该年份文件夹下的子文件夹（排除 `subject` 和 `new` 文件夹），逻辑同原 `getMonths`。
   - **获取主题数据**：扫描 `subject` 子文件夹下的所有文件夹。读取 `metadata.json`，生成预览图逻辑与月份一致。
   - **获取睡美人数据**：扫描 `new` 子文件夹下的所有文件夹。读取 `metadata.json`，生成预览图逻辑与月份一致。
3. 返回按年份聚合的完整数据结构。

### 4.2 页面逻辑层 (`app/archive/page.tsx`)

**主要变动：**
- 调用新的 `getArchiveData`，获取包含三种类型数据的 `YearArchiveData[]`。
- 将处理好的 `YearArchiveData[]` 传递给 `ArchiveContent` 组件。

### 4.3 UI 组件层 (`components/ArchiveContent.tsx`)

**状态管理：**
- 新增状态 `activeTab`: `'month' | 'subject' | 'sleeping_beauty'`，默认为 `'month'`。
- 当 `activeYear` 改变时，重置 `activeTab` 为 `'month'`。

**界面布局：**
- 在年份标题（如 "2025"）下方/右侧增加 Tab 切换器。
- **Tab 样式设计**：
  - 使用文字按钮，激活状态高亮（金色），未激活状态半透明。
  - 增加下划线作为激活指示器（使用 Framer Motion 的 `layoutId` 实现平滑过渡）。
- **Tab 显示逻辑**：
  - 所有年份都显示三个Tab（月份牌、睡美人、主题卡）。
  - 只要该年份下有任意一种类型的数据，就显示Tab切换器。
  - 如果某个Tab没有数据，点击后显示 "COMING SOON"。
- **内容渲染**：
  - 根据 `activeTab` 渲染不同的 Grid。
  - **月份 Grid**：复用现有的渲染逻辑，显示繁体汉字月份背景。
  - **睡美人 Grid**：复用 `MagazineCard` 组件，显示主题名称首字符作为背景。
  - **主题 Grid**：复用 `MagazineCard` 组件，显示主题名称首字符作为背景。

### 4.4 组件复用 (`components/MagazineCard.tsx`)
- 现有 `MagazineCard` 逻辑较为通用，可直接复用。
- 通过 `ArchiveItem` 的 `type` 属性区分不同类型的卡片。

### 4.5 下载功能优化 (`components/InfoPanel.tsx`)

**"全部下载"按钮路径构建逻辑：**
根据 `book.month` 的格式自动判断数据类型并构建正确的路径：

```typescript
if (month.includes('-subject-')) {
    // 主题卡: 2025-subject-科幻 -> /content/2025/subject/科幻/metadata.json
    const [year, , subjectName] = month.split('-subject-');
    metadataPath = `/content/${year}/subject/${subjectName}/metadata.json`;
} else if (month.includes('-sleeping-')) {
    // 睡美人: 2025-sleeping-xxx -> /content/2025/new/xxx/metadata.json
    const [year, , newName] = month.split('-sleeping-');
    metadataPath = `/content/${year}/new/${newName}/metadata.json`;
} else {
    // 月份牌: 2025-08 -> /content/2025/2025-08/metadata.json
    const year = month.split('-')[0];
    metadataPath = `/content/${year}/${month}/metadata.json`;
}
```

## 5. 扩展性设计
- **Tab 扩展**：未来如果需要增加"作者"或"出版社"维度，只需在 `YearArchiveData` 中增加对应字段，并在 UI 上增加新的 Tab 即可。
- **数据源扩展**：`lib/content.ts` 中的逻辑将文件系统读取与数据处理解耦，方便未来接入数据库或 CMS。

## 6. 实施状态

✅ **已完成**：
1. 数据迁移：已创建新目录结构（`2025/2025-08`、`2025/2025-09`、`2025/2025-10`）。
2. 后端改造：已修改 `lib/content.ts`，实现新的目录扫描和数据读取逻辑。
3. 前端改造：
   - 已修改 `app/archive/page.tsx` 数据获取。
   - 已修改 `ArchiveContent.tsx` 增加三个Tab交互。
   - 已优化 `InfoPanel.tsx` 的"全部下载"功能。
4. 验证：月份视图正常，主题视图和睡美人视图支持已就绪（待添加数据）。

## 7. 待办事项

- [ ] 为 `2025/subject/` 添加主题数据
- [ ] 为 `2025/new/` 添加睡美人数据
- [ ] 为其他年份（2024、2026、2027等）添加数据
