# 任务 3 · 打包 + 真机清单（用户执行） — check 表

> 计划：[2026-10-15-quick-launch-exe-path-precheck.md](../../plans/2026-10-15-quick-launch-exe-path-precheck.md) §任务 3 · 规格：[2026-10-15-quick-launch-exe-path-precheck.md](../../specs/2026-10-15-quick-launch-exe-path-precheck.md) §7.2（9 条逐字在那儿） · 关联审查重点 **RF1 RF2**
> 前置：任务 1、任务 2 都已提交
> 索引：[00-index.md](00-index.md) 的 G5、**K5**（「不可访问」分支只能真机守）、RF1 RF2
> 本任务**不改代码**：主代理打包 + 核对产物，真机 9 条由**用户**在打包产物上跑。本实现环境起不了 ConPTY，**不得用「自动化已过」代替这一条**。

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 任务 2 已提交、无已跟踪改动 | `git log --oneline -2`；`git status --porcelain` | HEAD = 任务 2 的提交；porcelain 干净 | ☑ 主代理实测：`git log --oneline -2` = `ba7576c test(main): …`（任务 2）+ `17a4e6c fix(main): …`（任务 1）；`git status --porcelain` 空（`CLEAN=True`） |
| A2 | 全量仍绿（打包前门） | `npm test` | `Test Files 52 passed (52)` / `Tests 907 passed (907)`，exit 0 | ☑ 主代理实测 `npm test` → `Test Files 52 passed (52)` / `Tests 907 passed (907)`，exit 0（与索引 K9 的 907 一致） |
| A3 | 打包锚点属实 | 读 `build.bat:83` / `:90`（`npx electron-builder --config electron-builder.yml --win dir`）、`:102`（`:pack_done`）、`:109-110`（产物目录提示）；`electron-builder.yml:3-11`（`output: dist-release`、`files`）、`:18-21`（`asarUnpack` 三条） | 与本表引用一致（本表生成时实测） | ☑ 锚点属实：`build.bat:83` / `:90` 都是 `call npx electron-builder --config electron-builder.yml --win dir`，`:102` = `:pack_done`，`:109-110` = 产物目录与启动提示。另实测：`build.bat` 里**没有**任何 `node.exe` / `hardlink` 步骤（`8998801` 已删，索引 K14） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | 无源码改动 | 只跑 `build.bat` 与产物核对命令 | 命中 §9-R1（App Paths 裸名）时才改代码，且**同一 commit** 同步 spec / plan / 本表 | ☑ 本任务零源码改动：`git diff --name-only` 只有文档（本表 + 索引 + 前置 feature 的 task-09 加注）。§9-R1 未命中（真机未跑），故无代码改动 |
| B2 | `dist-release/` | 产物（不入库） | 不 `git add` 产物 | ☑ 产物未入库：`git status --porcelain` 无 `dist-release/` 条目（`.gitignore` 已排除），未 `git add` 任何产物 |

## C. 契约（真机清单，逐字取自规格 §7.2）

| # | 真机项 | 期望现象 | ✓ |
| --- | --- | --- | --- |
| C1 | §7.2-1 不存在的 `.exe`（不勾管理员） | **不弹任何系统错误框**；按钮回落绿 [启动]；日志 `[lms_launcher] PROC: E:\V2rayN\no-such-v2ray.exe 不存在、不是 .exe 文件或不可访问`；该行**立即**出现 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| C2 | §7.2-2 同条目勾「管理员」 | 与 C1 同（旧 §3-P3 的 1223 不再出现） | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| C3 | §7.2-3 填存在的目录 | 同 C1 的文案；**不**打开资源管理器（旧 §3-P6 的假成功退场） | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| C4 | §7.2-4 存在的 `notepad.exe` 绝对路径 | 记事本正常打开；既有日志行为不变 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| C5 | §7.2-5 裸名 `notepad.exe` | 与 C4 同样能起（PATH 解析，RF2 / K5 的反面） | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| C6 | §7.2-6 `requireAdministrator` 的 exe + 勾管理员 + UAC 点「否」 | 日志是 `[lms_launcher] PROC: <exe> 已取消管理员权限请求`（前置规格 §7.2-3 口径不变，RF3） | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| C7 | §7.2-7 命令行类型 / 提权终端 / [停止] | 与今天一致，无新增日志行 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| C8 | §7.2-8 存在的 `.exe` 副本被 `icacls /deny "<用户>:RX"` | 报「不可访问」那条，**不是**「已取消管理员权限请求」；验完 `/reset` 还原（索引 K5 / 规格 §9-R7：这条没有单测，只有这里守） | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |

| C9 | §7.2-9 裸名 `mspaint.exe`（或 `python.exe` / `code.exe` 这类 WindowsApps 别名） | **仍能起**（P13：今天能起，预检不得误杀；索引 K11/K12、规格 §9-R9）。失败 = §6.1 判定① 的重解析点那一支没生效 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |

