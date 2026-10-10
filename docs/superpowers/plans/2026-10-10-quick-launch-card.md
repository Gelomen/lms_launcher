# 快捷启动卡片（Quick Launch · 交互终端版）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在应用右侧新增「快捷启动」卡片：配置多条启动项，命令行类型得到一个绑定了 ConPTY 的**交互终端页签**（可选 pwsh / Windows PowerShell / cmd / WSL），可执行程序类型直接启动 .exe 且不产生页签。

**架构：** 主进程用 `node-pty` 为每条命令行配置开一个伪终端（一配置一实例），输出/输入/尺寸经三个 IPC 通道与渲染端往返；渲染端在日志区新增一种「终端页签」（xterm.js），与既有两种纯文本页签共存，页签条共用。原生二进制从 asar 解出（`asarUnpack`），打包产物验收是硬门。

**技术栈：** Electron 28 + Vue 3 + TypeScript + vitest + `@lydell/node-pty` + `@xterm/xterm 5.5.0`；不引入需要编译器的依赖。

**规格：** `docs/superpowers/specs/2026-10-10-quick-launch-card-design.md`（v2；所有取值以规格为准，执行者两份都要读）

## 全局约束

- **依赖版本钉死**：`@lydell/node-pty@^1.2.0-beta.15`（`dependencies`，运行时必需）、`@xterm/xterm@5.5.0` / `@xterm/addon-fit@0.10.0` / `@xterm/addon-search@0.15.0` / `@xterm/addon-web-links@0.11.0`（`devDependencies`，vite 打进 renderer bundle，不进 asar）。
- **不引入需要 C++ 编译器的依赖**（本机无 Visual Studio）。
- **不传 `encoding` 选项**给 pty（Windows 不支持）；统一 UTF-8 字符串（底层 `net.Socket.setEncoding('utf8')` 已保证多字节跨 chunk 完整）。
- **`src-main/process.ts` 与 `src-main/process.test.ts` 一行都不改**（llama-server 链路零改动；exe 类型直接复用 `ProcessState`）。
- 所有非 PTY 子进程 spawn 带 `windowsHide: true`。
- 渲染端所有用户可见文案走 `t()`，主进程错误消息走 `t()`；`no-hardcoded.test.ts` 与 `key-coverage.test.ts` 是硬门，中英两份同时补齐。
- 错误前缀沿用：`MISSING:` / `VALIDATION:` / `YAML:` / `STATE:` / `PROC:`。
- 单测命令 `npx vitest run <路径>`，全量 `npm test`；主进程类型检查 `npx tsc -p tsconfig.main.json --noEmit`。
- **xterm 在单测里必须 `vi.mock`**（happy-dom 无真实布局，xterm 渲染不可靠）。
- 提交信息用 Conventional Commits + 中文（与仓库历史一致）。
- 本期不做的事见规格 §2，**不得顺手扩范围**。

## 审查重点（Review Focus）

规格隐含、单测容易漏掉、且最可能伤到使用者的五条；每条都在对应任务里配了钉住它的测试：

