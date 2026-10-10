# 快捷启动卡片（Quick Launch）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在应用右侧新增「快捷启动」卡片，让用户能配置并一键启动任意命令行（pwsh / Windows PowerShell / cmd / WSL）或可执行程序，命令行类型的实时输出进入日志区专属页签。

**架构：** 主进程新增一层「多实例进程管理」（`ManagedProcess` 泛化 + `QuickLaunchManager` 持有 configId → 进程映射），配置独立存于 `configs/quick_launch.yaml`；渲染端把日志桶与页签从静态注册表改为动态可增删，并新增卡片与弹窗两个组件。所有 spawn 一律 `windowsHide: true`，输出按终端类型流式解码（pwsh/powershell 注入 UTF-8，cmd 按系统 OEM 代码页）。

**技术栈：** Electron 28 + Vue 3 + TypeScript + vitest + YAML；不新增任何依赖。

**规格：** `docs/superpowers/specs/2026-10-10-quick-launch-card-design.md`（计划的所有取值以规格为准，执行者两份都要读）

## 全局约束

- **不新增运行时/开发依赖**（`node:util` 的 `TextDecoder` 已足够做 gbk 解码）。
- 所有子进程 spawn 必须带 `windowsHide: true`（避免控制台窗口闪现，且这是规格 §7.3 字节行为成立的前提）。
- `src-main/process.test.ts` **一行都不许改**，且重构后必须继续通过。
- `ProcessState` 的公开 API 与行为不变（llama-server 路径零行为变化）。
- 渲染端所有用户可见文案必须走 `t()`；主进程所有错误消息必须走 `t()`。`src-main/i18n/no-hardcoded.test.ts` 与 `key-coverage.test.ts` 是硬门。
- 中英文两份词条必须同时补齐（`src/i18n.ts` 与 `src-main/i18n/dict.ts`）。
- 错误分类沿用既有前缀约定：`MISSING:` / `VALIDATION:` / `YAML:` / `STATE:` / `PROC:`。
- 提交信息用 Conventional Commits + 中文描述（与仓库既有历史一致）。
- 单测命令：`npx vitest run <路径>`；全量：`npm test`。
- 类型检查：`npx tsc -p tsconfig.main.json --noEmit`（主进程）/ `npx vue-tsc --noEmit`（如仓库有该脚本则用 `npm run build` 兜底）。
- 本期不实现的项见规格 §2，**不得顺手扩范围**。

## 审查重点（Review Focus）

规格隐含、但没有被上面任何测试覆盖的输入类别与失败模式，最可能伤到使用者的五条；每条都已在下面对应任务中加入钉住它的测试：

1. **用户命令里含双引号 / 换行 / 中文 / `&` 等外壳元字符** → 命令必须作为**单个 argv 元素**原样送达终端宿主（不得被拼接进额外的引号里、不得被二次解释）。钉住：任务 6 的 `buildShellArgv` 测试。
2. **配置名含 emoji 等代理对字符，且超长** → 截断不得切断代理对（不得产出半个字符的乱码）。钉住：任务 11 的截断测试。
3. **yaml 被手工改坏**（某条缺 `type`、`shell` 不在白名单、`cmd` 为空）→ 加载不崩、坏条目被跳过、其余条目照常可用。钉住：任务 3 的 `invalid` 测试。
4. **进程根本起不来**（exe 路径写了但文件不存在；终端在保存后被卸载）→ 有明确错误且行按钮回落 `[启动]`，绝不卡在「停止中」。钉住：任务 6 的失败路径测试。
5. **窗口很窄 + 页签名很长 + 页签很多** → 页签条横向滚动而不是换行撑破卡片/日志区。钉住：任务 10 的 LogPanel 溢出测试。

---

## 文件结构（先锁分解）

