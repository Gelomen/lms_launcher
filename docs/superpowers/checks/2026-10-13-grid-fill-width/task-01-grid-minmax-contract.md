# 任务 1 · `.grid` 第 3 列 `minmax` + 宽度契约测试 — check 表

> 计划：[2026-10-13-grid-fill-width.md](../../plans/2026-10-13-grid-fill-width.md) §任务 1 · 规格：[2026-10-13-grid-fill-width-design.md](../../specs/2026-10-13-grid-fill-width-design.md) §3 / §4.1 · 关联审查重点 **R1 / R2 / R3**
> 前置：无（本 feature 的第一个任务）
> 现状锚点：`src/style.css:76-82`（`.grid`，属性在 :80，注释在 :78-79）、`src/App.test.ts:891-933`（`describe('App GPU card mount')`，新 describe 追加在其后）、`src/modules/LogPanel.test.ts:365`（读 `style.css` 文本的先例）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净、HEAD 为文档提交 | `git status --porcelain`；`git log --oneline -1` | 无输出；HEAD = `e373af6` | ☑（主代理实测：`git status --porcelain` 无输出，HEAD `e373af6 docs: 快捷启动列填满可用宽度 —— spec + plan（代码一行未改）`） |
| A2 | 全量基线（索引 K6：由主代理实测，子代理不重跑） | `npm test` | 改动前全绿，两个计数抄进本行 | ☑（主代理实测 2026-10-13 14:58：`Test Files 47 passed (47)` / `Tests 814 passed (814)`，exit 0；`src/App.test.ts (59 tests)`） |
| A3 | 锚点行号属实 | 读 `src/style.css:76-82`、`src/App.test.ts:891-933` | 与本表引用一致 | ☑（主代理实测：`grid-template-columns` 在 `style.css:80`；`describe('App GPU card mount')` 起于 `App.test.ts:892`、止于 :933） |
| A4 | 红阶段预期可复算（解析式在现状 CSS 上干跑） | `node` 跑计划步骤 1 的解析式 | `tracksRaw = "280px 350px 330px 330px"`；`sum+3gap = 1326`；`winW-2gap = 1376` | ☑（主代理实测，输出见 J-1） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src/style.css` | 改 :78-80（两条注释 + 属性行） | 只此三行；`.grid` 的 `display` / `gap` 与文件其余部分一字不动 | ☐ |
| B2 | `src/App.test.ts` | 追加一个 `describe`（2 条用例）+ 两个 import（`node:fs` / `node:path`） | 既有用例一字不改（含 :891-933 的 GPU 网格用例） | ☐ |
| B3 | 其余全部文件 | 不改 | `App.vue` / `QuickLaunch.vue` / `GpuModule.vue` / `src-main/*` / i18n / `package.json` / 旧规格 | ☐ |

## C. 接口契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `.grid` 的 `grid-template-columns` 值逐字 = `280px 350px minmax(330px, 380px) 330px` | 规格 §3 / 索引 K1 | ☐ |
| C2 | 用例名逐字：`第 3 列 = minmax(330px, 380px)，其余三列不变（规格 §3 / §4.1-1、3）`、`四列上限 + 3×gap = 默认窗口可用宽度（不留空是算术，规格 §4.1-2）` | 计划 步骤 1 | ☐ |
| C3 | 测试不写死 1376 / 1400：窗口宽从 `src-main/main.ts` 现读、间距从 `--card-gap` 现读 | 规格 §4.1-2 / 索引 G8 | ☐ |
| C4 | 注释同步：:78-79 里「靠左排布，右侧留白」必须删掉（改后不成立），换成记录新口径与日期的注释 | 规格 §5 | ☐ |
| C5 | 切 track 的解析式必须把 `minmax(…)` 当**一个整体**（它内含空格，按空白切会切成两段 → `tracks.length` 变 6，E1/E3 都会假红）。逐字正则见计划 步骤 1 的 `tracks` 一行 | 计划 步骤 1 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（2 条，见 E1-E5） | — | 用例落盘 | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src/App.test.ts -t '网格宽度契约'` | FAIL 2 条：① 期望 `'280px 350px minmax(330px, 380px) 330px'` 实收 `'280px 350px 330px 330px'`；② `expected 1326 to be 1376` | ☐ |
| D3 | 步骤 3：改 `src/style.css:78-80` | — | 见 C1 / C4 | ☐ |
| D4 | 步骤 4：定向绿（含 GPU 网格用例回归 = R5） | `npx vitest run src/App.test.ts` | 全 PASS，`Tests 61 passed (61)`（A2 基线 59 + 2） | ☐ |
| D5 | 步骤 5-1：相邻回归（三份都会读 `style.css` 文本；含 R4） | `npx vitest run src/modules/LogPanel.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModule.test.ts` | 全 PASS | ☐ |
| D6 | 步骤 5-2：CSS 语法门 | `npx vite build` | exit 0 | ☐ |
| D7 | 步骤 5-3：类型门 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，exit 0 | ☐ |
| D8 | 步骤 5-4：全量 | `npm test` | 全绿 = A2 基线 + 2（`Tests 816 passed (816)`），`Test Files 47 passed (47)`，无减少 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 四列逐字（第 3 列不含 `fr` → 最大化时不会无限拉伸） | 规格 §4.1-1 / R3 | ☐ |
| E2 | 第 3 列 base = 330（窗口收窄时先缩回 330 再溢出，不新增横向滚动区间） | 规格 §3 / R1 | ☐ |
| E3 | 四列上限之和 + 3×`--card-gap` = 默认窗口宽 − 2×内边距（「不留空」是算术，不是目测） | 规格 §4.1-2 / R2 | ☐ |
| E4 | 其余三列仍是 `280px` / `350px` / `330px`（防顺手扩范围） | 规格 §4.1-3 | ☐ |
| E5 | `.layout` 的 `padding: var(--card-gap)` 这一前提被断言（否则 E3 的算术失去依据） | 计划 步骤 1 | ☐ |

## F. 本任务相关的硬约束（索引 G 组子集）

| # | 约束 | 索引 | ✓ |
|---|---|---|---|
| F1 | 只改 B1 / B2 两处，其余不改 | G1 / G9 | ☐ |
| F2 | 不引入新依赖、不改 `package.json` / lockfile | G2 | ☐ |
| F3 | `BUDGET = 30`（`QuickLaunch.vue:124`）不改 | G3 / 索引 K3 | ☐ |
| F4 | 旧规格文档不改写 | G4 / 索引 K4 | ☐ |
| F5 | 第 3 列不写成 `1fr`、不设更高上限 | G5 / 索引 K1 / K2 | ☐ |
| F6 | 子代理不 `git add`、不 commit（H 段归主代理） | 索引 K5 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/App.test.ts` | `Tests 61 passed (61)` | ☐ |
| G2 | `npx vitest run src/modules/LogPanel.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModule.test.ts` | 全绿 | ☐ |
| G3 | `npm test` | `Test Files 47 passed (47)` / `Tests 816 passed (816)`，exit 0 | ☐ |
| G4 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，exit 0 | ☐ |
| G5 | `npx vite build` | exit 0（CSS 语法门） | ☐ |
| G6 | i18n 硬门（`no-hardcoded.test.ts` / `key-coverage.test.ts`）在 G3 里绿 | 全绿（本任务不碰文案） | ☐ |

## H. 提交门（**由主代理在验收通过后执行**，索引 K5）

| # | 项 | 命令 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 = 两个文件 | `git add src/style.css src/App.test.ts` | ☐ |
| H2 | commit message 逐字 | `git commit -m "fix: 快捷启动列改 minmax(330px, 380px)，四列填满默认窗口可用宽度"` | ☐ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-13-grid-fill-width/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0`，退出码 0 | ☐ |

## I. 完成判据

- [ ] B1-B3 / C1-C5 / D1-D8 / E1-E5 / F1-F6 / G1-G6 全部成立并落勾
- [ ] J 段有真实命令与真实输出（J 段空 = 该任务未完成）
- [ ] H1-H3 由主代理执行完毕

## J. 执行记录（命令 + 真实输出摘要）

| 命令 / 动作 | 真实输出摘要 | 判定 |
|---|---|---|
| J-1（主代理，生成表时）`node` 干跑计划步骤 1 的解析式（读 `src/style.css` + `src-main/main.ts`） | `tracksRaw = "280px 350px 330px 330px"`；`tracks = ["280px","350px","330px","330px"]`；`sum = 1290`、`sum+3gap = 1326`、`expected = 1376 (winW 1400 gap 12)`；`layout padding matches: true`；把值换成 `minmax(330px, 380px)` 后 `sum+3gap = 1376` | 红/绿两阶段的预期都能复算；C5 的切分式在改后仍切出 4 个 track |
| J-2（实现者）`npx vitest run src/App.test.ts -t '网格宽度契约'` | 待填 | |
| J-3（实现者）`git diff --numstat` | 待填 | |
