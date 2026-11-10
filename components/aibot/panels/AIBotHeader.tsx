'use client';

export interface AIBotHeaderProps {
    onClose: () => void;
}

export default function AIBotHeader({ onClose }: AIBotHeaderProps) {
    return (
        <header className="flex items-center justify-between px-6 md:px-10 py-6 border-b border-[#C9A063]/20 shrink-0 relative z-10 bg-[#1a1a1a]">
            <div className="flex items-center gap-4">
                <div className="w-2 h-2 bg-[#C9A063]" />
                <div>
                    <p className="font-mono text-[#C9A063] tracking-[0.3em] text-sm uppercase">AIBot</p>
                    <p className="text-xs text-[#C9A063]/50 mt-1">本地对话 · 仅限本地调试，云端默认关闭</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="group relative w-10 h-10 flex items-center justify-center border border-[#C9A063]/30 hover:bg-[#C9A063] transition-colors duration-300 cursor-pointer"
                    aria-label="Close"
                >
                    <span className="font-mono text-[#C9A063] group-hover:text-[#1a1a1a] text-xl transition-colors">×</span>
                    <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-[#C9A063] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-[#C9A063] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
            </div>
        </header>
    );
}
