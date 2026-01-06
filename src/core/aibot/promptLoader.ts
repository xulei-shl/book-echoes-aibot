import fs from 'node:fs/promises';
import path from 'node:path';
import { getLogger } from '@/src/utils/logger';

const cache = new Map<string, string>();
const logger = getLogger('aibot.promptLoader');

/**
 * 懒加载提示词内容，避免每次请求都触发磁盘 IO。
 */
export async function loadPrompt(promptName: string): Promise<string> {
    if (cache.has(promptName)) {
        return cache.get(promptName)!;
    }

    const filePath = path.join(process.cwd(), 'public', 'prompts', `${promptName}.md`);
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        cache.set(promptName, content);
        return content;
    } catch (error) {
        logger.error('读取提示词失败', { promptName, error });
        throw error;
    }
}

/**
 * 测试或热更新提示词时可清空缓存。
 */
export function clearPromptCache(): void {
    cache.clear();
}
