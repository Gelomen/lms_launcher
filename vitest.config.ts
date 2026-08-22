import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src-main/**/*.test.ts'],
    // Windows 下 powershell 进程测试需要 30–60s（见任务 4）
    testTimeout: 60000,
  },
});
