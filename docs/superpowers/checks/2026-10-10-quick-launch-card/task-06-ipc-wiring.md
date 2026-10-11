# 任务 6 · IPC 接线（12 通道 + 2 事件） — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 6 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §8
> 前置：任务 3（配置层）、任务 4（探测）、任务 5（进程管理）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☑ |
| A2 | 既有事件订阅模式 | 读 `src-main/preload.ts` 的 `onLogLine` | listener + removeListener 模式，照抄 | ☑ |
| A3 | `emitLog` 现有签名 | 读 `src-main/main.ts` | `emitLog(line, 'sys', tabs?)` 可用，`onSysLine` 走它 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/main.ts` | 修改 | 注册 12 通道 + 2 事件；`ql` 单例 | ☑ |
| B2 | `src-main/preload.ts` | 修改 | **两个事件订阅**（`onQlData` / `onQlExit`，照 `:5-9` 的 `onLogLine` 模式）。**更正（主代理取证）**：本文件没有「按通道白名单」——`:4` 是通用 `invoke(cmd, ...args)` 透传，12 个通道**不需要**在这里逐个登记（原表述有误，见索引 K12） | ☑ |
| B3 | `src/ipc.ts` | 修改 | 封装与类型 | ☑ |
| B4 | `src/App.test.ts` | 追加用例 | 既有用例不改 | ☑ |
| B5 | `src-main/ipc-ql.test.ts` | 新建（D6a 形状门专用） | 只测主进程处理器形状；**不得**把 D6a 塞进 `src/App.test.ts`（那份 mock 的是 `./ipc`，不是 `electron`）。索引 K12(2) 授权本文件 | ☑ |

## C. 通道契约（严格照规格 §8，名称/参数/返回逐字）

| # | 通道 | 参数 | 返回 | ✓ |
|---|---|---|---|---|
| C1 | `ql_list` | — | `QuickLaunchList` | ☑ |
| C2 | `ql_save` | `id: string \| null, entry` | `string`（最终 id） | ☑ |
| C3 | `ql_delete` | `id` | `void`（不存在 → `VALIDATION:`） | ☑ |
| C4 | `ql_terminals` | — | `TerminalInfo[]` | ☑ |
| C5 | `ql_start` | `id` | `{ tabId: string \| null }` | ☑ |
| C6 | `ql_stop` | `id` | `void`（幂等） | ☑ |
| C7 | `ql_write` | `id, data: string` | `void` | ☑ |
| C8 | `ql_resize` | `id, cols, rows` | `void` | ☑ |
| C9 | `ql_states` | — | `Record<string, { running: boolean; stopping: boolean }>` | ☑ |
| C10 | `ql_pick_exe` | — | `string \| null`（`.exe` 过滤对话框） | ☑ |
| C11 | `clipboard_read` / `clipboard_write` | — / `text: string` | `string` / `void` | ☑ |
| C12 | 事件 `ql-data` = `{ tabId, data }`；`ql-exit` = `{ configId, code }` |  |  | ☑ |

## D. 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试 | — | `typeof mod.onQlData === 'function'`、`typeof mod.onQlExit === 'function'` | ☑ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/App.test.ts` | FAIL | ☑ |
| D3 | 步骤 3：实现 | — | `onData` → `ql-data`；`onExit` → `ql-exit`；`onSysLine` → 既有 `emitLog(line, 'sys')`；`clipboard_*` 用 Electron `clipboard` | ☑ |
| D4 | 步骤 4-1：单测 | `npx vitest run src/App.test.ts` | PASS | ☑ |
| D5 | 步骤 4-2：类型 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☑ |
| D6a | 步骤 4-3a：**自动化形状门**（本任务内必须过） | 用 `vi.mock('electron')` 捕获 `ipcMain.handle` 注册的处理器，直接调用 `ql_list` / `ql_terminals` / `ql_save` / `ql_start` / `ql_states` 等，断返回形状与 C 表逐字一致 | PASS，输出记入 J | ☑ |
| D6b | 步骤 4-3b：真机冒烟 | `npm run dev`（后台任务）→ 等 ~15s → 采 stdout/stderr → 结束进程 | 主进程无异常/无未注册通道报错；**DevTools 里逐条手测 `ql_list`/`ql_terminals`/`ql_save`/`ql_start` 推到任务 14 真机验收**（索引 K12：子代理无法驱动 DevTools） | ☐（DevTools 手测推到任务 14 真机门；索引 K12） |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | `src/ipc.ts` 导出 `onQlData` / `onQlExit` 两个订阅封装 | 计划 步骤 1 | ☑ |
| E2 | 12 个通道全部在 `src-main/main.ts` 里 `ipcMain.handle(...)` 注册（漏一个 → 渲染端 invoke 报 no handler）；`src/ipc.ts` 的 `declare global` 的 `window.lms` 类型补 `onQlData` / `onQlExit`。取证：`preload.ts:4` 是通用 `invoke` 透传，**没有**通道白名单（索引 K12） | 规格 §8 | ☑ |
| E3 | 事件订阅用 removeListener 清理，重复订阅不叠加 | 照 `onLogLine` 模式 | ☑ |
| E4 | `onSysLine` 不新建通道，复用既有日志通道（exe 类型的无页签反馈） | 计划 步骤 3 | ☑ |
| E5 | `ql_pick_exe` 取消对话框 → 返回 `null`，不抛错 | 规格 §8 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 通道名与规格 §8 逐字一致（大小写、下划线） | 渲染端调不到 | ☑ |
| F2 | 主进程错误消息走 `t()`，前缀只用 G7 五种 | 渲染端无法分类 | ☑ |
| F3 | 不改 `src-main/process.ts`（G4） | llama-server 链路受影响 | ☑ |
| F4 | 不加规格外的通道（如 `ql_restart`） | 违反 G10 | ☑ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/App.test.ts src/main 相关既有测试` | 全 PASS | ☑ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☑ |
| G3 | `git diff --name-only` + `git status --porcelain` | 只含 B1-B5（B5 是未跟踪新文件） | ☑ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/main.ts src-main/preload.ts src/ipc.ts src/App.test.ts src-main/ipc-ql.test.ts`（含 B5 授权的 D6a 测试） → 已执行（主代理，修复轮 1 + 定向复审通过后） | ☑ |
| H2 | 提交信息逐字 | `feat(ipc): 快捷启动与终端通道接线` → `a789477`（5 files, +722）；口径与文档另做 `6e4b085` / `6581374`（docs，与代码分开） | ☑ |

