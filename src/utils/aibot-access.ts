import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 本地对话模块的访问密码。
 * 只在服务端读取（不要加 NEXT_PUBLIC_ 前缀），留空表示不启用密码门。
 */
export const AIBOT_ACCESS_COOKIE = 'aibot_access';

const TOKEN_CONTEXT = 'aibot-access-v1';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** 定长摘要比较，避免比较耗时随输入长度变化 */
const safeEqual = (a: string, b: string): boolean => timingSafeEqual(digest(a), digest(b));

export function getAIBotAccessPassword(): string | null {
    const password = process.env.AIBOT_ACCESS_PASSWORD?.trim();
    return password ? password : null;
}

/** 是否配置了访问密码（未配置时整条访问控制链路放行） */
export function isAIBotAccessRequired(): boolean {
    return getAIBotAccessPassword() !== null;
}

/** 由密码派生的会话令牌，写入 httpOnly Cookie；改密码后旧令牌自动失效 */
export function createAIBotAccessToken(password: string): string {
    return createHmac('sha256', password).update(TOKEN_CONTEXT).digest('hex');
}

/** 校验用户提交的密码 */
export function verifyAIBotPassword(input: string): boolean {
    const expected = getAIBotAccessPassword();
    if (!expected) {
        return true;
    }
    return safeEqual(input, expected);
}

/** 校验 Cookie 中的会话令牌 */
export function verifyAIBotAccessToken(token: string | null | undefined): boolean {
    const password = getAIBotAccessPassword();
    if (!password) {
        return true;
    }
    if (!token) {
        return false;
    }
    return safeEqual(token, createAIBotAccessToken(password));
}
