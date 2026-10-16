# 任务 5 · 打包 + 真机清单（用户执行） — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 5 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §7.2 / §9-R1 R3 R4 R6 · 关联审查重点 **RF1 RF4**
> 前置：任务 1–4 全部验收并提交
> 索引：[00-index.md](00-index.md) 的 V5、**K4**（pwsh 与 Windows PowerShell 图标几乎相同 → 照实显示）、**K10**（宽度不重测 → 真机兜）、**K6**（缓存不失效不清理）
> 本任务的「实现者」是用户：自动化全绿**不等于**这一条过（AGENTS.md：不得用「自动化已过」代替真机门）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 任务 1–4 已提交、工作区无未提交代码 | `git log --oneline -5`；`git status --porcelain` | 四条 `feat(main)` / `feat(ui)` 提交在位；porcelain 无已跟踪改动 | ☑ |
| A2 | 全量测试在打包前是绿的 | `npm test` | `Tests 923 passed (923)`，exit 0 | ☑ |
| A3 | 前置 feature 未收尾的真机项一并交回 | 读 `docs/superpowers/checks/2026-10-15-quick-launch-exe-path-precheck/task-03-packaging-realmachine.md` 的 J 段 | 未回报的条目列出来，与本次清单一起交给用户 | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | 本表 J 段 | 填真机现象（用户回报后由主代理逐字录入） | 不改任何代码；命中 R1/R4 时按 C 段口径核对现象并**同一 commit** 同步 spec / plan / 本表 | ☑ |

## C. 真机清单（逐字交给用户）

| # | 检查项 | 期望现象 | 回报 | ✓ |
| --- | --- | --- | --- | --- |
| C1 | 打开「新建启动项」，[类型] = 命令行 → 点开 [终端] | 每一项文字前都有图标；`cmd` 是黑底 `C:\\_`、`wsl` 是企鹅（本机无 WSL 则该项不出现）；文字不被省略号截断 | （待用户回报） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| C2 | 收起态 trigger | 显示当前选中终端的图标；换选一项 → trigger 的图标跟着换 | （待用户回报） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| C3 | 第二次打开弹窗 | 下拉**立刻**有图标（不再等提取）；`<exe 目录>\\cache\\terminal-icons\\` 下有 `.png`，数量 = 本机可用终端数 | （待用户回报） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| C4 | 删掉 `cache\terminal-icons\` 目录后再打开 | 第一次稍慢（冷启动可到 1.7s）后仍有图标；目录被重建 | （待用户回报） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| C5 | [类型] 切「可执行程序」再切回 | 图标仍在；弹窗高度不变（218px 定高门不回归） | （待用户回报） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| C6 | [类型] 下拉、`TemplateModal` 的配置下拉、`LaunchBar` 的启动项下拉 | **没有任何变化**（不传 `imageUrl` 的调用方一字不变） | （待用户回报） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| C7 | 快捷启动条目实际启动（终端页签、提权终端、[停止]） | 与今天一致 | （待用户回报） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| C8 | 降级路径（若命中） | 约束语言模式 / 目录不可写的机器上：图标缺席、其余照常、无报错弹窗（规格 \|9-R1/R4 + 索引 K5） | （待用户回报） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |

## D. 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 打包 | `cmd /c build.bat`（或仓库既有打包命令） | 打包成功，无新增告警 | ☑ |
| D2 | 产物含新模块 | `npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String ql-terminal-icons` | 出现 `\dist-main\ql-terminal-icons.js` | ☑ |
| D3 | 既有 unpacked 依赖未受影响 | `Get-ChildItem dist-release\win-unpacked\resources\app.asar.unpacked -Recurse \| Select-String koffi -SimpleMatch \| Select-Object -First 1` | koffi 仍在 | ☑ |
| D4 | 把 C1–C8 逐字交给用户（含 A3 的前置未收尾项） | — | 用户开始真机 | ☑ |
| D5 | 等回报并录入 | — | C1–C8 每行都有「通过 / 不通过 + 现象」 | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
| --- | --- | --- | --- |
| E1 | 真实图标 = 那个 exe 的图标（不是内置图形）：`cmd` 黑底控制台、`wsl` 企鹅 | 规格 \|8-Q1 / \|3-P2 | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| E2 | pwsh 与 Windows PowerShell 图标几乎相同 → 照实显示，不额外区分 | 规格 \|8-Q4 / 索引 K4 | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| E3 | 最长项 `Command Prompt (cmd)` 不截断（宽度不重测的兜底） | 规格 \|6.5 / \|9-R6 / 索引 K10 | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| E4 | 缓存目录在应用目录下、可手动删除、删除后自动重建且不报错 | 规格 \|6.2 / \|9-R3（不失效不清理） | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| E5 | 任何降级都不改变终端列表与启动行为 | 规格 \|6.1 / RF1 | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | 不得用「自动化已过」代替真机门 | 本表 C 段每行都有用户回报 | ☐（原因 + 去处：等用户真机回报——本实现环境跑不了真机 UI；清单已于 21:0x 逐字交付，见 D4 / J-9。回报到达后补一次提交填本行与 J 段） |
| F2 | 命中 R1/R4 时：先改 spec / plan / 本表（同一 commit）再改代码 | `git show --stat` 里三份文档与代码同 commit  | ☐（原因 + 去处：本次真机未回报，尚未命中 §9-R1/R4；命中时按本行流程把三份文档与代码同 commit 同步） |
| F3 | 不顺手扩范围（spec \|5 非目标） | 真机发现的新诉求登记为下一份 spec 的输入，不在本任务实现 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 打包前全量 | `npm test` | `Tests 923 passed (923)`，exit 0 | ☑ |
| G2 | 产物核对 | D2/D3 | 两条都过 | ☑ |

## H. 提交门（主代理在收到真机回报后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 只 `git add docs/superpowers/checks/2026-10-16-quick-launch-terminal-icons/`（+ 若命中偏离：同 commit 的 spec / plan） | ☑ |
| H2 | commit message（逐字） | `docs: 快捷启动 [终端] 真实图标的真机门清单与回报` | ☑ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0`（真机未回报的行写成 `☐（原因 + 去处）`） | ☑ |