| 文件 | 职责 |
|---|---|
| `src/util/copy-name.ts`（新建） | 纯函数 `nextCopyName`，模板卡与快捷启动卡共用 |
| `src-main/quick-launch-config.ts`（新建） | `quick_launch.yaml` 的加载 / 校验 / 保存 / 删除 / id 生成 |
| `src-main/decode-lines.ts`（新建） | `LineDecoder`：字节流 → 行（流式多字节安全） |
| `src-main/quick-launch-terminals.ts`（新建） | 终端探测 + `wsl -l -q` 的 UTF-16LE 输出解析 |
| `src-main/process.ts`（修改） | 抽出 `ManagedProcess`，`ProcessState` 变子类 |
| `src-main/quick-launch.ts`（新建） | `QuickLaunchManager`：多实例进程管理 + argv 拼装 + 解码路由 |
| `src-main/main.ts`（修改） | 8 个 `ql_*` IPC handler + 事件推送 + `exit_app` 停止全部 |
| `src-main/preload.ts`（修改） | 白名单扩容（`onQlLog` / `onQlExit`） |
| `src/ipc.ts`（修改） | 类型与封装导出 |
| `src/modules/log-tabs.ts`（修改） | 动态页签 id 约定 |
| `src/modules/LogPanel.vue`（修改） | 动态页签 + `[x]` 关闭 + 横向滚动 |
| `src/App.vue`（修改） | 动态日志桶、`ql` 事件、布局第 3 列、弹窗接线 |
| `src/modules/QuickLaunch.vue`（新建） | 快捷启动卡片 |
| `src/modules/QuickLaunchModal.vue`（新建） | 新建 / 编辑启动弹窗 |
| `src/i18n.ts` / `src-main/i18n/dict.ts`（修改） | `ql.*` / `err.ql.*` 中英词条 |

---

### 任务 1：公共命名工具 `nextCopyName`

**文件：**
- 创建：`src/util/copy-name.ts`
- 测试：`src/util/copy-name.test.ts`
- 修改：`src/modules/TemplateModule.vue`（把第 73-80 行的本地实现换成引用）

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

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/util/copy-name.test.ts`
预期：FAIL，报错指向 `Failed to resolve import "./copy-name"`。

- [ ] **步骤 3：实现** `src/util/copy-name.ts`

把 `src/modules/TemplateModule.vue` 现有的 `COPY_SUFFIX = / - copy( \d+)?$/` 与循环逻辑原样搬过来（**行为不许变**），并加注释说明「与 TemplateModule 旧实现同源」。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/util/copy-name.test.ts src/modules/TemplateModule.test.ts`
预期：两个文件全 PASS（第二个证明模板卡行为未变）。

- [ ] **步骤 5：Commit**

`git add src/util/copy-name.ts src/util/copy-name.test.ts src/modules/TemplateModule.vue && git commit -m "refactor(util): 抽出 nextCopyName 供模板卡与快捷启动卡共用"`

---

### 任务 2：`suggestConfigId` 支持前缀

**文件：**
- 修改：`src-main/config.ts:117-124`
- 测试：`src-main/config.test.ts`（追加用例）

**接口：** `export function suggestConfigId(existing: string[], prefix = 'tpl'): string`（默认值保证既有调用不变）

- [ ] **步骤 1：编写失败的测试**

在 `src-main/config.test.ts` 追加：
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

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/config.test.ts`
预期：第一个用例 FAIL（生成的 id 仍以 `tpl` 开头）。

- [ ] **步骤 3：实现**

把候选串由 `'tpl' + …` 改为 `prefix + Date.now().toString(36) + rand()`，函数签名加默认参数 `prefix = 'tpl'`。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/config.test.ts`
预期：PASS（含既有用例）。

- [ ] **步骤 5：Commit**

`git add src-main/config.ts src-main/config.test.ts && git commit -m "feat(config): suggestConfigId 支持自定义 id 前缀"`

---

### 任务 3：配置层 `quick-launch-config.ts`

**文件：**
- 创建：`src-main/quick-launch-config.ts`
- 测试：`src-main/quick-launch-config.test.ts`（用 `src-main/test-utils.ts` 的临时目录写法，先读该文件确认既有约定）

**接口（后续任务据此使用）：**

```ts
export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
export type QuickLaunchKind = 'shell' | 'exe';
export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }
export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }

export function qlLoad(path: string): QuickLaunchList;      // 缺失/空 → 空表；YAML 坏 → YAML:；坏条目进 invalid
export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry, availableTerminals: TerminalId[]): string; // 校验失败 → VALIDATION:；返回最终 id
export function qlDelete(path: string, id: string): void;   // 不存在 → VALIDATION:
export function validateQuickLaunchName(name: string): boolean; // trim 后 1..64
```

- [ ] **步骤 1：编写失败的测试**（覆盖规格 §5.2 / §5.3，至少这些断言）

```ts
// 加载
expect(qlLoad(缺失路径)).toEqual({ items: {}, invalid: [] });
expect(() => qlLoad(坏 yaml 路径)).toThrow(/^YAML:/);
// 坏条目跳过：yaml 里两条，一条缺 type → items 只有 1 条，invalid 含坏条目 id
// 校验
expect(() => qlSave(p, null, { name: '  ', type: 'shell', shell: 'pwsh', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: 'a.exe' }, [])).not.toThrow();
expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'wsl', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
// 重名（trim 后精确比较）
expect(() => qlSave(p, null, { name: 'A', type: 'exe', exe: 'b.exe' }, [])).toThrow(/^VALIDATION:/);
// 只写该类型字段：写入 shell 条目后 yaml 里不含 exe 键（读回 items 断言）
// id：id === null 时生成 ql 前缀且 validateConfigId 通过；id 显式给出时沿用
// 删除：不存在 → VALIDATION:
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/quick-launch-config.test.ts`
预期：FAIL，`Failed to resolve import "./quick-launch-config"`。

