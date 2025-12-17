# 随机漫步 (Random Walk) - 最终设计与开发方案

## 1. 概述 (Overview)
本方案旨在打造一个打破时间与分类维度的“探索模式”。用户将置身于一个无限的书籍流中，每一次刷新都是一次全新的偶遇。点击任意书籍，即可穿越回它所属的时空（月份、主题或睡美人画板）。

## 2. 核心逻辑与路由 (Core Logic & Routing)

### 2.1 数据源与识别
针对您的问题：**“content下月份、主题、睡美人三类目录下json数据，这个/[month_id]都能正确识别？”**

**答案是：可以，但需要升级路由解析逻辑。**

目前 `app/[month]/page.tsx` 仅支持 `YYYY-MM` (月份) 和 `YYYY-subject-NAME` (主题)。为了支持“睡美人”，我们需要在开发时同步升级该文件，使其能识别 `YYYY-sleeping-NAME` 格式。

**最终 ID 格式规范：**
*   **月份 (Month)**: `2025-08`
*   **主题 (Subject)**: `2025-subject-科幻`
*   **睡美人 (Sleeping Beauty)**: `2025-sleeping-失落的书`

### 2.2 交互跳转流程
1.  用户在“随机漫步”页面点击书籍封面。
2.  获取该书籍所属的 `sourceId` (即上述 ID)。
3.  路由跳转至 `/${sourceId}`。
4.  `app/[month]/page.tsx` 解析 ID，加载对应目录下的 `metadata.json` 并渲染画板。

## 3. 视觉与交互设计方案 (Visual Design)

### 3.1 最终选择：沉浸式错位瀑布流 (Immersive Masonry)
**推荐理由**：
相比于“横向长廊”，**瀑布流**更符合“书海”的意象，且在设计感与实用性上达到了最佳平衡：
1.  **视觉包容性**：书籍封面多为纵向长方形，瀑布流能完美兼容不同长宽比的图片，避免横向布局中常见的裁剪或留白问题。
2.  **探索效率**：二维平面的浏览效率高于一维横向滚动，用户能一眼扫过更多封面，增加“偶遇”心仪书籍的概率。
3.  **高级感**：通过添加**滚动视差 (Parallax)** 和 **交错入场动画 (Staggered Entrance)**，可以消除传统瀑布流的廉价感，营造出“浮动在虚空中”的艺术画廊氛围。

### 3.2 详细设计细节
*   **布局**：
    *   **Desktop**: 4-5 列错位排列，列与列之间有轻微的垂直偏移（由随机边距或算法生成），打破死板的网格感。
    *   **Mobile**: 2 列布局，保证封面清晰度。
*   **动效**：
    *   **入场**：图片加载时带有轻微的 `y` 轴位移和透明度渐变。
    *   **悬停 (Hover)**：鼠标悬停时，非当前图片轻微变暗 (Dimming)，当前图片保持高亮并轻微上浮，显示书名和所属画板标签（如“2025 · 睡美人”）。
*   **无限感**：
    *   底部不设明确的“页脚”，当滚动到底部时，自动无缝加载下一批随机书籍，营造无尽书海的体验。
    *   右下角提供一个悬浮的 **“洗牌 (Shuffle)”** 按钮（图标：骰子），点击可重新随机排序并回到顶部。

## 4. 页面入口设计 (Entry Points)

根据您的要求，入口将不再放置于右下角，而是提升至页面核心导航区。

*   **位置**：**往期回顾页面 (`/archive`)** 和 **画板页面 (`/[month]`)** 的 **顶部中间 (Top Center)**。
*   **样式**：
    *   一个精致的胶囊形或圆形按钮，采用半透明毛玻璃效果 (Glassmorphism)，以免遮挡背景内容。
    *   **图标**：使用“双向箭头交错”或“足迹”图标，寓意“漫步”或“随机”。
    *   **交互**：向下滚动页面时，按钮可以自动隐藏以减少干扰；向上滚动时重新出现。

## 5. 开发实施路径 (Implementation Plan)

### 阶段一：数据层升级
1.  **修改 `lib/content.ts`**:
    *   实现 `getAllBooksRandomized()`：遍历所有年份的 `month`, `subject`, `sleeping_beauty` 目录，收集所有书籍。
    *   为每本书籍对象注入 `sourceId` 属性，用于跳转。