1. **shell 还没就绪就把命令写进去** → 自动执行的命令可能丢失或被 PSReadLine 吃掉。钉住：任务 5 的「等首批输出」与「5s 超时兜底」测试。
2. **隐藏页签（v-show）里做 fit** → `cols/rows` 变成 0 或异常值，PTY 尺寸被写坏、终端显示错乱。钉住：任务 9 的「不可见时不 fit、激活时再 fit」测试。
3. **运行中的终端页签被关掉** → PTY 变孤儿进程（用户看不见、只能去任务管理器杀）。钉住：任务 10 的 `closeDisabled` 测试 + 任务 13 的联动。
4. **打包后 `.node` / `conpty.dll` 加载失败** → `dev 正常、发布版一开终端就崩`。钉住：任务 14 硬门第 1 条（打包产物里真开一个终端）。
5. **复制粘贴与 Ctrl+C 冲突** → 本该中断命令的 Ctrl+C 被当成复制，或粘贴触发终端控制字符。钉住：任务 9 的键盘处理测试。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/util/copy-name.ts`（新建） | `nextCopyName`，模板卡与快捷启动卡共用 |
| `src-main/quick-launch-config.ts`（新建） | `quick_launch.yaml` 加载/校验/保存/删除 |
| `src-main/quick-launch-terminals.ts`（新建） | 终端探测 + `wsl -l -q` UTF-16LE 解析 |
| `src-main/quick-launch.ts`（新建） | `PtyProcess` + `QuickLaunchManager` |
| `src-main/main.ts`（修改） | 12 个 IPC 通道 + 2 个事件 + `exit_app` 收尾 |
| `src-main/preload.ts` / `src/ipc.ts`（修改） | 白名单与类型封装 |
| `src/modules/TerminalTabView.vue`（新建） | xterm 终端页签 |
| `src/modules/log-tabs.ts` / `LogPanel.vue`（修改） | 两种页签共存 + `[x]` + 横向滚动 |
| `src/modules/QuickLaunch.vue` / `QuickLaunchModal.vue`（新建） | 卡片与弹窗 |
| `src/App.vue` / `src/style.css`（修改） | 四列布局、`qlTabs`/`qlStates`、数据路由 |
| `src/i18n.ts` / `src-main/i18n/dict.ts`（修改） | `ql.*` / `err.ql.*` |
| `electron-builder.yml`（修改） | `asarUnpack` |

---

### 任务 1：公共命名工具 `nextCopyName`

**文件：** 创建 `src/util/copy-name.ts`；测试 `src/util/copy-name.test.ts`；修改 `src/modules/TemplateModule.vue`（第 73-80 行改为引用）

**接口：** `export function nextCopyName(base: string, taken: Set<string>): string`

- [ ] **步骤 1：编写失败的测试**

```ts
import { describe, expect, it } from 'vitest';
import { nextCopyName } from './copy-name';

describe('nextCopyName', () => {
  it('首次复制加 - copy 后缀', () => {
    expect(nextCopyName('Qwen', new Set(['Qwen']))).toBe('Qwen - copy');
  });
  it('已占用时递增编号', () => {
    expect(nextCopyName('Qwen', new Set(['Qwen', 'Qwen - copy']))).toBe('Qwen - copy 2');
  });
  it('源名本身是复制品时剥后缀重算', () => {
    expect(nextCopyName('Qwen - copy', new Set(['Qwen - copy']))).toBe('Qwen - copy 2');
    expect(nextCopyName('Qwen - copy 2', new Set(['Qwen - copy 2']))).toBe('Qwen - copy');
  });
});
```

- [ ] **步骤 2：运行测试验证失败** —— `npx vitest run src/util/copy-name.test.ts` → FAIL（无法解析 `./copy-name`）
- [ ] **步骤 3：实现** 把 `TemplateModule.vue` 的 `COPY_SUFFIX = / - copy( \d+)?$/` 与循环逻辑原样搬入（**行为不许变**）
- [ ] **步骤 4：运行测试验证通过** —— `npx vitest run src/util/copy-name.test.ts src/modules/TemplateModule.test.ts` → 全 PASS
- [ ] **步骤 5：Commit** —— `git add src/util/copy-name.ts src/util/copy-name.test.ts src/modules/TemplateModule.vue && git commit -m "refactor(util): 抽出 nextCopyName 供模板卡与快捷启动卡共用"`

---

### 任务 2：`suggestConfigId` 支持前缀

**文件：** 修改 `src-main/config.ts:117-124`；测试追加到 `src-main/config.test.ts`

**接口：** `suggestConfigId(existing: string[], prefix = 'tpl'): string`

- [ ] **步骤 1：编写失败的测试**

```ts
it('suggestConfigId 支持自定义前缀且仍满足 id 契约', () => {
  const id = suggestConfigId([], 'ql');
  expect(id.startsWith('ql')).toBe(true);
  expect(validateConfigId(id)).toBe(true);
});
it('suggestConfigId 默认前缀仍是 tpl', () => {
  expect(suggestConfigId([]).startsWith('tpl')).toBe(true);
});
```

- [ ] **步骤 2：运行测试验证失败** —— `npx vitest run src-main/config.test.ts` → 第一个用例 FAIL
- [ ] **步骤 3：实现** —— 候选串改 `prefix + Date.now().toString(36) + rand()`，签名加默认参数
- [ ] **步骤 4：运行测试验证通过** —— `npx vitest run src-main/config.test.ts` → PASS
- [ ] **步骤 5：Commit** —— `git add src-main/config.ts src-main/config.test.ts && git commit -m "feat(config): suggestConfigId 支持自定义 id 前缀"`

---

### 任务 3：配置层 `quick-launch-config.ts`

**文件：** 创建 `src-main/quick-launch-config.ts`；测试 `src-main/quick-launch-config.test.ts`（临时目录写法先读 `src-main/test-utils.ts` 对齐既有约定）

**接口（后续任务据此使用）：**

```ts
export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
export type QuickLaunchKind = 'shell' | 'exe';
export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }
export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }

