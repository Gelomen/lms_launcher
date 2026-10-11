# 快捷启动卡片 · 任务 check 表索引

> 计划：[2026-10-10-quick-launch-card.md](../../plans/2026-10-10-quick-launch-card.md) ·
> 规格：[2026-10-10-quick-launch-card-design.md](../../specs/2026-10-10-quick-launch-card-design.md)（v2）
> 本目录把计划里的 14 个任务各拆成一份可勾选的核对表；**一份表 = 一个任务的完成判据**。

## 使用方式

1. 按任务号顺序执行；每份表按 A→I 顺序逐行执行并勾选。
2. 「怎么验 / 命令」列必须**真跑**，输出摘要写进表末的「J. 执行记录」——没有输出就没有勾选。
3. 任何一行不成立 → 不勾选、不 commit、不进入下一任务；先修再往下走。
4. 全局约束（G 组）与审查重点（R 组）由本索引统一持有，任务表只列与该任务相关的子集；两处冲突以本索引为准。

## 清单

> 「前置」列只描述依赖关系，**不是并行批次建议**——执行一律串行，见 K6。

| 任务 | 标题 | check 表 | 前置 | 钉住的审查重点 |
|---|---|---|---|---|
| 1 | 公共命名工具 `nextCopyName` | [task-01-next-copy-name.md](task-01-next-copy-name.md) | — | — |
| 2 | `suggestConfigId` 支持前缀 | [task-02-suggest-config-id-prefix.md](task-02-suggest-config-id-prefix.md) | — | — |
| 3 | 配置层 `quick-launch-config.ts` | [task-03-quick-launch-config.md](task-03-quick-launch-config.md) | 2 | — |
| 4 | 终端探测 `quick-launch-terminals.ts` | [task-04-terminal-detection.md](task-04-terminal-detection.md) | — | — |
| 5 | 依赖安装 + `PtyProcess` + `QuickLaunchManager` | [task-05-pty-manager.md](task-05-pty-manager.md) | — | 1 |
| 6 | IPC 接线（12 通道 + 2 事件） | [task-06-ipc-wiring.md](task-06-ipc-wiring.md) | 3、4、5 | — |
| 7 | `exit_app` 停止全部终端 | [task-07-exit-app-stop-all.md](task-07-exit-app-stop-all.md) | 5、6 | 3（部分） |
| 8 | i18n 词条（中英） | [task-08-i18n-keys.md](task-08-i18n-keys.md) | — | — |
| 9 | `TerminalTabView.vue`（xterm 终端页签） | [task-09-terminal-tab-view.md](task-09-terminal-tab-view.md) | 5、8 | 2、5 |
| 10 | 页签条两种页签 + `[x]` + 横向滚动 | [task-10-log-panel-tabs.md](task-10-log-panel-tabs.md) | 9 | 3 |
| 11 | 快捷启动卡片 `QuickLaunch.vue` | [task-11-quick-launch-card.md](task-11-quick-launch-card.md) | 1、2、3、8 | — |
| 12 | 弹窗 `QuickLaunchModal.vue` | [task-12-quick-launch-modal.md](task-12-quick-launch-modal.md) | 3、4、8 | — |
| 13 | App 接线（四列、状态、数据路由、重载复原） | [task-13-app-wiring.md](task-13-app-wiring.md) | 6、7、9、10、11、12 | 3、4（部分） |
| 14 | 打包硬门 + 真机验收 + 文档记录 | [task-14-build-acceptance.md](task-14-build-acceptance.md) | 全部 | 4 |

## 已定口径（用户已确认，实现时不再作为待决项）