## I. 完成判据

- [x] C1-C12 全部落地且与规格 §8 一致（12 通道 + 两个事件；`ql_pick_exe` 取消返回 `null`）
- [x] D4-D6a 都过（形状门由 D6a 自动化测试钉；DevTools 手测按 K12 推到任务 14）
- [x] G1-G3 通过 —— 见 J 段 G1/G2/G3 行
- [x] H1-H2 完成（`a789477`）

## J. 执行记录（实现时填写）

> 完整报告（含 C1-C12 ↔ 实现位置对应表、E1-E5 ↔ 测试对应、K13 适配器说明、自审与疑虑）：
> `.superpowers/sdd/2026-10-10-quick-launch-card/task-06-report.md`

| 步骤 | 命令 / 调用 | 实际返回（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain` / `git log --oneline -3` | 无输出 / HEAD = `8ac9fa9 docs: 任务 6 表补 B5…` | 起点干净 |
| D1 | 追加用例到 `src/App.test.ts:1091-1100`（计划 :269-273 逐字 + `vi.importActual` 断真实模块） | 用例落盘 | — |
| D2 | `npx vitest run src/App.test.ts` | `❯ src/App.test.ts (48 tests \| 1 failed)`；`× 快捷启动 IPC 封装（任务 6） > ipc 模块导出终端相关封装` → `[vitest] No "onQlData" export is defined on the "./ipc" mock`；`Tests 1 failed \| 47 passed (48)` | 先红 ✓ |
| D3 | 改 `src-main/main.ts`（`:17-21` import、`:983-1124` 快捷启动段）、`src-main/preload.ts:61-71`、`src/ipc.ts:30-31/:116-122` | 12 个 `ipcMain.handle` + `ql` 单例 + K13 适配器 + 两个订阅 | 实现落盘 |
| D4 | `npx vitest run src/App.test.ts` | `✓ src/App.test.ts (48 tests) 1119ms`；`Test Files 1 passed (1)`；`Tests 48 passed (48)` | 后绿 ✓ |
| D5 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，`EXITCODE=0` | 类型门 ✓ |
| D6a | `npx vitest run src-main/ipc-ql.test.ts`（新建，`vi.mock('electron')` 捕获处理器后直调） | `✓ src-main/ipc-ql.test.ts (16 tests) 1901ms`；`Tests 16 passed (16)` | 形状门 ✓ |
| D6a | `ql_list`（经捕获的处理器直调） | 空文件 → `{ items: {}, invalid: [] }`（不抛 MISSING）；`ql_save` 后 → `{ items: { qlmv3rehxw0f64: { name:'形状门 cmd', type:'shell', shell:'cmd', cmd:'echo HI' } }, invalid: [] }`（传入的 `exe` 字段被规整掉） | C1/C2 ✓ |
| D6a | `ql_save`（空名 / `ql_delete` 二次删） | reject `/^VALIDATION:/`（`err.ql.nameRequired`）；`ql_delete` → `undefined`，再删 → reject `/^VALIDATION:/`（`err.ql.notFound`，非 MISSING） | C2/C3 ✓ |
| D6a | `ql_terminals`（经捕获的处理器直调） | `handler.constructor.name === 'AsyncFunction'`、返回 Promise；元素键恰为 `['id','path']`；id ∈ 四个终端；两次调用 `a !== b`（不缓存）；本机含 `cmd` | C4 / K10-3 ✓ |
| D6a | `ql_start` / `ql_states` / `ql_write` / `ql_resize` / `ql_stop`（真 cmd.exe） | 未知 id → reject `/^VALIDATION:/`；`ql_start('qlshape01')` → `{ tabId: 'ql:qlshape01' }`；`ql_states` → `{ qlshape01: { running: true, stopping: false } }`；write/resize → `undefined`；`ql_stop` → `undefined` 且 `ql_states` → `{}`，再 stop 一次不抛错 | C5-C9 ✓ |
| D6a | 事件 `ql-data` / `ql-exit`（假窗口的 `webContents.send` 捕获） | `ql-data` 载荷键恰为 `['data','tabId']`、`tabId='ql:qlshape01'`；`ql-exit` 载荷键恰为 `['code','configId']`、`code` 为 number | C12 ✓ |
| D6a | `ql_start`（两个 exe 配置，真 `notepad.exe`） | 两次都 `{ tabId: null }`；`ql_states` 同时含两条；既有 `get_state` 仍 `{running:false,stopping:false,configId:null}` → 未复用 `main.ts:59` 的 `ps` 单例 | K13 ✓ |
| D6a | `ql_start`（`no-such-exe-zzz.exe`） | `{ tabId: null }`；日志通道出现 `stream='sys'` 的 `PROC: no-such-exe-zzz.exe … 启动失败: spawn … ENOENT`（前缀由 `ProcessState` 自带） | E4 / K11(4) ✓ |
| D6a | `ql_pick_exe` / `clipboard_read` / `clipboard_write` | 取消 → `null` 且 `filters[0].extensions === ['exe']`；选中 → `'D:\\Tools\\LM Studio.exe'`；read → `string`、write → `undefined` 且随后读得到 | C10/C11 / E5 ✓ |
| D6a | `preload` 的两个订阅（`contextBridge` 捕获后驱动） | 订阅 → 计数 1；清理 → 0 且不再收到；再订阅两次 → 2，各清理 → 0 | E3 ✓ |
| D6b | `npm run dev`（后台起 → ~25s 采 stdout/stderr → 进程随 `concurrently -k` 退出） | vite `ready in 663 ms` → `wait-port` Connected → `electron .` → `dist-main/main.js:86 TypeError: Cannot read properties of undefined (reading 'requestSingleInstanceLock')`；**无 `No handler registered`** | 见下行取证 |
| D6b | 根因取证：`Get-ChildItem env: \| ? Name -like "*ELECTRON*"`；`npx electron .temp/electron-probe.js`；去掉该变量再跑 | `ELECTRON_RUN_AS_NODE=1`；探针 `PROBE typeof app: undefined` / `keys: 0,1,2,…`（= npm stub 字符串）；去掉后退出码 `-2147483645` = `0x80000003` STATUS_BREAKPOINT（规格 §13.2 已记录） | 环境限制，非接线缺陷；模块图（含 node-pty）加载成功 |
| D6b | `ql_terminals` / `ql_save` / `ql_start`（真机 DevTools，任务 14 补） | 本环境起不了 Electron GUI（上一行），未能手测；形状已由 D6a 直调同一批处理器钉住 | 推到任务 14（索引 K12(2)） |
| G1 | `npx vitest run src/App.test.ts src-main/ipc-ql.test.ts src-main/quick-launch.test.ts src-main/quick-launch-config.test.ts src-main/quick-launch-terminals.test.ts src-main/process.test.ts` | `Test Files 6 passed (6)`；`Tests 114 passed (114)`（含 `process.test.ts` 5 passed） | ✓ |
| V4 | `npx vitest run src-main/i18n src/i18n.test.ts` | `Test Files 5 passed (5)`；`Tests 22 passed (22)`（`key-coverage` / `no-hardcoded` 均绿） | i18n 硬门 ✓ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | `TSC_EXITCODE=0` | ✓ |
| G3 | `git diff --name-only` + `git status --porcelain` | 代码只有 4 个 `M`（B1-B4）+ `?? src-main/ipc-ql.test.ts`（B5）；另有本任务的过程文档 `M docs/superpowers/checks/…/task-06-ipc-wiring.md`（就是本表 J 段）与 `.superpowers/sdd/…/task-06-report.md`（被 `.gitignore` 的 `.*/` 忽略，不进 git）。`src-main/process.ts` / `process.test.ts` / 任务 3-5 的四个文件 / `package.json` / lock 均不在 diff 里 | 范围门 ✓ |
| 额外 | `npx vitest run`（全量，非本任务门） | `Test Files 44 passed (44)`；`Tests 731 passed (731)` | 全量回归 ✓ |

### J-2 · 修复轮 1（任务 6 审查：重要 #1 / 重要 #2 + 已批准的 Minor #1/#2/#3/#8）

> 起点 HEAD = `6e4b085`，工作区含本任务五个文件（未提交）。本轮只动 `src-main/main.ts` 与 `src-main/ipc-ql.test.ts`；
> 仍未 add / commit（K5）。完整修复记录：`.superpowers/sdd/2026-10-10-quick-launch-card/task-06-report.md` §10。

| 步骤 | 命令 / 调用 | 实际返回（摘要） | 结论 |
|---|---|---|---|
| 修复轮 1 · 先红 | `npx vitest run src-main/ipc-ql.test.ts`（先加 3 组用例：重要 #1 / 重要 #2 / Minor #2，实现未改） | `Tests 7 failed \| 16 passed (23)`：`保存/启动 exe 配置不得调用 detectTerminals: expected 15/16 to be 14/15`；`expected 'VALIDATION: err.ql.typeInvalid' to contain 'err.ql.notFound'`；`重要 #2 的守卫必须存在…expected 'undefined' to be 'function'`；`expected [ false, false ] to deeply equal [ true, true ]` | 先红 ✓ |
| 修复轮 1 · 重要 #1 的证据（索引 K15(2)） | 在测试里 `vi.mock('./quick-launch-terminals')` 只计数地包一层 `detectTerminals`，`afterAll` 打印真实调用次数 | 修复后：`[ipc-ql] detectTerminals 真实调用次数 = 9`。临时去掉 `entry.type === 'shell'` 守卫的同一次运行：`= 20`（两条新用例在断言处提前失败，少跑 2 次 shell 对照 → 完整对照 22）。差 13 = 本文件 7 次 exe `ql_save`（`ipc-ql.test.ts:218/:292/:293/:314/:332/:408/:409`）+ 6 次 exe `ql_start`（`:295/:298/:315/:346/:411`×2）。**对照断言仍绿**：保存 / 启动 **shell** 配置各恰好 +1 次（规格 §5.3-4 / §7.5 的实测没被削弱） | exe 分支不再探测 ✓ |
| 修复轮 1 · 重要 #2 | `main.ts:1016-1029` 新增 `export function qlStartContextOrThrow(seam)`（槽为 null → `STATE:`）；`:1086` / `:1088` 两个构造期回调改走守卫（不再 `?? null` / `?? false`） | 新用例 1：不在任何 `ql_start` 里时 `expect(() => guard('probe')).toThrow(/^STATE:/)` 绿。新用例 2：两个 exe 配置并发 `ql_start`，把 `ProcessState.prototype.launch` 的第三参数逐次记录 → `['qlconc01','qlconc02']`（不串）、`args=[]`（K13 逐字）、`ctxOk=[true,true]`（槽非空且属于本次）；`get_state` 仍 `{running:false,stopping:false,configId:null}` | 不变量由代码强制 ✓ |
| 修复轮 1 · Minor #1/#2/#3/#8 | 删 `launchError`（原 `:1038-1046` → 现 `:1060-1064`）并把注释改成事实；`ql_start` 用 `Object.prototype.hasOwnProperty.call(items, id)`（`:1112-1115`）；`(t) => t.id` → `(info) => info.id`；测试 `afterAll` 对 8 个已知 id 逐个 `ql_stop`（吞异常） | `ql_start('constructor'\|'toString'\|'__proto__')` → `VALIDATION: err.ql.notFound`（不再是 `err.ql.typeInvalid`）；`tsc` 无错；`no-hardcoded` 绿（守卫消息为 ASCII 断言，非文案） | ✓ |
| 修复轮 1 · 反向自检 | A：临时去掉 `entry.type === 'shell'` 守卫（exe 也探测）→ 跑定向；B：临时删 `qlStartContextOrThrow`、两处回到 `?? 默认值` → 跑定向；然后各还原一次 | A：`Tests 3 failed \| 20 passed (23)` —— 两条「exe 不探测」断言红（`expected 15 to be 14` / `expected 16 to be 15`）。B：`Tests 2 failed \| 21 passed (23)` —— 恰是两条重要 #2 用例红（`expected 'undefined' to be 'function'` / `expected [ false, false ] to deeply equal [ true, true ]`）。两次还原后：`Tests 23 passed (23)` | 反向自检 ✓ |
| 修复轮 1 · G 段 | `npx vitest run src-main/ipc-ql.test.ts src/App.test.ts src-main/quick-launch.test.ts src-main/quick-launch-config.test.ts src-main/quick-launch-terminals.test.ts src-main/process.test.ts`；`npx tsc -p tsconfig.main.json --noEmit`；`npx vitest run src-main/i18n src/i18n.test.ts` | `Test Files 6 passed (6)` / `Tests 121 passed (121)`（ipc-ql 23 · App 48 · quick-launch 17 · config 19 · terminals 9 · process 5）；`TSC_EXITCODE=0`；i18n `Test Files 5 passed (5)` / `Tests 22 passed (22)` | 回归门 ✓ |
| 修复轮 1 · G3 | `git status --porcelain` | 仍是 `M src-main/main.ts` / `M src-main/preload.ts` / `M src/App.test.ts` / `M src/ipc.ts` / `?? src-main/ipc-ql.test.ts`（+ 本表 J-2 段）；`process.ts` / `process.test.ts` / 任务 3-5 的四个文件 / `package.json` / lock 不在 diff 里 | 范围门 ✓ |
| 验收（主代理复跑 + 独立变异探针） | `npx vitest run` 定向 6 文件；`npx tsc -p tsconfig.main.json --noEmit`；`npx vitest run src-main/i18n src/i18n.test.ts`；`git diff --stat HEAD -- src-main/process.ts src-main/process.test.ts`；**主代理自己**跑 A/B 两次变异 | `Tests 121 passed (121)` exit 0；`TSC_EXIT=0`；i18n `22 passed`；process.ts / process.test.ts 的 diff 为空；范围只含 B1-B5。A) `:1119` 的 `entry.type === 'shell'` 改 `true` → 2 红（exe 不探测断言 + 并发用例）；B) `:1025` 的 `if (!qlStartContext)` 改 `if (false)` → 恰 1 红（守卫用例）；两次还原后 main.ts 字节级一致（`741C8B2D…85B1C21`） | 定向复审：六条发现全部 ADDRESSED、无新 Critical/Important；探测次数复算自洽（9 vs 20，差 13 = 7 次 exe 保存 + 6 次 exe 启动）→ 验收通过 |
