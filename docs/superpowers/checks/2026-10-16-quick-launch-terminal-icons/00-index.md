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

**顺序**：串行，一次只跑一个子代理，按任务号（AGENTS.md 工作流第 5 步）。任务 3 不依赖 1/2 的接口，但「前置」列只描述依赖关系，不改变串行口径。

## G 组：plan「全局约束」→ 可验证检查项

| # | 约束（plan 逐字） | 怎么验 | 落在哪张表 |
| --- | --- | --- | --- |
| G1 | 探测层四行判定 / 顺序 / 不缓存一字不动，`quick-launch-terminals.ts` 只允许改 `:17-20` 与 `:9` | `git diff -U0 src-main/quick-launch-terminals.ts` 只允许两处 hunk | task-02 F 段 |
| G2 | 不新增 i18n 键；三门不得变红；新代码字面量无汉字 | `npx vitest run src-main/i18n` 全绿 + `git diff src-main/i18n` 为空 | 全部五张表的 G 段 |
| G3 | 不新增依赖 | `git diff package.json pnpm-lock.yaml package-lock.json` 为空 | task-01 F 段 |
| G4 | 提取走 `execFile`（异步），不用 `spawnSync` | `grep -n spawnSync src-main/ql-terminal-icons.ts` 无命中 | task-01 F 段 |
| G5 | 任何失败不抛出、不写日志、不弹提示 | 假接缝三种失败（null / 抛错 / 单项 null）用例 + `grep -n 'emitLog\|console\.' src-main/ql-terminal-icons.ts` 无命中 | task-01 E 段、task-04 E 段 |
| G6 | 不传 `imageUrl` 的调用方一字不变 | `TemplateModal.test.ts` / `LaunchBar.test.ts` / `QuickLaunchModal.test.ts:669-700` 一字不改且绿 | task-03 F 段、task-04 F 段 |
| G7 | 不改宽度（`.term-field` / `.type-field`） | `git diff src/modules/QuickLaunchModal.vue` 不含 `:444` / `:534` 两条规则；`type_field_is_widened_to_180px` 仍绿 | task-03 F 段、task-04 F 段 |
| G8 | 每任务收尾门：tsc + 定向 + 全量 | `npx tsc --noEmit -p tsconfig.main.json` 无输出；`npm test` 总数 = 基线 + 累计新增（1→918、2→919、3→921、4→923） | 全部五张表的 G 段 |
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
| V2 | 任务 3 之后必跑：`npx vitest run src/components/Dropdown.test.ts src/modules/TemplateModal.test.ts src/modules/LaunchBar.test.ts`（共享组件被三个调用方用） |
| V3 | 任务 4 之后必跑：`npx vitest run src/modules/QuickLaunchModal.test.ts src/modules/QuickLaunch.test.ts`（含 [类型] 图标门 `:669-700` 与 180px 宽度门 `:711-721`，两条都不许动） |
| V4 | 每个任务之后：`npx tsc --noEmit -p tsconfig.main.json` + `npm test`（G8） |
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
