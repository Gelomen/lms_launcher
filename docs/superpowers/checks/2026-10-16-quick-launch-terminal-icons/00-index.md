# 快捷启动弹窗 [终端] 下拉的真实图标 · check 表索引

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md)
> 文档 commit = `5c4313d`（代码一行未改）。实现的起点就是它。
> 普查脚本：`node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs`（AGENTS.md「H3 勾完整性门」）
> 测试基线（主代理 2026-10-16 16:07 实测，子代理不重跑）：`npm test` → `Test Files 52 passed (52)` / `Tests 912 passed (912)`，exit 0。各任务后的预期总数见 G8 行。

## 清单表

| 任务 | 标题 | 表 | 前置 | 钉住的审查重点 |
| --- | --- | --- | --- | --- |
| 1 | `ql-terminal-icons.ts` —— 缓存 + PowerShell 提取接缝 | [task-01-ql-terminal-icons-cache-and-powershell-seam.md](task-01-ql-terminal-icons-cache-and-powershell-seam.md) | 无（本 feature 第一个任务） | RF1 RF3 |
| 2 | `TerminalInfo.icon` + `main.ts` 接线 + IPC 形状门 | [task-02-terminal-info-icon-main-wiring-ipc-gate.md](task-02-terminal-info-icon-main-wiring-ipc-gate.md) | 1 | RF1 RF2 RF3 |
| 3 | `Dropdown` 的 `imageUrl` 通道 + 图标尺寸样式 | [task-03-dropdown-imageurl-channel-and-icon-sizing.md](task-03-dropdown-imageurl-channel-and-icon-sizing.md) | 无（与 1/2 无接口依赖，但按编号串行） | RF4 RF5 |
| 4 | `QuickLaunchModal` 接上真实图标 + 改写既有 CSS 契约门 | [task-04-quick-launch-modal-wires-real-icons.md](task-04-quick-launch-modal-wires-real-icons.md) | 2、3 | RF1 RF2 RF5 |
| 5 | 打包 + 真机清单（用户执行） | [task-05-packaging-realmachine.md](task-05-packaging-realmachine.md) | 1–4 | RF1 RF4 + 规格 §9-R1/R3/R4/R6 |
| 6 | 修复轮：图标只补给 `ql_terminals`（最终审查 I-1 / I-3 / M-1） | [task-06-fix-icons-only-for-ql-terminals.md](task-06-fix-icons-only-for-ql-terminals.md) | 1–5（最终审查之后新增） | RF1 RF3 + 规格 §6.3 / §7.1-14~16 |

**顺序**：串行，一次只跑一个子代理，按任务号（AGENTS.md 工作流第 5 步）。任务 3 不依赖 1/2 的接口，但「前置」列只描述依赖关系，不改变串行口径。

## G 组：plan「全局约束」→ 可验证检查项

| # | 约束（plan 逐字） | 怎么验 | 落在哪张表 |
| --- | --- | --- | --- |
| G1 | 探测层四行判定 / 顺序 / 不缓存一字不动，`quick-launch-terminals.ts` 只允许改 `:17-20` 与 `:9` | `git diff -U0 src-main/quick-launch-terminals.ts` 只允许两处 hunk | task-02 F 段 |
| G2 | 不新增 i18n 键；三门不得变红；新代码字面量无汉字 | `npx vitest run src-main/i18n` 全绿 + `git diff src-main/i18n` 为空 | 全部五张表的 G 段 |
| G3 | 不新增依赖 | `git diff package.json pnpm-lock.yaml package-lock.json` 为空 | task-01 F 段 |
| G4 | 提取走 `execFile`（异步），不用 `spawnSync` | `grep -n spawnSync src-main/ql-terminal-icons.ts` 无命中 | task-01 F 段 |
| G5 | 任何失败不抛出、不写日志、不弹提示 | 假接缝三种失败（null / 抛错 / 单项 null）用例 + `grep -n 'emitLog\|console\.' src-main/ql-terminal-icons.ts` 无命中 | task-01 E 段、task-04 E 段 |
| G6 | 不传 `imageUrl` 的调用方一字不变 | 六个调用方（索引 K23）的测试文件全绿且 diff 为空：`TemplateModal.test.ts` / `LaunchBar.test.ts` / `UpdateModal.test.ts` / `SettingsModal.test.ts` / `QuickLaunchModal.test.ts:669-700` | task-03 F/G 段、task-04 F/G 段 |
| G7 | 不改宽度（`.term-field` / `.type-field`） | `git diff src/modules/QuickLaunchModal.vue` 不含 `:444` / `:534` 两条规则；`type_field_is_widened_to_180px` 仍绿 | task-03 F 段、task-04 F 段 |
| G8 | 每任务收尾门：tsc + 定向 + 全量 | `npx tsc --noEmit -p tsconfig.main.json` 无输出；`npm test` 总数 = 基线 + 累计新增（1→918、2→919、3→921、4→923、6→926） | 全部五张表的 G 段 |
| G9 | 子代理不 `git add`、不 commit | 子代理报告里 `git status --porcelain` 有改动、`git log --oneline -1` 仍是文档 commit | 全部五张表的 H 段 |
| G10 | 只改该任务 B 段列出的文件 | `git diff --name-only` 与该表 B 段逐字对照 | 全部五张表的 B 段 |

