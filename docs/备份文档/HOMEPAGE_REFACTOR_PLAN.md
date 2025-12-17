# 首页重构与归档页面设计计划

## 1. 设计愿景 (Design Vision)

本计划旨在将“书海回响” (Book Echoes) 的首页重构为具有极简主义与高级艺术感的视觉体验。新设计强调视觉冲击力与沉浸感，通过大字排版与动态影像的结合，传达项目的核心精神。

### 核心设计元素
- **视觉锚点**: 顶部巨大的“书海回响”文字，作为页面的精神图腾。
- **动态中心**: 屏幕中央的动态画框，随机轮播最新一期的书籍影像，如同记忆的碎片在回响。
- **极简交互**: 所有的功能入口收纳于右下角，不打扰主视觉的沉浸感。

## 2. 页面架构 (Page Architecture)

### 2.1 首页 (Home) - `app/page.tsx`

首页将移除原本复杂的杂志封面列表，转变为全屏的沉浸式展示。

*   **Header Area**:
    *   显示巨大的“书海回响”标题。
    *   字体设计需具有雕塑感，占据顶部显著位置。
*   **Central Visual (Hero)**:
    *   **数据源**: 获取最新一期（Latest Month）的 `metadata.json`。
    *   **展示逻辑**: 读取 `originalImageUrl`，实现淡入淡出 (Fade-in/Fade-out) 的无限轮播。
    *   **交互**: 点击图片区域直接跳转至该月份的详情页 (`/[monthId]`)。
    *   **动效**: 图片切换需平滑，带有轻微的缩放 (Scale) 或模糊 (Blur) 过渡，营造梦幻感。
*   **Footer / Navigation**:
    *   **位置**: 页面右下角。
    *   **功能链接**:
        *   `往期回顾` (Past Issues) -> 跳转至 `/archive`。
        *   `About` -> 保持现有逻辑，弹出关于浮层。
    *   **版权声明**: “书海回响 — 那些被悄悄归还的一本好书 @ XXX 图书馆”。

### 2.2 往期回顾页 (Archive) - `app/archive/page.tsx` (New)

这是一个全新的页面，用于承载原本首页的归档功能，但以更高效、更有条理的方式展示。

*   **布局**: 双栏布局 (Two-column layout)。
    *   **左侧 (Left Sidebar)**: 年份导航 (Year Navigation)。
        *   列出所有年份 (e.g., 2025, 2024)。
        *   点击年份平滑滚动至对应区域。
    *   **右侧 (Right Content)**: 杂志封面网格 (Cover Grid)。
        *   按月份倒序排列。
        *   **卡片样式**: 复用并优化现有的 `MagazineCover` 样式（单卡片模式），保持视觉一致性。
        *   点击卡片进入对应月份详情页。

## 3. 技术实现方案 (Technical Implementation)

### 3.1 数据层 (Data Layer)

*   **重构数据获取**: 将 `app/page.tsx` 中的 `getMonths` 逻辑抽取为通用的工具函数 `lib/content.ts` (或类似位置)，以便在 Home 和 Archive 页面复用。
*   **图片预加载**: 首页轮播图需要预加载策略，避免切换时闪烁。

### 3.2 组件拆分 (Component Breakdown)

#### 新增组件
1.  **`components/HomeHero.tsx`**:
    *   负责首页的视觉核心。
    *   Props: `images: string[]`, `targetLink: string`.
    *   使用 `framer-motion` 实现 `AnimatePresence` 的图片切换。
2.  **`components/ArchiveLayout.tsx`**:
    *   负责归档页面的整体结构（侧边栏 + 内容区）。
3.  **`components/ArchiveYearNav.tsx`**:
    *   侧边栏年份导航组件。

#### 修改组件
1.  **`components/MagazineCover.tsx`**:
    *   需要将内部的 `SingleCard` 组件导出 (Export)，或者拆分为独立的 `components/MagazineCard.tsx`，以便在归档页复用。

### 3.3 样式系统 (Styling)

*   **Tailwind CSS**: 继续使用 Tailwind 进行布局和样式定义。
*   **字体**: 确保大标题使用具有设计感的字体（如现有项目中的 `font-display`）。
*   **配色**: 保持与现有设计一致的色调 (`#E8E6DC`, `#8B3A3A` 等)。

## 4. 实施步骤 (Implementation Steps)

1.  **准备工作**:
    *   创建 `lib/content.ts`，迁移数据获取逻辑。
    *   从 `MagazineCover.tsx` 中提取 `MagazineCard` 组件。
2.  **构建归档页 (`/archive`)**:
    *   创建 `app/archive/page.tsx`。
    *   实现年份分组逻辑。
    *   搭建侧边栏与网格布局。
3.  **重构首页 (`/`)**:
    *   清空现有的 `app/page.tsx` 内容。
    *   实现顶部大标题布局。
    *   开发 `HomeHero` 组件，实现图片轮播与跳转。
    *   实现右下角导航与版权信息。
4.  **细节打磨**:
    *   调整动画曲线，确保“高级感”。
    *   适配响应式布局（移动端可能需要调整大字大小和导航位置）。

## 5. 待确认事项 (Questions)

*   **图片来源**: 确认 `originalImageUrl` 是否在所有月份的 `metadata.json` 中都存在且有效。
*   **移动端适配**: 首页的大字和轮播在手机端是否需要特殊的堆叠布局？（默认将按响应式流体排布）。

---
*Created by Antigravity Agent*
