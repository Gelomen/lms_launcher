### 任务 1：Electron 骨架 + Vitest 基础设施

**文件：**
- 删除：src-tauri/（整目录，先救回 icons/icon.ico）
- 修改：package.json（去 tauri 依赖、加 electron/vitest/yaml + 新 scripts）、.gitignore（去 src-tauri 条目）、vite.config.js（去 src-tauri watch 排除）
- 创建：src-main/main.ts、src-main/preload.ts、src-main/test-utils.ts、tsconfig.main.json、vitest.config.ts、electron-builder.yml

- [x] **步骤 1：救回图标，删 Rust 残留**（已在计划定稿时提前完成：icon 已存 `src-main/icon.ico`、src-tauri/ 已从工作区与 git 移除——执行者跳过本步，直接进入步骤 2）

运行：

~~~ powershell
New-Item -ItemType Directory -Force src-main | Out-Null
Copy-Item src-tauri\icons\icon.ico src-main\icon.ico
Remove-Item -Recurse -Force src-tauri
~~~

.gitignore 改为：

~~~
.worktrees/
dist/
dist-main/
dist-release/
node_modules/
.superpowers/
package-lock.json
~~~

- [ ] **步骤 2：package.json 重写**（部分已提前完成：tauri 依赖与 "type" 字段已清除，vue 保留。剩余工作 = 用上方完整版本覆盖 package.json——加 electron/vitest/yaml 依赖 + dev/build/test scripts + "main": "dist-main/main.js"）

~~~ json
{
  "name": "lms-launch",
  "private": true,
  "main": "dist-main/main.js",
  "scripts": {
    "dev": "concurrently -k \"npm:dev:vite\" \"npm:dev:electron\"",
    "dev:vite": "vite",
    "dev:electron": "wait-port 1420 -t 120000 && tsc -p tsconfig.main.json && cross-env VITE_DEV_SERVER_URL=http://localhost:1420 electron .",
    "build": "vite build && tsc -p tsconfig.main.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "vue": "^3.5.13",
    "yaml": "^2.7.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.3",
    "concurrently": "^9.1.0",
    "cross-env": "^10.0.0",
    "electron": "^28.3.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^2.1.0",
    "wait-port": "^1.1.0"
  }
}
~~~

（不设 "type": "module"——主进程 CJS；yaml 放 dependencies 是运行时依赖。）

- [x] **步骤 3：vite.config.js 去 src-tauri 排除**（已提前完成——当前文件已是目标形态，执行者跳过）

~~~ js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { port: 1420 },
  clearScreen: false,
});
~~~

- [ ] **步骤 4：tsconfig.main.json（主进程 + preload，CJS）**

~~~ json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-main",
    "rootDir": "src-main",
    "types": ["node"],
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src-main/**/*.ts"]
}
~~~

- [ ] **步骤 5：vitest.config.ts**

~~~ ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src-main/**/*.test.ts'],
    // Windows 下 powershell 进程测试需要 30–60s（见任务 4）
    testTimeout: 60000,
  },
});
~~~

- [ ] **步骤 6：electron-builder.yml**

~~~ yaml
appId: com.lms.launch
productName: lms_launch
directories:
  output: dist-release
files:
  - dist/**
  - dist-main/**
  - package.json
win:
  target: portable
  icon: src-main/icon.ico
portable:
  artifactName: "lms-launch-${version}-portable.exe"
~~~

- [ ] **步骤 7：src-main/test-utils.ts（tmp 路径工具）**

~~~ ts
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function tmpPath(name: string): string {
  const dir = join(tmpdir(), 'lms_launch_test');
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function rm(p: string): void {
  rmSync(p, { force: true, recursive: true });
}
~~~

- [ ] **步骤 8：src-main/main.ts（Electron 入口，最小壳）**

~~~ ts
import { app, BrowserWindow } from 'electron';

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';

function createWindow(): void {
  const win = new BrowserWindow({
    title: 'lms_launch',
    width: 980, height: 720, minWidth: 760, minHeight: 540,
    webPreferences: {
      preload: require.resolve('../dist-main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(DEV_URL);
  else win.loadFile('dist/index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
~~~

- [ ] **步骤 9：src-main/preload.ts（占位，任务 5 补全）**

~~~ ts
// 任务 5 补全 IPC 桥
export {};
~~~

- [ ] **步骤 10：npm install + 构建 + dev 验证**

运行（worktree 根目录）：

~~~ powershell
npm install
npm run build
~~~

预期：vite build 成功（dist/）、tsc 输出 dist-main/{main.js,preload.js}、无 TS error。

再验证窗口：

~~~ powershell
npm run dev
~~~

预期：Vite 1420 起服 + Electron 窗口弹出（地址 http://localhost:1420）、页面显示「lms_launch 骨架」（App.vue 占位）、console 无报错。可视确认记入任务 10 人工验收清单。

- [ ] **步骤 11：Commit**

~~~ bash
git add -A
git commit -m "feat: Electron 骨架 + Vitest 基础设施（弃用 Rust/Tauri）"
~~~
