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
| B1 | `src/style.css` | 改 :78-80（两条注释 + 属性行） | 只此三行；`.grid` 的 `display` / `gap` 与文件其余部分一字不动 | ☑（主代理程序化核对：plan 步骤 3 的 CSS 块逐字出现在 `src/style.css`（includes=true）；`git diff -U0` 删除行只在 :78-80（索引 K9）） |
| B2 | `src/App.test.ts` | 追加一个 `describe`（2 条用例）+ 两个 import（`node:fs` / `node:path`） | 既有用例一字不改（含 :891-933 的 GPU 网格用例） | ☑（`git diff --numstat` = `27\t0 src/App.test.ts`（纯追加：2 import + 25 行 describe，0 删除）；:892-933 的 GPU 网格用例一字未改且仍绿（J-4）） |
| B3 | 其余全部文件 | 不改 | `App.vue` / `QuickLaunch.vue` / `GpuModule.vue` / `src-main/*` / i18n / `package.json` / 旧规格 | ☑（主代理复跑 `git diff --name-only` = `src/App.test.ts`、`src/style.css`（+ 本 check 表自身，属 J 段填写）；`QuickLaunch.vue` 的 `BUDGET = 30` 仍在（主代理正则复核）） |

## C. 接口契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `.grid` 的 `grid-template-columns` 值逐字 = `280px 350px 380px 330px`（**修订轮**：原口径 `minmax(330px, 380px)` 已被取代，见规格 §7 / 索引 K13） | 规格 §7 / §4.1-1 | ☑（主代理读取现值 = `grid-template-columns: 280px 350px 380px 330px;`，style.css:83；J-16） |
| C2 | 用例名逐字：`第 3 列 = minmax(330px, 380px)，其余三列不变（规格 §3 / §4.1-1、3）`、`四列上限 + 3×gap = 默认窗口可用宽度（不留空是算术，规格 §4.1-2）` | 计划 步骤 1 | ☑（两条用例名与 plan 步骤 1 逐字一致（diff 可见；测试块程序化核对 includes=true）） |
| C3 | 测试不写死 1376 / 1400：窗口宽从 `src-main/main.ts` 现读、间距从 `--card-gap` 现读 | 规格 §4.1-2 / 索引 G8 | ☑（测试从 `src-main/main.ts` 现读 `winW`、从 `--card-gap` 现读 `gap`，全文无 1376/1400 字面量） |
| C4 | 注释同步：:78-79 里「靠左排布，右侧留白」必须删掉（改后不成立），换成记录新口径与日期的注释 | 规格 §5 | ☑（「靠左排布，右侧留白」已删；新注释块按 plan 逐字，首行保留三列来历（左 424→280、模板 520→350、GPU 300→330，2026-09/10 定稿）→ 原 :80 行尾注释的信息未丢（索引 K10）） |
| C5 | 切 track 的解析式必须把 `minmax(…)` 当**一个整体**（它内含空格，按空白切会切成两段 → `tracks.length` 变 6，E1/E3 都会假红）。逐字正则见计划 步骤 1 的 `tracks` 一行 | 计划 步骤 1 | ☑（切 track 正则把 `minmax(…)` 当一个整体；J-11 变异 ② 证明写 `1fr` 时该式仍切出 4 段但算术红 → 切分式有效且有牙） |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（2 条，见 E1-E5） | — | 用例落盘 | ☑（两条用例落盘（`App.test.ts:937-960`，紧邻 :892-933 的网格用例 = 规格 §4.1 的落点，索引 K8）） |
| D2 | 步骤 2：验证失败 | `npx vitest run src/App.test.ts -t '网格宽度契约'` | FAIL 2 条：① 期望 `'280px 350px minmax(330px, 380px) 330px'` 实收 `'280px 350px 330px 330px'`；② `expected 1326 to be 1376` | ☑（J-2：exit 1，`2 failed \| 59 skipped (61)`，红因①逐字断言、②`expected 1326 to be 1376` —— 与 J-1 复算逐字一致） |
| D3 | 步骤 3：改 `src/style.css:78-80` | — | 见 C1 / C4 | ☑（见 B1 / C1 / C4） |
| D4 | 步骤 4：定向绿（含 GPU 网格用例回归 = R5） | `npx vitest run src/App.test.ts` | 全 PASS，`Tests 61 passed (61)`（A2 基线 59 + 2） | ☑（**主代理复跑**：`npx vitest run src/App.test.ts` → `Tests 61 passed (61)`（15:18:52），与 J-4 同值） |
| D5 | 步骤 5-1：相邻回归（三份都会读 `style.css` 文本；含 R4） | `npx vitest run src/modules/LogPanel.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModule.test.ts` | 全 PASS | ☑（J-5：`3 passed (3)` / `47 passed (47)`（QuickLaunch 7 / TemplateModule 20 / LogPanel 20），exit 0） |
| D6 | 步骤 5-2：CSS 语法门 | `npx vite build` | exit 0 | ☑（**主代理复跑**：`npx vite build` → `✓ built in 1.08s`，`BUILD=0`） |
| D7 | 步骤 5-3：类型门 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，exit 0 | ☑（**主代理复跑**：`npx tsc -p tsconfig.main.json --noEmit` → 无输出，`TSC=0`） |
| D8 | 步骤 5-4：全量 | `npm test` | 全绿 = A2 基线 + 2（`Tests 816 passed (816)`），`Test Files 47 passed (47)`，无减少 | ☑（**主代理复跑**：`npm test` → `Test Files 47 passed (47)` / `Tests 816 passed (816)`，exit 0（= 基线 814 + 2）） |
| D9 | **修订轮** 先改契约（只改测试、未改 CSS） | `npx vitest run src/App.test.ts -t '网格宽度契约'` | 恰 1 红：`expected '280px 350px minmax(330px, 380px) 330px' to be '280px 350px 380px 330px'` | ☑（J-16：`1 failed \| 1 passed \| 59 skipped (61)`，exit 1；算术那条仍绿） |
| D10 | **修订轮** CSS 改定宽 → 定向绿 | `npx vitest run src/App.test.ts` | `Tests 61 passed (61)` | ☑（J-18：61 passed，exit 0） |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
|---|---|---|---|
| E1 | 四列逐字（第 3 列不含 `fr` → 最大化时不会无限拉伸） | 规格 §4.1-1 / R3 | ☑（J-10 变异 ①（写死 `380px`）恰 1 红 = 逐字断言；算术仍绿 → 只有逐字断言抓得住写死写法（R3 有牙）） |
| E2 | **四列全部定宽**：任何一条 track 既不含 `minmax` 也不含 `fr`（**修订轮**：本行取代原「第 3 列 base = 330」口径；窗口 <1400 出横向滚动条属接受现状，规格 §7 / 索引 K13） | 规格 §7 / R1 | ☑（用例内 `expect(tracksRaw).not.toMatch(/minmax\|\bfr\b/)`；J-17 变异 ① 退回 `minmax` → 1 红、② 写 `1fr` → 2 红） |
| E3 | 四列上限之和 + 3×`--card-gap` = 默认窗口宽 − 2×内边距（「不留空」是算术，不是目测） | 规格 §4.1-2 / R2 | ☑（J-12 变异 ③（`--card-gap: 16px`）恰 1 红 = 算术断言 `expected 1388 to be 1368`（R2 有牙）） |
| E4 | 其余三列仍是 `280px` / `350px` / `330px`（防顺手扩范围） | 规格 §4.1-3 | ☑（逐字断言含 `280px` / `350px` / `330px` 三段（J-10 变异只动第 3 列即红 → 其余三段确实在断言里）） |
| E5 | `.layout` 的 `padding: var(--card-gap)` 这一前提被断言（否则 E3 的算术失去依据） | 计划 步骤 1 | ☑（用例内 `toMatch(/padding:\s*var\(--card-gap\)/)` 存在且绿（J-8 全量里绿）） |