## D. 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 打包 | `build.bat` | 走到 `:pack_done`，末尾 `[build] Done. Output folder: dist-release\win-unpacked\` | ☑ 主代理跑 `cmd /c build.bat`（后台任务 `pwsh-382`，exit 0）：走到 `:pack_done`，末尾两行逐字 = `[build] Done. Output folder: dist-release\win-unpacked\` / `[build] Start it with: dist-release\win-unpacked\lms_launcher.exe`（J-1） |
| D2 | 产物核对 | `Test-Path dist-release\win-unpacked\lms_launcher.exe`；`npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String -SimpleMatch 'shell-execute'（**不能用正斜杠**：asar list 在 Windows 输出 \dist-main\shell-execute.js，索引 K14）`；`Get-ChildItem dist-release\win-unpacked\resources\app.asar.unpacked\node_modules` | 主 exe 在；`dist-main/shell-execute.js` 在 asar 内；`koffi` / `@koromix` / `@lydell` 仍在 `app.asar.unpacked` | ☑ 主代理实测：`Test-Path dist-release\win-unpacked\lms_launcher.exe` = **True**；`npx asar list …app.asar \| Select-String -SimpleMatch 'shell-execute'` → `\dist-main\shell-execute.js`（**表里原写的正斜杠写法匹配不到**，已改命令并登记索引 K14）；`app.asar.unpacked\node_modules` 目录 = `@koromix` / `@lydell` / `koffi` 三个都在；`@koromix\koffi-win32-x64\win32_x64\koffi.node` = True；`@lydell\node-pty…\prebuilds\win32-x64\conpty.node` 与 `conpty\OpenConsole.exe` 都在。另加一条更硬的证据：`npx asar extract-file … dist-main/shell-execute.js` 抽出来 grep → `isLaunchableExe` / `exeNotFound` 在 :7 / :23 / :79 = **预检确实进了这个产物**（J-1） |
| D3 | 交清单 | 把 C1-C9 逐字交给用户，**同时**交前置 feature 未收尾的真机项（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1-E7、`docs/superpowers/checks/2026-10-14-quick-launch-admin/task-09-packaging-realmachine.md` 的真机门） | 用户收到逐字清单 | ☑ 清单已逐字交付用户（00:4x）：本 feature §7.2 的 9 条（C1-C9）+ 前置 `2026-10-13/task-04` 的 E1-E7（E3 注明旧回报只证文案、需在新构建复跑）+ 前置 `2026-10-14/task-09` 的 E1-E8（E2 措辞按索引 K14 更正，不再让用户找 `node.exe`）。未用「自动化已过」替代（F2） |
| D4 | 等回报并落表 | 逐条把「通过 / 不通过 + 现象」填进本表 J 段 | 9 条都有现象记录（不通过要能复现） | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2；用户已要求先提交本表（H2），回报到达后再补一次提交填本段） |

## E. 必须钉住的行为