## R 组：plan「审查重点」→ 钉住的任务与测试

| # | 重点 | 钉住它的任务与测试 |
| --- | --- | --- |
| RF1 | 取不到图标 → 该项退回纯文字，不报错、不空掉整个下拉 | task-01 `seam_failure_yields_no_icon_and_throws_nothing`；task-04 `terminal_option_without_icon_renders_no_img`；真机门 §7.2-4 |
| RF2 | 列表形状不变：顺序 / 条数 / `id` / `path` / 标签文案一字不动 | task-01 `order_ids_and_paths_are_untouched`；task-02 改写后的 C4 形状断言 + 既有「两次调用不共用数组实例」；task-04 断言 `li` 的 `textContent` 与 `t('ql.term.*')` 逐字 |
| RF3 | 图标缓存不得把「探测不缓存」带偏 | task-01 `cache_hit_skips_the_extraction_process`；task-02 `terminal_icons_are_stable_across_calls_and_come_from_the_disk_cache` + 既有 C4 第一条一字不改 |
| RF4 | 不传图标的下拉（`TemplateModal` / `LaunchBar` / [类型]）一字不变 | task-03 在既有 `options_without_icon_render_no_icon_and_the_trigger_keeps_only_the_caret` 里加 `flexGrow` 不是 1；真机门 §7.2-6 |
| RF5 | 图标随选中项走；`imageUrl` 与 `icon` 同时存在只渲染一个 | task-03 `options_with_imageurl_render_an_img_before_the_label_in_trigger_and_panel` + `imageurl_wins_over_icon_and_absent_imageurl_keeps_the_fa_icon`；task-04 换选项 → trigger 的 `src` 跟着换 |

## V 组：跨任务回归门

| # | 何时必须跑什么 |
| --- | --- |
| V1 | 任务 2 之后必跑：`npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts`（`ql_terminals` 载荷变了，`quick-launch.ts` 消费 `TerminalInfo.path` 的那条链要确认没被带偏） |
| V2 | 任务 3 之后必跑：`npx vitest run src/components/Dropdown.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts src/modules/UpdateModal.test.ts src/modules/SettingsModal.test.ts`（共享组件被**六个**调用方用，索引 K23；名单外一律以 `npm test` 全量兜底） |
| V3 | 任务 4 之后必跑：`npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts`（含 [类型] 图标门 `:669-700` 与 180px 宽度门 `:711-721`，两条都不许动） |
| V4 | 每个任务之后：`npx tsc --noEmit -p tsconfig.main.json` + `npm test`（G8） |
| V6 | 任务 6 之后必跑：`npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts src-main/quick-launch-terminals.test.ts src/components/Dropdown.test.ts`（载荷接线与「谁付提取代价」都变了）；另：`cmd /c build.bat` 重打包 + 重跑 task-05 的 D2/D3（产物变了，旧证据作废） |
| V5 | 任务 5 之前：`build.bat` 产物核对（`asar list` 里能看到 `dist-main\\ql-terminal-icons.js`），不得用「自动化已过」代替真机门 |

## K 组：已定口径（口径 / 依据 / 落在哪张表）

