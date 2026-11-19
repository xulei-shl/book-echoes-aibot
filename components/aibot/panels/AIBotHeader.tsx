'use client';

export interface AIBotHeaderProps {
    onClose: () => void;
}

export default function AIBotHeader({ onClose }: AIBotHeaderProps) {
    return (
        <header className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 border-b border-[#C9A063]/20 shrink-0 relative z-10 bg-[#161514] gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-1.5 h-1.5 bg-[#C9A063] rounded-full shrink-0 animate-pulse" />
                <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                    <p className="font-mono text-[#C9A063] tracking-[0.25em] text-sm font-semibold uppercase shrink-0">AIBot</p>
                    <span className="text-[11px] text-[#A2A09A] font-info-content truncate">
                        书海回响深度书目智能体
                    </span>
                    <span className="hidden sm:inline-block text-[10px] text-[#C9A063]/40 font-mono tracking-wider">
                        · 本地模式
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={onClose}
                    className="group relative w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border border-[#C9A063]/30 hover:border-[#C9A063] hover:bg-[#C9A063] active:scale-[0.96] transition-[background-color,border-color,transform] duration-150 ease-out cursor-pointer shrink-0"
                    aria-label="关闭对话弹窗"
                    title="关闭 (Esc)"
                >
                    <span className="font-mono text-[#C9A063] group-hover:text-[#121110] text-lg leading-none transition-colors duration-150">×</span>
                </button>
            </div>
        </header>
    );
}
