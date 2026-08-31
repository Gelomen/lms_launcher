# 服务生命周期日志双发至 llama-server 日志区 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [x]`）语法来跟踪进度。

**目标：** LMS Launcher 日志区中与 llama-server 服务生命周期相关的行，同时写入 llama-server 日志区；通过 payload 可选字段 echoTabs（string[]）实现，未来新增标签页时发射点写目标 id 列表即可，分发逻辑不变。

**架构：** 主进程 emitLog 增加第三参 echoTabs，3 个生命周期发射点传 ['llama-server']；log-line IPC payload 携带该字段（preload/ipc 仅扩类型）；渲染端 App.vue appendLine 在写入主桶后，对 echoTabs 中每个已注册且非主桶的 tab id 再写一份并各自独立裁剪。渲染端 3 个本地点（启动失败/停止失败/进程退出）同样带 echoTabs。

**技术栈：** Electron + Vue 3 + TypeScript + vitest。

**规格：** docs/superpowers/specs/2026-08-31-sys-log-dual-echo-design.md（commit 9535e2c）

**基线：** 全量测试当前全过（执行前先跑 `npm test` 确认基线）。工作区：D:\AI\Workspace\lms_launcher，master 分支直接执行（用户已批准，无 worktree）。

---

## 文件结构

| 文件 | 职责 | 改动 |
|------|------|------|
| src-main/main.ts | 主进程发射点 | emitLog 签名 + 3 个发射点加 echoTabs |
| src-main/preload.ts | IPC 白名单桥 | onLogLine 类型加 echoTabs?: string[] |
| src/ipc.ts | 渲染端 IPC 封装 | onLogLine 类型加 echoTabs?: string[] |
| src/App.vue | 分桶路由 | LogEntry 加 echoTabs；appendLine 双写；3 个本地点带标记 |
| src/App.test.ts | 渲染端路由测试 | 新增双桶用例 |

不变：src/modules/log-tabs.ts（注册表已是单一真源）、src/modules/LogPanel.vue、src/modules/LogTabView.vue（其 lines prop 类型 `{ line; stream }` 数组是 App 下发子集，结构兼容，无需改）。

---

### 任务 1：类型链扩展（preload + ipc）——先行、无行为变化

**文件：**
- 修改：`src/main/preload.ts`（正确路径：`src-main/preload.ts`）
- 修改：`src/ipc.ts`

- [x] **步骤 1：改 preload.ts**

`src-main/preload.ts` 中 onLogLine 两处内联类型改为：

```ts
  onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }) => void) => {
    const listener = (_e: unknown, payload: { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }) => cb(payload);
    ipcRenderer.on('log-line', listener);
    return () => ipcRenderer.removeListener('log-line', listener);
  },
```

- [x] **步骤 2：改 ipc.ts**

`src/ipc.ts` 中 window.lms 声明与 onLogLine 导出函数的内联类型同样加 `echoTabs?: string[]`：

```ts
      onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }) => void) => () => void;
```

```ts
export function onLogLine(cb: (e: { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }) => void): () => void {
  return window.lms.onLogLine(cb);
```

- [x] **步骤 3：类型检查 + 全量测试**

运行：`npm test`
预期：全过（本任务零行为变化；若构建脚本含 tsc 报错则说明类型不一致，修到干净）

- [x] **步骤 4：Commit**

```bash
git add src-main/preload.ts src/ipc.ts
git commit -m "feat: add optional echoTabs to log-line IPC payload types"
```

---

### 任务 2：主进程 emitLog echoTabs + 3 个生命周期发射点

**文件：**
- 修改：`src-main/main.ts:46-50`（emitLog）、`174`（启动命令）、`184`（PROC 错误行）、`214`（停止指令）

- [x] **步骤 1：emitLog 签名扩展**

`src-main/main.ts`：

```ts
type StreamName = 'sys' | 'out' | 'err';
function emitLog(line: string, stream: StreamName, echoTabs?: string[]): void {
  const win = mainWin();
  if (win) win.webContents.send("log-line", { line, stream, ...(echoTabs ? { echoTabs } : {}) });
}
```

（spread 保证不带标记时 payload 与现状逐字段一致——不出现 echoTabs: undefined。）

- [x] **步骤 2：3 个发射点加标记**

`src-main/main.ts` start_server 内（约 174 行）：

```ts
  emitLog("[lms_launcher] 启动命令 · " + commandLine(args), "sys", ['llama-server']);
```

同函数 onExit error 分支（约 184 行）：

```ts
    if (error) emitLog(error, "sys", ['llama-server']);
```

stop_server（约 214 行）：

```ts
  emitLog('[lms_launcher] 停止指令已发送', 'sys', ['llama-server']);
```

其余发射点（detectLlamaInstall、onDirValidated 无主进程对应、params_default 回填失败约 329 行）不动。

- [x] **步骤 3：全量测试**

