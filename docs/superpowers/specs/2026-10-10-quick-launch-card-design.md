# 快捷启动卡片（Quick Launch · 交互终端版）设计规格

- 日期：2026-10-10（v1 日志版）→ **2026-10-11 v2：命令行类型改为交互终端页签**
- 状态：v2 设计已由用户逐项确认（grill-me 共 18 问），待写实现计划
- 依据：本文「实测」结论均在**本机真机**取得，证据见 §6.3 / §7.4 / §9.5

## 0 v2 相对 v1 的变更（为什么重写）

用户在 v1 规格批准后提出：日志页签应该**是真正的终端**，这样「命令执行到一半需要输入 y/n」之类的场景可用。

实测结论：**可行**，而且是**净简化**。

| v1 设计 | v2 处置 |
|---|---|
| 命令行输出走管道 + 「UTF-8 注入 / OEMCP 探测 / LineDecoder 流式解码」三大块 | **全部作废**（PTY 是真控制台，中文直接正确；见 §7.4） |
| `buildShellArgv` 拼 `-Command "[Console]::OutputEncoding=…; <cmd>"` | **作废**：PTY 直接起终端本体，**不包装** |
| 命令行页签 = 纯文本行渲染（LogTabView 同款） | **改为 xterm.js 交互终端页签**（新组件） |
| 进程 = `spawn` + 双管道 | **改为 node-pty 伪终端**（ConPTY） |
| IPC：`ql-log` 行事件 | **改为** `ql-data`（UTF-8 串）+ `ql-write` + `ql-resize` |

**保持不变**：卡片结构、配置存储与校验、终端探测、一配置一实例、页签关闭语义、长名截断、页签横向滚动、可执行程序类型无页签、退出应用时终止全部进程。

## 1 背景与目标

应用右侧（`.grid` 第 4 列位置）有约 330px 空位。新增一张「快捷启动」卡片：配置多条启动项，每条要么是**命令行**（选终端 → 填命令 → 得到一个可交互的终端页签），要么是**可执行程序**（选 .exe，无页签）。

## 2 非目标

- llama-server 与「LMS Launcher」两个静态页签**保持纯文本日志**，本期一行不改（理由见 §9.1）。
- 可执行程序的启动参数 / 工作目录字段；「多发行版 WSL」探测；页签拖动排序；终端会话录制/回放；命令历史；工作流串联；日志落盘。
- 窗口重载后的终端历史回放（§7.6 明确说明重载后的行为）。
- xterm 升级到 6.x（本期钉 5.5.0，理由见 §9.5）。

## 3 术语

| 术语 | 含义 |
|---|---|
| 快捷启动配置 | `quick_launch.yaml` 里的一条条目 |
| 终端类型 | `pwsh` / `powershell` / `cmd` / `wsl` 四种之一 |
| 终端页签 | 由命令行类型配置创建的日志区页签，内含一个 xterm 实例，绑定一个 PTY |
| 静态页签 | `launcher` 与 `llama-server` 两个纯文本页签 |

## 4 布局与卡片

- `src/style.css` 的 `.grid` 由 `280px 350px 330px` 改为 `280px 350px 330px 330px`；**第 3 列 = 快捷启动，GPU 卡顺移到第 4 列**。
- 默认窗口 1400px 下四列占 1290px（可用 1340px），放得下；窄窗口横向溢出属现状，本期不改。
- 卡片标题「快捷启动」+ 新建图标按钮（`faFileCirclePlus` / `.icon-btn--sm`）。
- 列表行同 `.tpl-row`：左名字（截断 + tooltip），右 `[复制][编辑][启动/停止]`。

## 5 数据模型与持久化

### 5.1 形状（与 v1 相同）

`<dataDir>/configs/quick_launch.yaml`：

```yaml
qlx1a2b3c4:
  name: 启动 webui
  type: shell
  shell: pwsh
  cmd: python -m webui
qlp9q8r7s6:
  name: LM Studio
  type: exe
  exe: D:\Tools\LM Studio.exe
```

```ts
export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
export type QuickLaunchKind = 'shell' | 'exe';
export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }
export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }
```

### 5.2 加载语义

| 情况 | 行为 |
|---|---|
| 文件不存在 / 空文件 | `{ items: {}, invalid: [] }`（**不抛 MISSING**——首次必然没有） |
| YAML 解析失败 / 顶层非对象 | 抛 `YAML:` |
| 单条条目非法 | 跳过该条，id 收进 `invalid`；卡片顶部提示「N 条配置无效，已跳过」 |

