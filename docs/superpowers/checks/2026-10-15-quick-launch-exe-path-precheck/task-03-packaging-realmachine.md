# 任务 3 · 打包 + 真机清单（用户执行） — check 表

> 计划：[2026-10-15-quick-launch-exe-path-precheck.md](../../plans/2026-10-15-quick-launch-exe-path-precheck.md) §任务 3 · 规格：[2026-10-15-quick-launch-exe-path-precheck.md](../../specs/2026-10-15-quick-launch-exe-path-precheck.md) §7.2（9 条逐字在那儿） · 关联审查重点 **RF1 RF2**
> 前置：任务 1、任务 2 都已提交
> 索引：[00-index.md](00-index.md) 的 G5、**K5**（「不可访问」分支只能真机守）、RF1 RF2
> 本任务**不改代码**：主代理打包 + 核对产物，真机 9 条由**用户**在打包产物上跑。本实现环境起不了 ConPTY，**不得用「自动化已过」代替这一条**。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 任务 2 已提交、无已跟踪改动 | `git log --oneline -2`；`git status --porcelain` | HEAD = 任务 2 的提交；porcelain 干净 | ☐ |
| A2 | 全量仍绿（打包前门） | `npm test` | `Test Files 52 passed (52)` / `Tests 907 passed (907)`，exit 0 | ☐ |
| A3 | 打包锚点属实 | 读 `build.bat:83` / `:90`（`npx electron-builder --config electron-builder.yml --win dir`）、`:102`（`:pack_done`）、`:109-110`（产物目录提示）；`electron-builder.yml:3-11`（`output: dist-release`、`files`）、`:18-21`（`asarUnpack` 三条） | 与本表引用一致（本表生成时实测） | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | 无源码改动 | 只跑 `build.bat` 与产物核对命令 | 命中 §9-R1（App Paths 裸名）时才改代码，且**同一 commit** 同步 spec / plan / 本表 | ☐ |
| B2 | `dist-release/` | 产物（不入库） | 不 `git add` 产物 | ☐ |

## C. 契约（真机清单，逐字取自规格 §7.2）

| # | 真机项 | 期望现象 | ✓ |
| --- | --- | --- | --- |
| C1 | §7.2-1 不存在的 `.exe`（不勾管理员） | **不弹任何系统错误框**；按钮回落绿 [启动]；日志 `[lms_launcher] PROC: E:\V2rayN\no-such-v2ray.exe 不存在、不是 .exe 文件或不可访问`；该行**立即**出现 | ☐ |
| C2 | §7.2-2 同条目勾「管理员」 | 与 C1 同（旧 §3-P3 的 1223 不再出现） | ☐ |
| C3 | §7.2-3 填存在的目录 | 同 C1 的文案；**不**打开资源管理器（旧 §3-P6 的假成功退场） | ☐ |
| C4 | §7.2-4 存在的 `notepad.exe` 绝对路径 | 记事本正常打开；既有日志行为不变 | ☐ |
| C5 | §7.2-5 裸名 `notepad.exe` | 与 C4 同样能起（PATH 解析，RF2 / K5 的反面） | ☐ |
| C6 | §7.2-6 `requireAdministrator` 的 exe + 勾管理员 + UAC 点「否」 | 日志是 `[lms_launcher] PROC: <exe> 已取消管理员权限请求`（前置规格 §7.2-3 口径不变，RF3） | ☐ |
| C7 | §7.2-7 命令行类型 / 提权终端 / [停止] | 与今天一致，无新增日志行 | ☐ |
| C8 | §7.2-8 存在的 `.exe` 副本被 `icacls /deny "<用户>:RX"` | 报「不可访问」那条，**不是**「已取消管理员权限请求」；验完 `/reset` 还原（索引 K5 / 规格 §9-R7：这条没有单测，只有这里守） | ☐ |

| C9 | §7.2-9 裸名 `mspaint.exe`（或 `python.exe` / `code.exe` 这类 WindowsApps 别名） | **仍能起**（P13：今天能起，预检不得误杀；索引 K11/K12、规格 §9-R9）。失败 = §6.1 判定① 的重解析点那一支没生效 | ☐ |

## D. 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 打包 | `build.bat` | 走到 `:pack_done`，末尾 `[build] Done. Output folder: dist-release\win-unpacked\` | ☐ |
| D2 | 产物核对 | `Test-Path dist-release\win-unpacked\lms_launcher.exe`；`npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String "dist-main/shell-execute.js"`；`Get-ChildItem dist-release\win-unpacked\resources\app.asar.unpacked\node_modules` | 主 exe 在；`dist-main/shell-execute.js` 在 asar 内；`koffi` / `@koromix` / `@lydell` 仍在 `app.asar.unpacked` | ☐ |
| D3 | 交清单 | 把 C1-C9 逐字交给用户，**同时**交前置 feature 未收尾的真机项（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1-E7、`docs/superpowers/checks/2026-10-14-quick-launch-admin/task-09-packaging-realmachine.md` 的真机门） | 用户收到逐字清单 | ☐ |
| D4 | 等回报并落表 | 逐条把「通过 / 不通过 + 现象」填进本表 J 段 | 9 条都有现象记录（不通过要能复现） | ☐ |

## E. 必须钉住的行为

| # | 断言 | 出处 | 由哪条守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 不存在的 `.exe`：不弹 Shell 系统框、日志即时出现且文案准确 | 规格 §6.2 / RF1 | C1 / C2 | ☐ |
| E2 | 目录与非 `.exe` 被挡（旧「假运行态」退场） | 规格 §8-Q4 / §3-P6 | C3 | ☐ |
| E3 | 存在的 `.exe`（绝对路径与裸名）行为不变 | 规格 §4-3 / RF2 | C4 / C5 | ☐ |
| E4 | 真 UAC 取消的文案不变 | 规格 §6.4 / RF3 | C6 | ☐ |
| E5 | ACL 不可访问 → 「不可访问」文案 | 规格 §8-Q11 / §9-R7 / 索引 K5 | C8 | ☐ |
| E6 | WindowsApps 别名**不被误杀** | 规格 §8-Q13 / §3-P13 / RF6 / 索引 K11 | C9 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 不改 `package.json` / `electron-builder.yml`（除非 §9-R1 命中并同 commit 同步三份文档） | 索引 G7 | ☐ |
| F2 | 真机门不得用自动化结果替代 | AGENTS.md 工作流第 4 步 / 前置规格 §7.2 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 打包前全量 | `npm test` | `Tests 907 passed (907)` | ☐ |
| G2 | 产物核对 | D2 的三条命令 | 逐条符合 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 本表 + （若真机打回）受影响的 spec / plan / 代码 | ☐ |
| H2 | commit message 逐字 | `docs: 快捷启动 exe 预检的真机门清单与回报` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0`（真机项未回报前写成 `☐（原因 + 去处：等用户回报）`） | ☐ |

## I. 完成判据

- [ ] A1-A3 成立
- [ ] D1-D2 产物核对通过
- [ ] D3 清单已逐字交给用户（含前置 feature 的未收尾真机项）
- [ ] C1-C9 / E1-E6 有用户回报并填进 J 段
- [ ] 命中 §9-R1 时三份文档同 commit 同步

## J. 执行记录（打包与真机回报填这里）

| # | 命令 / 真机项 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | | |
| J-2 | | |
