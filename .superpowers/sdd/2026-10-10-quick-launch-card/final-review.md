# 快捷启动卡片（Quick Launch · 交互终端版）· 最终整分支审查

- 审查日期：2026-10-12
- 范围：`341319a..dc3f310`（代码侧 31 files / +5447−43）
- 审查期间 HEAD 前进到 `22f4ab3`（`76f5aa2` / `22f4ab3` 两份纯文档提交：关闭 M2、任务 14 表补运行时取证并注明不替代真机门）。**代码零改动**，本报告结论对 `22f4ab3` 同样成立；我引用的「非 GUI 运行时补证」即出自这两份提交的工作区版本。
- 判据：规格 `docs/superpowers/specs/2026-10-10-quick-launch-card-design.md`（315 行，全文）· 计划 `docs/superpowers/plans/2026-10-10-quick-launch-card.md`（499 行，全文）· 索引 `00-index.md`（K1-K38 / M 组，全文）· 任务 14 表全文
- 只读审查：未改动工作区 / 索引 / HEAD（`git status` 只有主代理自己改的 `00-index.md`，我未触碰）

## 审查方法（分几遍看的）

diff 太大，一遍看不完，我分五遍：

1. 三份判据文档全文（规格 / 计划 / 索引 K+M 组 + 任务 14 表全文）
2. 主进程：`quick-launch-config.ts` / `quick-launch-terminals.ts` / `quick-launch.ts` 全文 + `main.ts` 的 ql 段与两处退出接线 + `preload.ts` / `ipc.ts` / `config.ts`
3. 渲染端：`TerminalTabView.vue` / `LogPanel.vue` / `QuickLaunch.vue` / `QuickLaunchModal.vue` 全文 + `App.vue` 的 ql 段与模板列序 + `log-tabs.ts` + `style.css` 的 grid / tab-bar
4. 测试：`quick-launch.test.ts` / `ipc-ql.test.ts` / `TerminalTabView.test.ts` / `App.test.ts` 的 ql 段全文；其余测试文件按用例名清单 + 关键断言抽查；另查了 `key-coverage.test.ts` 的扫描范围
5. 交叉核对：新词典键的实际引用点、`emitLog` 反馈链路、`ProcessState` 适配器、`Dropdown` 契约、tooltip 机制（CSS `:hover` 对 disabled 按钮仍生效，故「请先停止」提示可达）

我跑的验证命令：

| 命令 | 结果 |
|---|---|
| `npm test` | `Test Files 47 passed (47)` / `Tests 800 passed (800)`，exit 0 —— 与索引/规格声称的基线逐字一致，无减少 |
| `npx tsc -p tsconfig.main.json --noEmit` | 无输出，exit 0 |
| `git diff --name-only` 过滤非文档 | 34 个文件，全部在计划「文件结构」范围内（另含 `AGENTS.md` 流程文档与 `.gitignore` 的 `.superpowers/` 取反，均为用户已决定项） |
| 新代码里 `console.*` / TODO / FIXME / debugger 扫描 | 零命中 |

## 优点

具体、可核对的优点：

