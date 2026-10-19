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
  build: {
    // chunk 拆分（2026-10-19）：消除 build.bat 里的「Some chunks are larger than 500 kB」告警。
    // 实测原入口 615 kB 的构成：@xterm/* 307 kB、@fortawesome/* 112 kB（svg-core + vue-fontawesome + 约 28 个图标）、
    // vue 70 kB、自身代码 126 kB —— 没有意外依赖被误打包，纯粹是三个大件叠在一起过线。
    // 本 app 由 src-main/main.ts 的 loadFile() 以 file:// 读本地文件：拆不拆都不减少总字节、也不影响加载速度，
    // 所以这里不动态 import（LogPanel 用 v-show 保活所有页签，终端启动即挂载，懒加载 xterm 拿不到收益）。
    // 拆分的目的是让默认的 500 kB 护栏继续有效（将来真混入超大依赖仍会报警），而不是调高阈值把信号关掉 ——
    // 阈值保持 500 kB 不动。
    // 分组约束：vue 必须与其 @vue/* 子包同处一个 chunk，拆开 runtime-core/runtime-dom 会触发 chunk 间
    // 循环初始化（Vue 手册里 manualChunks 的已知坑），所以只切 @xterm / @fortawesome 两组，
    // 其余 node_modules（vue 及子包、yaml 等）统一进 'vendor'。
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;   // rollup 的 id 用正斜杠，自身代码（src/）不匹配，留在入口 chunk
          if (id.includes('@xterm')) return 'vendor-xterm';             // 终端仿真器 + fit/search/web-links addon
          if (id.includes('@fortawesome')) return 'vendor-fontawesome';  // svg-core + vue-fontawesome + 图标数据
          return 'vendor';
        },
      },
    },
  },
})
