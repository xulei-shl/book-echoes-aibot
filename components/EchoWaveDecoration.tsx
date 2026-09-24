'use client';

import { useEffect, useRef, useCallback } from 'react';

interface EchoWaveDecorationProps {
    /** 同心波纹环数量 */
    ringCount?: number;
    /** 常态扩散速度 (数值越小越平缓) */
    pulseSpeed?: number;
    /** 基础宋金主色 (RGB 格式便于动态控制透明度，默认 #C9A063) */
    ringColorRgb?: string;
    /** 中心波纹最大透明度 (保持背景克制、不遮挡文字) */
    maxOpacity?: number;
    /** 是否开启点击触发涟漪交互 */
    interactive?: boolean;
}

interface ClickRipple {
    id: number;
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    opacity: number;
    speed: number;
    lineWidth: number;
}

/**
 * 首页背景“书海回响”动态同心水波纹组件
 * 特性：
 * 1. 中心常态微澜脉冲：呼应“回响”意象，宛如声波/水波向外平缓扩散
 * 2. 点击水波交互：点击画布任意位置激发多重递进衰减水波
 * 3. 性能优化：Canvas 2D + 自动 DPR 高清适配 + 离屏/后台休眠控制 + 卸载自动清理
 */
export default function EchoWaveDecoration({
    ringCount = 10,
    pulseSpeed = 0.16,
    ringColorRgb = '201, 160, 99', // 宋金 #C9A063
    maxOpacity = 0.26,
    interactive = true,
}: EchoWaveDecorationProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // 交互产生的涟漪队列
    const ripplesRef = useRef<ClickRipple[]>([]);
    const nextRippleId = useRef(0);

    // 动画运行状态标记
    const isRunningRef = useRef(true);
    const animFrameIdRef = useRef<number | null>(null);

    // 添加交互点击水波纹
    const createRipple = useCallback((clientX: number, clientY: number) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // 计算当前画布尺寸下波纹能扩散到的最大距离
        const maxRadius = Math.max(rect.width, rect.height) * 0.65;

        // 生成双重递进同心波纹（正如石子入水产生的连续两重回响，节奏柔和缓进）
        const newRipples: ClickRipple[] = [
            {
                id: nextRippleId.current++,
                x,
                y,
                radius: 2,
                maxRadius,
                opacity: maxOpacity * 1.5,
                speed: 1.3,
                lineWidth: 1.6,
            },
            {
                id: nextRippleId.current++,
                x,
                y,
                radius: 0,
                maxRadius: maxRadius * 0.85,
                opacity: maxOpacity * 1.1,
                speed: 0.9,
                lineWidth: 1.1,
            },
        ];

        // 队列上限控制，防止高频点击产生过多实例
        ripplesRef.current = [...ripplesRef.current.slice(-18), ...newRipples];
    }, [maxOpacity]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let dpr = 1;

        // 画布尺寸适配函数 (处理高分屏 DPR 模糊问题)
        const updateCanvasSize = () => {
            const rect = container.getBoundingClientRect();
            dpr = window.devicePixelRatio || 1;
            width = rect.width;
            height = rect.height;

            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            ctx.resetTransform?.();
            ctx.scale(dpr, dpr);
        };

        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);

        // 页面休眠处理：切换标签页时停止渲染，返回时恢复
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                isRunningRef.current = false;
                if (animFrameIdRef.current) {
                    cancelAnimationFrame(animFrameIdRef.current);
                }
            } else {
                isRunningRef.current = true;
                startTime = performance.now() - (lastProgress * cycleDuration);
                renderLoop(performance.now());
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 动画参数
        let startTime = performance.now();
        const cycleDuration = (1 / pulseSpeed) * 3500; // 单个周期时长(ms)
        let lastProgress = 0;

        // 渲染主循环
        const renderLoop = (timestamp: number) => {
            if (!isRunningRef.current) return;

            // 清空画布 (透明背景，完全透出下方背景大图)
            ctx.clearRect(0, 0, width, height);

            const elapsed = timestamp - startTime;
            const progress = (elapsed % cycleDuration) / cycleDuration;
            lastProgress = progress;

            // 中心坐标：微调为稍微偏向上方（48%），呼应正中“書海回響”书法文字的视觉中心
            const centerX = width / 2;
            const centerY = height * 0.48;
            const maxCenterRadius = Math.hypot(width / 2, height / 2) * 1.05;

            // 1. 绘制常态中心回响波纹
            for (let i = 0; i < ringCount; i++) {
                // 每个环在整个周期内的归一化扩散进度 (0 ~ 1)
                const ringProgress = (progress + i / ringCount) % 1;

                // 物理扩散：半径平滑递增
                const r = ringProgress * maxCenterRadius;

                // 衰减模型：中心渐入，外围非线性自然衰减
                let alpha = 0;
                if (ringProgress < 0.08) {
                    // 中心生成时轻柔淡入，消除突兀闪现
                    alpha = (ringProgress / 0.08) * maxOpacity;
                } else {
                    // 向外围扩散时透明度衰减 (能量消散)
                    const fade = Math.pow(1 - ringProgress, 1.25);
                    alpha = maxOpacity * fade;
                }

                if (alpha > 0.005) {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
                    // 随着向外扩散，线宽由粗渐微细
                    ctx.lineWidth = Math.max(0.75, (1.6 - ringProgress * 0.8));
                    ctx.strokeStyle = `rgba(${ringColorRgb}, ${alpha.toFixed(3)})`;
                    ctx.stroke();
                }
            }

            // 2. 绘制用户点击产生的交互涟漪
            if (ripplesRef.current.length > 0) {
                const updatedRipples: ClickRipple[] = [];

                for (const ripple of ripplesRef.current) {
                    ripple.radius += ripple.speed;
                    // 涟漪生命周期衰减
                    const lifeProgress = ripple.radius / ripple.maxRadius;
                    const currentAlpha = ripple.opacity * Math.pow(1 - lifeProgress, 1.3);

                    if (lifeProgress < 1 && currentAlpha > 0.005) {
                        ctx.beginPath();
                        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
                        ctx.lineWidth = Math.max(0.8, ripple.lineWidth * (1 - lifeProgress * 0.5));
                        ctx.strokeStyle = `rgba(${ringColorRgb}, ${currentAlpha.toFixed(3)})`;
                        ctx.stroke();

                        updatedRipples.push(ripple);
                    }
                }

                ripplesRef.current = updatedRipples;
            }

            animFrameIdRef.current = requestAnimationFrame(renderLoop);
        };

        // 启动动画循环
        animFrameIdRef.current = requestAnimationFrame(renderLoop);

        // 资源清理
        return () => {
            isRunningRef.current = false;
            if (animFrameIdRef.current) {
                cancelAnimationFrame(animFrameIdRef.current);
            }
            window.removeEventListener('resize', updateCanvasSize);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [ringCount, pulseSpeed, ringColorRgb, maxOpacity]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!interactive) return;
        createRipple(e.clientX, e.clientY);
    };

    return (
        <div
            ref={containerRef}
            onClick={handleClick}
            className="absolute inset-0 z-[5] overflow-hidden cursor-default select-none pointer-events-auto"
            title="点击激荡微光回响"
        >
            {/* 基础电影级暗色渐变 - 保障文字可读性与层次深度 */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

            {/* 动态波纹 Canvas */}
            <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
}
