# 快捷启动卡片（Quick Launch）设计规格

- 日期：2026-10-10
- 状态：设计已由用户逐项确认（grill-me 12 问），规格待审阅 → 通过后进入实现计划
- 依据：本文所有「实测」结论均在**本机真机**取得，命令与字节结果见 §5.2 / §7.3

## 1 背景与目标

应用右侧（`.grid` 第 4 列位置）有约 330px 空位。本期在该位置新增一张卡片，让启动器能启动**任意命令行或可执行程序**，而不是只能启动 llama-server。

目标（用户原话拆解）：

1. 卡片结构与「启动参数模板」卡片同构：多条配置构成列表，新建/编辑/复制/删除齐备。
2. 「新建启动」弹窗里二选一：**命令行** 或 **可执行程序**。
3. 命令行类型：选终端（实时探测系统上可用的终端）→ 填命令文本 → 启动后日志区出现该配置专属页签，页签名 = 配置名，内容实时打印。
4. 可执行程序类型：选 .exe 路径（含文件选择按钮），**不产生日志页签**。
5. 每行配置有 `[启动]` 按钮，点击后变 `[停止]`（同「启动 llama-server」卡片），可停止正在运行的命令行/程序。
6. 页签右上角有 `[x]`，点击销毁页签；对应配置仍在列表中，再次启动会重建页签。
7. 解决两个已知问题：超长配置名的截断、页签过多时的溢出。

## 2 非目标（本期不做）

- 同一配置多实例并发（一配置一实例，见 §7.1）。
- 可执行程序的启动参数 / 工作目录字段（需要参数就用「命令行」类型写）。
- 「退出应用时保留进程」开关（本期一律终止，见 §7.4）。
- 页签拖动排序、页签重命名、命令历史、多命令串联（工作流）、日志落盘。
- 命令行类型的交互式终端（本期均为「执行完即退出」语义，日志区不可输入）。

## 3 术语

| 术语 | 含义 |
|---|---|
| 快捷启动配置 | `quick_launch.yaml` 里的一条条目，含名字、类型与类型专属字段 |
| 终端 | `pwsh` / `powershell` / `cmd` / `wsl` 四种命令行宿主之一 |
| 动态页签 | 由快捷启动配置创建的日志页签，id 形如 `ql:<configId>` |
| 静态页签 | 现有的 `launcher` 与 `llama-server` 两个固定页签 |

## 4 布局与卡片

- `src/style.css` 的 `.grid` 由 `280px 350px 330px` 改为 `280px 350px 330px 330px`。
- **第 3 列 = 快捷启动卡片；GPU 卡顺移到第 4 列**（用户明确指定）。
- 默认窗口 1400px：可用宽度 = 1400 − 2×12(padding) − 3×12(gap) = 1340px，四列占 1290px，放得下。
- 窗口窄于该值时横向溢出——这是**现状**（现有三列 960px 在 minWidth 760 下本已溢出），本期不改全局布局策略。
- 卡片标题「快捷启动」+ 标题右侧新建图标按钮（复用 `faFileCirclePlus` 与 `.icon-btn--sm`，与模板卡一致）。
- 列表行 = 灰边框圆角卡片（`.tpl-row` 同款）：左为名字（截断 + tooltip），右为 `[复制][编辑][启动/停止]` 三个按钮，顺序同用户截图。

## 5 数据模型与持久化

### 5.1 文件与形状

