# 任务 1 实现报告 · `.grid` 第 3 列 `minmax` + 宽度契约测试

- 日期：2026-10-13（实现者：子代理，子代理驱动 = subagent-driven-development 的任务 1）
- 判据来源：`docs/superpowers/checks/2026-10-13-grid-fill-width/task-01-grid-minmax-contract.md`（A2 基线由主代理实测，本报告不重跑基线）
- 工作区状态：**未 `git add`、未 commit**（F6 / 索引 K5），HEAD 仍 `9e2be11`；改动 = ` M src/style.css` + ` M src/App.test.ts`
- 取证：全部命令与真实输出已逐条落进该 check 表的 **J-2 … J-13**（A-I 的勾留给主代理）

## 1 状态

**通过（自动化门全绿）**。真机目视门属任务 2（本环境起不了 Electron，索引 K7），未跑。

## 2 先红 → 后绿（真实计数）

| 门 | 命令 | 真实结果 |
|---|---|---|
| D1/D2 先红 | `npx vitest run src/App.test.ts -t '网格宽度契约'`（改 CSS 前） | exit 1；`(61 tests \| 2 failed \| 59 skipped)`。红因①：`expected '280px 350px 330px 330px' to be '280px 350px minmax(330px, 380px) 330px'`（`App.test.ts:948`）；红因②：`expected 1326 to be 1376`（`App.test.ts:958`）——与 check 表 J-1 的复算值逐字一致 |
| D3 改 CSS | `src/style.css:78-80` → 计划 步骤 3 的 5 行块（逐字） | `git diff -U0` 的删除行只在 :78-80；属性行现落 :82，值逐字 = `280px 350px minmax(330px, 380px) 330px` |
| D4 / G1 定向绿 | `npx vitest run src/App.test.ts` | `Test Files 1 passed (1)` / **`Tests 61 passed (61)`**（基线该文件 59 + 2），exit 0；:892-933 的 GPU 网格用例仍绿（R5） |
| D5 / G2 相邻回归 | `npx vitest run src/modules/LogPanel.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModule.test.ts` | `Test Files 3 passed (3)` / `Tests 47 passed (47)`（QuickLaunch 7 / TemplateModule 20 / LogPanel 20），exit 0 |
| D6 / G5 CSS 语法门 | `npx vite build` | exit 0；`✓ 78 modules transformed`、`dist/assets/index-B7KDjMpY.css 31.15 kB`、`✓ built in 1.06s` |
| D7 / G4 类型门 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出，exit 0 |
| D8 / G3 全量 | `npm test` | **`Test Files 47 passed (47)` / `Tests 816 passed (816)`**，exit 0（= 基线 814 + 2，文件数不变、无文件计数减少） |
| G6 i18n 硬门 | `npx vitest run src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts` | `Tests 4 passed (4)`，exit 0（另在 `npm test` 里绿） |
| 改动范围 | `git diff --numstat` | `27\t0\tsrc/App.test.ts`（纯追加：2 个 import + 25 行 describe，0 删除）、`5\t3\tsrc/style.css`；仅此两文件 |

## 3 E 断言 ↔ 用例名对应

新 describe = `describe('App 网格宽度契约（2026-10-13-grid-fill-width）')`，`src/App.test.ts:937-960`（紧邻既有网格用例 :892-933 之后）。两条用例名逐字取计划 步骤 1（C2）。

| E | 断言 | 落在哪条用例 / 哪一行 |
|---|---|---|
| E1 | 四列逐字、第 3 列不含 `fr` | 用例 1「第 3 列 = minmax(330px, 380px)，其余三列不变（规格 §3 / §4.1-1、3）」的 `expect(tracksRaw).toBe('280px 350px minmax(330px, 380px) 330px')`（:948）——逐字串里没有任何 `fr`；`tracks.length === 4`（:949）另钉「切 track 把 `minmax(…)` 当一个整体」（C5） |
| E2 | 第 3 列 base = 330 | 同一用例的逐字串：`minmax(330px, 380px)` 的 base 330 是被断言字符串的一部分。变异 ②（上限换 `1fr`）时算术断言也红（`maxOf` 只取到 330 → 1326），反证 base 330 确实是这条契约的载体 |
| E3 | 四列上限之和 + 3×`--card-gap` = 默认窗口宽 − 2×内边距 | 用例 2「四列上限 + 3×gap = 默认窗口可用宽度（不留空是算术，规格 §4.1-2）」的最后一条 `expect(tracks.reduce(…) + 3 * gap).toBe(winW - 2 * gap)`（:958） |
| E4 | 其余三列仍 `280px` / `350px` / `330px` | 用例 1 的同一个 `toBe` 逐字串里含 `280px` / `350px` / 末段 `330px` 三段（改任一列宽即红） |
| E5 | `.layout` 的 `padding: var(--card-gap)` 前提被断言 | 用例 2 的 `expect(css.slice(css.indexOf('.layout {'), css.indexOf('.grid {'))).toMatch(/padding:\s*var\(--card-gap\)/)`（:957） |
| C3（不写死 1376/1400） | 窗口宽现读 `src-main/main.ts`、间距现读 `--card-gap` | 用例 2 的 `winW`（:954，正则 `/width:\s*(\d+),\s*height:/`）与 `gap`（:955）；文件里没有任何 1376/1400 字面量 |

