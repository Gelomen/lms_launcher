# 应用启动时检测 llama.cpp 安装目录 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 应用启动（app whenReady）时检测已保存的 llama.cpp 安装目录与 llama-server.exe 存在性，结果以 sys 日志行写入 LMS Launcher 日志区（日志行不带任何括号文字）。

**架构：** 新增 `src-main/llama-check.ts` 纯函数模块（`checkLlamaInstall` 四分支判定 + `installCheckMessage` 文案生成），`src-main/main.ts` 在 `app.whenReady()` 的 `createWindow()` 之后调用 `detectLlamaInstall()`，读 `lms_launcher.yaml` 的 `llama_dir` 并经现有 `emitLog(line, 'sys')` 通道发送。零新 IPC、零渲染端改动、目录卡片行为不变。

**技术栈：** Electron 主进程 + TypeScript（CommonJS，strict）+ vitest（node 环境，fs 临时目录）。

**规格：** `docs/superpowers/specs/2026-08-31-startup-llama-check-design.md`（已批准）。

**测试运行命令：** `npx vitest run src-main/llama-check.test.ts`（单文件）；全量 `npm test`。

**文件结构：**

- 创建 `src-main/llama-check.ts` —— 纯函数：status 判定 + 日志文案（不 import electron，可独立单测）。
- 创建 `src-main/llama-check.test.ts` —— 四分支 + 四条文案测试（复用 `test-utils` 临时目录）。
- 修改 `src-main/main.ts` —— import + `detectLlamaInstall()`（whenReady 内 createWindow 后调用）。

---

### 任务 1：llama-check.ts 纯函数（TDD）

**文件：**
- 创建：`src-main/llama-check.ts`
- 创建：`src-main/llama-check.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src-main/llama-check.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { checkLlamaInstall, installCheckMessage } from './llama-check';
import { tmpPath, rm, mkDir, writeText, jp } from './test-utils';

describe('llama-check.ts', () => {
  it('empty_or_blank_dir_is_unset', () => {
    expect(checkLlamaInstall('')).toBe('unset');
    expect(checkLlamaInstall('   ')).toBe('unset');
  });

  it('nonexistent_path_is_dir_missing', () => {
    const p = tmpPath('no-such-dir-xyz');
    rm(p);
    expect(checkLlamaInstall(p)).toBe('dir_missing');
  });

  it('dir_without_exe_is_exe_missing', () => {
    const dir = tmpPath('empty-llama-dir');
    rm(dir); mkDir(dir);
    expect(checkLlamaInstall(dir)).toBe('exe_missing');
    rm(dir);
  });

  it('dir_with_exe_is_ok', () => {
    const dir = tmpPath('ok-llama-dir');
    rm(dir); mkDir(dir);
    writeText(jp(dir, 'llama-server.exe'), 'stub');
    expect(checkLlamaInstall(dir)).toBe('ok');
    rm(dir);
  });

  it('messages_have_no_parentheses_and_match_status', () => {
    const dir = 'D:\AI\llama-cpp';
    expect(installCheckMessage(dir, 'unset')).toBe('[lms_launcher] 启动检测 · 未配置 llama.cpp 安装目录');
    expect(installCheckMessage(dir, 'dir_missing')).toBe('[lms_launcher] 启动检测 · 安装目录不存在：' + dir);
    expect(installCheckMessage(dir, 'exe_missing')).toBe('[lms_launcher] 启动检测 · 目录中未找到 llama-server.exe：' + dir);
    expect(installCheckMessage(dir, 'ok')).toBe('[lms_launcher] 启动检测 · llama-server.exe 已找到：' + dir);
    for (const s of ['unset', 'dir_missing', 'exe_missing', 'ok'] as const) {
      const m = installCheckMessage(dir, s);
      expect(m).not.toMatch(/[（(]/); // 批注：不带括号文字
    }
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/llama-check.test.ts`
预期：FAIL（Cannot find module './llama-check'）

- [ ] **步骤 3：编写最少实现代码**

创建 `src-main/llama-check.ts`：

