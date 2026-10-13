# 快捷启动列填满可用宽度 · 任务 check 表索引

> 计划：[2026-10-13-grid-fill-width.md](../../plans/2026-10-13-grid-fill-width.md) ·
> 规格：[2026-10-13-grid-fill-width-design.md](../../specs/2026-10-13-grid-fill-width-design.md)
> 本目录把计划里的 2 个任务各拆成一份可勾选的核对表；**一份表 = 一个任务的完成判据**。

## 使用方式

1. 按任务号顺序执行；每份表按 A→I 顺序逐行执行并勾选。
2. 「怎么验 / 命令」列必须**真跑**，输出摘要写进表末的「J. 执行记录」——没有输出就没有勾选。
3. 任何一行不成立 → 不勾选、不 commit、不进入下一任务；先修再往下走。
4. 全局约束（G 组）与审查重点（R 组）由本索引统一持有，任务表只列与该任务相关的子集；两处冲突以本索引为准。

## 清单

> 「前置」列只描述依赖关系，**不是并行批次建议**——执行一律串行，见 G6。

| 任务 | 标题 | check 表 | 前置 | 钉住的审查重点 |
|---|---|---|---|---|
| 1 | `.grid` 第 3 列 `minmax` + 宽度契约测试 | [task-01-grid-minmax-contract.md](task-01-grid-minmax-contract.md) | — | 1、2、3 |
| 2 | 真机目视门（用户执行） | [task-02-realmachine-visual.md](task-02-realmachine-visual.md) | 1 | 4、5 |

## G 组：全局约束（逐条可验证）

| # | 约束 | 怎么验 |
|---|---|---|
| G1 | 只改两处：`src/style.css:78-80`、`src/App.test.ts`（追加 describe + 两个 import） | `git diff --numstat` 只出现这两个文件；`git diff -U0 -- src/style.css` 的删除行只在 :78-80 |
| G2 | 不引入新依赖、不改 `package.json` / lockfile | `git diff --name-only` 不含它们 |
| G3 | 行名截断预算 `BUDGET = 30`（`src/modules/QuickLaunch.vue:124`）不改 | `git diff --name-only` 不含 `QuickLaunch.vue`；该行仍在 :124 |
| G4 | 旧规格 `2026-10-10-quick-launch-card-design.md` 不改写（规格 §2 / §6-Q6） | `git log --oneline -- docs/superpowers/specs/2026-10-10-quick-launch-card-design.md` 无新增提交 |
| G5 | 第 3 列取值逐字 = `minmax(330px, 380px)`；第 1/2/4 列仍是 `280px` / `350px` / `330px`；`gap` / `--card-pad` 不动 | 任务 1 表 C1 / E1 / E4 的测试断言 |
| G6 | **执行一律串行**：一次只跑一个子代理，按任务编号 1→2；上一任务验收并提交后才派下一个 | 主代理的派单记录（`.superpowers/sdd/2026-10-13-grid-fill-width/progress.md`） |
| G7 | 提交信息用 Conventional Commits + 中文，逐字取任务表 H2 | `git log -1 --format=%s` |
| G8 | 测试里不写死 1376 / 1400 这类魔数：窗口宽从 `src-main/main.ts` 现读、间距从 `--card-gap` 现读 | 任务 1 表 C3 |
| G9 | 不扩范围：规格 §2 的六条非目标一条都不做 | 任务 1 表 B3 + 本表 G1-G4 |

## R 组：审查重点 → 钉住它的任务与测试

| # | 风险（计划「审查重点」） | 钉在哪 |
|---|---|---|
| R1 | 窗口宽度落在 1350–1399 出现横向滚动条（写死 380 才会这样） | 任务 1 表 C1/E2（第 3 列 base = 330 的逐字断言）+ 任务 2 清单第 3 步 |
| R2 | 日后改列宽或改默认窗口宽 → 留白悄悄回来 | 任务 1 表 E3（算术断言，两个数都现读） |
| R3 | 写成 `1fr` → 最大化时卡片无限拉伸 | 任务 1 表 E1（逐字断言不含 `fr`） |
| R4 | 卡片变宽 50px 后行内按钮换行/错位 | 任务 2 清单第 4 步 + 任务 1 表 D5（`QuickLaunch.test.ts` 回归） |
| R5 | GPU 切卡动画与本列宽度耦合 | 任务 2 清单第 5 步 + 任务 1 表 D4（`App.test.ts` GPU 用例回归） |

## V 组：跨任务回归门

| # | 何时必须跑什么 |
|---|---|
| V1 | 任务 1 的 H 段（提交）之前：`npx vitest run src/App.test.ts` + 三份读 `style.css` 的测试 + `npx vite build` + `npx tsc -p tsconfig.main.json --noEmit` + `npm test` 全绿 |
| V2 | 任务 2 开始前：任务 1 必须已按 H1-H3 提交（真机门验的是提交后的代码） |
| V3 | 真机门任一条不通过 → 工作区改动打回（丢弃或重派），先改规格/plan/check 表再改代码；不得只在代码里体现 |

## K 组：已定口径

| # | 口径 | 依据 | 落在哪张表 |
|---|---|---|---|
| K1 | **第 3 列取 `minmax(330px, 380px)`，不是写死 `380px`**：写死会把「出横向滚动条」的窗口区间从 <1350 扩大到 <1400；`minmax` 有富余长到 380、窗口收窄时先缩回 330 再溢出 | 用户 grill-me Q2 决定；规格 §3 / §6-Q2 | 任务 1 表 C1 / E2 |
| K2 | **上限 380 = 定宽语义**：窗口比 1400 更宽时超出部分仍留在 GPU 卡右侧，本期不处理 | 用户 grill-me Q3 决定；规格 §2 / §6-Q3 | 任务 1 表 F 段（非目标） |
| K3 | **行名截断预算 30 不改**（卡片变宽后 30 比实际可放字数保守，属已知且接受） | 用户 grill-me Q4 决定；规格 §2 | 本表 G3 |
| K4 | **旧规格文档不改写**，取代关系只登记在新规格里 | 用户 grill-me Q6 决定；规格 §6-Q6 | 本表 G4 |
| K5 | **H 段由主代理在验收通过后执行**：子代理只改代码与测试、填 J 段，不 `git add`、不 commit | 上一 feature 索引 K5 + `AGENTS.md` 工作流第 4 步「提交」 | 全部任务表 H 段 |
| K6 | **全量基线由主代理在生成 check 表时实测并写入任务 1 表 A2**（实测：`Test Files 47 passed (47)` / `Tests 814 passed (814)`，exit 0；`src/App.test.ts` = 59 tests）。计划任务 1 步骤 0 因此不重跑全量，全量只在 D8/G3 跑一次并与 A2 基线对比（应为 816 = 814 + 2） | 主代理实测（`npm test`，2026-10-13 14:58）；计划 步骤 0 已按本条更正 | 任务 1 表 A2 / D8 / G3 |
| K7 | **真机门只能由用户执行**：本实现环境起不了 Electron GUI（`electron.exe` 立即退出 `0x80000003 STATUS_BREAKPOINT`），自动化截图不可行 | 旧规格 `2026-10-10-quick-launch-card-design.md:7`；用户 grill-me Q8 决定 | 任务 2 表 A 段 / E 段 |
