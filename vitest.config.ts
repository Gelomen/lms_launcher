import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['src-main/**/*.test.ts', 'src-update/**/*.test.ts', 'src/**/*.test.ts'],
    // Windows 下 powershell 进程测试需要 30–60s（见任务 4）；组件测试用文件级 @vitest-environment happy-dom 声明
    testTimeout: 60000,
  },
});