1. **`src-main/ipc-ql.test.ts` 是真正的集成门，不是 mock 秀。** `vi.mock('electron')` 只桩 Electron，其余全真：`ipcMain.handle` 注册的处理器被真调、`quick_launch.yaml` 写在 `os.tmpdir()` 真文件上、`ql_start` 真起 `cmd.exe` 的 ConPTY、exe 分支真用生产侧 `ProcessState` 适配器（含 `takePipes()` + `.resume()`），并断「不动 llama-server 的 `ps` 单例」（:304-313）。规格 §8 的 12 通道形状在这里被逐字钉住，包括「没有规格外的 `ql_*` 通道」（:194-197）。
2. **顺序类断言用时间线，不用「调用过没」。** `quick-launch.test.ts:24-43` 的 `timeline` 把 `deps.onData` 与 `pty.write` 的先后写进同一条序列，E4/E5 断的是完整序列 —— 「等首批输出再写命令」这条最容易悄悄退化的行为被真钉住了。
3. **两处「断言真的能失败」的自觉。** `stopAll(7)` 而不是 `stopAll(3)`（:300-307），因为常量恰好也是 3、结构上抓不到参数被吞；`changed_size_is_reported_again`（`TerminalTabView.test.ts:283-294`）专门补上尺寸去重的正半边，注释直说「没有这条，去重写成『每实例只报一次』也照样全绿」。这正是 K34(5) 那类缺口的自我防线。
4. **ESM live-binding 与 `vi.mock` 工厂的坑被干净解决**（`quick-launch.test.ts:99-113`）：不用可变 holder，而是命名空间取属性 + `setQl()` 写回，注释把「为什么不能直接 import 被测模块」写清了。
5. **数据层的两个判断是对的**：保存/删除走 `readRawMap()` 而不是 `qlLoad().items`（`quick-launch-config.ts:51-58`），否则一次保存会把判为 invalid 的条目静默抹掉；这条有测试（`quick-launch-config.test.ts:303`）。重名判定跳过自身 id，编辑同一条不被自己挡住。
6. **不重复定义类型**：渲染端三处 `import type` 直接取主进程配置层的类型（`App.vue:13`、`QuickLaunch.vue:13`、`QuickLaunchModal.vue:13-14`），构建期擦除、无运行时耦合。词典只有一份（K20）。
7. **复用优先于新抽象**：`nextCopyName` 原样搬出共用（含把描述它的注释一起搬走，K7）；`ConfirmDialog` / `Dropdown` / `truncateByWidth` / `emitLog` 全部复用；exe 类型在 `process.ts` 不可改的前提下按效果满足规格 §7.3（K13），并明确写了「必须 `takePipes()` 后 `.resume()`，否则管道写满阻塞子进程」。
8. **文档诚实且会自我更正**：任务 14 的 J 段推翻了自己表里 D2 的前提（K37：不加 `asarUnpack` 也有 `app.asar.unpacked`，真实差别是 18→21 个文件），并补了一条非 GUI 的运行时补证（从打包解包目录 `require` + `spawn('cmd.exe')` 成功），同时明确写「这不等于 E1」。规格状态行把「文件布局取证」与「运行时 dlopen 成功」分开写。这种不给自己抬轿的记录方式是这份交付最值钱的部分之一。
9. **`pid` 用 getter 不用构造期快照**（`quick-launch.ts:98-102`），依据是 ConPTY `innerPid` 异步赋值（实测 spawn 返回瞬间读到 0）—— 一个很容易踩的坑被取证后避开了。

## 问题

### Critical（必须修复）

**无。** 我没有找到会破坏数据、崩溃、或使规格 §8 / §9 契约不成立的问题。这条结论本身值得记录：14 个任务的逐任务验收确实拦住了契约级缺陷。

### Important（应该修复）

#### I-1 删除「运行中的」条目 → 不可关闭的页签 + 无法停止的进程（死胡同）

- 位置：`src/App.vue:438-443`（`refreshQlConfigs` 只刷新镜像，不做任何对账）、`src/modules/QuickLaunchModal.vue:131-139`（`doDelete` 无运行态守卫）、`src/App.vue:358-369`（`closeDisabled` 由 `qlStates` 决定）
- 现象：条目 X 正在运行时点 [编辑]→[删除]→[确认]：`ql_delete` 成功 → 卡片行消失（于是没有 [停止] 按钮）→ 但 `qlTabs` 里的 `ql:X` 与 `qlStates[X]` 原样留着 → 页签的 `[x]` 因 `closeDisabled` 永久禁用。用户既关不掉页签，也停不掉进程，只能退出应用。exe 类型同理（没有页签，进程在后台跑，UI 上没有任何入口能停它）。
- 为什么重要：规格 §7.5 对「页签 `[x]`」定的正是「运行中不得关，否则留孤儿 PTY」——同一个意图在删除路径上被完全放掉了。规格没写删除要不要守卫，但一个正常使用这个软件的人不会预期「删掉一条启动项之后，出现一个关不掉的页签和一个停不掉的进程」。
- 计划自己也在暗示这里缺一段行为：`ql.err.running`（`src-main/i18n/dict.ts:184` / `:526`）是计划 :299 要求建的键，**全仓零引用**（M22 只登记了另外三条，漏了这条）。键在、文案在、代码里没有守卫 —— 这是「原设计有守卫、实现漏了」的证据，不是「多余键」。
- 修法（二选一，都很小）：
  - (a) 在 `App.refreshQlConfigs` 里对账：新 items 里不再存在、且 `qlStates` 里仍 running/stopping 的 id → `invoke('ql_stop', id)` 并从 `qlTabs` 摘掉；顺带把已停止条目的残留页签一起摘（见 Minor 2）。约 10 行，不改任何契约。
  - (b) 在弹窗侧拦：卡片有 `states`，把 `running` 传给弹窗，运行中禁用 [删除] 并用现成的 `ql.err.running` 做 tooltip —— 同时消掉 M22 的这条「未用键」。