- [ ] **步骤 3：实现** `src-main/quick-launch-config.ts`

复用 `config.ts` 的 `parseYaml` 思路（缺失/空文件的宽松语义**不抛 MISSING**，与规格 §5.2 一致；YAML 坏抛 `YAML:`）；保存前做 §5.3 六条校验；写入前把条目规整为「只含该类型字段」的形状；`id === null` 用 `suggestConfigId(existingIds, 'ql')`；保存成功后整表写回（`yaml` 的 `stringify`）。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/quick-launch-config.test.ts` → 全 PASS；再跑 `npx vitest run src-main/config.test.ts` 确认未影响既有配置层。

- [ ] **步骤 5：Commit**

`git add src-main/quick-launch-config.ts src-main/quick-launch-config.test.ts && git commit -m "feat(config): 快捷启动配置层（quick_launch.yaml 加载/校验/保存/删除）"`

---

### 任务 4：流式解码 `LineDecoder`

**文件：**
- 创建：`src-main/decode-lines.ts`
- 测试：`src-main/decode-lines.test.ts`

**接口：** `export class LineDecoder { constructor(encoding: string); push(chunk: Buffer): string[]; flush(): string[] }`

- [ ] **步骤 1：编写失败的测试**

```ts
it('utf-8 解码并按 CRLF 切行', () => {
  const d = new LineDecoder('utf-8');
  expect(d.push(Buffer.from('中文a\r\nb\n', 'utf8'))).toEqual(['中文a', 'b']);
});
it('多字节字符被 chunk 切断时不产生替换字符', () => {
  const d = new LineDecoder('utf-8');
  const buf = Buffer.from('中文\n', 'utf8');
  expect(d.push(buf.subarray(0, 2))).toEqual([]);   // 不吐半行
  expect(d.push(buf.subarray(2))).toEqual(['中文']); // 拼回后完整
});
it('gbk 解码', () => {
  const d = new LineDecoder('gbk');
  expect(d.push(Buffer.from('中文测试', 'gbk'))).toEqual([]); // 无换行 → 不吐
  expect(d.flush()).toEqual(['中文测试']);
});
it('无换行结尾的最后一行由 flush 吐出', () => { /* push('abc') → []；flush() → ['abc'] */ });
it('纯空行被丢弃', () => { expect(new LineDecoder('utf-8').push(Buffer.from('\n\n', 'utf8'))).toEqual([]); });
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/decode-lines.test.ts` → FAIL（文件不存在）。

- [ ] **步骤 3：实现** `src-main/decode-lines.ts`

内部持 `new TextDecoder(encoding, { fatal: false })` 与一个「未完成行」缓冲；`push` 用 `{ stream: true }` 解码后按 `\r?\n` 切分，最后一段留作缓冲；`flush` 调 `decode()` 收尾并吐出剩余。空行（trim 后为空）丢弃。

- [ ] **步骤 4：运行测试验证通过** → `npx vitest run src-main/decode-lines.test.ts` 全 PASS。

- [ ] **步骤 5：Commit**

`git add src-main/decode-lines.ts src-main/decode-lines.test.ts && git commit -m "feat(main): LineDecoder 流式解码（UTF-8/GBK，多字节跨 chunk 安全）"`

---

### 任务 5：终端探测 `quick-launch-terminals.ts`

**文件：**
- 创建：`src-main/quick-launch-terminals.ts`
- 测试：`src-main/quick-launch-terminals.test.ts`

**接口：**

```ts
export interface TerminalInfo { id: TerminalId; path: string }
export function parseWslDistroOutput(buf: Buffer): string[];   // UTF-16LE → 非空发行版名列表
export function detectTerminals(): TerminalInfo[];             // 只返回可用项
```

- [ ] **步骤 1：编写失败的测试**

```ts
it('解析 wsl -l -q 的 UTF-16LE 输出', () => {
  const buf = Buffer.from('Ubuntu\nDebian\n', 'utf16le');
  expect(parseWslDistroOutput(buf)).toEqual(['Ubuntu', 'Debian']);
});
it('空输出（未安装发行版）解析为空数组', () => {
  expect(parseWslDistroOutput(Buffer.alloc(0))).toEqual([]);
  expect(parseWslDistroOutput(Buffer.from('\r\n\r\n', 'utf16le'))).toEqual([]);
});
it('本机探测结果里 cmd 一定可用且每项 path 存在', () => {
  const list = detectTerminals();
  const cmd = list.find((t) => t.id === 'cmd');
  expect(cmd).toBeDefined();
  expect(existsSync(cmd!.path)).toBe(true);
});
```

- [ ] **步骤 2：运行测试验证失败** → `npx vitest run src-main/quick-launch-terminals.test.ts` FAIL。

- [ ] **步骤 3：实现**（按规格 §6.1 的四行探测表）

`powershell` / `cmd` 走 `existsSync`；`pwsh` 走 `spawnSync('where.exe', ['pwsh'], { windowsHide: true, timeout: 3000, encoding: 'utf8' })` 取首行并 `existsSync`；`wsl` 需 `wsl.exe` 存在且 `spawnSync('wsl.exe', ['-l','-q'], { timeout: 3000, windowsHide: true })` 退出码 0 且 `parseWslDistroOutput(stdout)` 非空。任何异常 → 该项不可用（不冒泡）。

- [ ] **步骤 4：运行测试验证通过** → 全 PASS；本机预期列表 = `powershell / cmd / pwsh`（**不含 wsl**，本机未装发行版）。

- [ ] **步骤 5：Commit**

`git add src-main/quick-launch-terminals.ts src-main/quick-launch-terminals.test.ts && git commit -m "feat(main): 终端探测（pwsh/powershell/cmd/wsl，只返回可用项）"`

---

### 任务 6：`ManagedProcess` 抽取 + `QuickLaunchManager`

**文件：**
- 修改：`src-main/process.ts`（抽出基类，`ProcessState` 变子类）
- 创建：`src-main/quick-launch.ts`
- 测试：`src-main/managed-process.test.ts`、`src-main/quick-launch.test.ts`

**接口：**

```ts
// process.ts
export class ManagedProcess {
  state: ProcStateName;
  pid(): number | null;
  async launch(opts: { exe: string; args: string[]; cwd?: string; windowsHide?: boolean }): Promise<void>;
  takePipes(): { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream };
  isRunning(): boolean;
  async stopGraceful(timeoutSecs: number): Promise<void>;
  onExit(cb: (code: number, error?: string) => void): void;
  drainExit(): number | null;
}
export class ProcessState extends ManagedProcess { /* runningConfigId + 既有 launch(exe,args,configId,cwd?) */ }