运行：`npm test`
预期：全过（主进程无 emitLog 单测，行为变化由任务 3 渲染端测试覆盖）

- [x] **步骤 4：Commit**

```bash
git add src-main/main.ts
git commit -m "feat: echo lifecycle log lines to llama-server tab from main process"
```

---

### 任务 3：渲染端 appendLine 双桶分发 + 3 个本地点标记（TDD）

**文件：**
- 修改：`src/App.vue`（LogEntry、appendLine、doStart catch、doStop catch、onProcessExit）
- 测试：`src/App.test.ts`

- [x] **步骤 1：编写失败的测试**

`src/App.test.ts` 两处修改（复用文件顶部既有 mountApp / logHandlers / flush 基础设施）：

**a) 扩展顶部 ipc mock**——捕获 onProcessExit 回调（现为 no-op）：

在 `const logHandlers: ...` 之后加一行：

```ts
// 生命周期双发（规格 2026-08-31-sys-log-dual-echo）：onProcessExit 捕获回调，测试驱动进程退出行
const processExitHandlers: Array<(e: { code: number }) => void> = [];
```

mock 对象内 `onProcessExit: () => () => {},` 改为：

```ts
  onProcessExit: (fn: (e: { code: number }) => void) => { processExitHandlers.push(fn); return () => {} },
```

**b) 文件末尾追加以下 describe（逐字内容）：**

```ts
describe('lifecycle log dual-echo (echoTabs)', () => {
  function tabTexts(w: any, tabId: string): string[] {
    return w.find(`.log-pane[data-tab-id="${tabId}"]`)
      .findAll('p')
      .map((p: any) => p.text())
      .filter((t: string) => t !== '（暂无日志）');
  }

  it('sys line with echoTabs: [llama-server] lands in both tabs; without it stays launcher-only', async () => {
    const { w } = mountApp();
    await flush();
    const h = logHandlers.at(-1)!;
    h({ line: '[lms_launcher] 启动命令 · llama-server.exe -m x', stream: 'sys', echoTabs: ['llama-server'] });
    h({ line: '[lms_launcher] 目录校验 · 已找到', stream: 'sys' }); // 无 echoTabs → 单桶
    await flush();
    expect(tabTexts(w, 'launcher')).toEqual([
      '[lms_launcher] 启动命令 · llama-server.exe -m x',
      '[lms_launcher] 目录校验 · 已找到',
    ]);
    expect(tabTexts(w, 'llama-server')).toEqual(['[lms_launcher] 启动命令 · llama-server.exe -m x']);
    w.unmount();
  });

  it('echoTabs with unknown tab id is silently ignored', async () => {
    const { w } = mountApp();
    await flush();
    const h = logHandlers.at(-1)!;
    h({ line: '[lms_launcher] X', stream: 'sys', echoTabs: ['dsh'] }); // dsh 尚未注册
    await flush();
    expect(tabTexts(w, 'launcher')).toEqual(['[lms_launcher] X']);
    expect(tabTexts(w, 'llama-server')).toEqual([]);
    w.unmount();
  });

  it('start-fail line (local catch) lands in both tabs', async () => {
    // 独立于 mountApp：自备 invoke mock（get_state=ready）与可控 start_server，触发 doStart catch 通用失败分支
    const start2 = Promise.withResolvers<void>();
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve({ running: false, stopping: false, configId: null });
        case 'get_configs': return Promise.resolve({ c1: { name: null, values: {} } });
        case 'start_server': return start2.promise;
        case 'stop_server': return Promise.resolve(undefined);
        default: return Promise.resolve(undefined);
      }
    });
    const w = mount(App) as import('@vue/test-utils').VueWrapper<any>;
    await flush();
    const launchBtn = w.find('.module-launch .btn-launch');
    await launchBtn.trigger('click');
    start2.reject(new Error('boom'));
    await flush();
    expect(tabTexts(w, 'launcher')).toContain('[lms_launcher] 启动失败 · boom');
    expect(tabTexts(w, 'llama-server')).toContain('[lms_launcher] 启动失败 · boom');
    w.unmount();
  });

  it('process-exit line (local onProcessExit) lands in both tabs', async () => {
    const { w } = mountApp();
    await flush();
    processExitHandlers.at(-1)!({ code: 1 });
    await flush();
    expect(tabTexts(w, 'launcher')).toContain('[lms_launcher] 进程退出 code=1');
    expect(tabTexts(w, 'llama-server')).toContain('[lms_launcher] 进程退出 code=1');
    w.unmount();
  });
});
```

（注 1：既有 ipc mock 的 errMsg 为 `(e) => (e as Error).message`，`start2.reject(new Error('boom'))` 落通用分支，文案 = `'启动失败 · boom'`——与 App.vue doStart catch 第三分支一致。注 2：doStop 失败行与上述两行走同一 appendLine 双写分支（同构），不单独挂完整生命周期用例。注 3：新挂载的 `mount(App)` 直接复用文件顶部的 `import { mount } from '@vue/test-utils'`。）

