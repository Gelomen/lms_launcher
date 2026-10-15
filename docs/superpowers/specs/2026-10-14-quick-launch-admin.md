# 快捷启动启动项的「管理员」开关 设计规格

> 规格即真相源（AGENTS.md「术语」SDD）。实现、验收、偏离处理都以本文为准；代码领先规格不算进步。
> 分支：`feat/quick-launch-admin`（自 `feat/quick-launch` @ `b8dbdc0`）。
> 用户原话（逐字）：「[快捷启动] 卡片的 [新建/编辑启动项] 弹窗 — 类型为 [命令行] 时, [终端] 下拉菜单的 右边 添加 [管理员权限] checkbox；类型为 [可执行程序] 时, [程序路径] 上方添加 [管理员权限] checkbox；勾选 [管理员权限] checkbox, 启动命令或应用程序, 都以管理员权限方式启动」
> 用户澄清（逐字）：「你理解应该错了, 是 [终端] 那一行分为两列, 左列是 [终端] 和它的下拉, 右边是 [管理员] 开关」
> 前置规格：`docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md`（exe 类型走 ShellExecuteEx，本文在其上扩展）

## 1 需求

`[新建/编辑启动项]` 弹窗（`src/modules/QuickLaunchModal.vue`）增加一个「管理员」开关：

- 类型 = **命令行**：开关在「终端」那一行的**右段**（同一行分两段：左 = 「终端」标签 + 下拉，右 = 「管理员」标签 + 开关）。
- 类型 = **可执行程序**：开关在「程序路径」**上方新增一行**（左列 = 「管理员」标签，右列 = 开关）。
- 开关为开：该条目以**管理员权限**（UAC 提权）启动——命令行类型 = 那个终端进程树提权，可执行程序类型 = 那个程序提权。
- 开关为关 / 老配置里没有这个字段：与今天的行为逐字节一致。

## 2 根因与约束（为什么不能就地提权）

1. `child_process.spawn` → `CreateProcessW`，**不做 UAC 提权**：manifest 为 `requireAdministrator` 的 exe 直接被拒（`ERROR_ELEVATION_REQUIRED` → libuv `EACCES`），且不弹 UAC。提权是 Shell 的能力 → 必须 `ShellExecuteExW(lpVerb="runas")`。（前置规格 §2 已取证，本文沿用。）
2. **ConPTY 不能提权**：今天的终端由本进程（Medium IL）内的 `node-pty` 直接创建（`src-main/quick-launch.ts:153-163`）。提权只能由 Shell 创建**新进程**，本进程里的 PTY 无法「变成」提权 PTY。所以提权终端必须把 PTY 挪到一个**被提权的宿主进程**里，由它把 I/O 转回来。
3. **提权进程不继承调用方的环境块**（本文新取证，§3-P2）：`runas` 由 AppInfo 服务用目标令牌的新环境块创建进程。因此「临时往 `process.env` 注入 `ELECTRON_RUN_AS_NODE` 再提权」这条路**不成立**——它正是 grill-me 阶段选定的机制，被实测否决 → 改 §6.4。
4. **跨完整性级别的命名管道**：管道由本进程（Medium IL）创建、被提权进程（High IL）连接。默认 DACL 不够，必须显式 SDDL；反向（Medium 写 High 的对象）会被 ML 策略挡，所以**服务端必须是本进程**。§3-P4/P10 实测成立。
5. 本实现环境（DSH Windows 沙箱）**不能开命名管道** → ConPTY / node-pty 的 `spawn` 在此环境必然失败（`EPERM ... conpty-*-in`）。这不是设计缺陷，是环境限制；PTY 段只能真机验收（§7.2）。

## 3 现状取证（本机实测 2026-10-14，探针在 `.temp/ql-admin-probe/`，gitignore 内）

