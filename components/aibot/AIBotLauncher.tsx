'use client';

import { useAIBotStore } from '@/store/aibot/useAIBotStore';

export default function AIBotLauncher() {
    const toggleOverlay = useAIBotStore((state) => state.toggleOverlay);

    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                toggleOverlay(true);
            }}
            className="font-display text-lg md:text-xl text-[#E8E6DC] hover:text-[#C9A063] transition-all duration-300 hover:scale-105 cursor-pointer"
        >
            本地对话
        </button>
    );
}