- 附带同源风险：重载时 `ql_states` 若失败（`App.vue:469-471` 静默 catch），主进程有活 PTY 而渲染端显示未运行，点 [启动] 得 `STATE: 已在运行`，同样进不了那个终端。低概率，但同一套对账能覆盖。

#### I-2 启动在途（最坏 ≈9s）没有任何界面反馈

- 位置：`src/App.vue:447-452`（`qlStarting` 只在 App 内部做单飞，不下发）；`src/App.test.ts:1348-1354` 把「在途期间按钮既没变红也没禁用」钉成了契约
- 现象：点 [启动] 后 `ql_start` 带一次终端探测（K10(3) / K14(2)：最坏 ≈9s，本机典型 ~90ms）。这期间卡片按钮完全不变（绿色 [启动]、可点但被单飞吞掉），用户得到的是「点了没反应」。
- 为什么重要：9s 的成本是 K14 / K15 已裁定的取舍，我不质疑它；但那条裁定只要求「单飞防重复启动」，没有处理「用户看不到任何东西在发生」。一个正常人会再点两下、然后认为程序坏了。这是 K14 的取舍落到界面上的剩余部分，不是新需求。
- 修法：`doQlStart` 在 `invoke` 之前先置 `qlStates[configId] = { running: true, stopping: true }`（行按钮变「…」并禁用，与停止在途同一视觉语言），失败分支已有 `clearQlState` 兜住。一行改动；**必须同步改 `App.test.ts:1348-1354` 的断言**（那是有意的契约变更，不是测试坏了）。

#### I-3 `stopAll` 末尾无条件 `instances.clear()` 会丢掉退出窗口内新起的实例

- 位置：`src-main/quick-launch.ts:317-327`（快照 keys → 逐个 await → `:326` 无条件 `clear()`）；调用点 `src-main/main.ts:376-381`（`exit_app`）与 `:640-648`（`run_update`）
- 现象：`stopAll` 的 await 期间窗口仍然活着、仍可点（渲染端 `onExitConfirmed` 只是 `invoke('exit_app')`，不锁界面）。此时点 [启动] → 新实例进 `instances` → 末尾 `clear()` 把它从表里抹掉而**没有停它** → `app.exit(0)` 后就是孤儿 ConPTY + shell。
- 为什么重要：这正是审查重点 R3 / 规格 §7.5 唯一想防的东西；而且它让真机验收 E9（退出后 `tasklist` 无残留）变成偶发失败，最难查的那类。K19 已登记「两处退出接线没有任何自动化测试保护」，所以这条竞态连变红的可能都没有。
- 修法（约 4 行，不新增词典键）：删掉 `:326` 的 `clear()`（`finalize` 已逐个摘除；`clear()` 唯一能清掉的恰是「没被停的实例」，即 bug 本身），并把单次快照改成带上限的二轮循环：`let guard = 0; while (this.instances.size && ++guard <= 64) { for (const id of [...this.instances.keys()]) await this.stopInternal(id, timeoutSecs); }`。

### Minor（锦上添花）