// quick-launch.ts
export function buildShellArgv(shell: TerminalId, cmd: string): { exe: string; args: string[] };
export function decodeEncodingFor(shell: TerminalId | 'exe'): string;  // 'utf-8' | 'gbk'
export interface QlDeps {
  emitLog(tabId: string, line: string, stream: 'out' | 'err'): void;
  emitExit(configId: string, code: number): void;
  onProcLine(configId: string, tabId: string | null, line: string): void; // 无页签类型的 sys 行出口
}
export class QuickLaunchManager {
  constructor(deps: QlDeps, terminalAvailable: (id: TerminalId) => boolean, oemEncoding: () => string);
  async start(configId: string, entry: QuickLaunchEntry): Promise<{ tabId: string | null }>;
  async stop(configId: string): Promise<void>;
  async stopAll(timeoutSecs: number): Promise<void>;
  states(): Record<string, { running: boolean; stopping: boolean }>;
  isRunning(configId: string): boolean;
}
```

- [ ] **步骤 1：编写失败的测试**

```ts
// managed-process.test.ts
it('launch(takePipes) 能把子进程输出读出来', async () => { /* cmd.exe /d /s /c echo hi → 'hi' */ });
it('launch 后 state 为 running，stopGraceful 后回落 ready', async () => {});
it('已在运行时再次 launch 抛 STATE:', async () => {});