### 5.3 校验规则（保存路径，抛 `VALIDATION:`）

1. `name` trim 后非空且长度 ≤ 64。
2. `name` 与其它条目不重复（trim 后精确比较，区分大小写）。
3. `type` ∈ `{'shell','exe'}`。
4. `shell` 类型：`shell` ∈ 四种之一且**该终端当前可用**；`cmd` trim 后非空。
5. `exe` 类型：`exe` trim 后非空（不校验文件存在，启动时反馈）。
6. 写入时只写该类型字段（shell 丢 `exe`，exe 丢 `shell`/`cmd`）。

### 5.4 id 与复制命名

- `suggestConfigId(existing, prefix = 'tpl')` 泛化出前缀参数，快捷启动用 `'ql'`（默认值不变，既有调用与测试不受影响）。
- 新建 `src/util/copy-name.ts` 导出 `nextCopyName(base, taken)`，从 `TemplateModule.vue` 原样搬出并改为引用（行为不变，既有测试兜底）。

## 6 终端探测

### 6.1 探测表

| 终端 | 判定 |
|---|---|
| `powershell` | `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` 存在 |
| `cmd` | `%ComSpec%` 或 `%SystemRoot%\System32\cmd.exe` 存在 |
| `pwsh` | `where.exe pwsh` 退出码 0 且首行为存在的文件 |
| `wsl` | `wsl.exe` 存在 **且** `wsl -l -q` 退出码 0 且解析出的发行版名非空 |

- **只返回可用项**；每次 `ql_terminals`（= 每次打开弹窗）实时探测，不跨调用缓存 → 用户之后装好 WSL 发行版，下次打开弹窗自动出现。
- `spawnSync` + `windowsHide: true` + 单项 3s 超时；任何异常 = 该项不可用。
- `wsl -l -q` 输出是 **UTF-16LE**，需剥 NUL 后按行解析（纯函数 `parseWslDistroOutput(buf: Buffer): string[]`）。
- **本机实测**：pwsh 7.6.6 / Windows PowerShell 5.1 / cmd 可用；`wsl.exe` 存在但无发行版 → 不出现。
- 主进程只下发 `{ id, path }`，**标签文案由渲染端 `t()` 决定**。

### 6.2 WSL 粒度（用户决策）

只列**默认发行版**一项（选中即 `wsl.exe`）。要多发行版 → 用户自建一条 **PowerShell** 快捷启动，命令文本写 `wsl -d <发行版名>`（这在 pwsh 里是标准用法，WSL 作为子进程跑在同一个 PTY 里）。

### 6.3 本机探测证据

`pwsh 7.6.6` ✅ / `Windows PowerShell 5.1.26100.9549` ✅ / `cmd` ✅ / `wsl -l -q` 退出码 1（未安装发行版）⛔

## 7 主进程：PTY、终端生命周期

### 7.1 依赖（新增，用户已批准）

| 包 | 版本 | 用途 | 实测 |
|---|---|---|---|
| `@lydell/node-pty` | ^1.2.0-beta.15 | ConPTY 伪终端 | **免编译**：N-API 预编译，装 2 个包 8 秒完成；本机**无任何 Visual Studio / vswhere**，仍可用 |
| `@xterm/xterm` | 5.5.0 | 终端渲染 | 纯 JS |
| `@xterm/addon-fit` | 0.10.0 | 尺寸自适应 | 纯 JS |
| `@xterm/addon-search` | 0.15.0 | 查找（等价于静态页签的查找） | 纯 JS |
| `@xterm/addon-web-links` | 0.11.0 | 链接点击（复用 `open_external` IPC） | 纯 JS |

### 7.2 打包（硬门）

`@lydell/node-pty` 的平台包 `@lydell/node-pty-win32-x64` 内含：

```
prebuilds/win32-x64/conpty.node                  ← 原生插件
prebuilds/win32-x64/conpty_console_list.node
prebuilds/win32-x64/conpty/conpty.dll            ← ConPTY 运行库
prebuilds/win32-x64/conpty/OpenConsole.exe       ← ConPTY 宿主
```

- `electron-builder.yml` 必须加 `asarUnpack`：`**/node_modules/@lydell/**`（`.node` 无法从 asar 内 dlopen；`.dll`/`.exe` 也无法从 asar 内执行）。
- **`dev 能跑 ≠ 打包能跑`**：打包产物（portable exe）里必须能真的开出终端页签，这是**硬门验收项**（§12 第 1 条）。
- 打包后需确认这两处：`app.asar.unpacked/node_modules/@lydell/**` 存在；portable 运行时解包目录里同样存在。