1. **`states()` 从不问进程死活**（`quick-launch.ts:304-315`，M7）：`running: !inst.stopping`。进程已退出而 `exit` 事件未到时，重载复原会为它建一个空页签、按钮短暂显示运行中。后果有界（`ql-exit` 到达即回落，且规格 §7.5 本来就保留页签），但一行可修：`running: !inst.stopping && inst.proc.isRunning()`。
2. **删除已停止条目后，保留页签的名字退化成配置 id**（`src/App.vue:359`：`qlConfigs[configId]?.name || tab.configId`）：页签上显示截断后的 id。与 I-1 同一根因，同一修法覆盖。
3. **重名校验把「已判为 invalid 的隐形条目」也算冲突**（`src-main/quick-launch-config.ts:129-136` 遍历的是 raw map）：用户可能收到「名字「X」已存在」却在列表里找不到冲突行（那条被判 invalid 不显示）。行为可辩护（防止遮蔽），但对用户是莫名其妙的报错。若要改：只对通过 `normalizeEntry` 的条目比对，或把冲突 id 一并写进消息。
4. **探测到的 `path` 与实际 spawn 的可执行文件可能不是同一个**：探测优先 `%ComSpec%`（`src-main/quick-launch-terminals.ts:37-42`）、`where.exe` 命中路径（`:45-59`），而 spawn 用裸名 `cmd.exe` / `pwsh.exe` / `wsl.exe`（`src-main/quick-launch.ts:37-42`）。规格 §7.3 明确钉了裸名，所以这是规格层面的取舍而非实现偏离；但「验证过的那个」与「跑起来的那个」在 ComSpec 被改过或 PATH 异常时会分叉。若要修，得先改 §7.3。
5. **M17 设想的修法不足以解决它自己引用的问题**（`src/modules/LogPanel.vue:92-104`）：`<button role="tab">` 内嵌 `<button>` 既违反 HTML 内容模型，也违反 ARIA —— `tab` 角色的子项是 presentational，close 按钮作为它的后代会被辅助技术忽略。改成 `div[role=tab]` 只解决前一半。要同时合法又可访问，close 必须是 `role=tab` 的**兄弟**（外层 `div.log-tab` 包 `span[role=tab]` + `button`）。这条应写回 M17，否则将来照现方案改会得到「HTML 合法但可访问性更差」。
6. **两条已实现但没有测试钉的分支**（K34(5) 同类，只是影响小）：`PtyProcess.onExit` 的「注册晚于退出则补发」（`quick-launch.ts:126-129`，注释专门解释了为什么需要它，但没有用例喂这个顺序）；`stopInternal` 在 `stopGraceful` 早退时把 `exitCode` 记为 -1 并立即摘除实例（`quick-launch.ts:333-345`，双 `stop()` 路径）。各一条用例即可。
7. **`stopGraceful` 吞掉 taskkill 的全部失败**（`quick-launch.ts:104-121`，含 `pid` 仍为 0 的窗口期）：`handle.kill()` 会杀掉 shell 本体，但孙进程（shell 启动的程序）依赖 `taskkill /T /F`，失败即静默。真机 E5（`ping -n 60` → [停止] → `tasklist`）是唯一能发现它的门。
8. **终端下拉标签未做视觉宽度截断，且这违反共享组件自己的契约**：`src/components/Dropdown.vue:4` 明写「label 截断由父级负责」，而 `src/modules/QuickLaunchModal.vue:78` 传的是未截断的 `ql.term.*`（en `PowerShell 7 (pwsh)` 视觉宽 19）。见 M19 裁决，最小改法两行。
9. **删除确认文案用未 trim 的名字**（`src/modules/QuickLaunchModal.vue:92-94`）：`formName.value` 原样插入，名字带尾空格时确认文案里出现空洞。保存时会被 trim，所以只是文案瑕疵。
10. **新测试夹具引入 stderr 噪声**（`src/App.test.ts:1196` 的 `default: return Promise.resolve(undefined)`）：`get_params` 返回 undefined → 每条 ql 用例都打 `[Vue warn]: Invalid prop: type check failed for prop "paramsMeta"`。不是产品缺陷，但噪声会淹掉真警告；在 `mountQl` 的 default 分支返回一个合法形状即可。

## 不予判断的项（考虑过，按范围搁置）