## F. 本任务相关的硬约束（索引 G 组子集）

| # | 约束 | 索引 | ✓ |
|---|---|---|---|
| F1 | 只改 B1 / B2 两处，其余不改 | G1 / G9 | ☑（见 B3（只有两个文件）） |
| F2 | 不引入新依赖、不改 `package.json` / lockfile | G2 | ☑（`git diff --name-only` 不含 `package.json` / lockfile） |
| F3 | `BUDGET = 30`（`QuickLaunch.vue:124`）不改 | G3 / 索引 K3 | ☑（`QuickLaunch.vue` 不在改动清单里；`const BUDGET = 30;` 主代理正则复核仍在） |
| F4 | 旧规格文档不改写 | G4 / 索引 K4 | ☑（旧规格不在 `git diff --name-only` 里（主代理实测）） |
| F5 | 第 3 列不写成 `1fr`、不设更高上限 | G5 / 索引 K1 / K2 | ☑（现值不含 `fr`、上限 = 380（C1）） |
| F6 | 子代理不 `git add`、不 commit（H 段归主代理） | 索引 K5 | ☑（J-13：实现者未 `git add`、未 commit，HEAD 仍 `9e2be11`（主代理 `git status` 复核）） |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src/App.test.ts` | `Tests 61 passed (61)` | ☑（**主代理复跑** 61 passed (61)） |
| G2 | `npx vitest run src/modules/LogPanel.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModule.test.ts` | 全绿 | ☑（J-5：47 passed (47)，exit 0） |
| G3 | `npm test` | `Test Files 47 passed (47)` / `Tests 816 passed (816)`，exit 0 | ☑（**主代理复跑**：47 files / 816 tests，exit 0；「无减少」的判据见索引 K11（总数 +2 且唯一改动的测试文件 +2 ⇒ 其余文件不可能减少）） |
| G4 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，exit 0 | ☑（**主代理复跑**：无输出，TSC=0） |
| G5 | `npx vite build` | exit 0（CSS 语法门） | ☑（**主代理复跑**：✓ built，BUILD=0） |
| G6 | i18n 硬门（`no-hardcoded.test.ts` / `key-coverage.test.ts`）在 G3 里绿 | 全绿（本任务不碰文案） | ☑（J-9：`key-coverage` + `no-hardcoded` = 4 passed (4)，且在全量里绿） |

## H. 提交门（**由主代理在验收通过后执行**，索引 K5）

| # | 项 | 命令 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 = 两个文件 | `git add src/style.css src/App.test.ts` | ☑（主代理执行：`git add src/style.css src/App.test.ts`（check 表与索引另开一次 docs 提交，AGENTS.md 第 6 条）） |
| H2 | commit message 逐字 | `git commit -m "fix: 快捷启动列改 minmax(330px, 380px)，四列填满默认窗口可用宽度"` | ☑（主代理执行：`fix: 快捷启动列改 minmax(330px, 380px)，四列填满默认窗口可用宽度`） |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-13-grid-fill-width/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0`，退出码 0 | ☑（见 J-15：普查输出 `裸☐=0`、`I段 -[ ]=0`，退出码 0） |
| H4 | **修订轮** 暂存范围 = 两个文件 | `git add src/style.css src/App.test.ts` | ☑（主代理执行，见 J-19 的范围核对） |
| H5 | **修订轮** commit message 逐字 | `git commit -m "fix: 快捷启动列改定宽 380px（与其它列写法一致），四列仍填满默认窗口"` | ☑（主代理执行；文档另开一次 docs 提交，AGENTS.md 第 6 条） |