```ts
// 应用启动时的 llama.cpp 安装目录检测（规格 2026-08-31-startup-llama-check-design）。
// 纯函数模块：不 import electron / 不读 yaml / 不写日志——main.ts 负责接线与 emitLog。
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type LlamaInstallStatus = 'unset' | 'dir_missing' | 'exe_missing' | 'ok';

// 判定已保存的 llama_dir（trim 后）：
// 空 → unset；目录不存在或是文件 → dir_missing；缺 llama-server.exe → exe_missing；否则 ok。
// 不抛错：statSync 用 throwIfNoEntry:false 处理不存在路径。
export function checkLlamaInstall(dir: string): LlamaInstallStatus {
  const d = dir.trim();
  if (d.length === 0) return 'unset';
  const st = statSync(d, { throwIfNoEntry: false });
  if (st === null || !st.isDirectory()) return 'dir_missing';
  return existsSync(join(d, 'llama-server.exe')) ? 'ok' : 'exe_missing';
}

// 日志行文案（全部不带括号文字；dir 原样展示，不转义不截断）。
export function installCheckMessage(dir: string, status: LlamaInstallStatus): string {
  switch (status) {
    case 'unset': return '[lms_launcher] 启动检测 · 未配置 llama.cpp 安装目录';
    case 'dir_missing': return '[lms_launcher] 启动检测 · 安装目录不存在：' + dir;
    case 'exe_missing': return '[lms_launcher] 启动检测 · 目录中未找到 llama-server.exe：' + dir;
    case 'ok': return '[lms_launcher] 启动检测 · llama-server.exe 已找到：' + dir;
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/llama-check.test.ts`
预期：PASS（5 passed）

- [ ] **步骤 5：Commit**

```bash
git add src-main/llama-check.ts src-main/llama-check.test.ts
git commit -m "feat: add llama install dir check pure functions (status + log message)"
```

---

### 任务 2：main.ts 接线（whenReady 内调用 + 日志）

**文件：**
- 修改：`src-main/main.ts`（第 1-8 行 import 区、第 293-309 行 whenReady）

- [ ] **步骤 1：接线代码**

修改 `src-main/main.ts`：

1. import 区（第 8 行 `import { ProcessState } from './process';` 之后）追加：

```ts
import { checkLlamaInstall, installCheckMessage } from './llama-check';
```

2. `createTray` 函数结束后（第 84 行 `}` 之后、`// ---------- 窗口 ----------` 之前）新增：

```ts
// ---------- 启动检测（规格 2026-08-31-startup-llama-check-design） ----------
// whenReady 内 createWindow 后调用：读已保存的 llama_dir → 判定 → emitLog sys 行进 LMS Launcher 日志区。
// createWindow 同步建窗；send 先于渲染端订阅发出的消息按通道缓存，onMounted 订阅后按序收到，不丢行。
function detectLlamaInstall(): void {
  const [p] = yamlPaths();
  const dir = appConfigLoad(p).llama_dir;
  emitLog(installCheckMessage(dir, checkLlamaInstall(dir)), 'sys');
}
```

3. `app.whenReady().then(...)` 内 `createWindow();`（第 304 行）之后、`createTray();` 之前插入一行：

```ts
  detectLlamaInstall();
```

- [ ] **步骤 2：类型编译验证**

运行：`npx tsc -p tsconfig.main.json --noEmit`
预期：无输出（0 错误）

- [ ] **步骤 3：全量测试回归**

运行：`npm test`
预期：全部 PASS（含新增 llama-check.test.ts）

- [ ] **步骤 4：Commit**

```bash
git add src-main/main.ts
git commit -m "feat: log llama.cpp install dir check result to launcher log on app start"
```

---

### 任务 3：端到端手动验证（真实启动）

- [ ] **步骤 1：构建 + 启动应用**

运行：`npm run dev`（vite + electron 并行，自动开窗）
预期：应用窗口打开。

- [ ] **步骤 2：验证日志行**

查看底部日志面板「LMS Launcher」页签，按当前 `lms_launcher.yaml` 的 `llama_dir` 实际值核对：

| 当前状态 | 预期首行（启动时刻） |
|----------|----------------------|
| 有目录且 exe 存在 | `[lms_launcher] 启动检测 · llama-server.exe 已找到：<dir>` |
| 有目录但 exe 缺失 | `[lms_launcher] 启动检测 · 目录中未找到 llama-server.exe：<dir>` |
| 目录被删除 | `[lms_launcher] 启动检测 · 安装目录不存在：<dir>` |
| 未配置（yaml 无 llama_dir） | `[lms_launcher] 启动检测 · 未配置 llama.cpp 安装目录` |

切换状态重跑 `npm run dev` 覆盖对应分支（至少验证「已找到」与一个失败分支）。
同时确认：目录卡片行为无变化（不自动出现 ✓/✗ 状态行，除非用户手动选目录）。

- [ ] **步骤 3：收尾**

停止 `npm run dev`。若一切正常，无需额外 commit（无代码改动）。