- 高频输出的 IPC 背压（`ping -t`）：规格 §13.5 明确本期不做（`handleFlowControl` 未启用）。
- xterm scrollback 5000 行上限：规格 §9.1 钉死。
- 静态两页签（`launcher` / `llama-server`）的任何行为：规格 §2 非目标 + 索引 G4；实测 `LogTabView.vue` 与 `process.ts` 一行未改。
- `window-all-closed → app.quit()` 路径不加 `stopAll`：索引 K17 已定口径（本应用的窗口关闭一律是实现为「隐藏到托盘」的优雅路径）。
- 第三处 `app.exit(0)`（`main.ts:56`，单实例锁失败）不接 `stopAll`：K17 明确排除（那时 `ql` 尚未构造），不算漏项。
- exe 的启动参数 / 工作目录、多发行版 WSL、页签拖动排序、会话录制回放、命令历史、工作流串联、日志落盘：规格 §2 非目标。
- 窗口重载后的终端历史回放（复原只建空页签）：规格 §2 / §7.6 明确。
- xterm 升级到 6.x：规格 §9.5 明确本期钉 5.5.0。
- 界面直接显示带 `VALIDATION:` 前缀的错误原文：全应用既有惯例（`TemplateModal.vue:202/218/250`），且 `QuickLaunchModal.test.ts:229` 明确钉住该行为。
- `pickExe` 无 try/catch（`QuickLaunchModal.vue:114-121`）：与 `TemplateModal.vue:149-153` 同构的既有写法，不是新引入的偏差。
- `style.css` 里 `.tip-up` 规则重复两次（`:414-425` / `:428-439`）：本分支未触碰，属既有重复。
- `.superpowers/` 入仓与 `.gitignore` 取反（`fb22844`）、`AGENTS.md` 的验收勾规则（`0e7c5b8`）：用户已决定的流程改动，不在特性范围。
- 窄窗口下四列横向溢出：规格 §4 明确「属现状，本期不改」。
- 页签条的 tablist 键盘导航（方向键）：既有两个静态页签同样是 `<button>`，非本次引入（与 M17 同域，M17 单独裁决）。
- `ql_start` 里「终端可用性」检查先于「已在运行」检查（`quick-launch.ts:231` vs `:235`）：两者都是错误返回，用户可见差异可忽略。
- 主进程 `console.error` 在打包态无处可看：`process.ts:41` 既有同口径，且本处已同时 `emitLog` 到日志页签。
- 截断预算 16 / 30 的具体数值：规格 §11-1 钉死，实现逐字一致（`App.vue:350`、`QuickLaunch.vue:113`）。
- `ql.term.*` 的中文措辞本身：规格 §10 明确不在钉死范围（真机复核，见 M15）。
- `run_update` 的 60s 等待预算与退出耗时叠加：归入 M13 裁决，不另立一项。

## 遗留项裁决（M 组）

