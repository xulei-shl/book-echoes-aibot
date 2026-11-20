import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    createAIBotAccessToken,
    isAIBotAccessRequired,
    verifyAIBotAccessToken,
    verifyAIBotPassword
} from '../../src/utils/aibot-access';

describe('aibot access helpers', () => {
    const originalPassword = process.env.AIBOT_ACCESS_PASSWORD;

    beforeEach(() => {
        delete process.env.AIBOT_ACCESS_PASSWORD;
    });

    afterEach(() => {
        if (originalPassword === undefined) {
            delete process.env.AIBOT_ACCESS_PASSWORD;
        } else {
            process.env.AIBOT_ACCESS_PASSWORD = originalPassword;
        }
    });

    it('未配置密码时不启用访问控制', () => {
        expect(isAIBotAccessRequired()).toBe(false);
        expect(verifyAIBotPassword('任意输入')).toBe(true);
        expect(verifyAIBotAccessToken(undefined)).toBe(true);
        expect(verifyAIBotAccessToken('任意令牌')).toBe(true);
    });

    it('配置密码后校验密码并签发可复用的会话令牌', () => {
        process.env.AIBOT_ACCESS_PASSWORD = 'shuhai@2026';

        expect(isAIBotAccessRequired()).toBe(true);
        expect(verifyAIBotPassword('shuhai@2026')).toBe(true);
        expect(verifyAIBotPassword('wrong-password')).toBe(false);

        const token = createAIBotAccessToken('shuhai@2026');
        expect(verifyAIBotAccessToken(token)).toBe(true);
        expect(verifyAIBotAccessToken(`${token}x`)).toBe(false);
        expect(verifyAIBotAccessToken(null)).toBe(false);
    });

    it('密码变更后旧令牌失效', () => {
        process.env.AIBOT_ACCESS_PASSWORD = 'old-password';
        const oldToken = createAIBotAccessToken('old-password');

        process.env.AIBOT_ACCESS_PASSWORD = 'new-password';
        expect(verifyAIBotAccessToken(oldToken)).toBe(false);
    });
});