// quick-launch.test.ts
it('buildShellArgv 把命令作为单个 argv 元素原样传递，含引号与换行也不改写', () => {
  const argv = buildShellArgv('pwsh', 'Write-Output "a b"');
  expect(argv.exe).toBe('pwsh.exe');
  expect(argv.args).toEqual(['-NoLogo','-NoProfile','-Command','[Console]::OutputEncoding=[Text.Encoding]::UTF8; Write-Output "a b"']);
  expect(buildShellArgv('cmd', 'a & b').args).toEqual(['/d','/s','/c','a & b']);
  expect(buildShellArgv('wsl', 'ls -la').args).toEqual(['-e','bash','-lc','ls -la']);
  expect(buildShellArgv('powershell', 'x\ny').args[3]).toBe('[Console]::OutputEncoding=[Text.Encoding]::UTF8; x\ny');
});
it('decodeEncodingFor：pwsh/powershell/wsl → utf-8；cmd → 由 oemEncoding 决定', () => {});
// 审查重点 4：终端不可用 / exe 路径不存在 → start 抛错且 states() 不残留 running/stopping
it('终端不可用时 start 抛 VALIDATION: 且不残留状态', async () => {});
it('exe 不存在时 start 抛错且 states() 为空', async () => {});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/managed-process.test.ts src-main/quick-launch.test.ts`
预期：FAIL（模块与类都不存在）。

- [ ] **步骤 3：实现**

先做 `process.ts` 的抽取（把现有 launch/takePipes/stopGraceful/onExit/drainExit 逻辑整体上移为基类，`ProcessState` 只保留 `runningConfigId` 与旧签名包装），再实现 `quick-launch.ts`：状态机 Map、`buildShellArgv` 按规格 §7.2 的五行矩阵、`decodeEncodingFor` 按规格 §7.3、每进程一个 `LineDecoder`、退出时 `flush` 再发 `emitExit`。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/managed-process.test.ts src-main/quick-launch.test.ts src-main/process.test.ts`
预期：三个文件全 PASS，**且 `process.test.ts` 未被修改**（用 `git diff --stat src-main/process.test.ts` 确认无输出）。

- [ ] **步骤 5：Commit**

`git add src-main/process.ts src-main/quick-launch.ts src-main/managed-process.test.ts src-main/quick-launch.test.ts && git commit -m "feat(main): ManagedProcess 泛化 + QuickLaunchManager 多实例进程管理"`

---

### 任务 7：IPC 接线（8 个通道 + 2 个事件）

**文件：**
- 修改：`src-main/main.ts`（在既有 IPC 区块后追加；参考 `start_server` 第 308-333 行与 `open_file_dialog` 第 343-355 行的写法）
- 修改：`src-main/preload.ts`（在 `onStartupLlamaCheck` 后追加）
- 修改：`src/ipc.ts`（类型导出 + 封装）

**接口：** 通道与事件严格按规格 §8 的表格（`ql_list` / `ql_save` / `ql_delete` / `ql_terminals` / `ql_start` / `ql_stop` / `ql_states` / `ql_pick_exe` + `ql-log` / `ql-exit`）。

- [ ] **步骤 1：编写失败的测试**

本任务的验证手段是**类型 + 真机**（handler 是薄包装，主进程无既有 IPC 测试基建）。先写一条能红的检查：在 `src/ipc.ts` 增加导出后在 `src/App.test.ts` 追加一条「`onQlLog` 与 `onQlExit` 已从模块导出」的断言。

```ts
it('ipc 模块导出 ql 事件封装', async () => {
  const mod = await import('./ipc');
  expect(typeof mod.onQlLog).toBe('function');
  expect(typeof mod.onQlExit).toBe('function');
});
```

- [ ] **步骤 2：运行测试验证失败** → `npx vitest run src/App.test.ts` FAIL（导出不存在）。

- [ ] **步骤 3：实现**

`preload.ts` 加 `onQlLog` / `onQlExit`（照抄 `onLogLine` 的 listener + removeListener 模式）；`ipc.ts` 加同名封装与 `QuickLaunchEntry` / `TerminalInfo` / `QlStateMap` 类型；`main.ts` 逐个注册 handler：`ql_start` 把 `emitLog` 适配成 `ql-log` 的 `{ tabId, line, stream }`、把退出适配成 `ql-exit`；`ql_save` 先调 `ql_terminals` 拿到可用终端白名单再进配置层校验；`ql_pick_exe` 用 `open_file_dialog` 同款对话框加 `.exe` 过滤。

- [ ] **步骤 4：验证通过**

运行：1) `npx vitest run src/App.test.ts` PASS；2) `npx tsc -p tsconfig.main.json --noEmit` 无错误；3) 真机 `npm run dev`，在 DevTools console 依次执行
`await window.lms.invoke('ql_list')`、`await window.lms.invoke('ql_terminals')`、`await window.lms.invoke('ql_save', null, { name: 'probe', type: 'exe', exe: 'C:\\Windows\\System32\\notepad.exe' })`、`await window.lms.invoke('ql_start', '<上一步返回的 id>')`、`await window.lms.invoke('ql_stop', '<id>')`、`await window.lms.invoke('ql_delete', '<id>')`，逐个确认返回形状与规格 §8 一致，并确认 `configs/quick_launch.yaml` 内容符合 §5.1。

- [ ] **步骤 5：Commit**

`git add src-main/main.ts src-main/preload.ts src/ipc.ts src/App.test.ts && git commit -m "feat(ipc): 快捷启动 8 个通道与 ql-log/ql-exit 事件接线"`

