import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalAIBotEnabled, resolveLLMConfig, resolveLLMCandidates, DEFAULT_PLAIN_TEXT_TEMPLATE } from '../../src/utils/aibot-env';

describe('aibot env helpers', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env = { ...originalEnv };
        vi.resetModules();
    });

    it('判断本地特性开关', () => {
        process.env.AIBOT_LOCAL_ENABLED = '1';
        expect(isLocalAIBotEnabled()).toBe(true);

        process.env.AIBOT_LOCAL_ENABLED = '0';
        expect(isLocalAIBotEnabled()).toBe(false);
    });

    it('优先解析 primary/secondary LLM 配置', () => {
        process.env.AIBOT_LLM_PRIMARY_BASE_URL = 'http://primary/v1';
        process.env.AIBOT_LLM_PRIMARY_API_KEY = 'sk-primary';
        process.env.AIBOT_LLM_PRIMARY_MODEL = 'gpt-primary';
        process.env.AIBOT_LLM_SECONDARY_BASE_URL = 'http://secondary/v1';
        process.env.AIBOT_LLM_SECONDARY_API_KEY = 'sk-secondary';
        process.env.AIBOT_LLM_SECONDARY_MODEL = 'gpt-secondary';

        expect(resolveLLMCandidates()).toEqual([
            {
                baseURL: 'http://primary/v1',
                apiKey: 'sk-primary',
                model: 'gpt-primary',
                temperature: undefined
            },
            {
                baseURL: 'http://secondary/v1',
                apiKey: 'sk-secondary',
                model: 'gpt-secondary',
                temperature: undefined
            }
        ]);
    });

    it('旧 AIBOT_LLM_* 配置映射为 primary', () => {
        process.env.AIBOT_LLM_BASE_URL = 'http://legacy/v1';
        process.env.AIBOT_LLM_API_KEY = 'sk-legacy';
        process.env.AIBOT_LLM_MODEL = 'gpt-legacy';

        expect(resolveLLMCandidates()).toEqual([
            {
                baseURL: 'http://legacy/v1',
                apiKey: 'sk-legacy',
                model: 'gpt-legacy',
                temperature: undefined
            }
        ]);
    });

    it('resolveLLMConfig 忽略 hint 覆盖，本地模式固定使用 env primary', () => {
        process.env.AIBOT_LLM_PRIMARY_BASE_URL = 'http://primary/v1';
        process.env.AIBOT_LLM_PRIMARY_API_KEY = 'sk-primary';
        process.env.AIBOT_LLM_PRIMARY_MODEL = 'gpt-primary';

        const config = resolveLLMConfig({
            base_url: 'http://override',
            api_key: 'sk-override',
            model: 'gpt-override',
            suggested_temperature: 0.2
        });

        expect(config).toMatchObject({
            baseURL: 'http://primary/v1',
            apiKey: 'sk-primary',
            model: 'gpt-primary',
            temperature: undefined
        });
    });

    it('提供纯文本模版常量', () => {
        expect(DEFAULT_PLAIN_TEXT_TEMPLATE).toContain('{title}');
        expect(DEFAULT_PLAIN_TEXT_TEMPLATE).toContain('{highlights}');
    });
});
