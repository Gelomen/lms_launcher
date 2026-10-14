# 任务 9 · `build.bat` 预建硬链接 + 打包真机门（用户执行） — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 9 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.11 / §7.2 / §9-R1 · 关联审查重点 **RF7**（索引 R 组）
> 前置：任务 1-8 全部已提交
> 现状锚点（本表生成时实测，2026-10-14）：`build.bat`：`:pack_done` 标签 `:102`、旧产物清理块 `:104-107`、`echo [build] Done.` `:109`、`exit /b 0` `:111`（插入点 = `:107` 与 `:108` 之间）；`electron-builder.yml`：`files` `:5`、`asarUnpack` `:18-21`；取证：`.temp/ql-admin-probe/probe8.mjs`（asar 内脚本 + 硬链接 node.exe）、`probe5.mjs` B 段（硬链接必须在同目录，否则 `0xC0000135 STATUS_DLL_NOT_FOUND`）
> 索引：[00-index.md](00-index.md) 的 G7、K11、K13

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 上一任务已提交、工作区干净 | `git log --oneline -1`；`git status --porcelain` | HEAD = 任务 8 的提交；porcelain 干净；`npm test` 全绿 | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | 起点基线写在索引头部「测试基线」行；本任务后用例数只增不减 | ☐（原因：本环境跑 vitest 需完全访问沙箱，审批未通过 → spawn EPERM；去处：派单前主代理实测后填索引头部「测试基线」行与本行） |
| A3 | 本表引用的锚点行号属实 | 读 `build.bat:100-111`、`electron-builder.yml:1-25` | 与本表引用一致 | ☐ |
| A4 | 前置任务交付的接口在（签名逐字可用） | 确认 `dist-main/ql-pty-host.js` 会被 `tsc` 产出（`tsconfig.main.json` 的 `outDir`） | 可用；不可用就停下来报告，不要自己补 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `build.bat` | 改：`:107` 之后插入预建 `node.exe` 硬链接的步骤 | 已存在则跳过；失败只警告不中断（运行时会自建）；echo 行里不得有未转义的 `)`（`:91-92` 的既有告诫） | ☐ |
| B2 | `electron-builder.yml` | **不改**（除非 R1 命中，命中就同 commit 改并同步 spec/plan） | `asarUnpack` 已覆盖 `@lydell/**` / `koffi/**` / `@koromix/**`（`:18-21`） | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | 预建命令 | 在 `win-unpacked` 目录内：`mklink /H "node.exe" "lms_launcher.exe"` —— 规格 §6.11 | ☐ |
| C2 | 产物核对项 | `win-unpacked\node.exe` 与 `lms_launcher.exe` 同 inode；`app.asar\dist-main\ql-pty-host.js` 在；`app.asar.unpacked\node_modules\@lydell` 与 `koffi` 在 | ☐ |
| C3 | 真机清单 | 规格 §7.2 的 9 条 + 前置 feature 的 E1-E7（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md`）逐字交给用户 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 改 `build.bat` 并跑一次 | `cmd /c build.bat` | 打包成功；新增步骤打印「已创建 / 已存在 node.exe」；`exit /b 0` | ☐ |
| D2 | 核对产物 | `fsutil hardlink list dist-release\win-unpacked\node.exe`；`npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String ql-pty-host`；`Test-Path dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell` | 两条硬链接名都在；`\dist-main\ql-pty-host.js` 在；unpacked 目录在 | ☐ |
| D3 | 把清单交给用户（含前置 feature 的六步） | —— | 不得用「自动化已过」代替这一条（规格 §7.2） | ☐ |
| D4 | 等回报并填 J 段 | —— | 每条「通过 / 不通过 + 现象」都落到本表 J 段与 E 段 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 提权终端真的能起（ConPTY 在提权进程里） | 规格 §7.2-1/2 / §9-R2 | 用户回报 + 任务管理器完整性级别截图/描述 | ☐（真机门，用户执行） |
| E2 | 提权宿主里 node-pty 原生模块解析成功 | 规格 §9-R1 | 用户回报；失败按 R1 回退口径改 `electron-builder.yml` 并同步三份文档 | ☐（真机门，用户执行） |
| E3 | UAC 点「否」→ 按钮回落 + 日志带终端名 | 规格 §7.2-4/5 | 用户回报 | ☐（真机门，用户执行） |
| E4 | 不勾选的两条与今天一致（无 UAC、无多余日志） | 规格 §4-4 / 索引 K10 | 用户回报 | ☐（真机门，用户执行） |
| E5 | 提权终端运行中退出应用不留孤儿进程 | 规格 §6.7 / RF6 | 用户回报 | ☐（真机门，用户执行） |
| E6 | 前置 feature 的 E1-E7 在同一次构建里跑完 | 索引 K11 | 前置表 J 段 + 本表 J 段 | ☐（真机门，用户执行） |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 不新增依赖、不新增 extraFile（除非 R1 命中） | 索引 G7 / 规格 §6.11 | ☐ |
| F2 | 硬链接必须在 exe 同目录（否则 STATUS_DLL_NOT_FOUND） | 取证 P5 / `probe4` 的失败教训 | ☐ |
| F3 | `build.bat` 的 echo 括号转义告诫 | `build.bat:91-92` | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 打包前全量 | `npm test` | 全绿（打包门之前必须是绿的） | ☐ |
| G2 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G3 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G4 | 产物核对 | 见 D2 的三条命令 | 见 C2 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `build.bat`（+ 本表与前置 feature 的 task-04 表；若 R1 命中则含 `electron-builder.yml` 与 spec/plan） | ☐ |
| H2 | commit message 逐字 | `build: 预建提权宿主的 node.exe 硬链接 + 真机门清单` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1 之外没有文件被改（B2 未改或已按 R1 同步三份文档）
- [ ] C1-C3 逐字一致
- [ ] D1→D4 执行且输出贴 J 段
- [ ] E1-E6 有用户回报或写明去处
- [ ] G1-G4 全绿 / 通过
- [ ] J 段有真实输出

## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `cmd /c build.bat` |  |
| J-2 | `fsutil hardlink list dist-release\win-unpacked\node.exe` |  |
| J-3 | `npx asar list dist-release\win-unpacked\resources\app.asar \| Select-String ql-pty-host` |  |
| J-4 | `Test-Path dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell` |  |
| J-5 | `npm test` |  |