| 编号 | 探针 | 结论（真实输出摘录） |
|---|---|---|
| P1 | `probe3.mjs`（不提权） | `ShellExecuteEx` 起 `cmd.exe`，子进程回显调用方临时设的变量 → 文件内容 `[env-inherited-ok]`：**不提权时环境块继承** |
| P2 | `probe3.mjs runas` | 同一命令，文件内容 = 字面量 `[%LMS_PROBE_ENV%]`（cmd 没展开）→ **提权时环境块不继承**。这是 §2-3 的依据 |
| P3 | 在 `electron.exe` 二进制内检索 | `ELECTRON_RUN_AS_NODE` 存在；`--ms-enable-electron-run-as-node` 开关**不存在**（Electron 28.3.3）→ 没有命令行等价物 |
| P4 | `probe5.mjs` A 段 | `cmd /d /c "set ELECTRON_RUN_AS_NODE=1&& <exe> <脚本>"` → 子进程 `runAsNodeEnv:"1"`、退出码 7：**cmd 包装能设环境变量**（备选机制，未采用） |
| P5 | `probe5.mjs` B 段 | 把 `electron.exe` **硬链接**成同目录 `node.exe` → 子进程跑成纯 Node（`versions{node:18.18.2,electron:28.3.3}`）、`consoleWindow:null`。**结论已于 2026-10-15 被 P13 证伪**：那条链路之所以进 Node 模式，是**环境里存在 `ELECTRON_RUN_AS_NODE=1`**（本会话预置，且 `probe1.mjs:58` / `probe2.mjs:53` 自己显式设过），**与文件名无关**。原文：**Electron 按可执行文件名进 Node 模式，不需要环境变量** |
| P6 | `probe6.mjs`（不提权） | `ShellExecuteEx`（`lpVerb=null`）起硬链接 `node.exe` + 脚本参数 → `exitCode=7`、管道读到 `PIPE-TOKEN-OK`：经 Shell 起宿主这条路径本身成立 |
| P7 | `probe6.mjs runas` | `exitCode=2147483651`（`0x80000003 STATUS_BREAKPOINT`）；结果文件停在 `TokenElevation` 之后、无 `ptyError` → **崩在 node-pty 的 spawn 那一步**（本沙箱禁命名管道），不是提权失败 |
| P8 | `probe7.mjs runas`（摘掉 `pty.spawn`，只 `require`） | `exitCode=7`、`TokenElevation.value=1`（**确实提权**）、`runAsNodeEnv:null`（靠文件名进 Node 模式，不依赖环境块）、`koffi-ok`、`ptyRequire:"ok"`（插件加载成功）、`pipe:"written"` 且父进程读到 `PIPE-TOKEN-OK` → **提权 + 纯 Node 宿主 + 连本进程的管道** 三段全部成立 |
| P9 | `probe8.mjs` | `@electron/asar` 打包后，硬链接 `node.exe` 执行 **asar 内**的脚本 → `ran:true`、退出码 9 → 宿主脚本可以留在 `app.asar/dist-main/` 内，不需要 extraFile |
| P10 | `probe9.mjs` | 本进程建管道服务端（SDDL `D:(A;;GA;;;WD)` + `PIPE_ACCESS_DUPLEX`）→ 子进程用 `net.connect` 连上（61ms）→ 帧往返 `HELLO→READY+DATA`、`WRITE→echo:ls`、`STOP→EXIT{code:0}`，子进程退出码 7；读侧 `PeekNamedPipe` 轮询 + `ReadFile`，写侧 `WriteFile`（`written=113 lastErr=0`）→ **§6.5 的传输设计整体成立** |
| P11 | `probe6/7 runas` 计时 | `ShellExecuteEx(runas)` 调用本身 **5.7–5.9s**（不提权 44ms）→ 提权启动同步阻塞主进程，与前置规格 §6.9 已接受的口径同量级（§8-K14） |
| P13 | 主代理 A/B 对照（2026-10-15，`dist-release\win-unpacked\node.exe` + 探针脚本写标记文件） | **带 `ELECTRON_RUN_AS_NODE=1` → 标记文件出现（真 Node 模式）；删掉该变量 → 标记文件不出现、进程 5s 后仍活着（= 应用模式，脚本根本没跑）**。三次独立观测一致：本机 A/B 各两次 + 用户真机 2026-10-15 18:4x（`.\node.exe "resources\app.asar\dist-main\ql-pty-host.js" …` **把应用启动了**，日志里是应用自己的 `get_configs` IPC 报错）。**Electron 28.3.3 只认环境变量，文件名不起作用**；而提权不继承环境块（P2）、`ShellExecuteEx` 无环境块参数、P3 证无命令行等价开关 → 原机制在真机上必然退化成「又起一遍应用」→ 宿主永不连管道 → `handshake=exit(code=0)`。**R-19 / K59/K60 的依据** |
| P14 | 主代理 D6 本地门（2026-10-15 19:5x-20:1x，打包产物 `dist-release\win-unpacked`，非提权；脚本 `.temp/ql-admin-probe/d6-*.ps1`、`probe-entry.js`、`real-pipe-run2.ps1`） | ① **命令行开关这条路不成立**：`lms_launcher.exe --ql-pty-host …` → `lms_launcher.exe: bad option: --ql-pty-host`、**退出码 9**（Electron 主进程在跑任何应用代码之前先过 Node 的命令行解析器，未知 `--x` 直接拒绝）；`--ql-pty-host=<值>` 同样被拒；`-- --ql-pty-host …` 与裸位置参数 `ql-pty-host …` 都被 Electron 当成**应用入口路径**去 require → `Cannot find module 'D:\Dev\Projects\lms_launcher\ql-pty-host'`、退出码 1。② **成立的是「应用入口参数」**：`lms_launcher.exe "<…\resources\app.asar\dist-main\ql-pty-host.js>" "\\.\pipe\x" tok` → **退出码 3**（= §6.6-10 的管道失败码）、stderr 空；同一形状换成探针入口脚本 → `process.argv = [exe, 入口, 管道名, token]`、`process.defaultApp` 不存在、`versions{node:18.18.2,electron:28.3.3}`。③ **端到端**：真实命名管道（`winPipe` 服务端）+ 打包 exe 当宿主 → 服务端 `serverHandle=true`、客户端**活着等 HELLO**（说明 `@lydell/node-pty` 已加载、`net.connect` 已成功）；管道不存在时同一形状**立刻退 3**。④ 对照：不带任何参数 → 退出码 0、无 stderr（排除「沙箱起不来」）。→ **R-21 / K61 的依据**（`boot.ts` / `parseHostMode` / 改 `package.json` 的 `main` 全部不需要） **已于 2026-10-15 21:1x 更正（索引 K64）：这三条都是在会话预置的 `ELECTRON_RUN_AS_NODE=1` 下跑的 = Node 模式。`bad option:` 是 Node 的未知参数格式（外部两份来源都写明它是「这个二进制在当 Node 跑」的标志），不是 Electron app 模式的行为；② 的 exit 3 是 Node 把第一个位置参数当脚本。app 模式在本会话起不来：删掉该变量后带不带参数都在启动瞬间退出 `0x80000003`** |
| P15 | **用户真机（2026-10-15 21:2x，打包产物 `dist-release\\win-unpacked`，第二轮 R-21 的代码）**：[快捷启动] 里类型 [命令行] + 勾选 [管理员权限] | UAC 弹窗出现（标题是应用自己）、点 [是] → **日志区没有页签**，日志一行 `[lms_launcher] PROC: pwsh.exe 终端启动失败: handshake=exit(code=0)`。含义链完整：提权子进程 = 应用 exe（app 模式）→ 它**接受**了那个位置参数（没有 `bad option`、没有报错框）→ 但**打包布局里没有解析位置参数的代码**：那段逻辑只在 `default_app.asar/main.js` 里（`for (const arg of argv)` → `option.file` → `loadApplicationPackage()` → `process.defaultApp = true` → `app.setAppPath()` → `import(filePath)`），而实测 `node_modules\\electron\\dist\\resources\\` 有 `default_app.asar`（108901 字节）、`win-unpacked\\resources\\` 只有 `app.asar` / `app.asar.unpacked` / `icon.ico` → 应用又起一遍 → 撞单实例锁 → **退出码 0** → 主进程看到 `handshake=exit(code=0)`。与 P13 硬链接机制的真机现象**同形同因**。同时它也正面证明：**app 模式下未知参数不被告拒、原样进 `process.argv`**（那条命令带位置参数没有任何 CLI 报错，应用一直跑到单实例锁）—— 这就是 §6.4 R-23 开关形状所依赖的性质 |
| P12 | 非提权对照 | `ConvertSDDL ok=true size=48`、`sizeof(SA)=24`、`sizeof(SE)=112`；管道读到 `lastErr=109`（`ERROR_BROKEN_PIPE`）收尾；`GetExitCodeProcess` 读到子进程 `process.exit(7)` 的 7 |

