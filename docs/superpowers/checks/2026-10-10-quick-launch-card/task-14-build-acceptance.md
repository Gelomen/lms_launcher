# 任务 14 · 打包硬门 + 真机验收 + 文档记录 — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 14 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §7.2 / §12 硬门 / §13
> 前置：任务 1-13 全部完成且 `npm test` 全绿
> 这是整个特性的**唯一硬门**：dev 能跑 ≠ 打包能跑（**R4**）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净、全量绿 | `git status --porcelain` / `npm test` | 无输出 / 全绿 | ☐ |
| A2 | **验收对象 = win-unpacked（已定，不是待决项）** | 读 `build.bat:70-110` + `git log --oneline -- build.bat` | `npx electron-builder --config electron-builder.yml --win dir` 只出 `dist-release\win-unpacked`，并删除旧 `*-portable.exe`——这是**既定行为**（commit `ef23ac6 build: 打包只产出 win-unpacked，不再生成 portable exe`）。**不生成 portable exe，也不改 `build.bat`**；计划与规格里「portable exe」是过时措辞，按 F3 更正 | ☐ |
| A3 | 现有打包配置 | 读 `electron-builder.yml` 全文 | 当前**没有** `asarUnpack`；`asar: true` | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `electron-builder.yml` | 加 `asarUnpack` | 只加这一段 | ☐ |
| B2 | `docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` | 改「状态」行 + 更正 §7.2 / §12-1 的「portable exe」措辞 | 只写事实与验收结果 | ☐ |
| B3 | `docs/superpowers/plans/2026-10-10-quick-launch-card.md` | 更正任务 14 步骤 2/3 的「portable exe」措辞 | 只改措辞，不动任务边界 | ☐ |
| B4 | `build.bat` | **不改** | 改它去产出 portable exe 属越界（见 A2） | ☐ |

## C. 配置门

| # | 检查项 | 预期 | ✓ |
|---|---|---|---|
| C1 | `asarUnpack` 内容 | 逐字两行：`asarUnpack:` 换行 + `- "**/node_modules/@lydell/**"` | ☐ |

## D. 打包门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 打包 | `build.bat` | 成功退出；产物 = `dist-release\win-unpacked\lms_launcher.exe`；`dist-release` 下**没有** `*-portable.exe`（属预期，见 A2） | ☐ |
| D2 | 解包检查 | 列 `dist-release\win-unpacked\resources\app.asar.unpacked\node_modules\@lydell\node-pty-win32-x64\prebuilds\win32-x64` | `conpty.node` / `conpty\conpty.dll` / `conpty\OpenConsole.exe` **三个都在**。基线核对：改动前 `resources` 只有 `app.asar` + `icon.ico`，**没有** `app.asar.unpacked` → 加 `asarUnpack` 后它必须出现，出现即证明解包生效 | ☐ |

## E. 硬门验收（逐条记录命令与输出；第 1 条 dev 与打包产物**各做一次**）

| # | 验收项 | 操作 | 预期 | ✓ |
|---|---|---|---|---|
| E1 | **R4：打包产物里开终端** | 运行 `dist-release\win-unpacked\lms_launcher.exe` → 新建 cmd 配置 → 启动 | 终端页签出现提示符、能输入 | ☐ |
| E2 | 中文与颜色 | pwsh / powershell / cmd 各跑一条中文输出命令 | 中文正确、ANSI 颜色正常 | ☐ |
| E3 | 交互输入 | cmd 配置命令写 `set /p X=NAME?` → 页签内输入 `Alice` → 回车 → 敲 `echo %X%` | 显示 `Alice` | ☐ |
| E4 | TUI / 清屏 | 页签内跑 `cls`；再跑一个交互式程序（如 `python`） | 清屏正常；能输入输出 | ☐ |
| E5 | 进程树 | 跑 `ping -n 60 127.0.0.1` → `[停止]` → `tasklist \| findstr PING` | 无残留；页签保留、`[x]` 可用 | ☐ |
| E6 | 自动执行 | 启动配置 | 命令自动执行并停在提示符（可继续输入） | ☐ |
| E7 | exe 类型 | 启动记事本 | 无页签、按钮变红；关闭记事本 → 按钮回落 | ☐ |
| E8 | 页签溢出与长名 | 建 8 条页签 + 超长名 | 横向滚动；列表与页签都截断 + tooltip | ☐ |
| E9 | 退出应用 | 退出后 `tasklist` | 所有终端进程消失 | ☐ |
| E10 | **WSL 不得声称已验收** | 本机无发行版 | 文档如实写「未验收，待安装发行版后补」 | ☐ |

## F. 文档门

| # | 检查项 | 预期 | ✓ |
|---|---|---|---|
| F1 | 规格「状态」行 | 写明：验收结果、打包验收结论、WSL 待补 | ☐ |
| F2 | 未验证项如实保留 | 规格 §13 的 5 条不得被改成「已解决」 | ☐ |
| F3 | 更正过时措辞 | 计划 任务 14 步骤 2/3 与规格 §7.2 / §12-1 里的「portable exe」改为「win-unpacked 产物」，并注明依据 `ef23ac6`（用户已明确：不要 portable exe） | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npm test` | 全绿 | ☐ |
| G2 | `git diff --name-only` | 只含 B1-B2（及 A2 选定时的 B3） | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add electron-builder.yml docs/superpowers/specs/2026-10-10-quick-launch-card-design.md docs/superpowers/plans/2026-10-10-quick-launch-card.md`（含 F3 的措辞更正） | ☐ |
| H2 | 提交信息逐字 | `build: asarUnpack 解出 node-pty 原生二进制 + 打包真机验收记录` | ☐ |

## I. 完成判据

- [ ] D2 三个文件都在
- [ ] E1-E9 逐条有命令与输出记录；E10 如实标注未验收
- [ ] F1-F2 文档更新
- [ ] G1-G2 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写，**每条都要有命令与输出**）

| 项 | 命令 / 操作 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A2 | 验收对象选择 |  |  |
| D1 |  |  |  |
| D2 |  |  |  |
| E1 |  |  |  |
| E2 |  |  |  |
| E3 |  |  |  |
| E4 |  |  |  |
| E5 |  |  |  |
| E6 |  |  |  |
| E7 |  |  |  |
| E8 |  |  |  |
| E9 |  |  |  |
