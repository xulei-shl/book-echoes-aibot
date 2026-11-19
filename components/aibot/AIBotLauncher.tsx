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
            className="font-display text-lg md:text-xl text-[#E8E6DC] hover:text-[#C9A063] active:scale-[0.96] transition-[color,transform] duration-150 ease-out cursor-pointer"
        >
            本地对话
        </button>
    );
}