新文件 `<dataDir>/configs/quick_launch.yaml`（与现有三份 yaml 并列；目录由 `configDir()` 提供）。

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
// src-main/quick-launch-config.ts
export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
export type QuickLaunchKind = 'shell' | 'exe';
export interface QuickLaunchEntry {
  name: string;
  type: QuickLaunchKind;
  shell?: TerminalId;  // type === 'shell' 时必填
  cmd?: string;        // type === 'shell' 时必填
  exe?: string;        // type === 'exe' 时必填
}
export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }
```

### 5.2 加载语义

| 情况 | 行为 | 依据 |
|---|---|---|
| 文件不存在 | 返回 `{ items: {}, invalid: [] }`，**不抛 MISSING** | 首次启动必然没有该文件，与模板卡的 `configsLoad` 语义刻意不同 |
| 空文件 | 返回 `{ items: {}, invalid: [] }` | 同 `configsLoad` |
| YAML 解析失败 | 抛 `YAML:` | 同 `configsLoad` |
| 顶层非对象 | 抛 `YAML:` | 同 `parseYaml` |
| 单条条目非法（缺 name / type 非法 / shell 缺失 / cmd 空 / exe 空） | **该条跳过**，id 收进 `invalid` | 手工编辑 yaml 的容错；卡片顶部显示「N 条配置无效，已跳过」 |

### 5.3 校验规则（保存路径，抛 `VALIDATION:`）

1. `name` trim 后非空且长度 ≤ 64（UTF-16 长度）。
2. `name` 与**其它条目**（trim 后精确比较，区分大小写）不重复。
3. `type` ∈ `{'shell','exe'}`。
4. `type === 'shell'`：`shell` ∈ `{'pwsh','powershell','cmd','wsl'}` 且该终端**当前可用**（复用 §6.1 探测结果）；`cmd` trim 后非空。
5. `type === 'exe'`：`exe` trim 后非空；**不校验文件是否存在**（与模板卡不校验路径一致，启动时反馈）。
6. 写入时**只写该类型相关字段**：shell 类型丢弃 `exe`，exe 类型丢弃 `shell`/`cmd`（保证 yaml 干净）。

### 5.4 id 生成

复用 `src-main/config.ts` 的 `validateConfigId`；把 `suggestConfigId(existing: string[], prefix = 'tpl')` 泛化出前缀参数，快捷启动用 `prefix = 'ql'`（默认值保持 `'tpl'`，既有调用与测试不受影响）。存在性检查只针对 `quick_launch.yaml` 内的 id。

### 5.5 复制命名（抽公共 util）

新建 `src/util/copy-name.ts` 导出 `nextCopyName(base: string, taken: Set<string>): string`，把 `TemplateModule.vue` 现有实现（去 ` - copy( N)?` 后缀后按 `X - copy` / `X - copy 2` … 递增取第一个未占用名）原样搬过去；`TemplateModule.vue` 改为引用它（行为不变，由既有 `TemplateModule.test.ts` 兜底），快捷启动卡片同样引用。

## 6 终端探测

### 6.1 探测表与判定

| 终端 | 判定 |
|---|---|
| `powershell` | `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` 存在 |
| `cmd` | `%ComSpec%` 或 `%SystemRoot%\System32\cmd.exe` 存在 |
| `pwsh` | `where.exe pwsh` 退出码 0 且首行为存在的文件（PATH 解析，覆盖非默认安装位置） |
| `wsl` | `%SystemRoot%\System32\wsl.exe` 存在 **且** `wsl.exe -l -q` 退出码 0 且输出（**UTF-16LE**，需剥 NUL 后按行取）有至少一个非空行 |

- **只返回可用的终端**（用户要求）。用户之后安装 WSL 发行版，下一次打开弹窗即自动出现（探测在每次打开弹窗时执行，不做跨调用缓存）。
- 探测时机：每次 `ql_terminals` IPC 调用（= 每次打开弹窗）。
- 全部探测用 `spawnSync` + `windowsHide: true` + 单项 3s 超时；失败/超时 = 该项不可用，不让异常冒泡。
- **本机实测**：`pwsh 7.6.6` 可用、`Windows PowerShell 5.1.26100.9549` 可用、`cmd` 可用、`wsl.exe` 存在但 `wsl -l -q` 退出码 1（未安装发行版）→ **不出现在列表**。
- 返回形状：`TerminalInfo[] = { id: TerminalId; path: string }`。**标签文案由渲染端 `t()` 决定**（切语言即时重译），主进程不下发中文/英文。

## 7 主进程：启动、编码、生命周期

### 7.1 进程模型

- `src-main/quick-launch.ts` 持 `Map<string, ManagedProcess>`（configId → 进程），**一配置一实例**：运行中/停止中的配置再次 `ql_start` → 抛 `STATE:` 拒绝。
- 所有 spawn 一律 `windowsHide: true`（避免控制台窗口闪现；同时这正是 §7.3 字节行为成立的前提）。
- 可执行程序类型：`spawn(exe, [], { windowsHide: true })`，工作目录继承本进程（与 `ProcessState.launch` 缺省行为一致）。

### 7.2 启动参数矩阵（实测钉死）

| 类型 | argv |
|---|---|
| `pwsh` | `pwsh.exe -NoLogo -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; <cmd>"` |
| `powershell` | `powershell.exe -NoLogo -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; <cmd>"` |
| `cmd` | `cmd.exe /d /s /c "<cmd>"`（**不注入 chcp**，见 §7.3） |
| `wsl` | `wsl.exe -e bash -lc "<cmd>"` |
| `exe` | `<exe>`（无参数） |

命令文本作为**单个 argv 元素**传递（`shell: false`），因此命令里的引号/空格不需要额外转义。

### 7.3 输出解码（实测证据）