| # | 裁决 | 理由 | 最小改法（若建议修） |
|---|---|---|---|
| **M3** 内联 `overflow: hidden; min-height: 0` | **保持推迟** | 判断正确：`.log-view` 已是 `overflow-y:auto` 的 flex item（`style.css:194-196`），按规范其自动最小尺寸本就是 0，`min-height:0` 纯冗余；`overflow:hidden` 是必需的（压掉 `.log-view` 的 `overflow-y:auto`）。零行为变化、零测试影响，属纯样式搬运。 | 若本轮要动 `style.css`（例如做 M19）就顺手：加 `.term-view { overflow: hidden; }`，删 `TerminalTabView.vue:235` 的 inline style（`.term-view` 类已存在，目前只当测试钩子）。 |
| **M5** 叶子组件里副作用导入 `@xterm/xterm/css/xterm.css` | **放弃该关注** | Vite 对组件内 CSS 副作用导入去重并在模块图加载时注入；`TerminalTabView` 由 `LogPanel` → `App` 静态导入，CSS 在应用启动即生效（`App.test.ts` 的挂载路径也证明该模块图可达）。搬到入口只让「谁需要这段 CSS」更难追，是负收益。 | — |
| **M6** `TerminalTabView.test.ts:278` 把「每次 ResizeObserver 都 fit」钉成契约 | **放弃该关注**（真机若抖再改） | 去重已经在 `reportSize` 挡住了真正贵的部分（IPC + `pty.resize`）；`fit()` 只是量一次盒子尺寸，而 xterm 在容器变化时本来就要重排。给未观测到的问题加防抖是提前付复杂度。`fitCalls === 3` 只是记录当前形状，真要改防抖时改这条断言的成本是一行。 | 真机出现拖窗口抖动再加 rAF 节流，并把断言改成「调用次数有上界 + 末次尺寸正确」。 |
| **M7** `states()` 从「在 Map 里且不在 stopping」推导 running | **保持推迟**（一行可修，建议真机 E9 之后再定） | 后果有界：空页签 + 按钮短暂显示运行中，`ql-exit` 到达即回落；而规格 §7.5 本来就在退出后保留页签，所以「空页签」与「保留历史的页签」对用户差别很小。规格 §8 的返回类型也没有 `kind`（K11(5) 已处理 exe 侧）。 | `running: !inst.stopping && inst.proc.isRunning()`（`quick-launch.ts:311`）+ 一条「进程已死、exit 未到 → states 不含 running」的用例。 |
| **M10** `KNOWN_STARTED_IDS` 手维护清单 | **现在就修** | 不修的代价不是「测试脏」，而是失败用例在开发机上留下真的 `notepad.exe` / `cmd.exe` 窗口（ConPTY 子进程独立于测试进程）。修的成本比解释它低。 | `invoke()` 里 `if (name === 'ql_start') startedIds.add(String(args[0]))`；`afterAll` 用它替代 `ipc-ql.test.ts:171-173` 的清单（保留 :178 的「兜底不是判据」注释）。 |
| **M11** 探测计数只数模块级 `detectTerminals` | **放弃该关注** | 事实核对：这条不会「静默归零而仍绿」。同一文件 `:440-451` 的 shell 对照组断言 `cap.termProbes === beforeShell + 1`；换入口 → 计数不涨 → 该用例红。风险已被配对断言消掉，不需要额外机制。 | — |
| **M12** `stopAll` 快照 + 无条件 `clear()` 的竞态 | **现在就修** | 见 I-3：产物正是 R3 要防的孤儿 PTY，且 K19 已登记这两处退出接线没有任何测试保护，真机 E9 会因此偶发。 | 删 `quick-launch.ts:326` 的 `clear()`；把单次快照改成带上限的二轮循环（`while (this.instances.size && ++guard <= 64)`）。 |
| **M13** 退出最坏 N×4s | **保持推迟**（真机 E9 实测后再定） | 典型路径不付这笔钱：`kill()` 后 shell 通常立即 `onExit` → 不进 taskkill 分支 → 不付 `FORCE_EXIT_WAIT_MS`。只有需要强杀的实例才付。先测再改，否则动的是任务 5 已审的停止语义。 | 若实测超预算：`stopAll` 改并发，或在退出路径把 `FORCE_EXIT_WAIT_MS` 置 0（它只为渲染端按钮回落服务，退出时不需要）。 |
| **M15** zh 界面措辞无测试钉 | **保持推迟**，但登记一条事实更正 | 登记已过时：zh 措辞并非完全无钉 —— `TerminalTabView.test.ts:351/387-389/405/431-432` 逐字钉了「清空终端 / 查找终端输出… / 上一个匹配 / 下一个匹配 / 清空查找 / 关闭页签 / 终端运行中，请先停止再关闭」。未钉的只是卡片与弹窗的 zh 措辞（那些测试一律用 `t()` 取值）。规格 §10 明确 zh 措辞不在钉死范围 → 保持真机复核，不加测试。 | — |
| **M16** 测试文件不在类型门 | **保持推迟**（另开一次工程化任务），但登记范围比记录的更宽 | 事实更正：`package.json:10` 的 `build` = `vite build && tsc -p tsconfig.main.json`，`tsconfig.main.json:14-15` 只含 `src-main/**/*.ts` 且排除测试 —— **`src/` 下的 `.ts`/`.vue` 根本没有类型门**，不只是测试文件。本特性新增约 1000 行渲染端 TS 从未被类型检查（含 `getCurrentInstance() as unknown as`、`formShell.value as TerminalId` 这类断言）。补 `vue-tsc` 会一次性暴露既有欠账，塞进本特性会把范围撑开。 | 单开 chore：加 `tsconfig.web.json` + `vue-tsc --noEmit`，先以报告模式接入（不阻断），清完既有报错再升级为门。 |
| **M17** `button` 嵌 `button` | **保持推迟**，但必须补一条更正（见 Minor 5） | 渲染与点击正常、E3/E4 已证；本任务不改既有页签元素类型是对的。但 M17 设想的修法（`div[role=tab]` + 键盘）只解决 HTML 合法性：ARIA 里 `tab` 的子项是 presentational，close 按钮作为它的后代会被 AT 忽略。这条不写回 M17，将来按现方案改会得到「合法但可访问性更差」。 | 真机复核时一并处理：外层 `div.log-tab` → `span[role=tab][tabindex=0]` + 同级 `button`，并补 Enter/Space 与方向键。 |
| **M18** 弹窗关闭按钮复用 `tplModal.close` | **保持推迟**（同意 K32(2)） | 为一个 `aria-label` 加键要同时改规格 §10 + 任务 8 表，属扩范围；文案「关闭弹窗」语义正确。提到 `common.close` 两处共用是干净做法，但那是跨模块词典重构，属独立清理。 | 若做：一次改完两处调用点（`key-coverage.test.ts:39-41` 会同时校验两处调用点，改一半会红）。 |
| **M19** 删除确认里的名字 / 终端下拉标签未截断 | **现在就修（只修下拉那一半）**；确认文案那一半保持推迟 | 下拉这一半不只是「规格没要求」：`src/components/Dropdown.vue:4` 自己写了「label 截断由父级负责」，而调用方传的是未截断标签（en `PowerShell 7 (pwsh)` 视觉宽 19 > 页签/列表同级的 16）—— 违反的是共享组件的既有契约。确认文案那一半同意 K32(3)：`ConfirmDialog` 有 `word-break` 兜底，真机难看再补（补时同步规格 §11）。 | `QuickLaunchModal.vue:78`：`label: truncateByWidth(TERM_LABEL[info.id](), 16), tip: TERM_LABEL[info.id]()` —— `Dropdown` 的 option 已支持 `tip` 字段（`:18`），零新组件、零新键。 |
| **M21** `getCurrentInstance().exposed` 取 `fit` / `focus` | **保持推迟** | 已用 `if (exposed && typeof … === 'function')` 兜住失败（`App.vue:397-400`），失败后果只是不 fit / 不聚焦。改成显式 `registerView` 透传要动 `LogPanel` / `TerminalTabView` 的 props，在任务 13 的 B 段之外。 | 将来若动这两个组件：`register` 之外再传一个 `registerView(id, handle)`，由页签在自己的 `onMounted` 里显式调用，删掉 `getCurrentInstance`。 |
| **M22** 未被引用的词典键 | **现在就修，但方向相反**：`ql.err.running` 不是冗余，是**未接线的行为** | 计划 :299 要求建这条键，说明原设计里有「对运行中的条目做守卫」；实现里没有任何代码用它 —— 它正是 I-1 需要的文案。M22 的清单本身漏了这条（只列了 `ql.err.nameTaken`、`ql.log.exit`、`ql.log.fail`）。 | 用 `ql.err.running` 实现 I-1 的守卫（或 I-1 选 (a) 时把它删掉并同步计划 :299 + 任务 8 表 C8/C10）。另外三条：`ql.err.nameTaken` 被 `QuickLaunchModal.test.ts:230` 反向引用（断「不用它」），留着有文档价值；`ql.log.exit` / `ql.log.fail` 确属冗余，删要同步计划 :299 与任务 8 表 —— 属文档同步，不是代码问题，可推迟。 |

