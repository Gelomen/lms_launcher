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
