import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // file:// 协议兼容：main.ts loadFile(dist/index.html)，资源路径必须相对（否则 /assets/... 在 file:// 下解析到盘根 → JS 404 → Vue 不挂载）
  base: './',
  plugins: [vue()],
  server: {
    port: 1420,
  },
  clearScreen: false,
})