export function qlLoad(path: string): QuickLaunchList;   // 缺失/空 → 空表；YAML 坏 → YAML:；坏条目进 invalid
export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry, available: TerminalId[]): string;
export function qlDelete(path: string, id: string): void;
export function validateQuickLaunchName(name: string): boolean;   // trim 后 1..64
```

- [ ] **步骤 1：编写失败的测试**（覆盖规格 §5.2 / §5.3）

```ts
expect(qlLoad(缺失路径)).toEqual({ items: {}, invalid: [] });
expect(() => qlLoad(坏yaml路径)).toThrow(/^YAML:/);
// 坏条目跳过：yaml 两条、一条缺 type → items 1 条 + invalid 含该 id
expect(() => qlSave(p, null, { name: '  ', type: 'shell', shell: 'pwsh', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'wsl', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'pwsh', cmd: '   ' }, ['pwsh'])).toThrow(/^VALIDATION:/);
// 重名（trim 后精确比较）重复保存同名 → 第二次抛 VALIDATION:
// 只写该类型字段：写入 shell 条目后读回，条目上没有 exe 键
// id：id === null 生成 ql 前缀并通过 validateConfigId；显式 id 沿用
expect(() => qlDelete(p, '不存在的id')).toThrow(/^VALIDATION:/);
```

- [ ] **步骤 2：运行测试验证失败** —— `npx vitest run src-main/quick-launch-config.test.ts` → FAIL
- [ ] **步骤 3：实现** —— 复用 `config.ts` 的 `parseYaml` 思路（缺失/空**不抛 MISSING**）；保存前跑 §5.3 六条校验；写入前把条目规整为「只含该类型字段」；新 id 用 `suggestConfigId(existing, 'ql')`；成功后整表写回
- [ ] **步骤 4：运行测试验证通过** —— `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` → 全 PASS
- [ ] **步骤 5：Commit** —— `git add src-main/quick-launch-config.ts src-main/quick-launch-config.test.ts && git commit -m "feat(config): 快捷启动配置层（quick_launch.yaml）"`

---

### 任务 4：终端探测 `quick-launch-terminals.ts`

**文件：** 创建 `src-main/quick-launch-terminals.ts`；测试 `src-main/quick-launch-terminals.test.ts`

**接口：** `TerminalInfo = { id: TerminalId; path: string }`；`parseWslDistroOutput(buf: Buffer): string[]`；`detectTerminals(): TerminalInfo[]`

- [ ] **步骤 1：编写失败的测试**

```ts
it('解析 wsl -l -q 的 UTF-16LE 输出', () => {
  expect(parseWslDistroOutput(Buffer.from('Ubuntu\nDebian\n', 'utf16le'))).toEqual(['Ubuntu', 'Debian']);
});
it('空输出（未安装发行版）解析为空数组', () => {
  expect(parseWslDistroOutput(Buffer.alloc(0))).toEqual([]);
  expect(parseWslDistroOutput(Buffer.from('\r\n\r\n', 'utf16le'))).toEqual([]);
});
it('本机探测结果里 cmd 可用且 path 存在', () => {
  const cmd = detectTerminals().find((t) => t.id === 'cmd');
  expect(cmd).toBeDefined();
  expect(existsSync(cmd!.path)).toBe(true);
});
```

- [ ] **步骤 2：运行测试验证失败** —— FAIL（模块不存在）
- [ ] **步骤 3：实现** 按规格 §6.1 四行探测表；`spawnSync` + `windowsHide: true` + 单项 3s 超时；任何异常 → 该项不可用；**不缓存**
- [ ] **步骤 4：运行测试验证通过** —— 全 PASS；本机列表应为 `powershell / cmd / pwsh`（**不含 wsl**）
- [ ] **步骤 5：Commit** —— `git add src-main/quick-launch-terminals.ts src-main/quick-launch-terminals.test.ts && git commit -m "feat(main): 终端探测（只返回可用项，wsl 需有发行版）"`

---

### 任务 5：依赖安装 + `PtyProcess` + `QuickLaunchManager`

**文件：** 修改 `package.json`；创建 `src-main/quick-launch.ts`；测试 `src-main/quick-launch.test.ts`

**接口：**

```ts
export class PtyProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (d: string) => void): void;
  onExit(cb: (code: number) => void): void;
  isRunning(): boolean;
  async stopGraceful(timeoutSecs: number): Promise<void>;   // pty.kill() → 超时 → taskkill /T /F
}
export function spawnShell(shell: TerminalId, cols: number, rows: number, cwd: string): PtyProcess;
export function shellExe(shell: TerminalId): { exe: string; args: string[] };   // pwsh/powershell 带 -NoLogo

