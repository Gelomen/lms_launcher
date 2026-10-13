# 任务 4 · 打包真机硬门（用户执行） — check 表

> 计划：[2026-10-13-quick-launch-elevated-exe.md](../../plans/2026-10-13-quick-launch-elevated-exe.md) §任务 4 · 规格：[2026-10-13-quick-launch-elevated-exe-design.md](../../specs/2026-10-13-quick-launch-elevated-exe-design.md) §7.2 / §6.8 / §6.9 / §9-R1-R4 · 关联审查重点 **R1 / R2 / R3 / R4**（+ R7 观察项）
> 前置：任务 1-3（已提交；索引清单表第 16 行）
> 本任务没有 TDD 红绿：D 段是它的实际步骤门（打包 → 解包核对 → 清单交用户 → 等回报 → 收尾）
> 现状锚点（本表生成时实测）：`build.bat:83` / `:90`（两次 `--win dir`）、`:84-100`（rcedit 自动重试）、`:109`（Done 行）；`electron-builder.yml:16-17`（现只有 `**/node_modules/@lydell/**`，任务 1 后应为三条）；`.gitignore:2` 的 `dist-*/`（实测 `git check-ignore -v dist-release` 命中 `.gitignore:2:dist-*/`）；`dist-release/` 目录当前已存在（旧构建残留，被忽略，不出现在 `git status` 里）
> 索引：[00-index.md](00-index.md) 的 G8 / G10 / G11、K5 / K10、V 组「任务 4」行

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 前置任务全部已提交（HEAD 链含任务 1 / 2 / 3 的提交） | `git log --oneline -4` | 三条实现提交（`build: 引入 koffi …` / `feat(main): shell-execute.ts …` / `fix(main): 快捷启动 exe 改走 ShellExecuteEx …`）都在 | ☐ |
| A2 | 打包不污染工作区 | `git check-ignore -v dist-release`；打包前后各跑一次 `git status --porcelain` | 命中 `.gitignore:2` 的 `dist-*/`；打包后 `git status` 与打包前一致 | ☑（主代理实测：`git check-ignore -v dist-release` → `.gitignore:2:dist-*/	dist-release`，`dist-release/win-unpacked/x` 同样命中；`dist-release/` 目录当前已存在（旧构建残留）却不出现在 `git status --porcelain` 里 → 打包不污染工作区，索引 K10 成立） |
| A3 | 打包命令与产物路径锚点属实 | 读 `build.bat:83` / `:90` / `:109` | 与本表引用一致 | ☑（本表生成时实测：:83 与 :90 都是 `call npx electron-builder --config electron-builder.yml --win dir`，:109 = `echo [build] Done. Output folder: dist-release\win-unpacked\`，:110 = 启动提示；rcedit 自动重试块在 :84-100（plan 写 :87-100，:87 是 `:pack_retry` 标签），口径一致） |
| A4 | 解包核对命令的目标路径逐字 | 读规格 §7.2 第 5 条 / plan 步骤 2 | 与平台包内布局一致 | ☑（本表生成时实测：`.temp/uac-probe/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node` 确实存在 → 与 plan 步骤 2 的 `…\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node` 布局一致；打包产物里的对应路径待步骤 2 实测） |
| A5 | 本实现环境起不了 Electron GUI（所以真机门只能由用户执行） | 规格 §7.2 取证 | 不得用「自动化已过」代替这一组 | ☑（规格 §7.2 记录：`electron.exe` 立即退出 `0x80000003 STATUS_BREAKPOINT` → 本任务的载体是「主代理打包 + 解包核对，用户执行 6 步清单」） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | 全部代码文件（`src/**`、`src-main/**`、`configs/**`、`scripts/**`、`package.json`、`electron-builder.yml`） | **不改**（真机门不改代码） | 本任务只写该表 J 段与索引 K 组；任何「顺手修代码」都越界 → 回到对应任务，按「先改 spec / plan / check 表再改代码」重走 | ☐ |
| B2 | `docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` | 填 J 段（用户回报的逐条结果） | 只 J 段（及必要的显式未勾改写） | ☐ |
| B3 | `docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/00-index.md` | K 组登记真机结论 | 步骤 5 的收尾动作 | ☐ |
| B4 | `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` | 状态行改为「已实现 + 真机已验收」（仅全部通过时） | 只改状态行；结论性变更须与受影响的 check 表同一 commit（AGENTS.md「后续更新」第 3 条） | ☐ |
| B5 | `dist-release/` | 打包产物（不入库） | 被 `.gitignore:2` 的 `dist-*/` 忽略（实测 `git check-ignore` 命中）→ 不 `git add`、不入库、不污染工作区（索引 K10） | ☐ |

## C. 接口契约（本任务 = 观察口径，逐字）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | 打包命令逐字 `.\build.bat`；成功判据 = exit 0 且末尾出现 `[build] Done. Output folder: dist-release\win-unpacked\` | plan 步骤 1 / `build.bat:109`（实测） | ☐ |
| C2 | rcedit 报 `Unable to commit changes` 时：走 `build.bat:84-100` 的自动重试；两次都失败 → 停下报告，不改打包配置试运气 | plan 步骤 1 / `build.bat:79-82` 的注释（实测） | ☐ |
| C3 | 解包核对命令逐字：`Test-Path "dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node"` → `True`；`…\node_modules\koffi\` 也应存在 | plan 步骤 2 / 规格 §6.8 | ☐ |
| C4 | 交用户的清单 6 步逐字（规格 §7.2 第 1-6 条，plan 步骤 3 已逐字抄出） | 规格 §7.2 / plan 步骤 3 | ☐ |
| C5 | 顺带观察项（不判过否，只回报现象）：UAC 挂起那几秒主界面只是红「...」、没有「未响应」或崩溃 | 规格 §9-R1 / §6.9 / 索引 K5 / R7 | ☐ |
| C6 | 回报格式：逐条「通过 / 不通过 + 现象」填进本表 J 段 | plan 步骤 4 | ☐ |

## D. 步骤门（本任务无红绿，门 = 打包 → 解包核对 → 清单交用户 → 等回报 → 收尾）

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：打包 | `.\build.bat` | exit 0，末尾 `[build] Done. Output folder: dist-release\win-unpacked\`；rcedit 失败按 C2 处理 | ☐ |
| D2 | 步骤 2：解包产物核对（主代理执行） | `Test-Path "dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node"` | `True`；`False` = `asarUnpack` 没生效 → 本任务不通过，回到任务 1 步骤 3 修 | ☐ |
| D3 | 步骤 3：把清单交给用户 | 逐字复制 C4 的 6 步 + C5 的观察项给用户 | 用户开始真机 | ☐ |
| D4 | 步骤 4：等回报并把结果填进本表 J 段 | — | 逐条通过 / 不通过 + 现象；**不得用「自动化已过」代替这一条** | ☐ |
| D5 | 步骤 5：收尾 | 全通过 → 索引 K 组登记真机结论 + 规格状态行改「已实现 + 真机已验收」；任一不通过 → 工作区改动打回（丢弃或重派），先改规格 / plan / check 表再改代码 | 两条分支之一明确执行，不留「部分通过」 | ☐ |

## E. 必须钉住的行为断言（真机清单逐条）

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 第 1 步：对 `E:\QiYou\QiYou.exe` 点 `[启动]` → 出现系统 UAC 弹窗 → 点「是」→ 奇游启动，日志出现 `启动命令 · E:\QiYou\QiYou.exe` | 规格 §7.2-1 / §4-1 / E6 / 索引清单第 16 行 | ☐ |
| E2 | 第 2 步：点 `[停止]` → 奇游进程真的消失（任务管理器里 `QiYou.exe` **与其子进程都要看**），行按钮回落绿 `[启动]` | 规格 §7.2-2 / §6.7 / E9 / E10 / §9-R2 / 索引 R2 | ☐ |
| E3 | 第 3 步：再点 `[启动]`，在 UAC 点「否」→ 日志出现 `PROC: E:\QiYou\QiYou.exe 已取消管理员权限请求`，按钮回落，无残留运行态（不再出现 `EACCES`、按钮不卡在红「...」） | 规格 §7.2-3 / §6.5 / 索引 R1 | ☐ |
| E4 | 第 4 步：不需要管理员的条目（例：`C:\Windows\System32\notepad.exe`）照常启动、停止，退出后 `进程退出 code=` 正常；**不因为走 Shell 路径多弹一次 UAC** | 规格 §7.2-4 / §6.3（`lpVerb = null`）/ E8 / 索引 R3 | ☐ |
| E5 | 第 5 步：打包目录里存在 `resources\app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node` | 规格 §7.2-5 / §6.8 / 索引 R4 | ☐ |
| E6 | 第 6 步：应用退出路径（托盘退出 / `[更新]`）仍不留孤儿进程（`ql.stopAll` 走的是新的 `stopGraceful`） | 规格 §7.2-6 | ☐ |
| E7 | 观察项：UAC 挂起期间（实测 4.1s）主界面只是红「...」、无「未响应」/ 崩溃 —— 只记录现象、不判过否；若判定不可接受 → 按规格 §9-R1 另立规格升级 `worker_threads` | 规格 §6.9 / §9-R1 / 索引 K5 / R7 | ☐ |
| E8 | 提权进程「杀不到子进程」是已知边界（§5 非目标）：第 2 步若出现「主程序停了但子进程还在」，按 §9-R2 记录并再议，不在本次顺手扩范围 | 规格 §5 / §9-R2 | ☐ |
| E9 | 控制台类 exe 开始显示窗口（`nShow = SW_SHOWNORMAL`）是本次唯一的行为变化，第 4 步覆盖；出现「窗口不该显示」的抱怨按 §9-R4 记录，不当缺陷修 | 规格 §6.3 / §9-R4 / Q11 | ☐ |

## F. 本任务相关的硬约束（索引 G 组子集）

| # | 约束 | 索引 | ✓ |
|---|---|---|---|
| F1 | 不改任何代码；真机门只记录（B1） | G1 / G11 | ☐ |
| F2 | 打包命令与产物路径逐字（`--win dir` → `win-unpacked`，不产出 portable exe） | G8 / 规格 E14 / `build.bat:83` / `:90`（实测） | ☐ |
| F3 | `dist-release/` 不入库、不 `git add` | K10（`.gitignore:2` 实测命中） | ☐ |
| F4 | 真机门不可被自动化替代（「自动化已过」不算这一组） | 规格 §7.2 末句 / 索引 V 组「任务 4」行 | ☐ |
| F5 | 不通过时先改文档再改代码（SDD 口径），并把工作区改动打回 | AGENTS.md 第 4 步「偏离 spec」/ plan 步骤 5 | ☐ |
| F6 | 分工：主代理打包 + 解包核对，用户执行 6 步清单 | 索引清单表第 16 行 / 规格 §7.2 | ☐ |
| F7 | 不扩范围：不借真机现象加「manifest 检测 / 提权引导 / 参数与 cwd / 提权额外日志」 | G11 / 规格 §5 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | 打包前：任务 1-3 各表 G 段已由主代理独立复跑同值（索引 V 组「每个任务验收前」行） | 三份表的 G 段都已落勾，否则不得进入打包 | ☐ |
| G2 | `npm test`（打包前最后一次全量） | `Test Files 48 passed (48)` / `Tests 834 passed (834)`，exit 0 | ☐ |
| G3 | 打包后 `git status --porcelain` | 与打包前一致（`dist-release/` 不出现，索引 K10） | ☐ |

## H. 提交门（**由主代理在验收通过后执行**；子代理不 `git add`、不 commit —— 索引 G10）

| # | 项 | 命令 | ✓ |
|---|---|---|---|
| H1 | 本任务无代码提交（plan 任务 4 没有「步骤 6：Commit」）；只提交文档：本表 J 段 + 索引 K 组 + 规格状态行 | `git add docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/00-index.md docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` | ☐ |
| H2 | commit message（plan 未给逐字；按 AGENTS.md「后续更新」第 6 条的格式，由主代理在真机回报后定稿） | `git commit -m "docs: 快捷启动 exe 提权启动 真机验收结论（任务 4 check 表 J 段 + 索引 K 组）"` | ☐ |
| H3 | 勾完整性门：本表 `裸☐=0` 且 `I段 -[ ]=0`，退出码 0 | `node .superpowers/sdd/2026-10-13-quick-launch-elevated-exe/tick-census.mjs` | ☐ |

## I. 完成判据

- [ ] B1-B5 / C1-C6 / D1-D5 / E1-E9 / F1-F7 / G1-G3 全部成立并落勾（真机条目以用户回报为准，未满足的写成 `☐（原因 + 去处）`）
- [ ] J 段有 6 步清单的逐条真实回报（通过 / 不通过 + 现象）与打包、解包核对的真实输出；J 段空 = 该任务未完成
- [ ] 索引 K 组已登记真机结论、规格状态行已按结果更新

## J. 执行记录（命令 + 真实输出摘要）

| 命令 / 动作 | 真实输出摘要 | 判定 |
|---|---|---|
| （实现时填） | | |