## I. 完成判据

- [x] B1-B3 / C1-C5 / D1-D10 / E1-E5 / F1-F6 / G1-G6 全部成立并落勾（D9/D10 = 修订轮）
- [x] J 段有真实命令与真实输出（J 段空 = 该任务未完成）
- [x] H1-H5 由主代理执行完毕（H1-H3 = 原提交 `eef0d35`；H4/H5 = 修订轮提交）

## J. 执行记录（命令 + 真实输出摘要）

| 命令 / 动作 | 真实输出摘要 | 判定 |
|---|---|---|
| J-1（主代理，生成表时）`node` 干跑计划步骤 1 的解析式（读 `src/style.css` + `src-main/main.ts`） | `tracksRaw = "280px 350px 330px 330px"`；`tracks = ["280px","350px","330px","330px"]`；`sum = 1290`、`sum+3gap = 1326`、`expected = 1376 (winW 1400 gap 12)`；`layout padding matches: true`；把值换成 `minmax(330px, 380px)` 后 `sum+3gap = 1376` | 红/绿两阶段的预期都能复算；C5 的切分式在改后仍切出 4 个 track |
| J-2（实现者）先红：`npx vitest run src/App.test.ts -t '网格宽度契约'`（改 CSS 之前） | exit 1；`❯ src/App.test.ts (61 tests \| 2 failed \| 59 skipped)`。红因①：`AssertionError: expected '280px 350px 330px 330px' to be '280px 350px minmax(330px, 380px) 330px'`（Expected: "280px 350px minmax(330px, 380px) 330px" / Received: "280px 350px 330px 330px"，落点 `App.test.ts:948`）；红因②：`AssertionError: expected 1326 to be 1376`（落点 `App.test.ts:958`）。汇总 `Test Files 1 failed (1)` / `Tests 2 failed \| 59 skipped (61)` | **D2 通过**：恰 2 红，两条红因与 J-1 复算值逐字一致；`-t\|'网格宽度契约'` 命中新 describe 的 2 条、其余 59 条 skipped |
| J-3（实现者）`git diff --numstat`（改 CSS 后） | `27\t0\tsrc/App.test.ts`、`5\t3\tsrc/style.css`（只有两个文件）。`git status --porcelain` = ` M src/App.test.ts` / ` M src/style.css` / `?? .superpowers/sdd/2026-10-13-grid-fill-width/`。`git diff -U0 -- src/style.css` 的 hunk 头只有 `@@ -78,3 +78,5 @@`，删除行 = 原 :78-79 两条注释 + 原 :80 属性行，新增行 = 计划 步骤 3 的 4 行注释 + 1 行属性 | **B1/B2 边界成立**：style.css 删除行只在 :78-80（新增 5 行是计划逐字给的注释块，长 4 行）；App.test.ts 纯追加 27 行（2 import + 25 行 describe）、0 删除 |
| J-4（实现者）`npx vitest run src/App.test.ts`（改 CSS 后） | `✓ src/App.test.ts (61 tests) 1475ms`；`Test Files 1 passed (1)` / `Tests 61 passed (61)`，exit 0 | **D4 / G1 通过**：59（A2 基线该文件计数）+ 2 = 61，含 :892-933 的 GPU 网格用例仍绿（R5） |
| J-5（实现者）`npx vitest run src/modules/LogPanel.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModule.test.ts` | `✓ src/modules/QuickLaunch.test.ts (7 tests)` / `✓ src/modules/TemplateModule.test.ts (20 tests)` / `✓ src/modules/LogPanel.test.ts (20 tests)`；`Test Files 3 passed (3)` / `Tests 47 passed (47)`，exit 0 | **D5 / G2 通过**：三份读 `style.css` 文本的相邻契约全绿（R4） |
| J-6（实现者）`npx vite build` | exit 0；`✓ 78 modules transformed`、`dist/assets/index-B7KDjMpY.css 31.15 kB \| gzip: 6.66 kB`、`✓ built in 1.06s`（仅既有的 chunk >500kB 提示，与本次改动无关） | **D6 / G5 通过**：`minmax(330px, 380px)` 通过 CSS 语法门 |
| J-7（实现者）`npx tsc -p tsconfig.main.json --noEmit` | 无任何输出，`EXITCODE=0` | **D7 / G4 通过** |
| J-8（实现者）`npm test` | `Test Files 47 passed (47)` / `Tests 816 passed (816)`，exit 0（Duration 8.65s） | **D8 / G3 通过**：= A2 基线 814 + 2，文件数 47 不变、无任何文件计数减少 |
| J-9（实现者）`npx vitest run src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts` | `✓ src-main/i18n/no-hardcoded.test.ts (2 tests)` / `✓ src-main/i18n/key-coverage.test.ts (2 tests)`；`Tests 4 passed (4)`，exit 0 | **G6 通过**（本任务不碰文案；这两份在 J-8 的全量里同样绿，此处单独取证） |
| J-10（实现者）变异 ①：第 3 列写成写死的 `380px`（`280px 350px 380px 330px`） | `Tests 1 failed \| 1 passed \| 59 skipped (61)`：红在「第 3 列 = minmax(330px, 380px)，其余三列不变（规格 §3 / §4.1-1、3）」——`expected '280px 350px 380px 330px' to be '280px 350px minmax(330px, 380px) 330px'`；算术那条仍绿（1376 = 1376，写死 380 在算术上「凑对」，只有逐字断言抓得住）。还原后 `git hash-object src/style.css` = `3c9f9af4d41966738706b0860db80848ab2233fc`（与变异前逐字一致），`git diff --numstat` 仍 `27\t0` + `5\t3` | **E1 / C1 有牙**（恰 1 红 = 逐字断言） |
| J-11（实现者）变异 ②：第 3 列写成 `minmax(330px, 1fr)` | `Tests 2 failed \| 59 skipped (61)`：① 逐字断言红 `expected '280px 350px minmax(330px, 1fr) 330px' to be '280px 350px minmax(330px, 380px) 330px'`；② 算术断言也红 `expected 1326 to be 1376`（`1fr` 无 px 上限 → `maxOf` 只取到 base 330，四列上限之和退回 1290）。还原后 SHA = `3c9f9af4d41966738706b0860db80848ab2233fc`、`git diff --numstat` 仍 `27\t0` + `5\t3` | **E1 / R3 有牙**（2 红：无上限的写法被逐字与算术双重抓住） |
| J-12（实现者）变异 ③（临时）：`src/style.css:41` `--card-gap: 12px` → `16px` | `Tests 1 failed \| 1 passed \| 59 skipped (61)`：红在「四列上限 + 3×gap = 默认窗口可用宽度（不留空是算术，规格 §4.1-2）」——`expected 1388 to be 1368`（1340 + 3×16 vs 1400 − 2×16）；逐字断言仍绿。还原后 SHA = `3c9f9af4d41966738706b0860db80848ab2233fc`、`git diff --numstat` 仍 `27\t0` + `5\t3` | **E3 / R2 有牙**（恰 1 红 = 算术断言；改间距即红） |
| J-13（实现者）三处变异全部还原后复核：`npx vitest run src/App.test.ts` | `Tests 61 passed (61)`，exit 0；`git status --porcelain` 仍只有 ` M src/App.test.ts` / ` M src/style.css`；未 `git add`、未 commit（HEAD 仍 `9e2be11`） | 工作区状态 = 待验收；**F6 成立** |
| J-14（主代理，验收复跑）`npx vitest run src/App.test.ts` / `npx tsc -p tsconfig.main.json --noEmit` / `npx vite build` / `npm test` | App：`✓ src/App.test.ts (61 tests)` → `Tests 61 passed (61)`（15:18:52）；tsc：无输出 `TSC=0`；build：`✓ built in 1.08s` `BUILD=0`；全量：`Test Files 47 passed (47)` / `Tests 816 passed (816)`，exit 0 | **D4 / D6 / D7 / D8 / G1 / G3 / G4 / G5 由主代理独立复跑同值**（不接受实现者自述） |
| J-15（主代理）程序化核对 + 普查 | 从 plan 抽出步骤 1 的 `ts` 块与步骤 3 的 `css` 块做 `includes` 比对 → 两者均 `true`（仅 CRLF 随仓库行尾）；`git diff --name-only` = `src/App.test.ts`、`src/style.css`（+ 本表自身）；`const BUDGET = 30;` 仍在 `QuickLaunch.vue:124`；旧规格不在改动清单里；`node .superpowers/sdd/2026-10-13-grid-fill-width/tick-census.mjs` → `task-01 … ☑=39 裸☐=0 I段 -[ ]=0 H2=已提交`，`CENSUS=0` | **H3 通过**；「无减少」按索引 K11 的算术判据成立 |
| J-16（主代理，修订轮先红）只改测试、未改 CSS：`npx vitest run src/App.test.ts -t '网格宽度契约'` | `❯ src/App.test.ts (61 tests \| 1 failed \| 59 skipped)`；`AssertionError: expected '280px 350px minmax(330px, 380px) 330px' to be '280px 350px 380px 330px'`；`Tests 1 failed \| 1 passed \| 59 skipped (61)`，exit 1 | **D9 通过**：恰 1 红 = 逐字断言（算术仍绿 → 定宽与 `minmax` 在算术上等价，只有逐字断言能区分） |
| J-17（主代理，修订轮变异）CSS ① 退回 `minmax(330px, 380px)`；② 写成 `1fr`（各跑一次 `-t '网格宽度契约'` 后还原） | ① `1 failed \| 1 passed \| 59 skipped (61)`：逐字断言红（`not.toMatch(/minmax\|\bfr\b/)` 是同条用例的第二道防线）；② `2 failed`：逐字红 + 算术红 `expected 996 to be 1376`（`1fr` 无 px 值，求和只到 996）。还原后 `git hash-object src/style.css` = `8521468a1e48c6cd13e2c27eb765e2b9a554b4bd`、`git diff --numstat` = `6\t5` | **E2 有牙**：改回 `minmax` 或写 `fr` 都会红 |
| J-18（主代理，修订轮四道门）`npx vitest run src/App.test.ts` / 相邻三份 / `npx vite build` / `npx tsc -p tsconfig.main.json --noEmit` / `npm test` | App：`Tests 61 passed (61)` exit 0；相邻：`3 passed (3)` / `47 passed (47)` exit 0；build：`✓ built in 1.09s` `BUILD=0`；tsc：无输出 `TSC=0`；全量：`Test Files 47 passed (47)` / `Tests 816 passed (816)` exit 0（计数与修订前一致——修订只改断言、不增删用例） | **D10 / G1-G5 通过** |
| J-19（主代理，修订轮范围）`git diff --numstat` / `git diff -U0 -- src/style.css` | `6\t5 src/style.css`（删除行 = 修订前的 4 行注释 + 1 行属性，均在 :78-83）、`13\t9 src/App.test.ts`（改 1 条用例名与断言、新增 1 条 `not.toMatch` 断言、改头注释；其余既有用例一字未改）；未碰 `App.vue` / `src/modules/**` / `src-main/**` / i18n / `package.json`；`BUDGET = 30` 仍在 | 边界内（索引 K9 的口径同样适用于修订轮） |
