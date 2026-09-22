import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // docs/ 下是参考资料（含第三方 SDK 自带测试），不参与本项目测试
        // evals/ 是需要真实检索（可能调 Jev、有成本）的评测集，用 vitest.eval.config.ts 单独跑
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.{idea,git,cache,output,temp}/**',
            '**/.next/**',
            '**/docs/**',
            '**/evals/**'
        ]
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname)
        }
    }
});