| # | 口径 | 依据 | 落在哪张表 |
| --- | --- | --- | --- |
| K1 | 图标来源 = 从 exe 真实提取（不是内置图形） | 用户选定（规格 §8-Q1） | task-01 A/C |
| K2 | 机制 = Windows PowerShell + `System.Drawing`，固定路径 `%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` | 用户选定（§8-Q2）+ 实测 P1/P3；K3 口径见规格 §8-K3 | task-01 C |
| K3 | 面板选项 + 收起态 trigger 都显示图标 | 用户选定（§8-Q3，与 [类型] 一致） | task-03 C、task-04 E |
| K4 | pwsh 与 Windows PowerShell 图标几乎相同 → 照实显示不区分 | 用户选定（§8-Q4，实测 P2） | task-05 真机门 1 |
| K5 | 取不到图标 = 该项不显示，其余照常，不写日志 | 用户选定（§8-Q5） | task-01 E、task-04 E |
| K6 | 缓存 = `<dataDir>/cache/terminal-icons/`，键 = sha1(规范化小写路径)，**不失效、不清理** | 用户选定（§8-Q6/Q7 原话） | task-01 C/E、task-02 B |
| K7 | 载荷 = `TerminalInfo` 加可选 `icon`，不新增 IPC 通道；同步改「只下发 {id,path}」的两处现存载体 | 用户选定（§8-Q8）；载体 = `quick-launch-terminals.ts:9` 与 `ipc-ql.test.ts:279`（前置 spec 已被 `b330a5c` 删除，P12） | task-02 B/C |
| K8 | 提取用 `execFile` + 超时 8000ms；`powershell.exe` 冷启动实测双峰（131–1727ms），提取本身只加 ~90ms | 实测 P4 + 索引 K2/K4（规格 §8） | task-01 C/D |
| K9 | 图标盒子 14×14（`1em`），`vertical-align: -0.125em` 与 vue-fontawesome 对齐 | 实测 P9 + 索引 K5（规格 §8） | task-03 C |
| K10 | 不改 [终端] 宽度：356.7px 可用区，最长项需求 ~196px | 实测 P8 + 索引 K6；本轮不重测 → 真机门兜（R6） | task-03 F、task-05 真机门 1/2 |
| K11 | `.gitignore` 加一行 `cache/`（dev 态 `dataDir()` = cwd，跑应用会在仓库根生成缓存目录）；测试不产生它（`ipc-ql.test.ts:168-175` 把 `process.cwd` 换成临时目录） | 本轮实测：`.gitignore` 现有规则不含 `cache/`；`ipc-ql.test.ts:175` 的 `process.cwd = () => workDir` | task-02 B/F |
| K12 | 既有两条断言的改法：`ipc-ql.test.ts:279` 放宽到「必含 id/path、可选 icon、不得有别的键」；`QuickLaunchModal.test.ts:726-737` 改成两个下拉都断 `flexGrow === '1'`，「不传图标不受影响」那一半搬到 `Dropdown.test.ts` | 规格 §6.6（本次要求，不是回归失败） | task-02 C/D、task-03 D、task-04 D |
| K13 | `powershellExtract` 用 `execFile` 的**内联 Promise 包装**（不 import `node:util` 的 `promisify`），并补本地类型 `ExecFileOptionsWithStdio` 承载 `stdio`（@types/node 的 `ExecFileOptionsWithStringEncoding` 不声明它）；五个取值一字未改 | 实测：首版按 plan 步骤 3 写 `promisify` 会撞 F2 的 import 白名单；直接写 `stdio` → tsc TS2353（task-01 J-7）。探针 `.temp/ql-term-icon-probe/encoded-batch.cjs:31` 带同一 stdio 实测可用 | task-01 C2/F2、plan 任务 1 步骤 3 |
| K14 | 「缓存目录不可写」= **本次不缓存、图标照常**（不是「该项无图标」）；两者都不抛、不写日志 | spec §6.2 比 plan G5 的概括更具体，spec 是真相源 | plan G5、task-01 C5 |
| K15 | D2 的「跑红」以 vitest 2.1 的实际措辞为准：`Failed to load url ./ql-terminal-icons … Does the file exist?` + `Tests no tests`（0 条被收集）——判据是「模块解析不到、不是断言写错」 | 实测 task-01 J-5；原预期写的是 Node CJS 的 `Cannot find module` | task-01 D2 |
| K16 | 「夹具不在则跳过 + 注释指向真机门」的先例 = `src-main/shell-execute.test.ts:204-222`（不是索引 K11，K11 是 `.gitignore` 口径）；测试文件按 plan 步骤 1 需要 `node:os`/`node:fs`/`node:path` 夹具 import，F2 白名单只约束 B1 实现文件 | 实测两处文件原文；plan 任务 1 步骤 1 明确要求 `os.tmpdir()` 夹具 | task-01 E6/F2 |
| K17 | 实现起点与「文档 commit」= 当前 HEAD（`50c9e77`）；plan:6 的 `b3604be` 与 task-01 A1/F6 的 `5c4313d` 是文档生成时的旧值，不改写历史 hash | 实测 `git log --oneline -1` | task-01 A1/F6 |
| K18 | 任务 1 的 H1 暂存范围除两份 `src-main/` 新文件外，另加受影响的三份文档（plan 的 G5/步骤 3、索引 K13–K17、本表受裁决影响的行） | AGENTS.md「偏离 spec：先改 spec / plan / check 表（同一 commit）」优先于 H1 的窄范围 | task-01 H1 |
| K19 | 两处口径：① `ipc-ql.test.ts` C4 的「只含 {id,path}」只在 `it()` 标题里，**标题一字不改**，新口径写进断言旁的注释（plan 任务 2 步骤 1 原文自相矛盾，已改）；② 新用例对「本机 PowerShell 可用」是**硬断言**，不为 §9-R1（约束语言模式 / WDAC）加豁免 —— spec §7.1-7 未给豁免口径，与任务 1 真机冒烟的做法一致（只在夹具 exe 不在时 `skipIf`）；R1 机器的降级现象归真机门 §7.2-4 | 实测：该字符串只在标题里；任务 2 报告 §5 疑虑 1/2 | plan 任务 2 步骤 1、task-02 C5/E5 代价（最终审查 M-4 补记）：标题里的「只含 {id,path}」与放宽后的断言不完全对得上，读者可能误读 → 读该用例要连着看它下面的注释。 |
| K20 | 文档里的行号（spec §2「现状」表、各表 A 段锚点）= **取证时的位置**；实现后会漂移（例：`main.ts` 的 `ql_terminals` handler `:1126` → `:1142`）。不改写历史行号，改后真实行号写在各任务报告与 J 段 | 实测 `git diff` 净增行数；与 K17 同一口径 | 全部五张表的 A 段 |
| K21 | `Dropdown.test.ts` 里断 `flexGrow` 的用例**必须先注入真实 `src/style.css`**（同文件 `:106-112` 的 `injectRealCss` 手法）：`options_without_icon…` 所在 describe（`:182-238`）没有注入真 CSS，happy-dom 里没有 `.select-icon + .select-label` 规则 → 不注入则「不是 1」恒真 = 假勾 | 起飞前扫描 PF2：读 `Dropdown.test.ts:100-112`（helper 是另一个 describe 的局部函数）与 `:182-238`（无注入） | plan 任务 3 步骤 1、task-03 E3 |
| K22 | 两个 `<img>` 带 `alt=""`（装饰图，规格 §4-4）：C3 字面只写 class 与 `:src`，`alt` 不在契约里 → **接受**，与既有 `src/App.vue:539` 的写法一致，且不写 `alt` 会让读屏器念 data URL | 实测 `App.vue:539` 同写法；任务 3 报告 §5 疑虑 1 | task-03 C3、task-04 E1 |
| K23 | `Dropdown` 的调用方 = **六处**（实测 `<Dropdown` 全仓 grep）：`SettingsModal.vue:109`、`src/modules/LaunchBar.vue:118`、`QuickLaunchModal.vue:234`（[类型]）、`QuickLaunchModal.vue:250`（[终端]）、`TemplateModal.vue:409`、`UpdateModal.vue:685`。spec §6.4 / plan G6 / 索引 G6·V2·RF4 原来只点名三个 → **名单补全**；定向名单只是快速反馈，权威门始终是 `npm test` 全量 | 独立审查（任务 3）指出并实测：`UpdateModal.test.ts` 有 ~25 处 `.select-trigger` 断言、`SettingsModal.test.ts` 3 处，另跑这两份 = 82 passed | plan G6、task-03 G2、task-04 G2 |
| K29 | 「读路径」这类门的**红**只能靠**变异取证**产生：改前那条本来就绿（读缓存路径本来就工作）。做法 = 临时把被测函数改坏（`readCachedIcon` → `return null`）→ 用例红 → 还原并 `git diff --quiet` 确认 | 任务 6 报告 §5 疑虑 1（实现者指出 check 表 D1 的预期不成立，我核对其论证成立）；与 K21 的「有牙」要求同一族 | task-06 D1、spec §7.1-15 |
| K30 | §7.1-14 的代价门 = **一条三段式用例**（保存 → 启动 → 对照），不照 `ipc-ql.test.ts:736-760` 拆两条。理由：这是一个契约的两条路径，拆开会为了计数改文档；代价 = 与该文件既有风格不一致、失败时靠断言消息定位 | 任务 6 报告 §5 疑虑 2；表里 D2「+2」/ G4「926」与实现一致 | task-06 E1·E2 |
| K31 | 声明门断的是**解析后的 px 值**（`14px`），不是字面 `1em`：happy-dom 的 `getComputedStyle` 按继承字号解析 `em`。它防「规则被删 / 改尺寸 / 去 `object-fit` / 改间距」，不防「把 `1em` 写成 `14px`」（渲染等价，K9 要的就是 14×14 的渲染尺寸） | 任务 6 报告 §5 附加口径 1；实测 `.select-trigger` 字号 = `var(--fs-body)` = 14px | spec §7.1-16、task-06 E4 |
| K24 | **补图标的调用点只有一处 = `ql_terminals` 的 handler**；`detectTerminalsAsync` 只探测、不补图标；建目录只在提取层做一次，`main.ts` 的 `terminalIconCacheDir()` 只算路径 | 最终审查 I-1 + I-2⑥；`ql_save:1134` / `ql_start:1155-1157` 只用 `.map(info => info.id)`，白付 0.9–1.7s（最坏 8s）；先例 = `ipc-ql.test.ts:736-760` | spec §6.3 / §6.2 / §8-K1、plan 任务 6、task-06 全表 |
| K25 | 「读缓存」这条路径的钉法 = **哨兵字节**（先写非 PNG 的字节到缓存键，断返回的 `icon` 是它的 base64）；原 `ipc-ql.test.ts:315`/`:324` 只证「写入发生 + 键稳定」，措辞相应降级，**用例名不改**（K19） | 最终审查 I-3：键只由路径决定 + 真接缝确定性 → 读路径全坏也全绿 | spec §7.1-15、task-06 C/E 段 |
| K26 | 图标盒尺寸契约的自动化 = **声明检查**（`injectRealCss` + `getComputedStyle` 读 `1em` / `object-fit` / `margin-right`）；happy-dom 不做布局，**「不被截断」仍归真机门 §7.2-1** | 最终审查 M-1；先例 = `QuickLaunchModal.test.ts:793-803` 的 180px 门；与 K21 同一手法 | spec §7.1-16、task-06 E 段 |
| K27 | 三条已接受的代价（不在本任务修）：损坏 / 半写缓存**永久命中**（无 magic 校验）；**无在途合并**（并发调用起多个 `powershell.exe`）；`systemRoot()` 两处重复 | 最终审查 M-2 / M-7 / M-3；前两条是 Q7「不失效不清理」与 §6.2 口径的直接后果，第三条是 G1「不改探测层」逼出来的 | spec §9-R9 / R10 / R11、真机门 §7.2-11 |
| K28 | 真机清单从 7 条扩到 **15 条**（§7.2）：降级拆成 8a（约束语言模式 = 图标缺席）与 8b（目录不可写 = 图标照常但每次重提取）；新增「保存/启动不付提取」「第二次不起进程」「损坏缓存」「含空格/中文路径」「powershell 被拦」「150%/200% 缩放」「图标身份映射可证伪」「.png 数量加限定」 | 最终审查「真机门必须覆盖」1–9；任务 6 改了产物 → 重新打包后**重发清单** | spec §7.2、task-05 C 段（待重写）、plan 任务 5 步骤 2 |