### 7.3 PTY 启动

```ts
pty.spawn(exe, [], {
  name: 'xterm-256color',
  cols, rows,                       // 来自渲染端 fit 结果
  cwd: os.homedir(),                // 用户决策：用户主目录
  env: process.env,
});
```

- `exe` 直接是终端本体：`pwsh.exe -NoLogo` / `powershell.exe -NoLogo` / `cmd.exe` / `wsl.exe`。**没有 v1 的 `-Command` 包装**。
- **不传 `encoding`**：Windows 实现里 `encoding` 选项不受支持（`windowsTerminal.js` 会 warn），而底层 socket 是 `setEncoding('utf8')`，即 **net.Socket 的 StringDecoder，天然保证多字节字符跨 chunk 完整**。因此统一按 UTF-8 字符串处理。
- 可执行程序类型：**不用 PTY**，走 `spawn(exe, [], { windowsHide: true, stdio: 'ignore' })`（无页签、输出丢弃）。
- 一配置一实例：运行中/停止中的配置再点启动 → 抛 `STATE:`。
- 自动执行命令（用户决策）：PTY 起好后，**等第一批输出到达**（说明 shell 已就绪）再把 `cmd + '\r'` 写入；若 5s 内无任何输出，则超时兜底直接写入。

### 7.4 输出编码实测（v1 的三大块工作量因此作废）

真机 ConPTY 实测（Electron 28.3.3 / node 18.18.2）：

| 终端 | 输入 | 结果 |
|---|---|---|
| `pwsh -NoLogo` | `Write-Output '中文测试ABC'` | 中文**正确**，带 ANSI 颜色 `\u001b[38;5;9m` |
| `powershell -NoLogo` | 同上 | 中文**正确** |
| `cmd` | `echo 中文测试ABC` | 中文**正确** |
| `cmd` | `cls & echo TUI_OK` | 收到完整清屏序列 `\u001b[H\u001b[K…\u001b[3J` → 真 ANSI |
| `cmd` | `set /p X=NAME? ` 后写 `Alice` | **真的阻塞等待输入**，随后 `echo GOT=%X%` 打印 `GOT=Alice` |

### 7.5 生命周期

| 事件 | 行为 |
|---|---|
| 启动前校验 | 配置存在 → 终端仍可用（shell）/ `exe` 非空（exe）；失败抛 `VALIDATION:` |
| 启动成功 | shell → `{ tabId: 'ql:<configId>' }`；exe → `{ tabId: null }` |
| PTY 输出 | `onData(string)` → 事件 `ql-data { tabId, data }` |
| 输入 / 尺寸 | `ql_write(id, data)` → `pty.write`；`ql_resize(id, cols, rows)` → `pty.resize` |
| 进程退出 | `ql-exit { configId, code }`；行按钮回落 `[启动]`；**页签保留**（用户决策） |
| `[停止]` | **直接杀终端进程树**（沿用 llama-server 口径：终止 → 3s → `taskkill /T /F`）；**不关页签**（用户决策）——想只中断当前命令，用户在终端里按 Ctrl+C |
| 页签 `[x]` | 该配置 `running \\|\\| stopping` 时禁用（tooltip「请先停止」）；否则关闭页签（连同 xterm 与历史） |
| 应用退出 | `exit_app` 在既有 `await ps.stopGraceful(3)` 之后加 `await ql.stopAll(3)`，再 `app.exit(0)` |

### 7.6 窗口重载

主进程持有 PTY，重载后仍持续推送；渲染端按 `ql_states` 为运行中的配置重建**空**终端页签（历史丢失，与「日志只存渲染端内存」一致），输入与后续输出照常。

## 8 IPC 契约

| 通道 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `ql_list` | — | `QuickLaunchList` | §5.2 |
| `ql_save` | `id: string \\| null, entry` | `string` | §5.3；返回最终 id |
| `ql_delete` | `id` | `void` | 不存在 → `VALIDATION:` |
| `ql_terminals` | — | `TerminalInfo[]` | §6.1 |
| `ql_start` | `id` | `{ tabId: string \\| null }` | §7.5 |
| `ql_stop` | `id` | `void` | 幂等 |
| `ql_write` | `id, data: string` | `void` | 键盘输入 |
| `ql_resize` | `id, cols: number, rows: number` | `void` | 尺寸 |
| `ql_states` | — | `Record<string, { running: boolean; stopping: boolean }>` | 重载复原 |
| `ql_pick_exe` | — | `string \\| null` | `.exe` 过滤对话框 |
| `clipboard_read` | — | `string` | 终端复制/粘贴（`file://` 下 `navigator.clipboard` 不可靠） |
| `clipboard_write` | `text: string` | `void` | 同上 |

