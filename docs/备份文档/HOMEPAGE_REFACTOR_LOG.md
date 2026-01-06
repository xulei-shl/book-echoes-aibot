# 首页重构实施记录 (Homepage Refactor Implementation Log)

## 1. 重构概述
本次重构完成了首页的极简主义设计改造，并新增了往期回顾（Archive）页面。设计目标是提升视觉冲击力，简化交互，同时提供更有条理的归档浏览体验。

## 2. 核心变更

### 2.1 数据层 (`lib/content.ts`)
- **新增**: 创建了统一的数据获取模块，替代了原先分散在页面中的逻辑。
- **功能**: 
  - `getMonths()`: 读取 `public/content` 下的期刊数据，解析 `metadata.json`。
  - `getAboutContent()`: 读取 `public/About.md`。
- **类型定义**: 导出了 `Book` 和 `MonthData` 接口，规范了数据结构，便于后续维护。

### 2.2 组件层 (`components/`)
- **首页组件**:
  - `HomeHero.tsx`: 全屏轮播组件。
    - **特性**: 使用 `framer-motion` 实现背景图片的淡入淡出轮播；中心展示巨大的“书海回响”标题；支持点击进入最新一期。
  - `HomeNavigation.tsx`: 右下角悬浮导航。
    - **特性**: 包含“往期回顾”入口和复用的“关于”弹窗；展示版权信息；使用 `mix-blend-difference` 确保在不同背景下的可见性。
- **归档页组件**:
  - `ArchiveLayout.tsx`: 归档页面的双栏布局容器（左侧固定导航，右侧滚动内容）。
  - `ArchiveYearNav.tsx`: 侧边栏年份导航，支持点击年份平滑滚动到对应区域。
  - `MagazineCard.tsx`: 从原 `MagazineCover` 中抽离并重构的通用单卡片组件。
    - **特性**: 移除了原有的复杂交互，保留了精美的拼贴视觉效果和悬停动画，适配网格布局。

### 2.3 页面层 (`app/`)
- **首页 (`app/page.tsx`)**:
  - **逻辑**: 获取最新一期数据，提取 `originalImageUrl`（优先）或 `coverImageUrl` 作为轮播源。
  - **布局**: 移除了原有的复杂列表，仅保留 `HomeHero` 和 `HomeNavigation`，实现全屏沉浸式体验。
- **往期回顾页 (`app/archive/page.tsx`)**:
  - **新增**: 全新的路由页面。
  - **逻辑**: 获取所有月份数据，并按年份进行分组（倒序排列）。
  - **布局**: 使用 `ArchiveLayout`，内容区采用响应式网格（Grid）展示 `MagazineCard`。

## 3. 维护指南

### 3.1 添加新期刊
1. 在 `public/content/` 下创建新的月份文件夹（格式：`YYYY-MM`）。
2. 确保文件夹内包含 `metadata.json`。
3. **关键点**: `metadata.json` 中的书籍条目应包含 `originalImageUrl` 字段。这是首页全屏轮播的首选数据源。如果缺失，系统会降级使用 `coverImageUrl`，但清晰度可能受影响。

### 3.2 修改样式
- **首页视觉**: 主要在 `components/HomeHero.tsx` 中调整标题大小、动画时长（默认5秒切换）和遮罩透明度。
- **卡片样式**: 修改 `components/MagazineCard.tsx`。注意该组件在归档页被大量复用，修改会影响全局。
- **主题色**: 沿用 Tailwind 配置中的颜色，特定强调色使用了 `#8B3A3A`（深红）和 `#E8E6DC`（米白）。

### 3.3 待优化项
- **图片加载策略**: 目前首页加载了当期所有书籍图片。如果当期书籍数量极大且图片未压缩，可能影响首屏加载性能。后续可优化为：
  - 仅预加载前 3-5 张图片。
  - 使用 Next.js `Image` 组件的 `priority` 属性优化首张图片加载（已实施）。
- **移动端适配**: `HomeHero` 的超大标题在极小屏幕手机上可能需要进一步调整字号或换行策略。

---
*记录时间: 2025-11-23*