## 真机门（§12 硬门 1-9）未跑：风险评估与最该先跑的几条

**风险定性。** 未跑的不是「功能没验证」，而是**只剩真机能验的那一层没验**。已经关掉的：配置层全部语义、IPC 形状（真处理器 + 真 PTY + 真 yaml）、进程状态机与停止时序（含真 `cmd.exe`）、渲染端接线（App → LogPanel → TerminalTabView 全链，xterm 打桩）、打包文件布局，以及最大的一条风险 R4 —— 任务 14 的 J 段用非 GUI 方式从打包解包目录 `require` + `spawn('cmd.exe')` 成功，并论证了 `conpty.node` 是 N-API 构建（不绑 V8 ABI），所以「打包后 dlopen 失败」的概率已被显著压低。

仍然敞开的，恰好是**只有真窗口才能观察的三类**：xterm 的真实渲染与字体度量（K23(1) 的 canvas 测量问题只能靠眼睛看）、ConPTY 的输入回写与进程树清理（单测只断 `taskkill` 被以该 pid 调用，不能断它真把孙进程杀干净）、以及自动执行命令与真实 shell 启动的时序（§13.4 自己承认是启发式）。加上 K19 登记的「两处退出接线没有任何测试保护」，真机门是这些缺口的**唯一**防线，不是形式。

