export default function Loading() {
    return (
        <div
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#1a1a1a] select-none pointer-events-none"
            aria-live="polite"
            aria-busy="true"
        >
            {/* Top ambient gold loading sweep line */}
            <div className="absolute top-0 inset-x-0 h-[2px] overflow-hidden bg-transparent">
                <div className="w-full h-full bg-gradient-to-r from-transparent via-[#C9A063] to-transparent animate-[pulse_1.5s_ease-in-out_infinite]" />
            </div>

            {/* Central delicate typographic loading cue */}
            <div className="relative flex flex-col items-center gap-4">
                <div className="relative w-10 h-10 flex items-center justify-center">
                    <div className="absolute inset-0 border border-[#C9A063]/20 rounded-full animate-ping opacity-30" />
                    <div className="w-5 h-5 border border-[#C9A063]/60 border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="font-mono text-xs tracking-[0.3em] uppercase text-[#C9A063]/70">
                        Loading
                    </span>
                    <span className="font-display text-sm tracking-widest text-[#E8E6DC]/60">
                        正在翻阅书海
                    </span>
                </div>
            </div>
        </div>
    );
}