Node `spawn` + `windowsHide: true` + 双管道（= Electron 真实路径），命令输出 `中文测试ABC`：

| 情形 | 输出字节（hex） | 按 UTF-8 解 |
|---|---|---|
| Windows PowerShell 5.1 原样 | `d6 d0 ce c4 b2 e2 ca d4 41 42 43 0d 0a`（GBK） | 乱码 |
| Windows PowerShell 5.1 + `[Console]::OutputEncoding=[Text.Encoding]::UTF8` | `e4 b8 ad e6 96 87 …`（UTF-8） | 正常 |
| **pwsh 7 原样** | `d6 d0 ce c4 …`（**GBK**，不是 UTF-8） | 乱码 |
| pwsh 7 + 同一句注入 | UTF-8 | 正常 |
| cmd 原样 | GBK | 乱码 |
| cmd + `chcp 65001>nul &` | **仍是 GBK** | `chcp` 无效（子进程无控制台，改不了代码页） |

结论（写死）：

- `pwsh` / `powershell`：**注入** `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ` 前缀 → 按 `utf-8` 解码。
- `cmd`：不注入；按系统 **OEM 代码页**解码。代码页取 `reg query HKLM\SYSTEM\CurrentControlSet\Control\Nls\CodePage /v OEMCP`（本机实测 `OEMCP = 936`）；`936 → 'gbk'`，其它值**回落 utf-8**（受限项，见 §12）。
- `wsl`：按 `utf-8` 解码（Linux 侧程序输出 UTF-8）；**本机无发行版，未实测**。
- `exe`：无页签，**不解码**（stdout/stderr 丢弃）。

### 7.4 生命周期

| 事件 | 行为 |
|---|---|
| 启动前校验 | 配置存在 → 终端当前仍可用（shell 类型）→ exe 非空（exe 类型）；失败抛 `VALIDATION:` |
| 启动成功（shell） | 主进程订阅 stdout/stderr → `ql-log` 事件；返回 `{ tabId: 'ql:<configId>' }` |
| 启动成功（exe） | 返回 `{ tabId: null }`；stdout/stderr 丢弃 |
| 启动失败（spawn error） | shell：该页签内写一行错误；exe：写一行 `launcher` 桶 sys 日志；两者都让行按钮回落 `[启动]` |
| 进程退出 | `ql-exit { configId, code }`；行按钮回落 `[启动]`；页签**保留**并追加一行退出码说明（exe 类型写 `launcher` 桶） |
| `ql_stop` | `stopGraceful(3)`：先终止 → 3s 超时 → `taskkill /T /F` 杀**进程树**（与 llama-server 完全一致，用户确认） |
| 应用退出 | `exit_app` 在既有 `await ps.stopGraceful(3)` **之后**加 `await ql.stopAll(3)`，再 `app.exit(0)`（含 exe 类型，用户确认） |
| 窗口重载 | 渲染端 `ql_states` 复原运行中的配置（重建页签，日志内容不保留） |

### 7.5 公共进程类抽取

`src-main/process.ts` 抽出 `ManagedProcess`：

```ts
export class ManagedProcess {
  state: ProcStateName;            // 'ready' | 'running' | 'stopping'
  pid(): number | null;
  async launch(opts: { exe: string; args: string[]; cwd?: string; windowsHide?: boolean }): Promise<void>;
  takePipes(): { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream };
  isRunning(): boolean;
  async stopGraceful(timeoutSecs: number): Promise<void>;
  onExit(cb: (code: number, error?: string) => void): void;
  drainExit(): number | null;
}
export class ProcessState extends ManagedProcess {
  runningConfigId: string | null;  // 既有 launch(exe,args,configId,cwd?) 签名保持
}
```

**硬约束：`ProcessState` 的公开 API 与行为不变，既有 `src-main/process.test.ts` 一行不改且必须继续通过。**

## 8 IPC 契约

| 通道 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `ql_list` | — | `QuickLaunchList` | §5.2 的宽松加载 |
| `ql_save` | `id: string \| null, entry: QuickLaunchEntry` | `string`（最终 id） | `id === null` → 生成新 id；校验见 §5.3 |
| `ql_delete` | `id: string` | `void` | 不存在 → `VALIDATION:` |
| `ql_terminals` | — | `TerminalInfo[]` | §6.1，每次实时探测 |
| `ql_start` | `id: string` | `{ tabId: string \| null }` | §7.4 |
| `ql_stop` | `id: string` | `void` | 幂等：未运行 → 直接返回 |
| `ql_states` | — | `Record<string, { running: boolean; stopping: boolean }>` | 窗口重载复原 |
| `ql_pick_exe` | — | `string \| null` | 对话框过滤 `[{ name: t('ql.dialog.filterExe'), extensions: ['exe'] }]`；取消/无窗口 → `null` |