export interface QlDeps {
  onData(tabId: string, data: string): void;
  onExit(configId: string, code: number): void;
  onSysLine(configId: string, line: string): void;   // exe 类型的无页签反馈
  homedir(): string;
  spawnExe(exe: string): { onExit(cb: (code: number) => void): void; stopGraceful(s: number): Promise<void>; isRunning(): boolean };
}
export class QuickLaunchManager {
  constructor(deps: QlDeps, terminalAvailable: (id: TerminalId) => boolean);
  async start(configId: string, entry: QuickLaunchEntry): Promise<{ tabId: string | null }>;
  write(configId: string, data: string): void;
  resize(configId: string, cols: number, rows: number): void;
  async stop(configId: string): Promise<void>;
  async stopAll(timeoutSecs: number): Promise<void>;
  states(): Record<string, { running: boolean; stopping: boolean }>;
}
```

- [ ] **步骤 1：安装依赖**

`npm i @lydell/node-pty@^1.2.0-beta.15` 与 `npm i -D @xterm/xterm@5.5.0 @xterm/addon-fit@0.10.0 @xterm/addon-search@0.15.0 @xterm/addon-web-links@0.11.0`
预期：**不触发任何编译**（本机无 Visual Studio）；`node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/conpty.node` 存在。

- [ ] **步骤 2：编写失败的测试**

```ts
// shellExe 映射（规格 §7.3：没有 -Command 包装）
expect(shellExe('cmd')).toEqual({ exe: 'cmd.exe', args: [] });
expect(shellExe('pwsh')).toEqual({ exe: 'pwsh.exe', args: ['-NoLogo'] });