---

### 任务 8：`exit_app` 停止全部快捷启动进程

**文件：** 修改 `src-main/main.ts:371-375`

- [ ] **步骤 1：编写失败的测试**

在 `src-main/quick-launch.test.ts` 追加：
```ts
it('stopAll 停掉所有运行中的进程并清空 states', async () => { /* 起两个 cmd 进程 → stopAll(3) → states() 为空 */ });
```

- [ ] **步骤 2：运行测试验证失败** → `stopAll` 尚未实现（或行为不符）→ FAIL。

- [ ] **步骤 3：实现**

`QuickLaunchManager.stopAll(timeoutSecs)` 遍历并对每个进程 `stopGraceful`，全部 await 完再返回；`main.ts` 的 `exit_app` 在 `await ps.stopGraceful(3)` 之后插入 `await ql.stopAll(3)`。

- [ ] **步骤 4：运行测试验证通过** → `npx vitest run src-main/quick-launch.test.ts` PASS。

- [ ] **步骤 5：Commit**

`git add src-main/quick-launch.ts src-main/quick-launch.test.ts src-main/main.ts && git commit -m "feat(main): exit_app 一并终止快捷启动进程"`

---

### 任务 9：i18n 词条（中英）

**文件：** 修改 `src/i18n.ts`、`src-main/i18n/dict.ts`；测试复用 `src-main/i18n/key-coverage.test.ts` 与 `no-hardcoded.test.ts`

**需要新增的键（渲染端）：** `ql.title`、`ql.btn.new`、`ql.btn.copy`、`ql.btn.edit`、`ql.btn.start`、`ql.btn.stop`、`ql.btn.closeTab`、`ql.tab.closeBlocked`、`ql.empty.none`、`ql.invalid`、`ql.term.pwsh|powershell|cmd|wsl`、`ql.modal.newTitle`、`ql.modal.editTitle`、`ql.modal.name`、`ql.modal.type`、`ql.modal.type.shell`、`ql.modal.type.exe`、`ql.modal.terminal`、`ql.modal.terminal.loading`、`ql.modal.cmd`、`ql.modal.exe`、`ql.modal.btn.pick`、`ql.modal.btn.save`、`ql.modal.btn.delete`、`ql.modal.delete.title`、`ql.modal.delete.message`、`ql.err.nameRequired`、`ql.err.nameTaken`、`ql.err.running`、`ql.dialog.filterExe`、`ql.log.start`、`ql.log.exit`、`ql.log.fail`

**需要新增的键（主进程）：** `err.ql.nameRequired`、`err.ql.nameDup`、`err.ql.typeInvalid`、`err.ql.terminalMissing`、`err.ql.cmdRequired`、`err.ql.exeRequired`、`err.ql.notFound`、`err.ql.alreadyRunning`、`err.ql.terminalGone`、`err.ql.qlExit`

- [ ] **步骤 1：编写失败的测试**

在两个字典的测试里追加键存在断言（或直接依赖既有的 key-coverage 门）；再在 `src/modules/QuickLaunch.test.ts`（任务 11 才建）之外，先写一条最小断言：`t('ql.title')` 不等于键名本身。

- [ ] **步骤 2：运行测试验证失败** → `npx vitest run src-main/i18n src/i18n.test.ts` FAIL（缺键）。

- [ ] **步骤 3：实现** 两个字典各补齐中英两份；中文用「快捷启动」、英文用 "Quick Launch" 等；终端标签英文用 "Windows PowerShell" / "PowerShell 7 (pwsh)" / "Command Prompt (cmd)" / "WSL"。

- [ ] **步骤 4：运行测试验证通过** → `npx vitest run src-main/i18n src/i18n.test.ts` 全 PASS。

- [ ] **步骤 5：Commit**

`git add src/i18n.ts src-main/i18n/dict.ts && git commit -m "feat(i18n): 快捷启动卡片中英词条"`

---

### 任务 10：日志页签动态化 + `[x]` 关闭 + 横向滚动

**文件：**
- 修改：`src/modules/log-tabs.ts`、`src/modules/LogPanel.vue`、`src/style.css`（`.tab-bar` 横向滚动）
- 测试：`src/modules/LogPanel.test.ts`（追加用例）

**接口：**

```ts
// log-tabs.ts
export const QL_TAB_PREFIX = 'ql:';
export function qlTabId(configId: string): string;
export interface LogTabItem { id: string; label: string; closable: boolean; closeDisabled: boolean }
// LogPanel.vue props：tabs: LogTabItem[], buckets: Record<string, LogEntry[]>
// emits: { clear: [id: string]; close: [id: string] }
```