事件：

| 事件 | 载荷 |
|---|---|
| `ql-data` | `{ tabId: string; data: string }` |
| `ql-exit` | `{ configId: string; code: number }` |

## 9 渲染端

### 9.1 页签模型（两种页签共存）

| | 静态页签（launcher / llama-server） | 终端页签（快捷启动命令行） |
|---|---|---|
| 组件 | `LogTabView.vue`（**不改**） | `TerminalTabView.vue`（新建） |
| 内容 | 文本行（App 的 logBuckets） | xterm 实例（自持 scrollback，5000 行） |
| 查找 | 现有实现（**不改**） | `@xterm/addon-search`（同一套工具条 UI 语言） |
| 链接 | 现有 Ctrl+点击（**不改**） | `@xterm/addon-web-links` → 复用 `open_external` |
| 清空 | 清桶（**不改**） | `term.clear()` |
| 自动滚动 | 勾选框（**不改**） | xterm 原生贴底跟随 |
| 着色 | Solarized 启发式（**不改**） | 终端自带 ANSI 真彩色 |

结论：**静态两页签的能力与代码完全不受影响**（用户确认了这一口径）。

### 9.2 `log-tabs.ts` 与 `App.vue`

- `QL_TAB_PREFIX = 'ql:'`；`qlTabId(configId)`。
- 新增 `qlTabs = ref<{ id: string; configId: string }[]>([])`、`qlStates = ref<Record<string, { running: boolean; stopping: boolean }>>({})`。
- **终端数据路由**：App 持 `Map<tabId, (data: string) => void>`，`TerminalTabView` 挂载时注册、卸载时注销；`onQlData` 按 `tabId` 派发（未知 tabId 忽略，防竞态）。
- `logBuckets` 只需容纳静态两页签（`launcher` / `llama-server`）：v1 的「动态桶」改动**作废**。
- 点 `[启动]`（shell）→ 建页签（若不存在）+ **自动激活**（用户决策）+ `fit()` + 聚焦。
- `onQlExit` → 更新 `qlStates`（卡片按钮回落），页签保留。
- `.grid` 四列；JSX 顺序 `stack → QuickLaunch（第 3 列）→ GPU（第 4 列）`。

### 9.3 `TerminalTabView.vue`（新建）

- props：`{ id: string; configId: string; label: string; closable: boolean; closeDisabled: boolean; register: (id: string, sink: (d: string) => void) => void; unregister: (id: string) => void; onInput: (id: string, data: string) => void; onResize: (id: string, cols: number, rows: number) => void }`（以实施时 App 的实际接口为准，保持单向数据流）。
- 挂载时：新建 `Terminal({ scrollback: 5000, fontFamily: var(--font-mono), fontSize: 13 })` + `FitAddon` + `SearchAddon` + `WebLinksAddon(open_external)`，`open(el)`，注册数据 sink，`ResizeObserver` + `fit()` → `onResize`。
- `term.onData` → `onInput`（含 Ctrl+C 的 `\x03`）。
- 键盘：`attachCustomKeyEventHandler` —— `Ctrl+Shift+C` 复制（有选中时）、`Ctrl+Shift+V` 粘贴、`Ctrl+C` **一律交给终端**（中断）；右键 = 粘贴。
- 工具条：清空 + 查找（输入框 + 上/下 + 计数）。
- `v-show` 保活（切走不销毁，终端状态保留）；隐藏期间不做 fit，激活时再 fit。

### 9.4 卡片与弹窗

与 v1 相同：`QuickLaunch.vue`（props `states`、emits `start/stop/changed`，列表/复制/编辑/长名 tooltip）、`QuickLaunchModal.vue`（类型 `Dropdown` 二选一、终端 `Dropdown`（打开时实时探测，加载中禁用）、命令输入框、exe 路径 + 选择按钮、编辑态左下删除 + `ConfirmDialog` 二次确认、右下紫色保存、重名/空名错误区）。

### 9.5 版本与兼容性取证