| # | 口径 | 依据 | 落在哪张表 |
|---|---|---|---|
| K1 | **验收对象 = `dist-release\win-unpacked\lms_launcher.exe`，不生成 portable exe，也不改 `build.bat`**；计划/规格里「portable exe」是过时措辞，由任务 14 F3 更正 | commit `ef23ac6 build: 打包只产出 win-unpacked，不再生成 portable exe` | 任务 14 A2 / B4 / D1 / D2 / E1 / F3 |
| K2 | `TerminalTabView` 的 props 以**计划**为准（含 `label`/`fullLabel`，**无 `configId`**）；需要 configId 处一律 `id.slice(QL_TAB_PREFIX.length)` 反解，不新增 API | 用户确认 | 任务 9 A4 / F7 |
| K3 | 包管理器 = **npm**：只提交 `package-lock.json`；`pnpm-lock.yaml` 已被 npm 落下但不影响打包（`build.bat:38` 跑 `npm install`），要同步就另开一次 chore | `node_modules\\.package-lock.json` 与 `package-lock.json` 为最近一次安装；`.modules.yaml` 停在更早 | 任务 5 A2 / B1 / H1 / H3 |
| K4 | 终端标签的 i18n key 必须以**字面量 `t()` 调用**出现在源码里，否则 `key-coverage` 扫不到；纯字符串映射不算 | `key-coverage.test.ts:39-45` 的 `KEY_CALL` 只匹配 `t(` / `hasKey(` 后的字面量 | 任务 8 A3 / E1 / F5 |
| K5 | **H 段由主代理在验收通过后执行**：子代理只写代码与测试、填 J 段，不 `git add`、不 commit；验收不通过就把工作区改动打回，因此不存在需要 revert 的提交 | 用户确认 + `AGENTS.md` 工作流第 4 步「提交」 | 全部 14 张表的 H 段 |
| K6 | **执行一律串行**：一次只跑一个子代理，按任务编号 1→14 顺序（编号即合法拓扑序）；上一任务验收并提交后才派下一个。**不得并行派单** | 本机为本地大模型、资源有限；DSH 子代理并行上限已设为 1 | 本索引「前置」列 + 全部任务表 A 段（前置只描述依赖，不是并行批次） |
| K7 | **任务 1 的搬移范围 = 原 70-80 行**：73-80 的代码与 70-72 那段「方案 A」注释一并搬到 `src/util/copy-name.ts` 头部（另加一行带日期与任务号的来源说明）；只删 73-80 会在 `reload()` 与「// 复制：…」之间留下无代码可解释的悬空注释。plan 任务 1 与任务 1 表 A2/B3 已按此更正 | 任务 1 任务审查（Important #1）+ 规格 §5.4「原样搬出」；代码侧证据：`git diff HEAD` 对 `TemplateModule.vue` 为 +1/−12 | 任务 1 A2 / B3 / E4 |
| K14 | **任务 6 的两条口径**：(1) `ql_pick_exe` 的 `.exe` 过滤器名只能取**主进程**词典（对话框由 `main.ts:1110-1119` 渲染，该通道无参数）→ 键定为 `app.dialog.filterExe`（与既有 `app.dialog.filterModel` / `app.dialog.filterJinja` 同组，`dict.ts:281-282` / :561-562）。计划 :299 原把它列在渲染端 `ql.dialog.filterExe` 已更正；任务 8 表 C9 作废、新增 D12。词典落地前对话框显示原始 key（D6a 日志可见 `[i18n] missing key`），属 K8 的既定过渡状态。(2) `ql_save` / `ql_start` 各带一次终端探测（最坏 ≈9s；规格 §6.1 不许缓存，§5.3-4 / §7.5 只用 `detectTerminals()` 判定）= **接受**，不改任务 4 的签名（按 id 单探测或 TTL 缓存都要扩范围）。代价与下游硬要求：任务 12 的保存按钮必须**单飞**（重复点击时 `qlSave(id=null)` 会生成两条新配置），任务 13 的启动按钮同理；真机若不可接受，再回来改 §6.1 的缓存口径 | 实测 `main.ts:1110-1119`、`dict.ts:281-282/561-562`、`quick-launch-config.ts:138`（id=null → 生成新 id）、`quick-launch-terminals.ts:107`（3×spawnSync） | 计划 §任务 8 · 任务 8 表 C9/D12/B2/I · 任务 12 / 任务 13 简报 |
| K13 | **任务 6 的 exe 适配器口径**（解决规格 §7.3 与 `ProcessState` 的冲突）：`QlDeps.spawnExe` 的生产实现 = **每个配置一个新 `ProcessState` 实例**（`process.ts:7`），调 `launch(exe, [], configId)`（:27）；**不得复用 `main.ts:59` 的 `ps` 单例**（只持一个 child + `runningConfigId`，会与 llama-server 撞车）。规格 §7.3 字面的 `{ windowsHide: true, stdio: 'ignore' }` 在 `process.ts` 不可改（B4/G4）前提下按效果满足：`process.ts:32-36` 未显式写 `windowsHide`，Node ≥12 默认即 `true`（该文件 :22 注释写明「隐藏窗口」）；`stdio` 是 `["ignore","pipe","pipe"]`，所以适配器**必须** `takePipes()`（:62）后把两路 `.resume()` 丢弃，否则管道写满会阻塞子进程。错误前缀由 `ProcessState` 自带（:28 `STATE:`、:46 `PROC:`）→ 与 K11(4) 一致。另：规格 §7.3 的 `pty.spawn(exe, [], …)` 片段已更正为 `pty.spawn(exe, args, …)`（`-NoLogo` 必须生效，任务 5 已按此实现） | 实测 `process.ts:27-59` / :62-68、`main.ts:59,316`、Node spawn 默认值 | 规格 §7.3 · 任务 6 表 C/D 段 |
| K12 | **任务 6 的三条口径（主代理取证更正）**：(1) `src-main/preload.ts:4` 是通用 `invoke(cmd, ...args)` 透传，**没有按通道白名单** —— 原表 B2/E2「12 个通道全部在 preload 白名单里」表述有误并已更正：通道在 `src-main/main.ts` 用 `ipcMain.handle` 注册（既有 25 例见 :234-465），preload 只需加 `onQlData` / `onQlExit` 两个事件订阅（照 :5-9 的 `onLogLine` 模式），`src/ipc.ts` 的 `declare global`（:14-31）补两个类型。(2) 原 D6「`npm run dev` → DevTools 依次调 …」实现者无法执行（子代理驱动不了 DevTools），拆成 **D6a 自动化形状门**（`vi.mock('electron')` 捕获 `ipcMain.handle` 注册的处理器并直调，断返回形状与 C 表逐字一致；本任务内必须过）+ **D6b 真机冒烟**（`npm run dev` 起停采 stdout/stderr）；DevTools 逐条手测推到任务 14 真机验收。(3) K11(2)「首帧必须上报尺寸」的落点更正为**任务 9 表 E9 / 任务 13 表 E3、E5**（发尺寸的是渲染端，不是任务 6 的通道注册） | 实测 `preload.ts:1-40`、`main.ts` 的 `ipcMain.handle` 清单、`src/ipc.ts:14-31`；子代理无 DevTools 驱动能力 | 任务 6 表 B2/E2/D6a/D6b/I/J · 任务 9 表 E9 · 任务 13 表 E3/E5 |
| K11 | **任务 5 的五条口径**：(1) `stopAll(timeoutSecs)` 必须把超时**透传**给每个停止动作，不得被 `stop()` 里的 `STOP_TIMEOUT_SECS` 常量覆盖（原实现丢弃参数，E9 断 `stopArgs === [3]` 恰好等于常量 → 结构上抓不到）；已补进任务 5 表 C5(a)，E9 改为 `stopAll(7)` 断 `[7]`。(2) `start()` 不带尺寸 → **80×24 兜底**【计划强制】：任务 6 的 `ql_start` 成功后必须在建页签前/同时发一次 `ql_resize`，任务 13 的复原同理，否则每个终端首帧按 80 列排版。(3) `protected createShellProcess` 是**授权测试接缝**（E4/E5 要注入假进程，C4/C5 无注入位），公开签名一字不改，任务 6/7 不得当公开 API 调用 → 任务 5 表 C5(b)。(4) exe 类型的错误前缀由**生产侧适配器自带**（`ProcessState` 已抛 `STATE:`/`PROC:`），`quick-launch.ts` 不包前缀 → 任务 6 简报钉住。(5) `states()` 不区分 shell/exe（规格 §8 的返回类型本来没有 kind）→ 任务 13 的复原必须 join `ql_list` 的 `type`，不得给 exe 配置建终端页签。另：任务 5 用到的 `err.ql.*` 占位符（`terminalGone→{terminal}`、`ptySpawn→{exe}{err}` 等）已并入任务 8 表 D 段注 | 任务 5 任务审查（Important #1/#2/#3 + 次要 #6/#11）+ 实测（node-pty `pid` 异步赋值、prebuilds 真实字节数、`process.ts:87` 同口径） | 任务 5 表 C5 · 任务 8 表 D 段注 · 任务 6 / 任务 13 简报 |
| K10 | **任务 4 的三条口径**：(1) `wsl.exe` 的定位手段 = `where.exe wsl.exe` 命中 **或** `%SystemRoot%\System32\wsl.exe` 固定路径回退（与 cmd 行同口径）——规格 §6.1 只写「`wsl.exe` 存在」未指定手段，现定为口径，后续审查不再重复讨论。(2) 任务 4 补两条注入式回归用例 E8（wsl 三条件链）/ E9（`where.exe` 判定）：本机永远观察不到「wsl 可用」（§6.3 / §12.10），不注入则 §6.1 的 wsl 行与 pwsh 行永不验证；实现要求用假 `spawnSync`，**不改** C1-C3 的导出签名。(3) `detectTerminals()` 每次调用最多 **3** 次 `spawnSync`（`where.exe pwsh` / `where.exe wsl.exe` / `wsl -l -q`），最坏 ≈9s 主进程同步阻塞（本机实测典型 ~90ms）——任务 6 的 `ql_terminals` 与任务 12 的「打开弹窗即探测」按 9s 预算，不得按实现者报告里的 6s 估 | 任务 4 任务审查（Important #1 标注计划强制 + 次要 #1/#2/#4）+ 审查者真机复现（四次调用改 env 反证、单次 ~90ms）+ 实现者报告 §7 主动披露 | 任务 4 表 B2 / E8 / E9 / F6 / J 段 · 任务 6 简报 |
| K9 | **任务 3 的两条补充口径**：(1) 错误 key 名以计划 :301 / 任务 8 表 D 段为准（`nameDup` / `typeInvalid` / `terminalMissing`，不得改名成 `nameDuplicate` / `badType` / `badTerminal`）；`err.ql.nameTooLong` 补登记进计划 :301 与任务 8 D11（§5.3-1 的 ≤64 分支需要它）；YAML 与 id 格式**复用**词典既有 `err.config.yamlLoadFail` / `err.config.yamlEmpty` / `err.config.idFormat`，不建同义键。(2) `qlSave` 对**显式 id** 也跑 `validateConfigId` → `VALIDATION:`：§5.3 未列，但它写的是 yaml 的 key，与 `config.ts:129` 同口径；缺了会把 `'Bad ID'` 写进文件、下次加载既不进 `items` 也不进 `invalid`。已补为任务 3 表 E16 | 任务 3 任务审查 Important #1/#2 + 实测 `dict.ts:220-226,500-506` 三个既有键 + `config.ts:129` | 任务 3 C6 / E16 · 任务 8 D11 + 占位符注 |
| K8 | **任务 3 的主进程错误消息不得写字面量 key**：`err.ql.*` 词典键在任务 8 才落地，任务 3 若写 `t('err.ql.nameRequired')` 会被 `key-coverage.test.ts:39-41` 的 `KEY_CALL`（只认字面量 key）判为「词典缺键」而红。口径：任务 3 用常量映射或拼接传 key（`t(QL_ERR.nameRequired)` / `t('err.ql.' + k)`，正则不匹配 → 跳过），**不改 `src-main/i18n/dict.ts`、不改 `err-keys.ts`**（`IPC_ERROR_KEYS` 由 `dict.test.ts` 守护，键未落地就登记会红）；任务 8 落地词典后再把调用点改回字面量 `t()`。测试只断 `/^VALIDATION:/` 前缀，不依赖译文 | 实测：`key-coverage.test.ts:39-45` + `no-hardcoded.test.ts:136-148`（汉字硬门，词典除外）+ `err-keys.ts:17-18` 的 `IPC_ERROR_KEYS` 守护 | 任务 3 F3 / 任务 8 A 段 |

