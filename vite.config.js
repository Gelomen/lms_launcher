import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 1420,
    // cargo 的 build-script 二进制被 Rust 进程锁定，Vite watcher 会 EBUSY 崩溃；
    // 前端源码不在 src-tauri/ 下，排除即可
    watch: { exclude: ['src-tauri/**'] },
  },
  clearScreen: false,
})
