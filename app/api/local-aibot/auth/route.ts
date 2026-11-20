import { NextResponse, type NextRequest } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { sameOrigin } from '@/src/utils/same-origin';
import {
    AIBOT_ACCESS_COOKIE,
    createAIBotAccessToken,
    getAIBotAccessPassword,
    isAIBotAccessRequired,
    verifyAIBotAccessToken,
    verifyAIBotPassword
} from '@/src/utils/aibot-access';

const notFound = () => NextResponse.json({ message: 'Not Found' }, { status: 404 });

const ensureEnabled = (): NextResponse | null => {
    try {
        assertAIBotEnabled();
        return null;
    } catch (error) {
        if (error instanceof AIBotDisabledError) {
            return notFound();
        }
        throw error;
    }
};

/** 查询当前模块是否需要密码，以及本次会话是否已通过验证 */
export async function GET(request: NextRequest) {
    const disabled = ensureEnabled();
    if (disabled) return disabled;

    const required = isAIBotAccessRequired();
    const authenticated =
        !required || verifyAIBotAccessToken(request.cookies.get(AIBOT_ACCESS_COOKIE)?.value);

    return NextResponse.json({ required, authenticated });
}

/** 校验密码并下发 httpOnly 会话 Cookie */
export async function POST(request: NextRequest) {
    const disabled = ensureEnabled();
    if (disabled) return disabled;

    if (!sameOrigin(request)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const password = getAIBotAccessPassword();
    if (!password) {
        return NextResponse.json({ ok: true });
    }

    let submitted: unknown;
    try {
        const body = (await request.json()) as { password?: unknown };
        submitted = body?.password;
    } catch {
        return NextResponse.json({ message: '请求格式错误' }, { status: 400 });
    }

    if (typeof submitted !== 'string' || !submitted) {
        return NextResponse.json({ message: '请输入访问密码' }, { status: 400 });
    }

    if (!verifyAIBotPassword(submitted)) {
        return NextResponse.json({ message: '密码错误' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
        name: AIBOT_ACCESS_COOKIE,
        value: createAIBotAccessToken(password),
        httpOnly: true,
        sameSite: 'lax',
        // 只有当前请求确实是 HTTPS 时才加 Secure，避免内网 HTTP 部署下 Cookie 被浏览器丢弃
        secure: request.nextUrl.protocol === 'https:',
        path: '/'
    });
    return response;
}