**仍未验证（只能真机）**：`pty.spawn` 在提权宿主里创建 ConPTY（P7 表明本环境必失败）；提权宿主里 `require('@lydell/node-pty')` 能否解析到 `app.asar.unpacked` 的原生模块（P8 只证到 `require` 成功，且是 dev 布局）；真机上「无黑窗口」。`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1–E7 六行至今未勾，本文 §7.2 在同一次构建里一并跑掉（§8-K11）。

## 4 目标

1. 弹窗两态都能设「管理员」，值随条目持久化到 `quick_launch.yaml`，编辑时回填。
2. 勾选后：命令行类型 = 终端进程树以管理员权限运行，**终端页签的全部能力不变**（输入、尺寸、[停止]、退出、自动命令）；可执行程序类型 = 该程序以管理员权限运行。
3. 用户在 UAC 点「否 / 取消」→ 该行按钮回落 + 日志给出原因（复用既有文案）。
4. 不勾选的路径**行为逐字节不变**（含 exe 走 `lpVerb=null` 的前置规格 §6.1 口径）。

## 5 非目标

- 不给启动项加「启动参数 / 工作目录 / 运行模式」等其它字段（前置规格 §5 同口径）。
- 卡片列表行**不加**「已提权」标记（§8-K6）。
- 不检测「应用自身是否已提权」、不为 WSL 特判（§8-K9）。
- 不把提权启动挪到 `worker_threads`（§8-K14）。
- 不新增词典键，除 `ql.modal.admin` 一个（§8-K3 / K7）。
- 不改 `src-main/process.ts`，不改 llama-server 的启动路径。
- 不做「以标准用户身份运行」（反向降权）。

## 6 设计

### 6.1 数据层：`admin` 字段（`src-main/quick-launch-config.ts`）

- `QuickLaunchEntry`（`:14`）加可选字段 `admin?: boolean`。**类型上可选**，是为了不破坏既有测试夹具（`src/modules/QuickLaunchModal.test.ts:29` 等）与旧配置文件；**落盘时总是显式写** `admin: true|false`（§8-K4）。
- `normalizeEntry`（`:63-80`）两个分支的返回对象字面量（`:72` / `:77`）加 `admin: e['admin'] === true` —— 只有字面量 `true` 算真，其它任何值（`'yes'` / `1` / 缺字段）规整为 `false`。
- `validateEntry`（`:84-103`）两个分支的返回对象字面量（`:95` / `:100`）加 `admin: e.admin === true`。因为 `qlSave`（`:138`）把 `clean` 整个写回 yaml，这就是「总是显式写」的实现点。
- 不新增校验规则：`admin` 不参与 `VALIDATION:`（它没有非法取值，只有非真即假）。

### 6.2 渲染端：两态布局与词典键（`src/modules/QuickLaunchModal.vue`）

- 表单状态：加 `formAdmin = ref(false)`；`fill()`（`:106-117`）回填 `formAdmin.value = e?.admin === true`；`save()`（`:149-168`）两个 payload 字面量（`:157` / `:158`）都带 `admin: formAdmin.value`。
- 控件 = `.bool-switch` 切换开关，**markup 与样式照抄** `src/modules/TemplateModal.vue:398-406`（`role="switch"` + `aria-checked` + `.bool-switch__knob`）与 `:567-588`（样式）。样式**复制**进本组件的 `<style scoped>`，不提到 `src/style.css`（§8-K15：避免把改动半径扩到 TemplateModal 与其样式断言；重复登记为已接受的技术债）。
- **命令行态**（`<template v-if="formType === 'shell'">`，`:229-245`）：把现在的「终端 label + `.dropdown`」两格改成「终端 label + 一个控件格」，控件格内部是 `.row-cell`：`.dropdown.term-field`（`flex:1 1 auto; min-width:0`）+ `<label>`「管理员」+ `.switch-cell` 开关。网格仍是 2 列、**行数仍 3**。
- **可执行程序态**（`:248-261`）：在「程序路径」那一行**之前**插入一行：`<label class="label flag-label admin-label">` + 控件格（`.field-cell > .row-cell > .switch-cell`）。行数 2 → **3**。
- 控件格一律用**已被测试计数器认识的类** `.field-cell`（`src/modules/QuickLaunchModal.test.ts:681-683` 的 `controlCells` 过滤器数 `.field-cell / .dropdown / .name-cell`）：命令行态仍数到 3，可执行程序态从 2 变 3 → **两态都是 3 行控件**，`min-height: 218px`（`:307`）的推导（`:291-303` 注释）在两态同时成立，可执行程序态原本 38px 的留白被这一行填掉。
- 标签宽度：`.flag-grid`（`:356-362`）左列是 `auto`，最宽标签仍是「程序路径」4 字；「管理员」3 字**不会**加宽左列。命令行态那个「管理员」标签在控件格内部，不参与网格列宽。
- 词典：只加 `ql.modal.admin` —— zh 插在 `src-main/i18n/dict.ts:176`（`ql.modal.exe`）之后，en 插在 `:519` 之后。zh = `管理员`，en = `Admin`（§8-K7：早前「以管理员身份运行」措辞作废）。

### 6.3 提权终端的总体形态（选项 3：提权 PTY 宿主）

`admin` 为真的命令行条目，PTY 不在本进程创建，而在一个**被提权的宿主进程**里创建；本进程与宿主之间走一条命名管道。终端页签的输入、尺寸、输出、退出、[停止]、自动命令全部经这条管道转发，因此**页签保真度与非提权路径一致**（§8-K1）。

`@
主进程（Medium IL）                          提权宿主（High IL，纯 Node）
  QuickLaunchManager ── ShellProcess 接口 ───┐
  ElevatedPtyProcess（新）                   │
    ├ 命名管道服务端（SDDL, duplex）◄────────┤ 宿主以 net.connect 连入
    ├ ShellExecuteExW(runas) ───────────────►└ pty.spawn(终端) → 转发 DATA/EXIT