| 项 | 事实 |
|---|---|
| xterm 6.0.0 | dist 使用 `??=` 与 `static {}`（ES2021/ES2022，Chromium 120 语法上支持），但**本机 harness 无法验证 renderer**（Electron GUI 进程在此环境启动即 `STATUS_BREAKPOINT`，与用户机器无关） |
| **决定** | 本期钉 **5.5.0** + addons 0.10.0 / 0.15.0 / 0.11.0（VS Code 长期实证于 Chromium 120）；6.x 升级留作单独的可验证改动 |

## 10 i18n

- 渲染端 `ql.*`（含终端标签 `ql.term.pwsh|powershell|cmd|wsl`、终端工具条、剪贴板提示）；
- 主进程 `err.ql.*`；
- `no-hardcoded.test.ts` / `key-coverage.test.ts` 是硬门，中英两份都要补齐。

## 11 两个已知问题的解法（不变）

1. **长名** → `truncateByWidth`：页签预算 16、列表行预算 30；只在真实超预算 + grace 时截断并加 `…`；hover 弹全名 tooltip（fixed 浮层）。
2. **页签溢出** → `.tab-bar` 横向滚动、页签不被压扁，切换时激活页签 `scrollIntoView({ inline: 'nearest' })`。

## 12 测试与验收

**单元（vitest，Node 侧可真跑 PTY——已实测 Node 里 `require('@lydell/node-pty')` 成功）**

1. `quick-launch-config`：缺失/空 → 空表；YAML 坏 → `YAML:`；坏条目进 `invalid`；名字空/超长/重名 → `VALIDATION:`；shell 缺 `cmd` → `VALIDATION:`；只写该类型字段；id 前缀 `ql`。
2. `copy-name`：`X` → `X - copy` → `X - copy 2`；源名已含后缀时剥后缀重算。
3. `parseWslDistroOutput`：UTF-16LE → 发行版名；空输出 → `[]`。
4. `QuickLaunchManager`：状态机（启动/重复启动抛 `STATE:`/退出回落）；`stopAll` 清空；shell 类型 spawn 失败不残留状态（真机跑 `cmd.exe` 集成用例）。
5. 组件：`QuickLaunchModal`（类型切换字段显隐、空名、重名、删除二次确认）；`QuickLaunch`（行按钮三态、复制插入位置）；`TerminalTabView` **用 `vi.mock('@xterm/xterm')` 打桩**，只测接线（注册/注销 sink、输入与 resize 回调、清空按钮、关闭禁用）——**xterm 的真实渲染不在单测范围**。

**硬门验收（真机，逐条记录）**

1. **打包产物**：`build.bat` 出 portable exe → 运行 → 开一个终端页签成功（验证 `asarUnpack` 与 `.node`/`conpty.dll` 加载）。
2. 三种终端各跑一条中文输出命令 → 中文正确、颜色正常。
3. **交互**：运行 `cmd` 配置，命令写 `set /p X=NAME?`，在终端页签里输入 `Alice` → 回车后能看到回显；再敲 `echo %X%` → `Alice`。
4. **TUI**：在 `cmd` 页签跑 `python`（或任一带提示符的交互程序）能正常交互；跑 `cls` 能正确清屏。
5. **进程树**：跑 `ping -n 60 127.0.0.1` → `[停止]` → `tasklist | findstr PING` 无残留；页签仍在且 `[x]` 变为可用。
6. **自动执行**：新建配置启动后，命令自动执行并停在提示符（可继续输入）。
7. 可执行程序类型：启动记事本 → 无页签、按钮变红；关闭记事本 → 按钮回落。
8. 页签溢出（8 条）横向滚动；超长名在列表与页签都截断 + tooltip。
9. 退出应用 → 所有终端进程消失。
10. **WSL 一项无法验收**（本机无发行版）：如实记录，不得声称已验收。

## 13 风险与未验证项（实现阶段必须显式标注）

1. **打包后原生模块加载**——本方案最大风险，§7.2 + §12 第 1 条把它设成硬门。
2. **xterm 渲染无法在本 harness 验证**（Electron GUI 起不来）→ 由 §12 硬门 2/4 在用户机器上覆盖；版本已按 §9.5 保守选择。
3. **WSL 未实测**（无发行版）。
4. **命令文本自动执行的就绪判定**是启发式（等首批输出，5s 超时兜底）；极端慢启动的 shell 可能出现命令先于提示符写入——验收项 6 覆盖常见情形。
5. **大数据量输出**：长时间高频输出（如 `ping -t`）受 xterm scrollback 5000 行与 IPC 吞吐限制；本期不做背压（`handleFlowControl` 未启用）。