## G 组 · 全局约束（每个任务都适用）

| # | 约束 | 怎么验 |
|---|---|---|
| G1 | 依赖版本钉死：`@lydell/node-pty@^1.2.0-beta.15` 进 `dependencies`；`@xterm/xterm@5.5.0` / `addon-fit@0.10.0` / `addon-search@0.15.0` / `addon-web-links@0.11.0` 进 `devDependencies` | 读 `package.json` 对照 |
| G2 | 不引入需要 C++ 编译器的依赖（本机无 Visual Studio） | 安装日志无 `node-gyp` / 无编译报错 |
| G3 | **不传 `encoding`** 给 pty；统一 UTF-8 字符串 | `grep -n "encoding" src-main/quick-launch.ts` 无命中 |
| G4 | `src-main/process.ts` 与 `src-main/process.test.ts` **一行都不改** | `git diff --name-only` 不含这两个文件 |
| G5 | 所有非 PTY 子进程 spawn 带 `windowsHide: true` | 逐个 spawn 调用点核对 |
| G6 | 渲染端用户可见文案走 `t()`，主进程错误消息走 `t()`；中英两份同时补齐 | `no-hardcoded.test.ts` + `key-coverage.test.ts` 绿 |
| G7 | 错误前缀沿用：`MISSING:` / `VALIDATION:` / `YAML:` / `STATE:` / `PROC:` | 测试断言用 `/^` 锚定前缀 |
| G8 | xterm 在单测里必须 `vi.mock`（happy-dom 无真实布局） | `grep -n "vi.mock" src/modules/TerminalTabView.test.ts` |
| G9 | 提交信息 Conventional Commits + 中文（与仓库历史一致） | `git log --oneline -1` |
| G10 | 不扩范围：规格 §2 非目标不得顺手做 | diff 里不出现参数/工作目录/多发行版 WSL/拖动排序/录制回放/命令历史/日志落盘 |