`@

三个新模块（`src-main/`）：

| 文件 | 职责 | 依赖 |
|---|---|---|
| `ql-host-protocol.ts` | 帧编解码 + 类型常量，纯函数 | 无 Win32 |
| `boot.ts` | 应用入口分流：`--ql-host` 在 argv 里 → 宿主分支；否则 → `require('./main.js')`（R-23 / K65） | 无（只 `require` 两个入口） |
| `ql-pty-host.ts` | 宿主进程入口（**由 `boot.js` 的宿主分支执行**，R-23；dev 下也可被 `require.main === module` 直接跑） | `net`、`@lydell/node-pty`、`./quick-launch` 的 `shellExe` |
| `ql-elevated.ts` | 主进程侧：管道服务端 + 起宿主 + `ElevatedPtyProcess` | `koffi`、`./shell-execute` 的 `WinShellApi` |

### 6.4 宿主进程怎么起（裁决 **R-23** / 索引 **K65**，2026-10-15 第三次机制修正：R-19 的形状恢复，R-21 作废）

> **两条已否掉的机制，证据都在 §3**：
> - **硬链接 `node.exe`（R-16 / K55）作废** —— P13：Electron 28.3.3 只认 `ELECTRON_RUN_AS_NODE` 环境变量，文件名不起作用；提权进程不继承环境块（P2）、`ShellExecuteEx` 无环境块参数、P3 证没有命令行等价开关 → 那个 `node.exe` 在真机永远是 app 模式，把应用又起一遍、退出 0。
> - **「应用入口参数」（R-21 / K61-K62）作废** —— P15（用户真机）+ K64 的结构性证据：把命令行里的路径当应用入口的代码只在 `default_app.asar/main.js` 里，打包产物的 `resources\\` 里没有 `default_app.asar`。
> - **R-19 当初被打回的理由不成立** —— P14 的 `bad option: --ql-pty-host`（exit 9）是 **Node 模式**的现象（会话预置 `ELECTRON_RUN_AS_NODE=1`，见 K64 ①③）；app 模式在本会话起不来（`0x80000003`，K64 ④）→ 这条门**本机跑不了**，只能真机跑。

1. **入口分流：`package.json` 的 `main` = `dist-main/boot.js`**，`boot.ts` 只做一件事：`process.argv` 里有 `--ql-host` → 走宿主分支（`require('./ql-pty-host.js')` 的 `main()`）；否则 → `require('./main.js')`。分流必须在**取单实例锁之前** —— `main.ts` 不加载就不会撞锁（P15 里第二个实例正是撞锁退出 `0`）。
2. **宿主进程 = 本应用自己的 exe**（`process.execPath`）：`shellExecute(runas, process.execPath, SW_HIDE, parameters)`，其中 `parameters = '--ql-host "<管道名>" "<token>"'`。P15 正面证明 app 模式不拒绝未知参数（带位置参数没有任何 CLI 报错，一直跑到单实例锁），开关原样进 `process.argv` 由 `boot.js` 读。
3. **两个接缝保留**（R-21 的这一段仍成立，K60 修订）：`hostExePath()` 恒等 `process.execPath`（dev / 打包同一条式子，**没有** `process.defaultApp` 分支）、`hostScriptPath() = path.join(__dirname, 'ql-pty-host.js')`。**硬链接一族仍退场**：`resolveHostLink` / `HOST_EXE_NAME` / `errnoOf` / `HostPaths.hostDir` / `hostlink=` 全部删除，`build.bat` 不再有预建步骤（R-16 / K55 作废）。
4. **`ql-pty-host.ts` 的 argv 形状改为 `--ql-host <管道名> <token>`**：`runHost` 从 `process.argv` 里取 `--ql-host` 之后的两个参数；任务 5 的 `require.main === module` 自动入口保留（dev 与单测直接跑脚本时用）。
5. **`main.ts` 的代码一字不改**（只允许 check 表 C7 ② 那 4 处注释，R-22 / K63）：既有的单实例锁、托盘、窗口逻辑都不动 —— 宿主分支根本不加载它。
6. **argv 只带管道名与 token**（K2 不变），终端 id / 尺寸 / cwd 一律在首帧 `HELLO` 里传。
7. **代价（明说，K12 的修订仍成立）**：宿主是一个 **Electron 进程**，入口 `boot.js` 走宿主分支 → 不建窗口、不加载渲染进程、不跑应用逻辑、不取单实例锁。比纯 Node 大一些，但三条硬约束（提权不继承环境块 + Electron 只认环境变量 + 不额外打包 exe、不用 cmd 包装）下没有更轻的路。
8. **收益**：UAC 弹窗显示应用自己（「LMS 启动器」）；进程树只有一层；「建链接失败 / size 不匹配 / 用户自己放了 `node.exe` / 换目录 `STATUS_DLL_NOT_FOUND`」一族风险消失。
9. **验收门改到真机**（K64 ④：本会话起不了 app 模式，`0x80000003`）：D6 不再是本地门，改为 §7.2 的真机条目 —— 勾选 [管理员权限] 的 [命令行] 项**出页签**、UAC 标题是「LMS 启动器」、日志里不出现宿主 exe 名。

### 6.5 命名管道与帧协议

**管道**（主进程侧，koffi）：

- 名字 `\\.\pipe\lms-ql-<8 位随机>`，每实例一条；`CreateNamedPipeW(dwOpenMode = PIPE_ACCESS_DUPLEX(3), dwPipeMode = 0, nMaxInstances = 1, 64KiB × 2, nDefaultTimeOut = 0)`。
- **必须显式 SDDL**：`ConvertStringSecurityDescriptorToSecurityDescriptorW("D:(A;;GA;;;WD)", 1)` → `SECURITY_ATTRIBUTES{ bInheritHandle = 0 }`。依据 P10/P12：不给 SD，提权客户端连不上（前置规格 E13 已证 `sizeof(SA)=24`、`sizeof(SE)=112`）。
- **连接等待必须非阻塞且有界**（裁决 **R-17** / 索引 **K56**，2026-10-15 真机缺陷）。服务端**不得**用阻塞的 `ConnectNamedPipe(h, null)` 去等连接：阻塞句柄上它要等到客户端连上才返回，写在它外面的超时判定**永远不可达**，真机表现为**应用永久卡死无响应**（用户 2026-10-15 18:0x 回报：类型 [命令行] + 管理员，UAC 点「是」后不出页签、应用无响应）。改成 `CONNECT_POLL_MS = 50` 的异步轮询：
  - `PeekNamedPipe` 成功（`available() >= 0`）= 客户端已连上。主代理 probe 实测：未连时 `available() = -1` 且 `lastError = 230`（`ERROR_PIPE_NOT_CONNECTED`）；客户端一连上立刻拿到可读字节（本机 35ms 检出）；期间**读写都不需要先调 `ConnectNamedPipe`**（probe 里 `ReadFile` 读到客户端发的 `PING`、`WriteFile` 回 `PONG` 成功）。
  - 连上后**补一次 `ConnectNamedPipe`**：此时客户端已在，立即返回 `ERROR_PIPE_CONNECTED = 535`（probe 实测 535），既有「535 也算成功」的判定不变。
  - 到 `HOST_HANDSHAKE_TIMEOUT_MS = 15000` 仍未连上 → 抛 `handshake=connect`（§6.7 / §6.10）。
  - 轮询期间**同时**判宿主进程是否已退出（§6.7）：已退出立即抛 `handshake=exit(code=N)`，不等满 15s、不再盲等。
- **读**：`PeekNamedPipe` 判可读字节数 → `ReadFile` 读出来喂给帧解析器；定时器 `POLL_READ_MS = 20`。不用阻塞 `ReadFile`：那会把主线程卡住（前置规格 §6.9 的「不卡死」口径）。写侧 `WriteFile` 直接写（形参声明成 `uint8 *` 传 Buffer；P10 里 `lastErr=998` 就是传错缓冲区 marshalling 的现象）。
- 断开：`ReadFile` 返回 `ERROR_BROKEN_PIPE(109)`（P12）→ 停止轮询、按 §6.7 的退出路径收尾。

**帧**（`ql-host-protocol.ts`，单条双工管道复用）：

`@
type: u8 | len: u32LE | payload: len 字节（JSON 或 UTF-8 文本；DATA 的 payload 是终端原始字节）
`@

| 方向 | type | payload |
|---|---|---|
| 主进程 → 宿主 | `HELLO = 0x01` | `{ token, shell, cols, rows, cwd }` |
| 主进程 → 宿主 | `WRITE = 0x02` | 键盘输入原文 |
| 主进程 → 宿主 | `RESIZE = 0x03` | `{ cols, rows }` |
| 主进程 → 宿主 | `STOP = 0x04` | `{ timeoutSecs }` |
| 宿主 → 主进程 | `READY = 0x81` | `{ hostPid, shellPid }` |
| 宿主 → 主进程 | `DATA = 0x82` | 终端输出原始字节 |
| 宿主 → 主进程 | `EXIT = 0x83` | `{ code }` |
| 宿主 → 主进程 | `ERR = 0x84` | `{ stage, message }` |

高位 `0x80` 区分方向；解析器必须能处理**粘帧 / 半帧**（P10 子进程里的解析器就是这个形状，可直接照搬）。

### 6.6 宿主侧行为（`ql-pty-host.ts`，由应用 exe 的「应用入口参数」直接执行，§6.4-1 / R-21）

1. 连管道（`net.connect(pipeName)`，P10 证明可用）；`pipeName` / `token` = `process.argv.slice(2)` 的前两位（§6.4-1/5；P14 实测的 argv 就是这个形状，不需要任何归一化）。
2. 等 `HELLO`；`token` 不匹配 → 发 `ERR{stage:'token'}` 并 `process.exit(2)`。
3. `shellExe(shell)`（复用 `src-main/quick-launch.ts:146-150`，不复制映射表）→ `pty.spawn(exe, args, { name:'xterm-256color', cols, rows, cwd, env: process.env })`（选项与非提权路径 `quick-launch.ts:155-161` 逐字一致，包括**不传 encoding**）。
4. 成功 → 发 `READY`；失败 → 发 `ERR{stage:'spawn', message}` 并 `process.exit(1)`。
5. `onData` → `DATA` 帧；`onExit` → `EXIT{code}` 帧，然后 `process.exit(code)`。
6. `RESIZE` → `handle.resize`；`WRITE` → `handle.write`。
7. `STOP` → 复用 `PtyProcess.stopGraceful`（`quick-launch.ts:122-142`：`kill()` → 等 `timeoutSecs` → `taskkill /T /F`）。**在提权进程里 `taskkill` 能杀掉整棵提权进程树**（前置规格 E9 的反面：非提权进程杀不动提权进程，提权进程自己杀得动）。
8. 管道断开（主进程退出 / 崩溃）→ 视同 `STOP{timeoutSecs:3}`，不留孤儿 ConPTY。
9. 宿主**不 import `electron`**、不含汉字字面量（`src-main/i18n/no-hardcoded.test.ts:26-28` 扫全部 `src-main/*.ts`）；错误只报 `stage` + 原始 message，文案在主进程侧按词典生成。
10. 管道连不上 / 管道 `error` 事件（含第 1 步的 `connect` 之后立刻失败）→ 发 `ERR{stage:'pipe', message}`（发不出去也要试）并 `process.exit(3)`（**退出码 3**：裁决 **R-18** / 索引 **K57**，2026-10-15；原来与下面的「加载期崩溃」同为 1，主进程无法判别），**不带未处理的崩溃栈**（裁决 R-10 / 索引 K43，2026-10-15 00:1x：没有 `error` 监听时宿主会带栈崩掉，主进程收不到任何帧、退出码不可控）
11. **退出码分类**（R-18 / K57）：`2` = token 不匹配（第 2 条）；`1` = `spawn` 失败（第 4 条）；`3` = 管道连不上（第 10 条）；`4` = 宿主自身的未预期异常（第 12 条）。主进程把退出码并进失败文案（§6.10）——提权子进程能带回主进程的判别信息只有这几样。
12. **失败留痕**（R-18 / K57）：`main()` 外层 `try/catch` 兜住加载期 / 运行期未预期异常 → 记 `stage='fatal'` 后 `process.exit(4)`；**上述四类失败**都向 `path.join(os.tmpdir(), 'lms-ql-host.log')` **追加一行**（换行压成空格）：`<ISO 时间> pid=<pid> pipe=<管道名> stage=<stage> err=<原始 message>`；文件超过 64KiB 先清空再写。为什么必须有它：`ShellExecuteEx` 不给子进程 stdio，提权宿主**连不上管道时 `ERR` 帧也发不出去**，主进程只有这个文件能知道宿主侧发生了什么（2026-10-15 的真机故障正是卡在这里）。纯 ASCII、不含汉字（G6），只追加、不由本 feature 清理。。主进程侧按 §6.7 的 `ERR` 帧 / 断管路径处理。

### 6.7 主进程侧 `ElevatedPtyProcess`（`ql-elevated.ts`）

形状 = `ShellProcess`（`quick-launch.ts:175-182`）逐字：`write / resize / onData / onExit / isRunning / stopGraceful`。

- 构造即启动：建管道 → `shellExecute(..., {verb:'runas', ...})` → 等连接 → 发 `HELLO` → 等 `READY`（`HOST_HANDSHAKE_TIMEOUT_MS = 15000`）。失败按 §6.10 抛出，**抛出前关掉管道句柄与进程句柄**（不留泄漏）。
- **等待连接不得阻塞主线程**（R-17 / K56，§6.5）：50ms 异步轮询 `PeekNamedPipe`（`available() >= 0` = 已连；`-1` = 还没连上，继续等），连上后补一次 `ConnectNamedPipe`（535 算成功）。**每轮同时判宿主是否已退出**：给 `HostLauncher` 加两个成员 `isAlive(handle): boolean` / `exitCodeOf(handle): number`（实现直接转调注入的 `WinShellApi.isAlive/exitCodeOf`——进程句柄的生命周期本来就归 launcher），宿主已退出 → 立刻抛 `handshake=exit(code=N)`；到 15s 仍未连上 → `handshake=connect`。真机回报（2026-10-15 18:0x）：宿主没连上时主线程被阻塞的 `ConnectNamedPipe` 永久卡住，应用「无响应」——这就是本次缺陷的修复口径。
- 宿主进程句柄的生命周期复用 `ShellExecProcess`（`shell-execute.ts:124-185`）的 100ms 轮询判退出，不另写一套。
- `onExit`：优先用 `EXIT` 帧里的 `code`；宿主没发 `EXIT` 就死了（崩溃 / 被强杀）→ 用 `GetExitCodeProcess`（P12 实测能读到 `process.exit(7)` 的 7）。已退出再注册 → 立即补发（与 `quick-launch.ts:108-115` 同口径）。
- `stopGraceful(timeoutSecs)`：发 `STOP` → 等 `EXIT` / 宿主退出（上限 `timeoutSecs`）→ 仍活则委托给 `ShellExecProcess.stopGraceful`（`taskkill` 打宿主 → 失败则 `TerminateProcess` → 再等 1000ms 让退出落地）。**委托时传剩余预算**：`Math.max(0, timeoutSecs - 已等毫秒 / 1000)`（裁决 R-13，2026-10-15 13:5x，索引 K50）。理由：`ShellExecProcess.stopGraceful`（`shell-execute.ts:178-190`）自己也要等一个完整的 `timeoutSecs` 才 `TerminateProcess`，再等 `FORCE_EXIT_WAIT_MS = 1000`；传同值会把单实例上限变成 `2×timeoutSecs + 1s`，而 `stopAll` 是**逐个 `await`**（`quick-launch.ts:322-333`），`main.ts:382` / `:648` 传的是 `3` → N 个提权终端退出时最坏 `N×7s`。传剩余预算后总上限与非提权路径同形（`timeoutSecs + 1s`）。幂等。
- `stopAll`（应用退出）走同一条路 → 提权终端不会成为孤儿 ConPTY（前置规格 A2·I-3 的关切由「宿主自己杀树」承担）。

### 6.8 `QuickLaunchManager` 接线（`src-main/quick-launch.ts`）

- `QlDeps`（`:166-172`）加**必填**成员 `spawnElevatedShell(shell: TerminalId, cols: number, rows: number, cwd: string): Promise<ShellProcess>`。必填而非可选：可选会让「忘了接线」退化成静默降级（`main.ts:1009-1011` 的既有批评口径）。代价是 `src-main/quick-launch.test.ts:151-156` 的 `QlDeps` 夹具要补一个假实现——机械改动，写进任务 7。
- 加测试接缝 `protected async createElevatedShellProcess(shell, cols, rows, cwd)`，与既有 `createShellProcess`（`:223-225`）同一手法（C5 构造签名逐字不动）。
- `start()` 的 shell 分支（`:232-266`）：`e.admin === true` 时把 `this.createShellProcess(...)` 换成 `await this.createElevatedShellProcess(...)`；**其余全部不变**——`tabId`、`onData` 先转渲染端再放自动命令（`:249-253`）、`onExit` → `finalize`、`scheduleAutoCommand`（`:264`）、失败不残留状态（`:242-245`）逐条沿用。
- `write` / `resize` / `stop` / `stopAll` 不改：它们只认 `ShellProcess` 形状。

### 6.9 exe 类型的「管理员」

`launchShellExe`（`shell-execute.ts:191-201`）加第三参 `verb`：`admin === true` → `'runas'`，否则 `null`（前置规格 §6.1「唯一路径」+ E8「asInvoker 不多弹」不变）。`main.ts:1050-1072` 的 `spawnExeProcess` 从 `qlStartContextOrThrow(...)` 拿到当前条目的 `admin`（槽守卫 `main.ts:1082` 的接线不删），把 `verb` 传下去。失败分类不变（`1223` → `err.proc.uacCancelled`）。

### 6.10 失败分类与文案（§8-K3：零新键）

| 场景 | 抛出 |
|---|---|
| `ShellExecuteEx` 失败且 `win32 = 1223`（用户点「否 / 取消」） | `PROC: t('err.proc.uacCancelled', { exe })`，`{exe}` = **用户那一行的目标**：命令行类型取 `shellExe(shell).exe`（与 `quick-launch.ts:244` 的 `err.ql.ptySpawn` 同口径），可执行程序类型取 exe 路径。**绝不传宿主 exe** |
| `ShellExecuteEx` 其它失败 | `PROC: t('err.proc.spawnFail', { exe, err: 'win32=' + code })` |
| 建管道失败（`ConvertStringSecurityDescriptor…` 或 `CreateNamedPipeW`） | `PROC: t('err.proc.spawnFail', { exe, err: 'pipe=create' })` —— 裁决 R-08（2026-10-14 23:2x，索引 K37）：`WinPipeApi.createServer` 的返回类型（`unknown`）交不回错误码，且这条路径在 `nMaxInstances=1` + 每次新名字下近乎不可能；只报阶段、不报 win32 码，换掉 C1 的签名不值 |
| 宿主起来了但握手失败（`ERR` 帧 / 管道断 / 连接超时 / **宿主早退**） | `PROC: t('err.ql.ptySpawn', { exe, err })`；`{err}` 取既有词表（索引 K48：`host=<stage>` / `handshake=timeout\|broken\|connect`），**宿主早退时扩成 `handshake=exit(code=N)`**（R-18 / K57） |
| **（R-19 删除）** 原第三行「硬链接建不出来 / 已存在的 `node.exe` 不是我们的 → `hostlink=`」整族**随硬链接机制退场**；索引 K48 的 `{err}` 词表里 `hostlink=` 一并作废 | —— |
| 宿主早退后的留痕合并（R-18 / K57） | 抛 `handshake=exit` 前读 `%TEMP%\lms-ql-host.log` 的**最后一行**，仅当该行 `pipe=` 与本次管道名相同才采信，把它的 `stage=` / `err=` 并进**同一个 `{err}`**（因此仍然只有一行日志，R-15 / K53 不变）。文件不存在 / 无匹配行 → 只报退出码，不报错。**合并点在 `ElevatedPtyProcess` 内，`main.ts` 零改动**（索引 K57） |

日志通道与条数与非提权路径**完全一致**（§8-K10）：不新增「宿主已启动」之类的日志行。**精确化（裁决 R-15，2026-10-15 14:4x，索引 K53）**：这句约束的是**成功路径**——不得有「宿主已启动 / 管道已连 / 握手完成」这类信息性行。**失败原因行**按既有分工写一行：`main.ts:1069-1071` 的 exe 路径（前置 feature 2026-10-13 的既有行为）就是「`emitLog('[lms_launcher] ' + msg, 'sys')` 然后原样抛出」，提权 shell 的接线逐字对齐它——这是 §7.2-4 真机判据（「日志一行取消原因且带的是终端名不是宿主名」）的前提，不是新增通道。既有缺口登记为不在本期范围：非提权的 shell 启动失败今天**没有**原因行（`ql_start` handler 不 catch），修它会改动非提权行为（受 G3/G4 约束）。

### 6.11 打包与 `build.bat`

- 依赖不变：`koffi` / `@lydell/node-pty` 已在 `electron-builder.yml:18-21` 的 `asarUnpack` 里；宿主脚本随 `dist-main/**` 进 asar（`:7`），P9 证明可执行。**不新增依赖、不新增 extraFile。**
- **`build.bat` 不再需要任何预建步骤**（裁决 **R-19** / 索引 K60，2026-10-15）：R-16 加的那段硬链接块随 `node.exe` 机制整体退场，在任务 11 里删除；`build.bat` 回到「只 `npm run build` + `electron-builder`」。产物核对改为：`app.asar\dist-main\ql-pty-host.js` 在包里（它就是宿主的入口参数目标）、`app.asar.unpacked\` 里 koffi / node-pty 的原生模块在、**包内不再有 `node.exe`**（§7.2）。`package.json` 的 `main` 保持 `dist-main/main.js`（R-21：`boot.ts` 那套作废）。

## 7 验收

### 7.1 自动化（先红后绿）

- 配置层：`admin` 缺字段 → `false`；`admin: true` 往返；非布尔值规整为 `false`；保存后 yaml **显式含** `admin: false`。
- 帧协议：编解码往返、粘帧、半帧、未知 type 忽略。
- 提权 exe：`admin: true` → 假 `WinShellApi` 收到 `verb='runas'`；`admin` 缺省 → `verb=null`（守前置规格的 G4）。
- 管道 / 起宿主接缝：假 Win32 管道接缝下 `HELLO` 内容、`PeekNamedPipe` 轮询被调用、`STOP` 委托顺序、退出码优先取 `EXIT` 帧。
- **起宿主（R-21）**：假 `WinShellApi` 收到 `verb='runas'`、`application = process.execPath`（接缝 `hostExePath()` 恒等它）、`parameters = '"<path.join(__dirname, "ql-pty-host.js")>" "<pipe>" "<token>"'` 逐字；**不再有** `parseHostMode` / `boot.ts` / `defaultApp` 特例的单测。
- **本地无 UAC 门（R-21 / §9-R10）**：`build.bat` 产物 + `lms_launcher.exe "<…\app.asar\dist-main\ql-pty-host.js>" "\\.\pipe\x" tok` → 退出码 **3**、无窗口；同一形状接真实管道 → 活着等 `HELLO`。主代理跑，不派子代理。
- 宿主入口：假 pty + 假管道下 `READY → DATA → EXIT` 的帧序、`STOP` 调 `stopGraceful`、token 不符退出码 2。
- `QuickLaunchManager`：`admin: true` 走 `createElevatedShellProcess`、失败不残留状态、自动命令与页签事件与非提权路径一致。
- 渲染端：两态各 3 个控件格、`min-height` 仍 218px、开关的 `aria-checked` 与 `formAdmin`、保存 payload 含 `admin`、编辑态回填、`ql.modal.admin` 两语都存在。
- i18n 三门（`key-coverage` / `dict` / `no-hardcoded`）+ 类型门 + 全量回归。

### 7.2 打包真机硬门（用户执行，§8-K11）

主代理跑 `build.bat`，核对 `dist-release\win-unpacked\`：`app.asar\dist-main\ql-pty-host.js` 在包里（宿主的入口参数目标）、`app.asar.unpacked\` 里 koffi 与 node-pty 的原生模块在、**包内不再有 `node.exe`**（`package.json` 的 `main` 仍是 `dist-main/main.js`）。**再跑本地无 UAC 门**（R-21 / §9-R10）：`lms_launcher.exe "<…\app.asar\dist-main\ql-pty-host.js>" "\\.\pipe\x" tok` 必须**不出现窗口**、退出码 **3**；接真实管道时进程活着等 `HELLO`。`%TEMP%\lms-ql-host.log` 多一行 `stage=pipe` 只能在真机核对（本会话对 TEMP 是 EPERM，见 §6.4-4）。然后交给用户在同一次构建里跑：

1. 命令行 + 管理员 + `cmd`：页签出现、提示符可用；任务管理器里该 `cmd.exe` 是「高」完整性级别。**R-19**：UAC 弹窗上显示的应是**应用自己**（「LMS 启动器」），不再是 `node.exe`。
2. 命令行 + 管理员 + `pwsh`：同上；输入、拖窗改尺寸、`[停止]` 都能用。
3. 命令行 + 管理员 + 自动命令：命令在 shell 就绪后自动执行（与非提权一致）。
4. 命令行 + 管理员，UAC 点「否」：按钮回落 `[启动]`，日志一行取消原因且带的是**终端名**不是宿主名。
5. 可执行程序 + 管理员：程序以提权启动；UAC 点「否」同上。
6. 不勾选的两条：与今天一致（无 UAC、无弹窗、无多余日志）。
7. 提权终端运行中点应用退出：终端进程树被杀掉，不留孤儿。
8. 提权终端里输 `exit` 关掉：按钮回落、退出码进日志。
9. **同一次构建里补跑前置 feature 的六步清单**（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1–E7），把那个 feature 收尾。
10. **宿主起不来时不得卡死**（R-17 / R-18，**先看这一条再看 1-8**）：命令行 + 管理员，若宿主连不上（安全软件拦提权进程访问管道 / 文件缺失 / 原生模块解析失败 / 参数被改写），应用**必须**在 15s 内回落 `[启动]` 并写**一行**原因日志：`handshake=exit(code=N; …)` 或 `handshake=connect`；`%TEMP%\lms-ql-host.log` 里能读到宿主侧的 `stage=` 与原始 message。**不允许再出现「应用无响应」。**

## 8 已定口径（grill-me 逐项确认，2026-10-14）

| 编号 | 口径 | 依据 |
|---|---|---|
| K1 | 命令行 + 管理员 = **提权 PTY 宿主**（选项 3），保住终端页签全部能力 | 用户选定 |
| K2 | 宿主 argv = **管道名 + 一次性 token 两个位置参数**（紧跟在「应用入口参数」之后），其余在 `HELLO` 帧。**R-21 改回原口径**：R-19 曾加 `--ql-pty-host` 开关，P14 证打包态下未知 `--x` 被 Node 的选项解析器拒绝（`bad option`、退 9），开关根本到不了应用代码 | 用户选定 + 裁决 R-21（2026-10-15） |
| K3 | 失败文案**零新词典键**：`err.proc.uacCancelled` / `err.proc.spawnFail` / `err.ql.ptySpawn` | 用户选定 |
| K4 | 配置字段名 `admin`，yaml 里**总是显式** `true\|false`；读取默认 `false` | 用户选定 |
| K5 | 控件 = `.bool-switch` 开关（不是原生 checkbox） | 用户选定 |
| K6 | 卡片列表行不加提权标记 | 用户选定 |
| K7 | i18n 只加 `ql.modal.admin`：zh「管理员」/ en「Admin」；早前「以管理员身份运行」措辞作废 | 用户选定 |
| K8 | 布局：命令行态「终端」行分两段（左 = 标签 + 下拉，右 = 「管理员」+ 开关），仍 3 行；可执行程序态在「程序路径」上方加一行，也 3 行；`min-height: 218px` 不变 | 用户澄清 + 选定 |
| K9 | WSL 不特判；应用自身已提权也不特判（一律走宿主） | 用户选定 |
| K10 | 不新增日志行，日志与非提权路径一致 —— **精确化见 R-15 / §6.10**：禁的是成功路径的信息性行；失败原因行按 `main.ts:1069-1071` 的既有分工写一行（索引 K53） | 用户选定 + 裁决 R-15（2026-10-15） |
| K11 | 验收 = 主代理 `build.bat` + 核对产物，用户跑真机清单；前置 feature 的六步在同一次构建里跑掉 | 用户选定 |
| K12 | 宿主 = **同一份 `ql-pty-host.js` 的纯 Node 逻辑**；承载它的进程 = **应用自己的 exe，入口参数换成宿主脚本**（**R-19 修订、R-21 修正接管方式**，2026-10-15：原写「不是完整 Electron 进程」——P13 证伪硬链接后，三条硬约束（提权不继承环境块 + Electron 只认 `ELECTRON_RUN_AS_NODE` + 不额外打包 exe）下没有更轻的路，详见 §6.4-6）；仍**不用 cmd 包装、不额外打包 exe**、不建窗口/不加载渲染进程 | 用户选定 + 裁决 R-19 / R-21 |
| K13 | 环境块注入机制被 P2 否决 → 改用**硬链接 `node.exe`**（运行时自建 + `build.bat` 预建）→ **2026-10-15 证伪并作废**（P13：Electron 只认环境变量、文件名不起作用）→ R-19 的「应用 exe + `--ql-pty-host` 开关 + `boot.ts` 转发入口」也被本地门证伪（P14：`bad option`）→ 现行 = **应用 exe + Electron 的「应用入口参数」指向 `ql-pty-host.js`**（R-21 / K61） | P2 / P5 / P8 / P14 + 裁决 R-19 / R-21 |
| K14 | `runas` 同步阻塞主进程 5.7–5.9s：**接受**，沿用前置规格 §6.9 / §9-R1 口径，不挪 `worker_threads` | P11 + 用户选定 |
| K15 | `@.bool-switch` 样式**复制**进本组件 scoped，不提到 `style.css`；重复登记为技术债 | 用户选定 |

## 9 风险与未验证项

| 编号 | 风险 | 处置 |
|---|---|---|
| R1 | 提权宿主里 `require('@lydell/node-pty')` 能否解析到 `app.asar.unpacked`（P8 只证到 `require` 成功，且是 dev 布局） | **非提权一侧已由 P14-③ 证到**：打包 exe + asar 内入口 → 模块已加载、`net.connect` 已成功；**提权一侧仍待**真机门 §7.2-1；失败的回退口径：把 `ql-pty-host.js` 作为 extraFile 解到包外（改 `electron-builder.yml`），不改协议 |
| R2 | ConPTY 在提权进程里创建（本环境不可测） | 真机门 §7.2-1/2 |
| R3 | 真机上是否弹 UAC、是否出现黑色控制台窗口（P8 的 `consoleWindow` 非空是本机 pwsh 父进程带控制台所致） | 真机门 §7.2-1/4 |
| R4 | `WriteFile` 在管道缓冲满时（阻塞模式）会阻塞主线程 | 终端输入量极小；真机门不触发则不动；出现症状再改 overlapped |
| R5 | ~~用户目录里已有别人的 `node.exe`~~ **作废**（R-19：不再有 `node.exe`） | —— |
| R6 | ~~非 NTFS / 只读目录 → `linkSync` 失败~~ **作废**（R-19：不再建硬链接） | —— |
| R10 | **宿主入口没被接管 / 参数被改写** → 又退化成「起一遍应用、宿主永不连管道」 | **本地无 UAC 门**（R-21，主代理跑，不需要提权）：`lms_launcher.exe "<…\app.asar\dist-main\ql-pty-host.js>" "\\.\pipe\x" tok` → 不出现窗口、退出码 3；接真实管道 → 活着等 `HELLO`。**2026-10-15 20:1x 本机已跑过：两种形状都符合预期**（`.temp/ql-admin-probe/task11-round1-d6-evidence.md`）——正是这道门在实现前拦下了 R-19 的开关形状。`%TEMP%\lms-ql-host.log` 的 `stage=pipe` 行只能在真机核对（本会话对 TEMP 是 EPERM） |
| R7 | 20ms 读轮询的输入延迟 | 真机门 §7.2-2 里「输入可用」即算过；明显迟滞再调 |
| R8 | 提权条目并发多条 → 多条管道与宿主 | 每实例独立管道名；`nMaxInstances = 1`；回归用例覆盖两条并发 |
| R9 | 提权宿主连不上管道（安全软件拦 IPC / 权限 / 缺文件 / 参数被改写） | **2026-10-15 真机已命中**（应用永久卡死）。已按 R-17（有界非阻塞等待）+ R-18（退出码分类 + 留痕文件）修复；真机门 §7.2-10 |