// 真机 PTY 集成（vitest 跑在 Node 里，node-pty 可用，已实测）
it('启动 cmd 后能收到输出，写入命令有回显', async () => {
  const m = new QuickLaunchManager(deps, () => true);
  await m.start('c1', { name: 'n', type: 'shell', shell: 'cmd', cmd: 'echo HI' });
  // onData 至少被调用一次，且拼接后包含 'HI'
});
it('自动执行命令要等首批输出（审查重点 1）', async () => {
  // deps.onData 第一次被调用之后，才发生 pty.write；用假 PtyProcess 断言顺序
});
it('5s 内无输出则超时兜底写入', async () => { /* 用假 PtyProcess + 假计时器 */ });
it('重复启动同一配置抛 STATE:', async () => {});
it('终端不可用时抛 VALIDATION: 且 states() 不残留', async () => {});
it('stop() 后发出 ql-exit 且 states() 变为空', async () => {});
it('stopAll 停掉全部并清空 states', async () => {});
```

- [ ] **步骤 3：运行测试验证失败** —— `npx vitest run src-main/quick-launch.test.ts` → FAIL
- [ ] **步骤 4：实现** —— `PtyProcess` 包装 `@lydell/node-pty` 的 `spawn/kill/resize/write/onData/onExit`（**不传 encoding**）；`spawnShell` 按 §7.3；`QuickLaunchManager` 用 `Map<string, { pty: PtyProcess; tabId: string | null }>`，exe 类型走 `deps.spawnExe`（生产代码传 `ProcessState` 适配器）
- [ ] **步骤 5：运行测试验证通过** —— `npx vitest run src-main/quick-launch.test.ts src-main/process.test.ts` → 全 PASS（后者证明未受影响）
- [ ] **步骤 6：Commit** —— `git add package.json package-lock.json src-main/quick-launch.ts src-main/quick-launch.test.ts && git commit -m "feat(main): ConPTY 终端进程管理（QuickLaunchManager + PtyProcess）"`

---

### 任务 6：IPC 接线（12 通道 + 2 事件）

**文件：** 修改 `src-main/main.ts`、`src-main/preload.ts`、`src/ipc.ts`；测试追加到 `src/App.test.ts`

**通道与事件：** 严格按规格 §8 表格（`ql_list` / `ql_save` / `ql_delete` / `ql_terminals` / `ql_start` / `ql_stop` / `ql_write` / `ql_resize` / `ql_states` / `ql_pick_exe` / `clipboard_read` / `clipboard_write`；事件 `ql-data` / `ql-exit`）。

- [ ] **步骤 1：编写失败的测试**

```ts
it('ipc 模块导出终端相关封装', async () => {
  const mod = await import('./ipc');
  expect(typeof mod.onQlData).toBe('function');
  expect(typeof mod.onQlExit).toBe('function');
});
```

- [ ] **步骤 2：运行测试验证失败** —— `npx vitest run src/App.test.ts` → FAIL
- [ ] **步骤 3：实现** —— `preload.ts` 照抄 `onLogLine` 的 listener + removeListener 模式加两个事件订阅；`ipc.ts` 加封装与类型；`main.ts` 用 `ql` 单例把 `onData` 适配成 `ql-data`、`onExit` 适配成 `ql-exit`、`onSysLine` 走既有 `emitLog(line, 'sys')`；`clipboard_read/write` 用 Electron `clipboard`；`ql_pick_exe` 用 `.exe` 过滤对话框
- [ ] **步骤 4：验证通过** —— 1) `npx vitest run src/App.test.ts` PASS；2) `npx tsc -p tsconfig.main.json --noEmit` 无错；3) 真机 `npm run dev`，DevTools 依次调 `ql_list` / `ql_terminals` / `ql_save` / `ql_start`，确认返回形状与规格 §8 一致
- [ ] **步骤 5：Commit** —— `git add src-main/main.ts src-main/preload.ts src/ipc.ts src/App.test.ts && git commit -m "feat(ipc): 快捷启动与终端通道接线"`

---

### 任务 7：`exit_app` 停止全部终端

**文件：** 修改 `src-main/main.ts:371-375`

- [ ] **步骤 1：编写失败的测试** —— 复用任务 5 的 `stopAll` 测试（已覆盖语义）；本任务补一条断言：`stopAll` 对**未运行**的配置不抛错（幂等）
- [ ] **步骤 2：运行测试验证失败** —— `npx vitest run src-main/quick-launch.test.ts` → 新用例 FAIL
- [ ] **步骤 3：实现** —— `stopAll` 内逐个 await 且对空表直接返回；`exit_app` 在 `await ps.stopGraceful(3)` **之后**插入 `await ql.stopAll(3)`
- [ ] **步骤 4：运行测试验证通过** —— PASS
- [ ] **步骤 5：Commit** —— `git add src-main/main.ts src-main/quick-launch.ts src-main/quick-launch.test.ts && git commit -m "feat(main): exit_app 一并终止所有快捷启动终端"`

---

### 任务 8：i18n 词条（中英）

**文件：** 修改 `src/i18n.ts`、`src-main/i18n/dict.ts`

**渲染端键：** `ql.title` / `ql.btn.new` / `ql.btn.copy` / `ql.btn.edit` / `ql.btn.start` / `ql.btn.stop` / `ql.btn.closeTab` / `ql.tab.closeBlocked` / `ql.empty.none` / `ql.invalid` / `ql.term.pwsh|powershell|cmd|wsl` / `ql.terminal.clear` / `ql.terminal.searchPlaceholder` / `ql.terminal.searchPrev|Next|Clear` / `ql.terminal.count` / `ql.modal.newTitle|editTitle|name|type|type.shell|type.exe|terminal|terminal.loading|cmd|exe|btn.pick|btn.save|btn.delete|delete.title|delete.message` / `ql.err.nameRequired|nameTaken|running` / `ql.dialog.filterExe` / `ql.log.exit|fail`

**主进程键：** `err.ql.nameRequired|nameDup|typeInvalid|terminalMissing|cmdRequired|exeRequired|notFound|alreadyRunning|terminalGone|ptySpawn`

- [ ] **步骤 1：编写失败的测试** —— 依赖既有 `key-coverage.test.ts` / `no-hardcoded.test.ts`；另在 `src/i18n.test.ts` 追加一条 `t('ql.title')` 不等于键名本身
- [ ] **步骤 2：运行测试验证失败** —— `npx vitest run src-main/i18n src/i18n.test.ts` → FAIL（缺键）
- [ ] **步骤 3：实现** —— 中英双语补齐；终端英文标签用 "Windows PowerShell" / "PowerShell 7 (pwsh)" / "Command Prompt (cmd)" / "WSL"
- [ ] **步骤 4：运行测试验证通过** —— 全 PASS
- [ ] **步骤 5：Commit** —— `git add src/i18n.ts src/i18n.test.ts src-main/i18n/dict.ts && git commit -m "feat(i18n): 快捷启动与交互终端中英词条"`

---

### 任务 9：`TerminalTabView.vue`（xterm 终端页签）

**文件：** 创建 `src/modules/TerminalTabView.vue`；测试 `src/modules/TerminalTabView.test.ts`（**必须 `vi.mock('@xterm/xterm')` 等三个 addon**）

**接口：**

```ts
props: {
  id: string;
  label: string;               // 已截断的展示名
  fullLabel: string;           // tooltip 用
  closable: boolean;
  closeDisabled: boolean;
  register: (id: string, sink: (d: string) => void) => void;
  unregister: (id: string) => void;
  onInput: (id: string, data: string) => void;
  onResize: (id: string, cols: number, rows: number) => void;
}
emits: { close: [id: string] }
```

- [ ] **步骤 1：编写失败的测试**

```ts
it('挂载时注册数据 sink，卸载时注销', async () => {});
it('sink 收到数据会写到终端实例', async () => {});
it('term.onData 触发 onInput（审查重点 5：Ctrl+C 必须原样送达）', async () => {
  // 模拟 xterm 触发 '\x03' → onInput 收到 '\x03'
});
it('隐藏时不 fit，重新可见时 fit 并上报尺寸（审查重点 2）', async () => {
  // element.offsetWidth = 0 → 不调用 fit/onResize；恢复宽度后调用
});
it('Ctrl+Shift+C 走复制、不被送往终端；Ctrl+C 不被拦截', async () => {
  // 用 attachCustomKeyEventHandler 捕获到的处理器直接断言返回值
});
it('运行中 closeDisabled=true 时 [x] 禁用（审查重点 3）', async () => {});
```

- [ ] **步骤 2：运行测试验证失败** —— `npx vitest run src/modules/TerminalTabView.test.ts` → FAIL
- [ ] **步骤 3：实现** —— `Terminal({ scrollback: 5000, fontSize: 13, fontFamily: 'var(--font-mono)' })` + `FitAddon` + `SearchAddon` + `WebLinksAddon((e, uri) => invoke('open_external', uri))`；`ResizeObserver`；工具条（清空 + 查找输入框 + 上/下 + 计数）；键盘处理按规格 §9.3；外壳复用 `.log-pane` / `.log-view` 的尺寸链
- [ ] **步骤 4：运行测试验证通过** —— 全 PASS
- [ ] **步骤 5：Commit** —— `git add src/modules/TerminalTabView.vue src/modules/TerminalTabView.test.ts && git commit -m "feat(module): xterm 交互终端页签（输入/尺寸/查找/复制粘贴）"`

---

### 任务 10：页签条支持两种页签 + `[x]` + 横向滚动

**文件：** 修改 `src/modules/log-tabs.ts`、`src/modules/LogPanel.vue`、`src/style.css`；测试追加到 `src/modules/LogPanel.test.ts`

**接口：**

```ts
export const QL_TAB_PREFIX = 'ql:';
export function qlTabId(configId: string): string;
export type LogTabKind = 'text' | 'terminal';
export interface LogTabItem { id: string; label: string; fullLabel: string; kind: LogTabKind; closable: boolean; closeDisabled: boolean; configId?: string }
// LogPanel props：tabs: LogTabItem[], buckets: Record<string, LogEntry[]>
// LogPanel emits：clear: [id], close: [id], 以及透传 terminal 的 register/unregister/onInput/onResize
```

- [ ] **步骤 1：编写失败的测试**

```ts
it('text 页签渲染 LogTabView 且清空行为不变（既有用例继续通过）', async () => {});
it('terminal 页签渲染 TerminalTabView（mock 掉 xterm）', async () => {});
it('仅 closable 页签渲染 [x]；closeDisabled 时禁用', async () => {});
it('点击 [x] 冒泡 close(id)', async () => {});
it('页签多于 6 条时页签条不换行（断言 .tab-bar 的 nowrap 类/样式）', async () => {});
```

- [ ] **步骤 2：运行测试验证失败** —— `npx vitest run src/modules/LogPanel.test.ts` → FAIL
- [ ] **步骤 3：实现** —— `log-tabs.ts` 保留静态 `LOG_TABS` 并新增前缀工具；`LogPanel` 按 `tabs` 渲染两种内容、激活态切换、`[x]` 用 `faXmark`（本组件内 `library.add`）；`.tab-bar` 加 `overflow-x: auto; flex-wrap: nowrap`，切换时对激活页签 `scrollIntoView({ inline: 'nearest' })`
- [ ] **步骤 4：运行测试验证通过** —— `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` → 全 PASS
- [ ] **步骤 5：Commit** —— `git add src/modules/log-tabs.ts src/modules/LogPanel.vue src/style.css src/modules/LogPanel.test.ts && git commit -m "feat(log): 页签条支持文本/终端两种页签 + 关闭按钮 + 横向滚动"`

---

### 任务 11：快捷启动卡片 `QuickLaunch.vue`

**文件：** 创建 `src/modules/QuickLaunch.vue`；测试 `src/modules/QuickLaunch.test.ts`

**接口：** props `{ states: Record<string, { running: boolean; stopping: boolean }> }`；emits `{ start: [configId: string]; stop: [configId: string]; changed: [] }`；内部 invoke `ql_list` / `ql_save`。**运行态由 App 持有并下发，卡片不订阅事件**（与 `LaunchBar` 同构）。

- [ ] **步骤 1：编写失败的测试**

```ts
it('空列表显示空态文案', async () => {});
it('行显示截断后的名字，长名带 data-tooltip 全名（预算 30）', async () => {});
it('名字含 emoji 且超长时截断不切断代理对', async () => {});
it('未运行 = 紫底「启动」；运行中 = 红底「停止」；stopping = 「...」且禁用', async () => {});
it('复制插入到源行正后方且名字为 “X - copy”', async () => {});
it('invalid 非空时显示「N 条配置无效」提示', async () => {});
```

- [ ] **步骤 2：运行测试验证失败** —— FAIL
- [ ] **步骤 3：实现** —— 复用 `.tpl-row` / `.tpl-row__id` / `.tpl-row__actions` / `.icon-btn--sm`；启动按钮 `.btn-launch`（紫）/ 运行中 `.btn-danger`（红），图标 `faRocket` / `faStop`；长名 tooltip 用模板卡同款 `position: fixed` 浮层
- [ ] **步骤 4：运行测试验证通过** —— 全 PASS
- [ ] **步骤 5：Commit** —— `git add src/modules/QuickLaunch.vue src/modules/QuickLaunch.test.ts && git commit -m "feat(module): 快捷启动卡片（列表/复制/编辑/启动停止）"`

---

### 任务 12：弹窗 `QuickLaunchModal.vue`

**文件：** 创建 `src/modules/QuickLaunchModal.vue`；测试 `src/modules/QuickLaunchModal.test.ts`

**接口：** props `{ open: boolean; id: string; entry: QuickLaunchEntry | null }`；emits `{ saved: []; deleted: [id: string]; close: [] }`

- [ ] **步骤 1：编写失败的测试**

```ts
it('默认类型为「命令行」，显示终端下拉与命令输入框', async () => {});
it('切到「可执行程序」后隐藏终端与命令，显示 exe 路径与选择按钮', async () => {});
it('终端下拉来自 ql_terminals（mock invoke），加载中禁用', async () => {});
it('名字为空时保存被拦下并显示错误文案', async () => {});
it('主进程返回 VALIDATION 重名时错误区显示「名字已存在」且不关窗', async () => {});
it('编辑态才显示删除按钮，删除需二次确认', async () => {});
```

- [ ] **步骤 2：运行测试验证失败** —— FAIL
- [ ] **步骤 3：实现** —— 复用 `TemplateModal.vue` 的遮罩/头部/footer 类名与 `Dropdown` 组件；`open` 变 true 时拉 `ql_terminals` 并回填表单
- [ ] **步骤 4：运行测试验证通过** —— 全 PASS
- [ ] **步骤 5：Commit** —— `git add src/modules/QuickLaunchModal.vue src/modules/QuickLaunchModal.test.ts && git commit -m "feat(module): 新建/编辑启动弹窗（类型二选一 + 终端探测 + 删除确认）"`

---

### 任务 13：App 接线（四列布局、状态、数据路由、重载复原）

**文件：** 修改 `src/App.vue`、`src/style.css`（`.grid` 四列）；测试追加到 `src/App.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
it('ql-data 按 tabId 派发到已注册的终端 sink，未知 tabId 被忽略', async () => {});
it('ql-exit 后该配置运行态清空，卡片行按钮回落为「启动」', async () => {});
it('onMounted 读到 ql_states 里 running 的配置时为其重建终端页签', async () => {});
it('停止后该终端页签的 [x] 由禁用变为可用', async () => {});
```

- [ ] **步骤 2：运行测试验证失败** —— FAIL
- [ ] **步骤 3：实现** —— `.grid` 改 `280px 350px 330px 330px`，卡片顺序 `stack → QuickLaunch → GPU`；新增 `qlTabs` / `qlStates` / `terminalSinks: Map<string, (d: string) => void>`；`onQlData` 按 `tabId` 派发；启动成功且 `tabId !== null` → 建页签（不存在时）+ 激活 + fit + 聚焦；页签 `close` → 删页签 + 注销 sink
- [ ] **步骤 4：运行测试验证通过** —— `npx vitest run src/App.test.ts src/modules/QuickLaunch.test.ts src/modules/LogPanel.test.ts src/modules/TerminalTabView.test.ts` → 全 PASS；再跑 `npm test` 全量绿
- [ ] **步骤 5：Commit** —— `git add src/App.vue src/style.css src/App.test.ts && git commit -m "feat(app): 快捷启动接入第 3 列、终端页签数据路由与重载复原"`

---

### 任务 14：打包硬门 + 真机验收 + 文档记录

**文件：** 修改 `electron-builder.yml`；修改规格文档的「状态」行

- [ ] **步骤 1：加 `asarUnpack`**

```yaml
asarUnpack:
  - "**/node_modules/@lydell/**"