## R 组 · 审查重点 → 钉住位置

| # | 风险 | 钉住的任务与测试 |
|---|---|---|
| R1 | shell 未就绪就写命令 → 命令丢失或被 PSReadLine 吃掉 | 任务 5：「等首批输出」+「5s 超时兜底」 |
| R2 | 隐藏页签（v-show）里 fit → cols/rows 为 0，PTY 尺寸写坏 | 任务 9：「不可见时不 fit、激活时再 fit」 |
| R3 | 运行中的终端页签被关掉 → PTY 成孤儿进程 | 任务 10：`closeDisabled` 测试；任务 7：`stopAll`；任务 13：停止后 `[x]` 解禁联动 |
| R4 | 打包后 `.node` / `conpty.dll` 加载失败 → dev 正常、发布版一开终端就崩 | 任务 14 硬门第 1 条 |
| R5 | 复制粘贴与 Ctrl+C 冲突 | 任务 9：键盘处理测试（`Ctrl+C` 原样送达） |

## 跨任务回归门

| # | 命令 | 何时必须 | 预期 |
|---|---|---|---|
| V1 | `npx vitest run <本任务测试文件>` | 每个任务 | 全 PASS |
| V2 | 计划中该任务点名的相邻回归文件 | 每个任务 | 全 PASS |
| V3 | `npx tsc -p tsconfig.main.json --noEmit` | 任何 `src-main/` 改动后 | 无错 |
| V4 | `npx vitest run src-main/i18n src/i18n.test.ts` | 任何新增文案/错误消息后 | 全 PASS |
| V5 | `npm test`（全量） | 任务 13 步骤 4、任务 14 之前 | 全绿 |
