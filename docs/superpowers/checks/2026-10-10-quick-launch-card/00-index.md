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
| K22 | **任务 8 审查后的四条口径**：(1) 规格 §10 的「剪贴板提示」在 §8/§9 里**没有对应行为**（§9 只规定 `Ctrl+Shift+C` 复制 / `Ctrl+Shift+V` 粘贴 / 右键粘贴 + 两个 `clipboard_*` 通道，没有任何提示界面）→ 属早期版本残留，**不建键**；已更正规格 §10。(2) 计划 :297 的「9 处」更正为 **8 处**（原数把 `invalidError()` 的定义行也数了进去；K20 已把总数从 17 更正为 16）。(3) **界面措辞不在 spec/check 表钉死范围**：C3 只钉 en 四条逐字，zh 措辞由实现者按既有词典风格判断（`err.ql.notFound` 直引号对齐 `err.config.notFound`、`delete.message` 用「」对齐 `tplModal.delete.message`、`ql.terminal.clear` en 用 `Clear` 对齐 `log.toolbar.clear`），真机验收复核。(4) **样板重复是口径强制的取舍**：删掉 `invalidError()` 后 `'VALIDATION: ' + t(...)` 在 `quick-launch-config.ts` 重复 8 次（`quick-launch.ts` 另有 6 次不同前缀）——K20(2) 要求字面量进硬门，任何接 key 的辅助函数都会让调用点重新逃出 `KEY_CALL`。将来若要消重，用**接已译消息**的 `validationError(t('err.ql.x'))` 形态（既保字面量又集中前缀），并另立口径 → 交最终整分支审查。另：`dict.ts:492` 的 en `ql.invalid` 在 n=1 时语法不成立，已登记给任务 11（首个调用点）顺手改成 `invalid entries skipped: {n}`（对齐既有计数键风格，现无调用点零成本） | 任务 8 任务审查 + 实测规格 §9:252 / §10:269、`quick-launch-config.ts:87-146`、`dict.ts:492` | 规格 §10 · 计划 §任务 8 · 任务 11 简报 · 最终整分支审查 |
| K21 | **任务 8 落地后的三条口径**：(1) `KEY_CALL` **连注释一起扫**——`key-coverage.test.ts:39-41` 的正则不看语法树，注释里举一个 `t('err.ql.xxx', {...})` 形态的假例子就会把硬门跑红。规则：**源码注释里不得出现 `t('字面量key')` 形态**，要举例就用不用引号的写法。(2) **终端查找的「清空」按钮复用既有 `log.search.clear`**（`dict.ts:135` zh / `:478` en，措辞就是「清空查找」/ `Clear search`），**不新建 `ql.terminal.searchClear`**：计划 :299 的 `ql.terminal.searchPrev\|Next\|Clear` 是我写计划时的扩写，规格 §9/§10 没有这条；按 K9「复用既有键」与 F4「不加规格外键」处理，计划已更正。(3) **尚无调用点的键，占位符名以词典为准**（词典 zh/en 注释里已写）：`ql.invalid` → `{n}`；`ql.terminal.count` → `{cur}` `{total}`；`ql.modal.delete.message` → `{name}`；`ql.log.exit` → `{name}`；`ql.log.fail` → `{name}` `{msg}`。任务 9/11/12/13 的调用点必须**照抄**这些名字，否则那几轮的 `key-coverage:44` 会红 | 任务 8 实现者踩坑 + 实测 `key-coverage.test.ts:39-41`、`dict.ts:133-139/476-482`、规格 §9/§10 无 `searchClear` | 计划 §任务 8 渲染端键行 · 任务 9 / 11 / 12 / 13 简报 |
| K20 | **任务 8 的两条事实更正**：(1) **词典只有一份**——`src/i18n.ts:3` 直接 `import { dict } from ../src-main/i18n/dict`，`:30-36` 的渲染端 `t()` 读的就是它。计划 :297 与任务 8 表 B1 原写「修改 `src/i18n.ts` 加 `ql.*`」是错的：所有键（渲染端 `ql.*` 与主进程 `err.ql.*` / `app.dialog.filterExe`）都落在 `src-main/i18n/dict.ts` 的 zh / en 两份里。(2) **K8 的收尾在任务 8 执行**：词典落地后把 **16 处**「常量映射传 key」的调用点改回**字面量**（实测拆分：`quick-launch-config.ts` 8、`quick-launch.ts` 6、`main.ts` 2 = 1 处 `err.ql.notFound` + 1 处 `app.dialog.filterExe`；主代理先前写的 17 把 `invalidError()` 的定义行也数了进去，已更正） `t()`（`quick-launch-config.ts` 9 处 `invalidError(QL_ERR.*)`、`quick-launch.ts` 6 处、`main.ts` 2 处），使它们进入 `key-coverage.test.ts:39-41` 的 `KEY_CALL` 与 `:44` 的占位符双向比对；因此 K15 加的「枚举断言」E6 改为「确认映射清零 + 删死代码」。`err-keys.ts` 的 `IPC_ERROR_KEYS` **不需要**登记 `err.ql.*`：那份清单只用于「经 IPC 传 key、渲染时翻译」的结构化错误（`err-keys.ts:2-6`），快捷启动的错误是 `throw new Error(前缀 + t(...))` 的已译串 | 实测 `src/i18n.ts:3/30-36`、`key-coverage.test.ts:15/30-32/39-45`、`err-keys.ts:1-28` + `dict.test.ts:64`、grep 得 17 处调用点 | 计划 §任务 8 文件行 · 任务 8 表 B1-B3/E6/I | 
| K19 | **任务 7 的覆盖缺口口径（复审重要 #1，计划/口径强制）**：本任务唯一的新行为——两处退出接线（`main.ts:381` / `:647`）**没有自动化测试保护**：`main.ts` 是纯副作用模块、处理器不外露，E5 又明确不要求为 `run_update` 造测试（要 mock 计划任务与安装目录文件）。这两行若被重构删掉，全套测试仍全绿。裁定：**接受现状**，登记为「靠真机门（任务 14 的 G3）把关」的已知缺口，**不得声称「已被测试钉住」**；把退出序列抽成可测的导出函数属扩范围，本任务不做。附带确认：真 node-pty 探针（`.temp/task07-probe.cjs`）算作对**机制**的取证（`stopAll` 真能清掉真实 ConPTY 进程树），**不算 G3 通过** | 任务 7 任务审查 + 实测探针脚本存在且自我把关（`process.exit(residual===0 && up>=3)`） | 任务 7 表 G3/I 段 · 任务 14 表 G3 |
| K18 | **任务 7 的两条口径**：(1) **跨任务已落地的语义不要求「先红」**——`stopAll` 的串行/吞单点/空表早退/透传在任务 5 就已实现并有测试（E8/E9），任务 7 新增的是**特征化用例**：首跑即绿是预期，红由**变异自检**提供（去早退 / 去吞异常 / 改 `Promise.all` 各让对应用例红，还原后 diff 为空）。已写进任务 7 表 D2。(2) **允许为 F4（串行）加测试**，即使它超出计划 步骤 1 的字面「追加幂等用例」：F4 是本任务唯一没有测试保护的硬约束，且它约束的是真机退出耗时。判据：新增用例钉的必须是**本任务表里**的硬约束，不是任意打磨 | 实测 `quick-launch.ts:320-346` 与任务 5 的 `quick-launch.test.ts:272/:300`；主代理自己跑的两次变异（去 `if (!inst) return` → 2 红含新幂等用例；改 `Promise.all` → 恰串行用例红） | 任务 7 表 D2/B3 |
| K17 | **任务 7 的退出路径口径（主代理主动取证后扩展）**：停终端必须覆盖**所有显式 `app.exit(0)` 路径**，不只是 `exit_app`。实测有两条：`exit_app`（`main.ts:376-380`）与 `run_update`（`main.ts:587-645`，同样 `await ps.stopGraceful(3)` → `app.exit(0)`）。依据：`app.exit` 不触发 `will-quit`（`main.ts:53-54` 已记录），conpty/cmd 是独立进程、父进程退出不会带走 → 漏一处即孤儿 PTY（R3）。**不在 `will-quit` 里加异步停止**：`window-all-closed → app.quit()`（:1191-1192）是优雅路径，而本应用的窗口关闭一律实现为「隐藏到托盘」（:233 / :468），要真覆盖得引入 `preventDefault` + 手动 quit 的机制，规格未要求 → 记为已知边缘，交最终整分支审查。另：`stopAll` 保持串行（计划 步骤 3 逐字），退出耗时上界 N×4s 是已知代价（任务 5 账本已记）。**第三处 `app.exit(0)`（`main.ts:56`，单实例锁失败）除外**：它在模块求值期退出，那时 `ql`（:1080）尚未构造、也没有渲染端能调 `ql_start` → 不可能有 PTY（真去调还会踩 TDZ）。最终整分支审查不要把它算成漏项 | 实测 `main.ts:53-54/233/376-380/468/587-645/1191-1192`、`quick-launch.ts:320-329` | 规格 §7.5 应用退出行 · 计划 §任务 7 · 任务 7 表 A2/B1/C3/E5/F4 |
| K16 | **任务 6 的两条收尾口径**：(1) `main.ts` 为钉住 `qlStartContext` 守卫新增了它历史上第一个导出 `qlStartContextOrThrow`（:1024）= **本轮接受**（只读 seam、不改行为、不触任何门；测试用命名空间取，缺失时是用例红而不是加载期炸）。**但不是分支最终形状**：更优做法是把「槽 + 守卫 + 两个构造期回调」抽到非入口模块（`src-main/ql-start-context.ts`，或把整段接线抽成 `registerQlIpc()`），入口回到零导出、测试可直接 import 无副作用模块、`ipc-ql.test.ts:382` 的 `typeof guard` 结构断言也能换成对真实 set/clear 序列的行为断言 → 留给最终整分支审查（任务 7 会再动 `main.ts`，但它的 check 表只覆盖 `exit_app`，不在此扩范围）。(2) 两条会延后爆的 Minor：`ipc-ql.test.ts:373-374` 断的是**未翻译的 key 文本**（依赖缺键返回 key 本身），任务 8 落地词典后必红 → 已写进任务 8 表 E7；`KNOWN_STARTED_IDS`（:170-173）是手维护清单，新增起进程用例会静默失效 → 记入账本 | 任务 6 定向复审（含它对「入口导出守卫」的明确判断，以及对计数包壳「仍测真实探测路径」的核实） | 任务 8 表 E7 · 账本 · 最终整分支审查 |
| K15 | **任务 6 审查后的三条口径**：(1) 「异步不阻塞」只做到一半——`detectTerminalsAsync`（`main.ts:1018-1020`）用 `setImmediate` 让出一拍后仍同步跑 3×3s，期间窗口 IPC / 托盘 / 定时器全部停摆。【口径强制：K10-3 要求 handler 异步、规格 §6.1 钉死 `spawnSync` 且不缓存】要真不阻塞得开 worker，属规格 §2 非目标 → 本任务不改，后果写进任务 6 表 J 段；下游硬要求见 K14(2)。(2) **exe 配置不探测**（任务 6 修复轮 1）：`available` 只在 shell 分支被读（`quick-launch-config.ts:104-107`、`quick-launch.ts:238`），所以保存/启动 exe 配置时不得付 9s 的探测代价——`entry.type !== 'shell'` 时传 `[]`。(3) **exe 的 cwd 保持不传**（K13 逐字 `launch(exe, [], configId)`）：exe 继承启动器工作目录（dev = 仓库根，打包态 = 安装目录），与 shell 走 `homedir()` 不同；规格 §7.3 对 exe 的 cwd 未规定，快捷启动的 exe 条目也没有参数，故不引入「按 exe 所在目录解析」的新语义（§2 非目标）。另：任务 8 新增 E6 钉三处常量映射的 key 取值（审查次要 #4） | 任务 6 任务审查（重要 #3 + 次要 #4/#10）+ 实测 `quick-launch-config.ts:104-107`、`quick-launch.ts:238`、`process.ts:23-26` | 任务 6 表 J 段 · 任务 8 表 E6/I 段 · 任务 12 / 任务 13 简报 |
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
