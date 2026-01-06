import { getLogger } from '@/src/utils/logger';

const logger = getLogger('aibot.env');

export const DEFAULT_PLAIN_TEXT_TEMPLATE = '【{title}】{highlights} - {rating}分';

/**
 * 自定义错误类，用于在禁用模式下提前结束请求。
 */
export class AIBotDisabledError extends Error {
    constructor(message: string = 'AIBot 本地模式未启用') {
        super(message);
        this.name = 'AIBotDisabledError';
    }
}

/**
 * 判断服务器端是否允许访问本地 AIBot。
 */
export function isLocalAIBotEnabled(): boolean {
    return process.env.AIBOT_LOCAL_ENABLED === '1';
}

/**
 * 判断客户端是否展示入口按钮。
 */
export function isClientAIBotEnabled(): boolean {
    return process.env.NEXT_PUBLIC_ENABLE_AIBOT_LOCAL === '1';
}

/**
 * 统一在 API Route 顶部调用，未开启时直接抛错。
 */
export function assertAIBotEnabled(): void {
    if (!isLocalAIBotEnabled()) {
        logger.info('拒绝访问本地 AIBot，环境变量未开启');
        throw new AIBotDisabledError();
    }
}

/**
 * 获取书籍检索 API 根路径，提供兜底值。
 */
export function getBookApiBase(): string {
    return process.env.BOOK_API_BASE_URL ?? 'http://127.0.0.1:8000';
}

export interface LLMConfig {
    baseURL: string;
    apiKey: string;
    model: string;
    temperature?: number;
}

export interface LLMHintMetadata {
    base_url_env?: string;
    api_key_env?: string;
    model_env?: string;
    base_url?: string;
    api_key?: string;
    model?: string;
    suggested_temperature?: number;
}

const readEnv = (key?: string): string | undefined => {
    if (!key) {
        return undefined;
    }
    return process.env[key];
};

/**
 * 根据 `.env.local` 与检索 API 回传的 hint 合成 LLM 调用信息。
 */
export function resolveLLMConfig(
    hint?: LLMHintMetadata,
    overrides?: Partial<LLMConfig>
): LLMConfig {
    const baseURL =
        overrides?.baseURL ??
        hint?.base_url ??
        readEnv(hint?.base_url_env) ??
        process.env.AIBOT_LLM_BASE_URL;

    const apiKey =
        overrides?.apiKey ??
        hint?.api_key ??
        readEnv(hint?.api_key_env) ??
        process.env.AIBOT_LLM_API_KEY;

    const model =
        overrides?.model ??
        hint?.model ??
        readEnv(hint?.model_env) ??
        process.env.AIBOT_LLM_MODEL;

    if (!baseURL || !apiKey || !model) {
        logger.error('LLM 配置缺失，请检查环境变量', { baseURL: !!baseURL, apiKey: !!apiKey, model: !!model });
        throw new Error('AIBot LLM 环境变量未配置完整');
    }

    return {
        baseURL,
        apiKey,
        model,
        temperature: overrides?.temperature ?? hint?.suggested_temperature
    };
}
