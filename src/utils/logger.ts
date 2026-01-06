import { inspect } from 'node:util';

type LogLevel = 'debug' | 'info' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    error: 30
};

const DEFAULT_LEVEL: LogLevel = (process.env.AIBOT_LOG_LEVEL as LogLevel) ?? 'info';

/**
 * 获取项目统一日志实例，生成结构化中文日志。
 */
export function getLogger(moduleName: string) {
    /**
     * 将上下文序列化成紧凑字符串，避免 JSON 序列化失败。
     */
    const serialize = (context?: Record<string, unknown>) => {
        if (!context || Object.keys(context).length === 0) {
            return '';
        }
        return inspect(context, { depth: 3, breakLength: 80, compact: true });
    };

    /**
     * 核心输出实现，按照设定级别过滤日志。
     */
    const emit = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
        if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[DEFAULT_LEVEL]) {
            return;
        }

        const payload = {
            timestamp: new Date().toISOString(),
            level,
            module: moduleName,
            message,
            context: context ?? {}
        };

        const line = `${payload.timestamp} [${payload.level}] ${payload.module} - ${payload.message}`;
        const suffix = serialize(payload.context);

        if (level === 'error') {
            console.error(suffix ? `${line} ${suffix}` : line);
            return;
        }

        if (level === 'debug') {
            console.debug(suffix ? `${line} ${suffix}` : line);
            return;
        }

        console.info(suffix ? `${line} ${suffix}` : line);
    };

    return {
        debug(message: string, context?: Record<string, unknown>) {
            emit('debug', message, context);
        },
        info(message: string, context?: Record<string, unknown>) {
            emit('info', message, context);
        },
        error(message: string, context?: Record<string, unknown>) {
            emit('error', message, context);
        }
    };
}