```

- [ ] **步骤 2：打包**

运行：`build.bat`（或 `npm run build && npx electron-builder`，以仓库既有脚本为准）
预期：`dist-release/` 出 portable exe；解包检查 `app.asar.unpacked/node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/` 下 `conpty.node` / `conpty/conpty.dll` / `conpty/OpenConsole.exe` **三个都在**。

- [ ] **步骤 3：硬门验收（逐条记录命令与输出）**

1. **打包产物里开终端**（审查重点 4）：运行 portable exe → 新建一条 cmd 配置 → 启动 → 终端页签出现提示符、能输入（**先 dev 后打包各做一次**）。
2. 三种终端各跑一条中文输出命令 → 中文正确、颜色正常。
3. **交互**：cmd 配置命令写 `set /p X=NAME?` → 页签内输入 `Alice` → 回车 → 再敲 `echo %X%` → 显示 `Alice`。
4. **TUI/清屏**：页签内跑 `cls` 清屏正常；跑一个交互式程序（如 `python`）能输入输出。
5. **进程树**：跑 `ping -n 60 127.0.0.1` → `[停止]` → `tasklist | findstr PING` 无残留；页签保留、`[x]` 可用。
6. **自动执行**：启动后命令自动执行并停在提示符。
7. exe 类型：启动记事本 → 无页签、按钮变红；关闭记事本 → 按钮回落。
8. 页签溢出（8 条）横向滚动；超长名在列表与页签都截断 + tooltip。
9. 退出应用 → 所有终端进程消失。
10. **WSL 无法验收**（本机无发行版）：如实写入文档，不得声称已验收。

- [ ] **步骤 4：文档收尾** —— 在规格「状态」行写明验收结果、打包验收结论、WSL 待安装发行版后补
- [ ] **步骤 5：Commit** —— `git add electron-builder.yml docs/superpowers/specs/2026-10-10-quick-launch-card-design.md && git commit -m "build: asarUnpack 解出 node-pty 原生二进制 + 打包真机验收记录"`