事件（主进程 → 渲染端）：

| 事件 | 载荷 |
|---|---|
| `ql-log` | `{ tabId: string; line: string; stream: 'out' \| 'err' }` |
| `ql-exit` | `{ configId: string; code: number }` |

`preload.ts` 增加 `onQlLog` / `onQlExit` 与上述 invoke 白名单；`src/ipc.ts` 增加同名封装与类型导出。

## 9 渲染端

### 9.1 日志页签动态化

- `src/modules/log-tabs.ts`：`LogTabId` 由字面量联合改为 `string`；保留 `LOG_TABS`（静态两项）并导出 `QL_TAB_PREFIX = 'ql:'` 与 `qlTabId(configId)`。
- `App.vue`：
  - `logBuckets` 改为 `Record<string, LogEntry[]>`，新增 `qlTabs = ref<{ id: string; configId: string }[]>([])`。
  - `log-line` 载荷新增可选 `tabId`：**有 `tabId` 时只写该桶**（不再走 `sys→launcher / out/err→llama-server` 的硬编码路由）；桶不存在则忽略该行（防竞态）。无 `tabId` 时行为完全不变。
  - 桶与页签在 `ql_start` 返回后创建（主进程在订阅日志**之后**才返回，故顺序安全）。
- `LogPanel.vue`：改为接收 `tabs` 列表（静态 + 动态）；动态页签渲染右上角 `[x]`；`@close` 冒泡给 App（App 删页签 + 删桶）；页签条改横向滚动（见 §11.2）。
- 页签显示名 = 配置名经 `truncateByWidth(name, 16)`；`data-tooltip` 带全名（仅实际截断时，与模板卡 grace=2 规则一致）。
- 点 `[启动]`（shell 类型）→ 建页签（若不存在）+ **自动激活该页签**（用户确认）。
- 页签关闭：该配置 `running || stopping` 时 `[x]` 禁用并 tooltip「请先停止」；点击存活页签 → 删页签 + 删桶。

### 9.2 卡片 `src/modules/QuickLaunch.vue`

- props：无（自持配置列表，`onMounted` 拉 `ql_list`）；emit：无（内部直接 invoke）。
- 状态：`configs` / `invalid` / `error` / `states: Record<string, {running, stopping}>` / `modalOpen` / `editingId` / `copying`。
- 行渲染：
  - 名字：`truncateByWidth(name, 30)` + 长名 tooltip（fixed 浮层，避开列表裁切，样式复用 `.tpl-tip`）；
  - `[复制]`：`ql_save(null, {...src, name: nextCopyName(src.name, taken)})`，成功后本地按插入序插到源行之后；
  - `[编辑]`：开弹窗（编辑态）；
  - `[启动/停止]`：未运行 = `.btn-launch` 紫底 rocket 图标；运行中 = `.btn-danger` 红底 stop 图标；`stopping` = 红底 `...` 禁用。点击 → `ql_start` / `ql_stop`。
- 空列表提示、无效条目提示、错误区（`.error-text`）与模板卡同款。
- 订阅 `onQlExit` → 把该配置置回未运行；订阅 `onQlLog` 由 App 统一处理（卡片不碰日志）。
- 运行中的配置点 `[删除]`（弹窗内）→ 错误「请先停止该启动」，不动进程。

### 9.3 弹窗 `src/modules/QuickLaunchModal.vue`

props：`open`、`id`（空串 = 新建）、`entry`（编辑时的条目副本）；emits：`saved` / `deleted` / `close`。结构照搬 `TemplateModal`（同一套遮罩/头部/footer 类名）：

1. 第 1 行：`名字` 输入框 + 类型 `Dropdown`（**复用现有 `src/components/Dropdown.vue`**，两项都列出、当前项高亮）。
2. 类型 = 命令行：终端 `Dropdown`（打开弹窗时拉 `ql_terminals`，加载中禁用并显示「检测中…」）+ 命令文本输入框（多行 `textarea`，样式与 `.input` 同族）。
3. 类型 = 可执行程序：`.exe` 路径输入框 + 文件夹图标按钮（调 `ql_pick_exe`，样式同模板弹窗的文件选择按钮）。
4. footer：左侧 `[删除]`（仅编辑态，`.btn-delete`）+ 右侧紫色保存图标按钮（`.modal-save`）。
5. `[删除]` → `ConfirmDialog`（`tone="danger"`）二次确认，确认才 `ql_delete`；失败留在弹窗错误区。
6. 保存：名字空 → 错误「请输入名字」；主进程重名 `VALIDATION:` → 错误区显示「名字已存在」；成功 `emit('saved')`。