## I. 完成判据

- [x] A1–A3 实测过
- [x] D1–D3 产物核对通过
- ☐（原因 + 去处：等用户真机回报；清单已逐字交付（D4 / J-9）。回报到达后补一次提交填 C / E / J 段）
- ☐（原因 + 去处：本次未命中 §9-R1/R4；真机回报若命中，按 F2 把三份文档与代码同 commit 同步）
- [x] H1–H3 由主代理执行

## J. 执行记录（真机回报填）

| # | 检查项 | 用户回报的现象 |
| --- | --- | --- |
| J-1 | C1 | |
| J-2 | C2 | |
| J-3 | C3 | |
| J-4 | C4 | |
| J-5 | C5 | |
| J-6 | C6 | |
| J-7 | C7 | |
| J-8 | C8 | |
| J-9 | **打包与产物核对（主代理，20:5x–21:0x）**：`npm test`（打包前）；`cmd /c build.bat`（后台 `pwsh-183`）；`Test-Path dist-release\win-unpacked\lms_launcher.exe`；`npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String -SimpleMatch 'ql-terminal-icons'`；`Get-ChildItem …app.asar.unpacked -Recurse -Filter *.node \| Where-Object { $_.FullName -match 'koffi' }`；`Test-Path dist-release\win-unpacked\cache`；`Test-Path cache` | 打包前全量 = \`Test Files 53 passed (53)\` / \`Tests 923 passed (923)\` exit 0；build.bat exit 0（\`vite build\` 78 modules + \`tsc -p tsconfig.main.json\` + electron-builder \`packaging … appOutDir=dist-release\win-unpacked\`，\`[build] Done.\`，无新增告警，只有既有的 chunk >500kB 提示）；exe = \`True\`；**D2 = \`\dist-main\ql-terminal-icons.js\` 在 app.asar 内**；**D3 = \`app.asar.unpacked\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node\` 仍在**；两处 \`cache\` 均 \`False\`（运行期缓存不在产物里，仓库根也没被测试写出来，索引 K11） |
| J-10 | **A3 前置未收尾真机项 + 本次 C1–C8 一并交回用户（D4）** | 交回内容：本 feature §7.2 八条（C1–C8）+ 前置 \`2026-10-15-quick-launch-exe-path-precheck/task-03\` 的 C1–C9（§7.2-1..9，含 WindowsApps 别名那条）**全部仍是 \`☐（等用户回报）\`**（该表 J-2 记录清单曾在 00:4x 交付但无回报）+ 更早两份 \`2026-10-13-quick-launch-elevated-exe/task-04\`、\`2026-10-14-quick-launch-admin/task-09\` 的真机项同样未回报。回报到达后逐条填本表 J 段与 C / E 段 |
