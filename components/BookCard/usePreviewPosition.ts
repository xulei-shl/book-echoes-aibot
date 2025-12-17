import { useState, useCallback, useEffect, useMemo } from 'react';

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 680;
const PREVIEW_OFFSET = 16;

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
        let left = rect.right + PREVIEW_OFFSET;
        if (window.innerWidth - rect.right < PREVIEW_WIDTH + PREVIEW_OFFSET) {
            left = rect.left - PREVIEW_WIDTH - PREVIEW_OFFSET;
        }
        let top = rect.top;
        if (window.innerHeight - rect.top < PREVIEW_HEIGHT + PREVIEW_OFFSET) {
            top = window.innerHeight - PREVIEW_HEIGHT - PREVIEW_OFFSET;
        }
        top = Math.max(PREVIEW_OFFSET, top);
        left = Math.max(PREVIEW_OFFSET, left);
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
