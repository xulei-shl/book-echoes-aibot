import { useState, useCallback, useMemo } from 'react';

/**
 * 自定义 Hook 用于管理悬停事件处理
 */
export function useHoverHandlers(
    state: 'scatter' | 'focused' | 'dock',
    cardRef: React.RefObject<HTMLDivElement | null>,
    updatePreviewPosition: () => void
) {
    const [isHovered, setIsHovered] = useState(false);

    const handleHoverStart = useCallback(() => {
        if (state === 'focused') return; // focused 状态下不显示预览
        setIsHovered(true);
        updatePreviewPosition();
    }, [state, updatePreviewPosition]);

    const handleHoverEnd = useCallback(() => {
        setIsHovered(false);
    }, []);

    // 节流优化鼠标移动处理
    const handlePointerMoveThrottled = useCallback((event: React.PointerEvent) => {
        if (!cardRef.current) return;

        // 检查鼠标是否真的在卡片元素上
        const rect = cardRef.current.getBoundingClientRect();
        const isInside =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;

        if (!isInside && isHovered) {
            // 鼠标已经移出卡片,但悬浮状态还是 true,强制清除
            setIsHovered(false);
        } else if (isInside && isHovered) {
            updatePreviewPosition();
        }
    }, [isHovered, updatePreviewPosition, cardRef]);

    const handlePointerMove = useMemo(() => {
        let rafId: number | null = null;
        return (event: React.PointerEvent) => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                handlePointerMoveThrottled(event);
                rafId = null;
            });
        };
    }, [handlePointerMoveThrottled]);

    return {
        isHovered,
        setIsHovered,
        handleHoverStart,
        handleHoverEnd,
        handlePointerMove
    };
}