2.  **升级 `app/[month]/page.tsx`**:
    *   增加对 `sleeping` 关键字的正则匹配逻辑，确保能正确读取 `public/content/YYYY/new/NAME/metadata.json`。

### 阶段二：前端组件开发
1.  **创建 `app/random/page.tsx`**:
    *   作为服务端组件，获取随机化数据。
2.  **开发 `components/RandomMasonry.tsx`**:
    *   实现瀑布流布局（推荐使用 CSS Columns 或 `react-masonry-css`）。
    *   集成 `framer-motion` 实现平滑的入场和悬停效果。
    *   实现“洗牌”功能（客户端重新排序数组）。

### 阶段三：入口集成
1.  **修改 `components/Header.tsx`**:
    *   在 Header 中间区域增加 `RandomWalkButton` 组件。
    *   通过 Props 控制该按钮的显示（仅在 Archive 和 Month 页面显示）。

### 阶段四：视觉打磨
1.  调整间距、阴影和字体，确保符合“书海回响”的整体深色金调风格。
2.  性能优化：确保图片使用 Next.js `Image` 组件并开启懒加载。

---

# Random Walk Feature Implementation Walkthrough
I have successfully implemented the "Random Walk" feature as per the design document. This feature allows users to explore a randomized stream of books from all categories (Months, Subjects, and Sleeping Beauties) and navigate to their respective collections.
## Changes Overview
### 1. Data Layer ([lib/content.ts](file:///f:/Github/book-echoes-web/lib/content.ts))
- Added [getAllBooksRandomized()](file:///f:/Github/book-echoes-web/lib/content.ts#226-252) function.
- This function aggregates books from all years, months, subjects, and sleeping beauties.
- It injects a `sourceId` into each book object, which is used for routing (e.g., `2025-08`, `2025-subject-SciFi`, `2025-sleeping-LostBooks`).
- The books are shuffled to provide a random experience.
### 2. Routing & Data Fetching ([app/[month]/page.tsx](file:///f:/Github/book-echoes-web/app/%5Bmonth%5D/page.tsx))
- Updated [getMonthData](file:///f:/Github/book-echoes-web/app/%5Bmonth%5D/page.tsx#16-50) to handle the new `sleeping` ID format (`YYYY-sleeping-NAME`), which maps to the `public/content/{Year}/new/{Name}` directory.
- Updated [generateStaticParams](file:///f:/Github/book-echoes-web/app/%5Bmonth%5D/page.tsx#68-112) to include these paths for static generation.
### 3. Asset Resolution ([lib/assets.ts](file:///f:/Github/book-echoes-web/lib/assets.ts) & `app/api/images/...`)
- Updated `legacyCardThumbnailPath` in `lib/assets.ts` to correctly resolve thumbnail paths for `sleeping` items.
- Updated the image API route (`app/api/images/[month]/[id]/[type]/route.ts`) to serve images for `sleeping` items from the correct directory.
### 4. Frontend Components
- **`app/random/page.tsx`**: A new server component that fetches the randomized book list and renders the masonry layout.
- **`components/RandomMasonry.tsx`**: A new client component that implements:
    - **Masonry Layout**: Using Tailwind's `columns` utility for a responsive 2-5 column layout.
    - **Animations**: Using `framer-motion` for staggered entrance and hover effects.
    - **Shuffle**: A floating button to re-shuffle the books on the client side.
    - **Navigation**: Clicking a book navigates to its source collection (Month, Subject, or Sleeping Beauty).
### 5. Entry Point (`components/Header.tsx`)
- Added a "Random Walk" (漫步) button to the header.
- **Visibility Logic**: The button appears only on the Archive page and Month/Subject/Sleeping pages (not on Home).
- **Scroll Interaction**: The button (along with the center group) hides when scrolling down and reappears when scrolling up, ensuring an unobstructed view.
## Verification
- **Data**: All book sources are now accessible via the unified random stream.
- **Navigation**: Clicking a book correctly routes to the specific collection page, thanks to the updated routing logic.
- **Visuals**: The masonry layout provides an immersive browsing experience with smooth animations.
- **Images**: Images for all categories, including the new "Sleeping Beauty" category, are correctly resolved and served.
## Next Steps
- You can further customize the visual style (colors, fonts) in `components/RandomMasonry.tsx` if needed.
- The "Shuffle" button currently re-sorts the existing list. For a true "infinite" experience, we could implement pagination or infinite scrolling in the future, but the current implementation loads all books which is performant enough for thousands of items.