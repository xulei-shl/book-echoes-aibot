import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

type SupportedBody = BodyInit | null | undefined;

const DEFAULT_HTTP_PORT = 80;
const DEFAULT_HTTPS_PORT = 443;

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
    if (!headers) {
        return {};
    }

    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }

    if (Array.isArray(headers)) {
        return Object.fromEntries(headers);
    }

    return Object.entries(headers).reduce<Record<string, string>>((result, [key, value]) => {
        result[key] = String(value);
        return result;
    }, {});
};

const toBuffer = (body: SupportedBody): Buffer | undefined => {
    if (body == null) {
        return undefined;
    }

    if (typeof body === 'string') {
        return Buffer.from(body);
    }

    if (body instanceof URLSearchParams) {
        return Buffer.from(body.toString());
    }

    if (body instanceof ArrayBuffer) {
        return Buffer.from(body);
    }

    if (ArrayBuffer.isView(body)) {
        return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    }

    throw new Error('当前代理请求仅支持字符串或二进制请求体');
};

const resolveTargetProxy = (targetUrl: URL): URL | null => {
    const proxyValue = targetUrl.protocol === 'https:'
        ? process.env.HTTPS_PROXY || process.env.HTTP_PROXY
        : process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

    if (!proxyValue?.trim()) {
        return null;
    }

    return new URL(proxyValue);
};

const buildProxyHeaders = (proxyUrl: URL): Record<string, string> => {
    if (!proxyUrl.username && !proxyUrl.password) {
        return {};
    }

    const token = Buffer.from(`${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`).toString('base64');
    return {
        'Proxy-Authorization': `Basic ${token}`
    };
};

const readIncomingMessage = async (response: http.IncomingMessage): Promise<Buffer> => {
    const chunks: Buffer[] = [];

    for await (const chunk of response) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
};

const buildResponse = async (response: http.IncomingMessage): Promise<Response> => {
    const body = await readIncomingMessage(response);
    const headers = new Headers();

    Object.entries(response.headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach((item) => headers.append(key, item));
            return;
        }

        if (typeof value === 'string') {
            headers.set(key, value);
        }
    });

    return new Response(body, {
        status: response.statusCode ?? 500,
        statusText: response.statusMessage,
        headers
    });
};

const attachAbort = (
    signal: AbortSignal | null | undefined,
    onAbort: () => void
): (() => void) => {
    if (!signal) {
        return () => undefined;
    }

    if (signal.aborted) {
        onAbort();
        return () => undefined;
    }

    const listener = () => onAbort();
    signal.addEventListener('abort', listener, { once: true });
    return () => signal.removeEventListener('abort', listener);
};

const requestViaHttpProxy = async (
    targetUrl: URL,
    options: RequestInit,
    proxyUrl: URL
): Promise<Response> => {
    const headers = {
        ...normalizeHeaders(options.headers),
        ...buildProxyHeaders(proxyUrl)
    };
    const body = toBuffer(options.body);

    if (body && !headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = String(body.byteLength);
    }

    return new Promise<Response>((resolve, reject) => {
        const request = http.request({
            host: proxyUrl.hostname,
            port: Number(proxyUrl.port || DEFAULT_HTTP_PORT),
            method: options.method ?? 'GET',
            path: targetUrl.href,
            headers
        }, async (response) => {
            try {
                resolve(await buildResponse(response));
            } catch (error) {
                reject(error);
            }
        });

        const cleanupAbort = attachAbort(options.signal, () => {
            request.destroy(new Error('请求已取消'));
        });

        request.on('error', (error) => {
            cleanupAbort();
            reject(error);
        });
        request.on('close', cleanupAbort);

        if (body) {
            request.write(body);
        }

        request.end();
    });
};

const connectTunnel = async (
    targetUrl: URL,
    proxyUrl: URL,
    signal?: AbortSignal | null
): Promise<tls.TLSSocket> => {
    const proxyHeaders = buildProxyHeaders(proxyUrl);
    const targetPort = Number(targetUrl.port || DEFAULT_HTTPS_PORT);

    return new Promise<tls.TLSSocket>((resolve, reject) => {
        const connectRequest = http.request({
            host: proxyUrl.hostname,
            port: Number(proxyUrl.port || DEFAULT_HTTP_PORT),
            method: 'CONNECT',
            path: `${targetUrl.hostname}:${targetPort}`,
            headers: proxyHeaders
        });

        const cleanupAbort = attachAbort(signal, () => {
            connectRequest.destroy(new Error('请求已取消'));
        });

        connectRequest.on('connect', (_response, socket) => {
            cleanupAbort();
            const tlsSocket = tls.connect({
                socket,
                servername: targetUrl.hostname
            });

            tlsSocket.once('secureConnect', () => resolve(tlsSocket));
            tlsSocket.once('error', reject);
        });

        connectRequest.on('response', async (response) => {
            cleanupAbort();
            const body = await readIncomingMessage(response);
            reject(new Error(`代理隧道建立失败: ${response.statusCode} ${body.toString('utf8')}`));
        });

        connectRequest.on('error', (error) => {
            cleanupAbort();
            reject(error);
        });

        connectRequest.end();
    });
};

const requestViaHttpsProxy = async (
    targetUrl: URL,
    options: RequestInit,
    proxyUrl: URL
): Promise<Response> => {
    const headers = normalizeHeaders(options.headers);
    const body = toBuffer(options.body);

    if (body && !headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = String(body.byteLength);
    }

    const tlsSocket = await connectTunnel(targetUrl, proxyUrl, options.signal);

    return new Promise<Response>((resolve, reject) => {
        const request = https.request({
            host: targetUrl.hostname,
            port: Number(targetUrl.port || DEFAULT_HTTPS_PORT),
            path: `${targetUrl.pathname}${targetUrl.search}`,
            method: options.method ?? 'GET',
            headers,
            agent: false,
            createConnection: () => tlsSocket
        }, async (response) => {
            try {
                resolve(await buildResponse(response));
            } catch (error) {
                reject(error);
            }
        });

        const cleanupAbort = attachAbort(options.signal, () => {
            request.destroy(new Error('请求已取消'));
            tlsSocket.destroy();
        });

        request.on('error', (error) => {
            cleanupAbort();
            reject(error);
        });
        request.on('close', () => {
            cleanupAbort();
            tlsSocket.destroy();
        });

        if (body) {
            request.write(body);
        }

        request.end();
    });
};

/**
 * 服务端网络请求入口。
 * 仅在配置了 HTTP(S)_PROXY 时接管请求，否则继续使用原生 fetch。
 */
export async function fetchWithOptionalProxy(url: string, options: RequestInit = {}): Promise<Response> {
    const targetUrl = new URL(url);
    const proxyUrl = resolveTargetProxy(targetUrl);

    if (!proxyUrl) {
        return fetch(url, options);
    }

    if (targetUrl.protocol === 'https:') {
        return requestViaHttpsProxy(targetUrl, options, proxyUrl);
    }

    return requestViaHttpProxy(targetUrl, options, proxyUrl);
}