| # | 断言 | 出处 | 由哪条守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 不存在的 `.exe`：不弹 Shell 系统框、日志即时出现且文案准确 | 规格 §6.2 / RF1 | C1 / C2 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| E2 | 目录与非 `.exe` 被挡（旧「假运行态」退场） | 规格 §8-Q4 / §3-P6 | C3 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| E3 | 存在的 `.exe`（绝对路径与裸名）行为不变 | 规格 §4-3 / RF2 | C4 / C5 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| E4 | 真 UAC 取消的文案不变 | 规格 §6.4 / RF3 | C6 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| E5 | ACL 不可访问 → 「不可访问」文案 | 规格 §8-Q11 / §9-R7 / 索引 K5 | C8 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |
| E6 | WindowsApps 别名**不被误杀** | 规格 §8-Q13 / §3-P13 / RF6 / 索引 K11 | C9 | ☐（原因 + 去处：**等用户回报**——本实现环境起不了 ConPTY / 真机 UI，AGENTS.md 工作流第 4 步与规格 §7.2 都不得用自动化替代；清单已于 00:4x 逐字交付，见 D3 / J-2） |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 不改 `package.json` / `electron-builder.yml`（除非 §9-R1 命中并同 commit 同步三份文档） | 索引 G7 | ☑ `git diff --name-only` 不含 `package.json` / `electron-builder.yml`；§9-R1 未命中，未改任何配置 |
| F2 | 真机门不得用自动化结果替代 | AGENTS.md 工作流第 4 步 / 前置规格 §7.2 | ☑ 本表 C1-C9 / E1-E6 全部留 `☐（原因 + 去处：等用户回报）`，没有一条被自动化结果替代；G1/G2 只算产物门，不算真机门 |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 打包前全量 | `npm test` | `Tests 907 passed (907)` | ☑ 主代理实测 `npm test` → `Tests 907 passed (907)`，exit 0（打包前跑，与 A2 同一次） |
| G2 | 产物核对 | D2 的三条命令 | 逐条符合 | ☑ D2 的三条命令逐条符合，并额外用 `asar extract-file` 证明预检在产物里（见 D2 / J-1） |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 本表 + （若真机打回）受影响的 spec / plan / 代码 |  ☑ 本次暂存：本表 + `00-index.md`（K14 两条实测口径）+ 前置 feature 的 `2026-10-14/task-09-packaging-realmachine.md`（D2 / E2 按 K14 加注）+ 本 feature 的 plan（步骤 4 的顺序偏离一行）+ `.superpowers/sdd/…/task-03-report.md`（主代理自执行记录）。**不含**任何产物（`dist-release/` 未 `git add`，B2）与源码（B1：零源码改动） |
| H2 | commit message 逐字 | `docs: 快捷启动 exe 预检的真机门清单与回报` |  ☑ 按本行逐字 message 提交。**顺序偏离（人类指令）**：plan 步骤 3（等回报）先于步骤 4（提交），用户 00:55 明确要求「commit」→ 先提交清单与产物门证据；C1-C9 / D4 / E1-E6 仍留 `☐（原因 + 去处：等用户回报）`，回报到达后**再补一次提交**填 J 段与 C / E 段（已同步进 plan 步骤 4 与本表 D4） |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0`（真机项未回报前写成 `☐（原因 + 去处：等用户回报）`） |  ☑ 主代理在 `git commit` 之前跑 `node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs`：本表 `裸☐=0`、`I段 -[ ]=0`（真机项按本行要求写成 `☐（原因 + 去处：等用户回报）` = 显式未勾，供核对，不算违规）；另跑列数自检 `broken=0`。实测输出见 J-3 |

## I. 完成判据

- [x] A1-A3 成立
- [x] D1-D2 产物核对通过
- [x] D3 清单已逐字交给用户（含前置 feature 的未收尾真机项）
- ☐（原因 + 去处：等用户回报；清单已交付，见 D3 / J-2）
- ☐（原因 + 去处：§9-R1 未命中即不适用；命中时按 plan 步骤 3 同 commit 同步三份文档）

## J. 执行记录（打包与真机回报填这里）

| # | 命令 / 真机项 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | 打包与产物核对（00:3x-00:4x，主代理）：`cmd /c build.bat`（后台 `pwsh-382`）；`Test-Path dist-release\win-unpacked\lms_launcher.exe`；`npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String -SimpleMatch 'shell-execute'`；`Get-ChildItem …app.asar.unpacked\node_modules -Directory`；`Test-Path …@koromix\koffi-win32-x64\win32_x64\koffi.node`；`npx asar extract-file … dist-main/shell-execute.js` + grep | build exit 0 且末尾 `[build] Done. Output folder: dist-release\win-unpacked\`；`lms_launcher.exe` = True；asar 内 `\dist-main\shell-execute.js`（另有 `\dist-main\ql-elevated.js`、`\dist-main\ql-pty-host.js`、`\dist-main\i18n\dict.js`）；unpacked 三个目录 `@koromix` / `@lydell` / `koffi`；`koffi.node` = True；node-pty 的 `conpty.node` / `conpty_console_list.node` 与 `conpty\OpenConsole.exe` 都在；抽出的 `shell-execute.js` 里 `isLaunchableExe` / `exeNotFound` 命中 :7 / :23 / :79。**顺带实测**：`Test-Path dist-release\win-unpacked\node.exe` = False 且 `build.bat` 无 `node.exe` / `hardlink` 步骤（`8998801` 删的）→ 索引 K14 |
| J-2 | 交清单（D3）：把 C1-C9 逐字交给用户，同时交前置 feature 未收尾的真机项 | 00:4x 已交付：本 feature §7.2 九条（含新增的 §7.2-9 别名条）+ `2026-10-13/task-04` 的 E1-E7（E3 注明旧回报只证文案、需在新构建复跑）+ `2026-10-14/task-09` 的 E1-E8（E2 按 K14 更正措辞）。回报到达后逐条填本表 J 段与 C / E 段 |
| J-3 | 提交前普查与结构自检（主代理，00:5x）：`node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs`；逐表列数普查 | 修 H 段与 I 段之前的实测：`task-03 ☑=12 裸☐=0 I段 -[ ]=2 H2=未提交`（我把 H2 误写成 `☑` 时普查判 `✗` 且 `CENSUS_EXIT=1` —— 假勾被抓出来，正是普查的用途）；改回显式未勾后 `H2=未提交`、`CENSUS_EXIT=0`。列数自检先报 `line 43 / line 92 cols 不符`（我在 D2 / J-1 里写了未转义的 `\|`），修完 `broken=0`。最终提交前实测（00:5x）：`task-01 ☑=44 裸☐=0 I段 -[ ]=0`、`task-02 ☑=27 裸☐=0 I段 -[ ]=0`、`task-03 ☑=15 裸☐=0 I段 -[ ]=0 H2=已提交`，「显式未勾」= C1-C9 / D4 / E1-E6 十六条（全部写 `☐（原因 + 去处：等用户回报）`）→ 无 `✗`、`CENSUS_EXIT=0`；列数自检四表 `broken=0` |