### 9.4 卡片与页签的状态同步

页签名从配置列表派生（`ql_list` 结果），因此**编辑改名后页签名自动更新**，无需额外同步逻辑。

## 10 i18n

- 渲染端词条前缀 `ql.`（标题、按钮、空态、弹窗字段、终端标签 `ql.term.pwsh|powershell|cmd|wsl`、tooltip、页签关闭、错误文案）；
- 主进程错误词条前缀 `err.ql.`；`src-main/i18n/no-hardcoded.test.ts` 与 `key-coverage.test.ts` 是硬门，中英两份都要有。

## 11 两个已知问题的解法

### 11.1 超长配置名（用户问题 1）

复用 `src/util/truncate.ts` 的 `truncateByWidth`：页签预算 **16**、列表行预算 **30**（与模板卡同源，CJK 算 2 宽 / 拉丁算 1 宽），只在真实超出预算 + grace(2) 时才截断并加 `…`；长名 hover 弹全名 tooltip（fixed 浮层，避开容器裁切）。

### 11.2 页签过多溢出（用户问题 2）

`.tab-bar` 改横向滚动（`overflow-x: auto; flex-wrap: nowrap`，复用现有细滚动条样式 `--sb-w` 与 thumb 变量），页签**不被压扁**；切换激活页签时对激活项调用 `scrollIntoView({ inline: 'nearest' })` 保证可见。

## 12 测试策略

单元（vitest，与既有测试同风格）：

1. `LineDecoder`：UTF-8/GBK 各自解码；**多字节字符被 chunk 切断**时不产生 U+FFFD；`\r\n` 与 `\n` 都切行；最后一行无换行符时 `push` 不吐、`flush` 吐出；纯空行被丢弃。
2. `quick-launch-config`：缺失/空文件 → 空表；YAML 坏 → `YAML:`；非法条目进 `invalid` 且不阻断其余条目；`name` 空/超长/重名 → `VALIDATION:`；shell 类型缺 `cmd` → `VALIDATION:`；保存后 yaml 只含该类型字段；id 前缀为 `ql` 且不与现有碰撞。
3. `copy-name`：`X` → `X - copy` → `X - copy 2`；源名已是 `X - copy` 时剥后缀重算。
4. 终端探测：`wsl -l -q` 的 **UTF-16LE 输出解析**（纯函数），空输出 → 不可用。
5. 组件：`QuickLaunchModal`（类型切换字段显隐、名字空校验、重名错误展示、删除二次确认、运行中删除被拒）；`QuickLaunch`（空列表、行按钮三态、复制插入位置、`ql-exit` 后回落）。
6. `LogPanel`：动态页签渲染、`[x]` 仅在存活时可用、关闭事件冒泡；静态页签行为不变（既有 `LogPanel.test.ts` 继续通过）。

集成（真机，手动执行并记录输出）：

- 三种终端各跑一条中文输出命令行 → 日志区不乱码；
- `cmd /c "ping -n 60 127.0.0.1"` 启动 → 停止 → `tasklist` 确认子进程消失（进程树被杀）；
- exe 类型启动一个真程序 → 无页签、退出后行按钮回落；
- 页签溢出（建 8 条命令行并启动）→ 横向滚动可用、激活页签可见；
- 超长名字 → 列表与页签截断 + tooltip 全名。

## 13 风险与未验证项（实现阶段必须显式标注，不得声称已验收）

1. **WSL 未实测**：本机无发行版。探测解析与启动参数按规格实现 + 单测覆盖，**真机验收推迟到用户安装发行版之后**。
2. **非 936 的 OEM 代码页**：cmd 解码回落 UTF-8，非中文系统的 cmd 本地字符输出仍可能乱码；本期接受，规格不承诺。
3. **命令文本的引号语义**：整条命令作为单个 argv 传给终端宿主，宿主自己的解析规则（如 `cmd /c` 的引号剥离规则）仍然生效；规格只承诺「命令原样传入」，不承诺跨终端的引号等价。
4. **`windowsHide: true` 与 GUI 程序**：exe 类型若为 GUI 程序不受影响；若为控制台程序且需要交互输入，本期不支持（日志区不可输入）。
5. **停止 = 杀进程树**：`taskkill /T /F` 会连带杀掉目标进程的所有子进程；用户若启动的是「启动器壳 + 真实服务」，服务会一并被杀——这是用户已确认的语义。