- [ ] **步骤 1：编写失败的测试**

```ts
it('渲染动态页签并显示截断后的名字', () => { /* tabs 里给一条 label '一个特别特别特别长的快捷启动名字' → 文本以 … 结尾 */ });
it('仅 closable 页签渲染 [x]', () => {});
it('[x] 在 closeDisabled=true 时禁用', () => {});
it('点击 [x] 冒泡 close(id)', () => {});
it('页签多于 6 条时仍不换行（.tab-bar white-space/nowrap 断言或渲染条目数）', () => {});
```

- [ ] **步骤 2：运行测试验证失败** → `npx vitest run src/modules/LogPanel.test.ts` FAIL。

- [ ] **步骤 3：实现**

`LogPanel` 接收 `tabs`；静态页签 `closable: false`；动态页签 `closable: true` 且运行中传 `disabled`；`[x]` 用 `faXmark`（`App.vue` 已注册该图标，需在 LogPanel 内单独 `library.add`）；`.tab-bar` 加 `overflow-x: auto; flex-wrap: nowrap`，激活页签切换时 `scrollIntoView({ inline: 'nearest', block: 'nearest' })`；页签标签用 `truncateByWidth(label, 16)` + `data-tooltip` 全名。

- [ ] **步骤 4：运行测试验证通过** → `npx vitest run src/modules/LogPanel.test.ts src/modules/LogTabView.test.ts` 全 PASS。

- [ ] **步骤 5：Commit**

`git add src/modules/log-tabs.ts src/modules/LogPanel.vue src/style.css src/modules/LogPanel.test.ts && git commit -m "feat(log): 动态可关闭页签 + 页签条横向滚动"`

---

### 任务 11：快捷启动卡片 `QuickLaunch.vue`

**文件：** 创建 `src/modules/QuickLaunch.vue`；测试 `src/modules/QuickLaunch.test.ts`

**接口：** props `{ states: Record<string, { running: boolean; stopping: boolean }> }`；emits `{ start: [configId: string]; stop: [configId: string]; changed: [] }`；内部 invoke `ql_list` / `ql_save`。**运行态由 App 持有并下发，卡片不订阅任何事件**（与 `LaunchBar` 同构）。

- [ ] **步骤 1：编写失败的测试**

```ts
it('空列表显示空态文案', async () => {});
it('行显示截断后的名字且长名带 data-tooltip 全名', () => {
  // 名字 'abcdefghijklmnopqrstuvwxyz0123456789' → 文本以 … 结尾，dataset.tooltip = 全名
});
it('名字含 emoji 且超长时截断不切断代理对', () => {
  // '甲'.repeat(10) + '🚀'.repeat(10) → 结果里不出现孤立代理项（未配对的 \uD83D）
});
it('未运行显示紫底「启动」，运行中显示红底「停止」，stopping 显示「...」且禁用', async () => {});
it('复制插入到源行正后方且名字为 “X - copy”', async () => {});
it('states prop 变化时行按钮在「启动」/「停止」之间切换', async () => {});
```

- [ ] **步骤 2：运行测试验证失败** → FAIL（组件不存在）。

- [ ] **步骤 3：实现**（按规格 §9.2）

行结构与样式复用模板卡的 `.tpl-row` / `.tpl-row__id` / `.tpl-row__actions` / `.icon-btn--sm`（这些类在 `src/style.css` 已全局定义）；启动按钮用 `.btn-launch`（紫）/ 运行中 `.btn-danger`（红），图标 `faRocket` / `faStop`，复制 `faCopy`，编辑 `faPenToSquare`，新建 `faFileCirclePlus`；长名 tooltip 用与模板卡同款的 `position: fixed` 浮层。

- [ ] **步骤 4：运行测试验证通过** → `npx vitest run src/modules/QuickLaunch.test.ts` 全 PASS。

- [ ] **步骤 5：Commit**

`git add src/modules/QuickLaunch.vue src/modules/QuickLaunch.test.ts && git commit -m "feat(module): 快捷启动卡片（列表/复制/编辑/启动停止）"`

---

### 任务 12：弹窗 `QuickLaunchModal.vue`

**文件：** 创建 `src/modules/QuickLaunchModal.vue`；测试 `src/modules/QuickLaunchModal.test.ts`

**接口：**

```ts
props: { open: boolean; id: string; entry: QuickLaunchEntry | null }
emits: { saved: []; deleted: [id: string]; close: [] }
```

- [ ] **步骤 1：编写失败的测试**

