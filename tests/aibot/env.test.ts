import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalAIBotEnabled, resolveLLMConfig, DEFAULT_PLAIN_TEXT_TEMPLATE } from '../../src/utils/aibot-env';

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

    it('根据 hint 合成 LLM 配置', () => {
        process.env.AIBOT_LLM_BASE_URL = 'http://localhost:8001/v1';
        process.env.AIBOT_LLM_API_KEY = 'sk-base';
        process.env.AIBOT_LLM_MODEL = 'gpt-test';

        const config = resolveLLMConfig({
            base_url: 'http://override',
            api_key: 'sk-override',
            model: 'gpt-override',
            suggested_temperature: 0.2
        });

        expect(config).toMatchObject({
            baseURL: 'http://override',
            apiKey: 'sk-override',
            model: 'gpt-override',
            temperature: 0.2
        });
    });

    it('提供纯文本模版常量', () => {
        expect(DEFAULT_PLAIN_TEXT_TEMPLATE).toContain('{title}');
        expect(DEFAULT_PLAIN_TEXT_TEMPLATE).toContain('{highlights}');
    });
});
