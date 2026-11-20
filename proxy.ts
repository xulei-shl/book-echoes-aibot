import { NextResponse, type NextRequest } from 'next/server';
import {
    AIBOT_ACCESS_COOKIE,
    isAIBotAccessRequired,
    verifyAIBotAccessToken
} from '@/src/utils/aibot-access';

const AIBOT_AUTH_PATH = '/api/local-aibot/auth';

/**
 * 本地对话接口的访问控制：配置了 AIBOT_ACCESS_PASSWORD 后，
 * 除登录接口外的 /api/local-aibot/* 都必须携带有效会话 Cookie，避免绕过前端密码门直接调用接口。
 */
export default function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!isAIBotAccessRequired() || pathname === AIBOT_AUTH_PATH) {
        return NextResponse.next();
    }

    const token = request.cookies.get(AIBOT_ACCESS_COOKIE)?.value;
    if (verifyAIBotAccessToken(token)) {
        return NextResponse.next();
    }

    return NextResponse.json({ message: '未通过访问验证' }, { status: 401 });
}

export const config = {
    matcher: '/api/local-aibot/:path*'
};