**建议按这个顺序跑（信息量 / 分钟从高到低）：**

1. **E1 打包产物里开终端**（R4 的收尾）：非 GUI 补证只覆盖了 dlopen，没覆盖「页签出现提示符、能输入」。
2. **E5 进程树**（`ping -n 60` → [停止] → `tasklist | findstr PING`）：唯一能证伪 `taskkill /T /F` 与 `pid` 时序（Minor 7）的门；顺带看页签保留与 `[x]` 回落。
3. **E9 退出应用 → `tasklist` 无残留**：覆盖 `stopAll` 两处接线（K19：无测试保护）与 M12 / M13；跑的时候顺手验「退出确认弹出后再点一次 [启动]」，正好命中 I-3 的竞态。
4. **E3 交互输入**（`set /p X=NAME?` → 输入 `Alice` → `echo %X%`）：v2 的全部价值主张在这条上；单测只证了 `onData → ql_write` 的接线，没证 ConPTY 真把输入喂回程序。
5. **E6 自动执行的时序**：真实 shell 冷启动与「等首批输出」启发式（§13.4）的唯一实测机会。
6. E8（8 条页签 + 超长名）顺带看 M19 与 I-1 的页签名退化；E2 / E4 已有规格 §7.4 的真机取证，E7 已被 `ipc-ql.test.ts:304-313` 用真 `ProcessState` 覆盖 —— 这三条优先级最低。

## 建议

1. **把「配置消失 → 停进程 + 摘页签」做成 App 的一条显式对账**，而不是在弹窗里加守卫：App 已经持有 `qlStates` / `qlTabs` / `qlConfigs` 三份状态，缺的只是「三者不一致时以谁为准」的一条规则。补上它，I-1 与 Minor 2 一次消掉，重载时 `ql_states` 失败的边缘也顺带覆盖。
2. **给「没有测试保护的关键接线」留可测形状**：K19 已诚实登记两处退出接线无测试。若将来再动 `main.ts`，按 K16(1) 的方向把 ql 接线抽成 `registerQlIpc()`（或至少把退出序列抽成一个导出的 `async function quitAll()`），入口回到零导出 —— 那时 I-3 这类竞态也能被直接测。不建议本轮做。
3. **测试卫生**：`mountQl` 的 default 分支返回合法形状（Minor 10），让 stderr 只出现真警告；`quick-launch.ts:126-129` 与 `:333-345` 两条已实现分支各补一条用例（Minor 6）。这两项都是「断言能不能失败」的自检，成本各几分钟。
4. **文档一致性**：M15 与 M16 的登记内容需要按上文更正（zh 措辞已有部分逐字钉；渲染端整体无类型门）；M17 需要补 ARIA 那一半。这三条不改代码，只改索引，避免下一轮审查重复讨论。
5. 流程上，这份交付的 J 段质量（含推翻自己前提的 K37、主动补非 GUI 补证）值得作为模板保留 —— 它让这次审查能在短时间内确认「哪些风险真的被关掉了」，而不是重跑一遍实现。

## 评估

**可以合并吗？** 修完再合。

**理由：** 契约层没有 Critical，主进程与渲染端的架构与既有代码（GPU 卡片 / 日志面板 / 模板模块 / `ProcessState`）集成干净、复用充分，测试是行为级的且多处刻意设计成能失败（47 files / 800 passed 与 `tsc` 门我复跑确认）。合并前应修的是三处小改动：I-1（删除运行中条目导致的不可关闭页签 + 不可停止进程，并顺手接上已存在却没人用的 `ql.err.running`）、I-3（`stopAll` 末尾无条件 `clear()` 的孤儿 PTY 竞态）、M10 / M19（各 2-3 行）；I-2 需要一次有意的契约变更（含改 `App.test.ts:1348-1354`），建议一并做，由你决定是否本轮做。真机 §12 硬门 1-9 是**发布门**而非合并门，但按上面的顺序跑完 E1 / E5 / E9 / E3 / E6 之前不应发布。
