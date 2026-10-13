# 任务 1 简报 · `.grid` 第 3 列 `minmax` + 宽度契约测试

完成判据以 check 表为准：docs/superpowers/checks/2026-10-13-grid-fill-width/task-01-grid-minmax-contract.md（A1-A4 / B1-B3 / C1-C5 / D1-D8 / E1-E5 / F1-F6 / G1-G6 / H1-H3 / I）。
规格：docs/superpowers/specs/2026-10-13-grid-fill-width-design.md §3 / §4.1 / §5（取值以规格为准）。
计划：docs/superpowers/plans/2026-10-13-grid-fill-width.md §任务 1（**步骤 1 的测试代码逐字照抄，步骤 3 的 CSS 逐字照抄**）。

## 起点（已实测，**不要重跑基线**）

- HEAD = `9e2be11`，工作区干净（只有 `.superpowers/` 下本功能的 SDD 工件未跟踪，属正常）。
- 全量基线（索引 K6，主代理已实测）：`npm test` → `Test Files 47 passed (47)` / `Tests 814 passed (814)`，exit 0；其中 `src/App.test.ts` = **59 tests**。你的全量结果必须是 **816 = 814 + 2**，且 `Test Files 47` 不变、任何文件不得减少。
- 现状锚点（真实行号，已核对）：
  - `src/style.css:76-82` = `.grid` 规则：`:78-79` 两条注释、`:80` `grid-template-columns: 280px 350px 330px 330px;`、`:81` `gap: var(--card-gap);`。**要改的是 :78-80 三行**（注释 + 属性），:81 与 `.grid` 的 `display` 一字不动。
  - `src/style.css:41` `--card-gap: 12px`；`src/style.css:73` `.layout { padding: var(--card-gap); }` ← 这是 E5 要断言的前提。
  - `src/App.test.ts:892-933` = `describe('App GPU card mount')`（网格顺序契约）。新 describe 追加在 **:933 之后**；**既有用例一字不改**（这条 GPU 用例就是 R5 的回归对象）。
  - `src/modules/LogPanel.test.ts:365` = 读 `style.css` 文本做契约断言的先例（它用 `join(__dirname, '..', 'style.css')`；**本文件在 `src/` 下，路径是 `join(__dirname, 'style.css')`**）。
  - `src-main/main.ts:223` `width: 1400, height: 950, minWidth: 760` ← 测试从这里**现读**窗口宽（C3：不许写死 1400 / 1376）。
- 红阶段预期我已复算（见 check 表 J-1）：`tracksRaw = "280px 350px 330px 330px"`、`sum+3gap = 1326`、`winW-2gap = 1376`、`.layout` 的 padding 前提 = true。你的 D2 必须复现这两个红因。

## 契约（C1-C5，逐字）

- **C1**：改后 `grid-template-columns` 的值逐字 = `280px 350px minmax(330px, 380px) 330px`。
- **C2**：两条用例名逐字取计划 步骤 1（`第 3 列 = minmax(330px, 380px)，其余三列不变（规格 §3 / §4.1-1、3）` / `四列上限 + 3×gap = 默认窗口可用宽度（不留空是算术，规格 §4.1-2）`）。
- **C3**：不写死 1376 / 1400：窗口宽从 `src-main/main.ts` 现读、间距从 `--card-gap` 现读。
- **C4**：`:78-79` 注释里「靠左排布，右侧留白」必须删（改后不成立），换成计划 步骤 3 给的新注释（含日期与规格名）。
- **C5**：切 track 的解析式必须把 `minmax(…)` 当一个整体（它内含空格）。

## TDD（D1-D8，先红后绿）

1. D1/D2：先落 2 条用例 → `npx vitest run src/App.test.ts -t '网格宽度契约'` → **必须 2 红**，红因与 J-1 逐字一致（`expected '280px 350px minmax(330px, 380px) 330px'` 实收旧值；`expected 1326 to be 1376`）。
2. D3：改 `src/style.css:78-80`。
3. D4：`npx vitest run src/App.test.ts` → **61 passed (61)**（59 + 2）。
4. D5：`npx vitest run src/modules/LogPanel.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModule.test.ts` → 全绿（这三份都会读 `style.css` 文本）。
5. D6：`npx vite build` → exit 0（CSS 语法门）。
6. D7：`npx tsc -p tsconfig.main.json --noEmit` → 无输出、exit 0。
7. D8：`npm test` → `47 files / 816 tests`，exit 0。

## 口径（F1-F6）

- F1：只改 `src/style.css` 与 `src/App.test.ts` 两个文件。
- F2：不新增依赖、不碰 `package.json` / lockfile。
- F3：`src/modules/QuickLaunch.vue:124` 的 `BUDGET = 30` **不改**（卡片变宽后 30 偏保守是**已接受**的口径，索引 K3）。
- F4：旧规格 `2026-10-10-quick-launch-card-design.md` 不改写（索引 K4）。
- F5：第 3 列不得写成 `1fr`、不得设更高上限（索引 K1 / K2）。
- F6：**不 `git add`、不 commit**（索引 K5）——改动留在工作区等主代理验收。

## 明确不做（越界即打回）

- 不改 `src/App.vue`、`src/modules/**`、`src-main/**`、`src/i18n.ts`、`electron-builder.yml`、任何文档。
- `src/style.css` 只改 :78-80 三行；`.grid` 的 `display` / `gap` 与文件其余部分一字不动。
- **不跑 `npm run dev` / 不起 Electron**（索引 K7：本环境 `electron.exe` 立即退出 `0x80000003`）。真机门属任务 2，由用户执行。

## 门（跑完把命令与真实输出填进 check 表 J 段；A-I 的勾留给我）

- D4-D8 / G1-G6 逐条真实输出。
- `git diff --numstat` 只含两个文件；`git diff -U0 -- src/style.css` 的删除行只在 :78-80。
- **变异自检至少三处**（每次还原后报该文件 SHA 与 `git diff --numstat`）：
  ① 第 3 列写成写死的 `380px` → E1/C1 必须红（逐字断言）；
  ② 写成 `minmax(330px, 1fr)` → E1 必须红（R3：无上限会无限拉伸）；
  ③ 把 `--card-gap` 改成 `16px`（临时）→ E3 必须红（R2：算术契约随窗口/间距变化而红）。

报告写到 `.superpowers/sdd/2026-10-13-grid-fill-width/task-01-report.md`（先红/后绿计数、每条 E 对应哪个用例名、三处变异各红几条、疑虑清单）。
回传给我（简短）：状态一行 + 各门真实计数 + 三处变异各红几条 + 疑虑（若有）。