- [x] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/App.test.ts`
预期：新增 describe 中第 1 条 FAIL（llama-server 桶为空）；第 2 条 PASS（未知 id 现状即忽略）；第 3 条 FAIL（启动失败行未进 llama-server 桶）；第 4 条 FAIL（进程退出行未进 llama-server 桶）。

- [x] **步骤 3：实现 App.vue 双写**

`src/App.vue`：

```ts
interface LogEntry { line: string; stream: 'sys' | 'out' | 'err'; echoTabs?: string[] }
```

appendLine 替换为：

```ts
function trimBucket(arr: LogEntry[]): void {
  if (arr.length > MAX_LINES) arr.splice(0, arr.length - MAX_LINES); // 裁最旧，仅本桶
}

function appendLine(e: LogEntry): void {
  const id = bucketOf(e.stream);
  logBuckets.value[id].push(e);
  trimBucket(logBuckets.value[id]);
  // echoTabs（规格 2026-08-31-sys-log-dual-echo §2.1）：主桶之外，对每个已注册且非主桶的
  // tab id 再写一份并各自独立裁剪；未知 id 静默忽略（主/渲染端版本不一致时不崩）
  for (const t of e.echoTabs ?? []) {
    if (t === id || !logBuckets.value[t]) continue;
    logBuckets.value[t].push(e);
    trimBucket(logBuckets.value[t]);
  }
}
```

3 个本地点改为带标记（appendSys 增加透传，默认不带）：

```ts
function appendSys(line: string, echoTabs?: string[]): void {
  appendLine({ line: line.startsWith('[lms_launcher]') ? line : '[lms_launcher] ' + line, stream: 'sys', ...(echoTabs ? { echoTabs } : {}) });
}
```

- doStart catch：`appendSys('启动失败（配置缺失）· ' + msg, ['llama-server']);` / `appendSys('启动失败（校验未过）· ' + msg, ['llama-server']);` / `appendSys('启动失败 · ' + msg, ['llama-server']);`
- doStop catch：`appendSys('停止失败 · ' + errMsg(e), ['llama-server']);`
- onProcessExit：`appendSys('进程退出 code=' + e.code, ['llama-server']);`
- onDirValidated 两处调用不动（保持单桶）。

- [x] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/App.test.ts`
预期：全过（含既有「sys 行单桶 / out-err 单桶 / 各桶 500 裁剪 / 逐 tab 清空」用例——注意既有用例发的行无 echoTabs，走缺省单桶路径不受影响）。

- [x] **步骤 5：全量测试 + 构建**

运行：`npm test` 然后 `npm run build`
预期：全过，构建 exit 0。

- [x] **步骤 6：Commit**

```bash
git add src/App.vue src/App.test.ts
git commit -m "feat: echo lifecycle sys log lines into llama-server tab (renderer)"
```

---

### 任务 4：真实运行验证（dev + 人工/CDP 观察）

**文件：** 无代码改动；产出报告 `.superpowers/sdd/dual-echo-verify-report.md`。

- [ ] **步骤 1：构建并 dev 运行**

运行：`npm run build`（确保 dist 最新）→ `npm run dev`（后台）。
无可用 llama.cpp 目录时，验证点 2/3 走启动失败路径：模板下拉选任意模板点[启动] → 预期 sys 行「启动失败 · …」**同时**出现在两个页签。

- [ ] **步骤 2：逐页签核对**

- LMS Launcher 页签与 llama-server 页签同时可见：启动失败行（或启动命令/停止指令行，若环境可真实启动）
- 目录校验行只出现在 LMS Launcher 页签
- 两页签 [清空日志] 互不影响（清 llama-server 后 launcher 行仍在）

- [ ] **步骤 3：收尾**

杀掉 dev 进程；将观察结果（页面截图或文字记录）写入 `.superpowers/sdd/dual-echo-verify-report.md`；commit：

```bash
git add .superpowers/sdd/dual-echo-verify-report.md
git commit -m "docs: dual-echo real-run verification report"
```

---

## 自检记录（写计划时执行）

1. 规格覆盖度：§2.1 payload → 任务 1/2/3；§2.2 三发射点 → 任务 2 步骤 2；§2.3 渲染端 → 任务 3；§2.4 兼容性约束 → echoTabs 列表设计本身满足，无独立任务；§2.5 不变项 → 计划明确不改 LogPanel/LogTabView；§3 测试 → 任务 3 步骤 1；§4 错误处理（未知 id 忽略）→ 任务 3 用例 2。全覆盖。
2. 占位符扫描：任务 3 步骤 1 中先给的「占位骨架」已用完整用例代码替代（执行者只写下方完整代码块）。
3. 类型一致性：echoTabs?: string[] 在 preload/ipc/App.vue/main.ts 四处同名同型；appendSys(line, echoTabs?) 与 appendLine(e) 签名在任务 3 内自洽。