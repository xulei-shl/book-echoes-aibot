import { useState, useCallback, useEffect } from 'react';

import { PREVIEW_WIDTH, PREVIEW_HEIGHT } from './HoverPreview';

const PREVIEW_OFFSET = 12;

/**
 * 自定义 Hook 用于管理悬停预览的位置计算
 */
export function usePreviewPosition(
    isHovered: boolean,
    cardRef: React.RefObject<HTMLDivElement | null>
) {
    const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });

    // 节流优化预览位置更新,避免频繁重渲染
    const updatePreviewPositionThrottled = useCallback(() => {
        if (typeof window === 'undefined' || !cardRef.current) {
            return;
        }
        const rect = cardRef.current.getBoundingClientRect();
        
        // 判断卡片是否位于屏幕下半部（如底部 Dock 题名列表）
        const isBottomShelf = rect.bottom > window.innerHeight * 0.55;

        let left: number;
        let top: number;

        if (isBottomShelf) {
            // 底部 Dock 题名：水平跟随当前题名中心居中
            left = rect.left + rect.width / 2 - PREVIEW_WIDTH / 2;
            left = Math.max(PREVIEW_OFFSET, Math.min(window.innerWidth - PREVIEW_WIDTH - PREVIEW_OFFSET, left));

            // 垂直方向：紧贴当前书签正上方 12px，消除距离过远的视觉脱节感
            top = rect.top - PREVIEW_HEIGHT - 12;
            if (top < PREVIEW_OFFSET) {
                top = PREVIEW_OFFSET;
            }
        } else {
            // 画布散落卡片：保持在卡片右侧/左侧优雅浮现
            left = rect.right + PREVIEW_OFFSET;
            if (window.innerWidth - rect.right < PREVIEW_WIDTH + PREVIEW_OFFSET) {
                left = rect.left - PREVIEW_WIDTH - PREVIEW_OFFSET;
            }
            left = Math.max(PREVIEW_OFFSET, Math.min(window.innerWidth - PREVIEW_WIDTH - PREVIEW_OFFSET, left));

            top = rect.top;
            if (window.innerHeight - rect.top < PREVIEW_HEIGHT + PREVIEW_OFFSET) {
                top = window.innerHeight - PREVIEW_HEIGHT - PREVIEW_OFFSET;
            }
            top = Math.max(PREVIEW_OFFSET, top);
        }

        setPreviewPosition({ x: left, y: top });
    }, [cardRef]);

    // 节流函数,限制更新频率为约 60fps
    const updatePreviewPosition = useCallback(() => {
        let timeoutId: NodeJS.Timeout | null = null;
        return () => {
            if (timeoutId) return;
            timeoutId = setTimeout(() => {
                updatePreviewPositionThrottled();
                timeoutId = null;
            }, 16); // ~60fps
        };
    }, [updatePreviewPositionThrottled])();

    useEffect(() => {
        if (!isHovered) {
            return;
        }
        updatePreviewPosition();
        const handleReposition = () => updatePreviewPosition();
        window.addEventListener('scroll', handleReposition);
        window.addEventListener('resize', handleReposition);
        return () => {
            window.removeEventListener('scroll', handleReposition);
            window.removeEventListener('resize', handleReposition);
        };
    }, [isHovered, updatePreviewPosition]);

    return { previewPosition, updatePreviewPosition };
}