```ts
it('默认类型为「命令行」，显示终端下拉与命令输入框', async () => {});
it('切到「可执行程序」后隐藏终端与命令，显示 exe 路径与选择按钮', async () => {});
it('终端下拉来自 ql_terminals 的返回（mock invoke）', async () => {});
it('名字为空时保存被拦下并显示错误文案', async () => {});
it('主进程返回 VALIDATION 重名时错误区显示「名字已存在」且不关窗', async () => {});
it('编辑态才显示删除按钮，删除需二次确认', async () => {});
```

- [ ] **步骤 2：运行测试验证失败** → FAIL。

- [ ] **步骤 3：实现**（按规格 §9.3）

复用 `TemplateModal.vue` 的遮罩/头部/footer 结构与类名（`.modal-overlay` / `.modal-body` / `.modal-actions` / `.modal-save` / `.btn-delete`）；类型选择用 `src/components/Dropdown.vue`；`open` 变 true 时并行拉 `ql_terminals` 并回填表单（编辑态用 `entry` 副本）。

- [ ] **步骤 4：运行测试验证通过** → `npx vitest run src/modules/QuickLaunchModal.test.ts` 全 PASS。

- [ ] **步骤 5：Commit**

`git add src/modules/QuickLaunchModal.vue src/modules/QuickLaunchModal.test.ts && git commit -m "feat(module): 新建/编辑启动弹窗（类型二选一 + 终端探测 + 删除确认）"`

---

### 任务 13：App 接线（动态桶 + 布局 + 自动切页签 + 重载复原）

**文件：** 修改 `src/App.vue`、`src/style.css`（`.grid` 四列）；测试 `src/App.test.ts`（追加）

- [ ] **步骤 1：编写失败的测试**

```ts
it('log-line 带 tabId 时只写该桶，不带 tabId 时行为不变', async () => {});
it('ql-exit 后对应配置的运行态清空，卡片行按钮回落为「启动」', async () => {});
it('onMounted 读到 ql_states 里 running 的配置时为其重建页签', async () => {});
```

- [ ] **步骤 2：运行测试验证失败** → FAIL。

- [ ] **步骤 3：实现**

`.grid` 改 `280px 350px 330px 330px`，JSX 顺序 `stack → QuickLaunch 卡（第 3 列）→ GPU 卡（第 4 列）`；`logBuckets` 改动态键；新增 `qlTabs` 与页签增删函数；`onQlLog` 按 `tabId` 入桶；`onQlExit` 更新**App 自己持有**的 `qlStates`（单一真源：同时喂给卡片 props 与页签的 `closeDisabled`），并给该配置的页签追加一行退出说明；启动成功且 `tabId !== null` 时激活该页签。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/App.test.ts src/modules/QuickLaunch.test.ts src/modules/LogPanel.test.ts` → 全 PASS；再跑 `npm test` 全量绿。

- [ ] **步骤 5：Commit**

`git add src/App.vue src/style.css src/App.test.ts && git commit -m "feat(app): 快捷启动接入选第 3 列、动态日志桶与页签自动切换"`

---

### 任务 14：真机验收 + 文档收尾

**文件：** 修改 `docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` 的「状态」行（标注验收结果与 WSL 未验收）

- [ ] **步骤 1：跑全量单测与类型检查**

运行：`npm test` 与 `npx tsc -p tsconfig.main.json --noEmit`
预期：全绿、无类型错误。

- [ ] **步骤 2：真机验收（逐条记录命令与输出）**

1. `npm run dev` 启动应用。
2. 新建三条命令行配置，分别选 `pwsh` / `Windows PowerShell` / `cmd`，命令都填 `echo 中文测试ABC`，逐条启动 → 日志区三条页签，内容均为中文不乱码（规格 §7.3 的验收标准）。
3. `cmd` 配置改为 `ping -n 60 127.0.0.1` → 启动 → 点 [停止] → 在任务管理器或 `tasklist | findstr PING` 确认无残留（进程树被杀）。
4. 新建一条可执行程序配置（如 `C:\Windows\System32\notepad.exe`）→ 启动确认无页签、按钮变红 [停止]；关掉记事本 → 行按钮自动回落 [启动]。
5. 建 8 条命令行配置并全部启动 → 页签条横向滚动、可切换、激活页签可见。
6. 配置名改为 30 字以上 → 列表截断 + hover tooltip 全名；页签同样截断。
7. 应用退出（托盘 → 退出）→ `tasklist` 确认快捷启动的进程全部消失。
8. WSL 一项目前**无法验收**（本机无发行版）：在规格文档里如实记录。

- [ ] **步骤 3：Commit**

`git add docs/superpowers/specs/2026-10-10-quick-launch-card-design.md && git commit -m "docs: 快捷启动真机验收记录（WSL 待用户安装发行版后补）"`
