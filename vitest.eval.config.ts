import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * 检索评测集专用配置（与单元测试隔离）。
 *
 * 为什么单独一份配置：
 * - 评测要跑真实检索链路（可能调 Jev、有成本），不能混进 `npm test`；
 * - 默认 `fileParallelism: false`：评测共享 Jev 每分钟预算与进程内缓存，并发会互相干扰。
 *
 * 环境变量：手动加载 `.env`（Next 的 env 注入对 vitest 无效）。
 * 只补空缺（`override: false`），不覆盖 shell 里已显式设置的值（如录制时抬高的预算）。
 * `.env` 缺失时静默跳过 —— 离线评测（`npm run eval`）本来就无需 key。
 *
 * 用法：`npm run eval`（离线，无需 key）；`npm run eval:record` / `eval:replay`（需 `.env` 里的 TYPESAFE_API_KEY）。
 */

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, envFile);
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false });
}

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
