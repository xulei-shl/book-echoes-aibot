import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * 检索评测集专用配置（与单元测试隔离）。
 *
 * 为什么单独一份配置：
 * - 评测要跑真实检索链路（可能调 Jev、有成本），不能混进 `npm test`；
 * - 默认 `fileParallelism: false`：评测共享 Jev 每分钟预算与进程内缓存，并发会互相干扰。
 *
 * 用法：`npm run eval`（离线，无需 key）；录制 cassette 见 `evals/record-cassette.eval.ts`。
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['evals/**/*.eval.ts'],
        fileParallelism: false,
        testTimeout: 120_000,
        hookTimeout: 60_000
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname)
        }
    }
});