## 4 三处变异自检

| # | 变异 | 红几条 / 哪条红 | 还原取证 |
|---|---|---|---|
| ① | 第 3 列写成写死的 `380px` | **1 红**：用例 1（逐字断言）`expected '280px 350px 380px 330px' to be '280px 350px minmax(330px, 380px) 330px'`；算术那条仍绿（写死 380 在算术上「凑对」1376=1376）→ 只有逐字断言抓得住这种写法（E1/C1 有牙） | `git hash-object src/style.css` = `3c9f9af4d41966738706b0860db80848ab2233fc`（与变异前逐字一致）；`git diff --numstat` 仍 `27\t0` + `5\t3` |
| ② | 第 3 列写成 `minmax(330px, 1fr)` | **2 红**：逐字断言红（`… minmax(330px, 1fr) 330px` ≠ 期望）+ 算术断言红 `expected 1326 to be 1376`（`1fr` 无 px 上限 → 上限之和退回 1290）→ R3 被双重抓住 | 同上 SHA / 同上 numstat |
| ③ | 临时把 `src/style.css:41` `--card-gap: 12px` → `16px` | **1 红**：用例 2（算术）`expected 1388 to be 1368`（1340 + 3×16 vs 1400 − 2×16）；逐字断言仍绿 → R2 有牙 | 同上 SHA / 同上 numstat |
| 还原后复核 | 三处全部还原 | `npx vitest run src/App.test.ts` → `Tests 61 passed (61)`，exit 0；`git status --porcelain` 仍只有两个 ` M` | 见 J-13 |

## 5 疑虑清单（请主代理裁决）

1. **落点：`:933 之后` 还是「文件末尾」**。计划 步骤 1 写「在 `src/App.test.ts` 末尾追加」，而计划「文件结构」表、简报、规格 §4.1 都写「紧邻既有网格用例（:891-933）/ 追加在 :933 之后」。按 SDD「spec 为真相源」+ 简报，我落在 **:937-960**（GPU describe 之后、`describe('i18n / App 外壳（Slice 1）')` 之前）。若你要的是文件末尾，位置可平移，但会离规格 §4.1 的「紧邻」更远。
2. **`+5 / -3` 不是越界**：计划 步骤 3 给的替换块本身是 5 行（4 行注释 + 1 行属性），替换原 :78-80 三行，故 `git diff --numstat` 是 `5\t3`、属性行从 :80 移到 :82。check 表 B1 的「只此三行」按简报口径 = 「删除行只在 :78-80」，已满足；验收时别把新增 5 行当扩范围。
3. **原 :80 行尾注释被整行删除**：其中「GPU 卡 300→330（2026-10-05 用户微调 +30px）；快捷启动卡（2026-10-10 规格 §4）插在第 3 列、同宽 330，GPU 顺移到第 4 列」这段来历不在计划 步骤 3 的新注释里，新注释只保留「第 1/2/4 列」「第 3 列（快捷启动）」的列序语义。我按「逐字照抄 plan」执行、没有自行补回来历注释；若认为该来历必须保留，应先改 plan 再改代码。
4. **R1 的行为面（1350–1399 不新增横向滚动区间）没有自动化覆盖**：契约断的是 CSS 规则文本（happy-dom 不加载外部 CSS），`minmax` 的实际收缩行为只能靠真机清单第 3 步（任务 2）。本环境起不了 Electron，未跑。
5. **逐文件计数未逐条比对**：`npm test` 只核对了 `47 files / 816 tests` 与 `App.test.ts 59 → 61`，没有把 47 份文件的计数逐份和基线对照（A2 明令不重跑基线，无基线的逐份数字可比）。若你要逐份对照，需要重跑基线。
6. **`git diff -U0` 的 hunk 头显示 `@@ -78,3 +78,5 @@ body {`**：`body {` 是 git 对 CSS 的「函数上下文」猜测，不是真的改了 `body`，别误读。
7. 未 `git add`、未 commit（F6）；check 表我只填了 **J 段**（J-2…J-13），A-I 的勾与 H1-H3 归你。填表后跑过 `node .superpowers/sdd/2026-10-13-grid-fill-width/tick-census.mjs`：本表 `☑=4 裸☐=36 I段 -[ ]=3`（未提交状态，符合预期），表格列数校验 `bad rows = 0`。
