# 任务 6 · 修复轮：图标只补给 `ql_terminals` — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 6 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §6.2 §6.3 §7.1-14~16
> 来源：**最终整分支审查**（只读）的 I-1（Important）/ I-3 / M-1。按 AGENTS.md「偏离先改文档（同一 commit）」：spec §6.1/§6.2/§6.3/§6.4/§7.1/§7.2/§8-K1/§9-R9~R11 与 plan 任务 6 **已先改**，与本任务的代码改动同一个 commit（索引 K24）。
> 索引：[00-index.md](00-index.md) 的 V6、**K24 K25 K26 K27 K28**、K19（用例名不改）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 任务 1–5 已提交；**工作区只有待同步的文档**（spec / plan / `00-index.md` / task-05 / 本表），**代码一行未改** | `git log --oneline -7`；`git status --porcelain`；`git diff --name-only -- src src-main` | 五个实现/文档提交 + `dee5f83`（SDD 账本）在位；porcelain 只有上述五份文档；`git diff --name-only -- src src-main` = **空**（这就是「先改文档再改代码」的证据） | ☑ |
| A2 | 基线总数（主代理实测，子代理不重跑） | `npm test` | `Tests 923 passed (923)`，exit 0 | ☑ |
| A3 | 要复用的既有做法（真实行号） | 读 `src-main/ipc-ql.test.ts:87-92`（`vi.mock` 透传计数器）、`:736-760`（「不付代价」断言的形状）、`src/modules/QuickLaunchModal.test.ts:793-803`（`injectRealCss` + `getComputedStyle` 声明门先例） | 三处做法可直接照搬；本任务不引入新机制 | ☑ |
| A4 | 现状取证（缺陷本身） | 读 `src-main/main.ts:1046-1058`（`detectTerminalsAsync` 无条件 `withTerminalIcons`）、`:1134`（`ql_save` shell 分支）、`:1155-1157`（`ql_start` shell 分支）、`:112-120`（`terminalIconCacheDir` 里的重复 `mkdirSync`） | 四处与描述一致：两个消费方只取 `.map(info => info.id)` | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/main.ts` | ① `:1046-1058` 去掉 `withTerminalIcons`，恢复「只探测」（注释同步改：补图标只在 `ql_terminals`）；② `:1142` 的 handler 改为「探测 → 补图标」（仍是 `AsyncFunction`）；③ `:112-120` 删掉 `mkdirSync`（建目录归提取层，spec §6.2） | 三处之外不得有 hunk；`:1134` / `:1155-1157` 两个消费方**一字不改**（它们本就不该付代价） | ☑ |
| B2 | `src-main/ipc-ql.test.ts` | 新增 spec §7.1-14（不付提取代价，含 `ql_terminals` 对照）与 §7.1-15（哨兵字节钉读路径）；把原用例注释里「磁盘缓存生效」改成「写入生效 + 键稳定」（索引 K25） | **用例名一字不改**（索引 K19）；既有 C4 形状门、缓存写入门、「两次调用不共用数组实例」不得改 | ☑ |
| B3 | `src/components/Dropdown.test.ts` | 新增 spec §7.1-16 尺寸声明门（`injectRealCss` + `getComputedStyle`） | 既有 `options_with_imageurl…` / `imageurl_wins…` / `options_without_icon…` 三条一字不改 | ☑ |
| B4 | 文档（同一 commit） | spec（已先改）、plan 任务 6（已写）、`00-index.md`（清单表 / G8 / V6 / K24~K28）、task-05 C 段按 §7.2 的 15 条重写（索引 K28）、本表 J 段 | 三份文档任一改动，另两份对应处必须核对（AGENTS.md「后续更新」第 3 条） | ☑ |

## C. 接口契约

| # | 契约 | 出处 | ✓ |
| --- | --- | --- | --- |
| C1 | `detectTerminalsAsync(): Promise<TerminalInfo[]>` 签名不变，语义 = **只探测**，返回项**不带** `icon` | spec §6.3 / 索引 K24 | ☑ |
| C2 | `ql_terminals` 的 handler 仍是 `AsyncFunction`（`ipc-ql.test.ts` 有这条形状断言），返回**带可选** `icon` | spec §6.3 / §6.6-1 | ☑ |
| C3 | `terminalIconCacheDir(): string` 只算路径、不建目录；建目录只在 `withTerminalIcons` 内（`ql-terminal-icons.ts:151-155`） | spec §6.2 / 索引 K24 | ☑ |
| C4 | 计数器写法：`vi.mock("./ql-terminal-icons", importOriginal => 包一层计数并透传)`（照 `:87-92` 的 `detectTerminals` 计数器），**不改行为只计数** | spec §7.1-14 / `ipc-ql.test.ts:87-92` | ☑ |
| C5 | 哨兵字节：按 `cacheFileName(exe)` 算出文件名 → 写一段**不是 PNG** 的字节 → 调 `ql_terminals` → 断 `icon === "data:image/png;base64," + base64(那段字节)` | spec §7.1-15 / 索引 K25 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写 §7.1-14 / §7.1-15 两条测试（B1 未改） | `npx vitest run src-main/ipc-ql.test.ts`；§7.1-15 另加**变异取证** | 14 **红**（计数不变 → 实际 +1，`expected 22 to be 21`）。**15 改前必然绿**（读缓存路径本来就工作，忠实于 §7.1-15 的写法在改前不会红）→ 它的「有牙」靠变异证明：临时把 `ql-terminal-icons.ts` 的 `readCachedIcon` 改成 `return null` → 该用例红（收到真 PNG `iVBORw0KGgo…` 而不是哨兵 `cWwtdGVybWluYWw…`）→ 还原（`git diff --quiet` exit 0）。口径登记索引 K29 | ☑ |
| D2 | 改 `main.ts` 三处（B1）后定向跑 | `npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts src-main/quick-launch-terminals.test.ts` | 全绿；本文件用例数 = 基线 + 2 | ☑ |
| D3 | 声明门**有牙**验证（B3 之后） | 临时把 `src/style.css` 的 `.option-image` 的 `width: 1em` 改成别的值 → 跑该用例 → 还原 | 改后**红**、还原后**绿**；`git diff --stat src/style.css` 回到 2 hunks / +13 −1 | ☑ |
| D4 | 收尾门 | `npx tsc --noEmit -p tsconfig.main.json`；`npm test` | tsc 无输出 exit 0；`Tests 926 passed (926)`（923 + 3）。数字对不上要在 J 段说明 | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | ✓ |
| --- | --- | --- | --- |
| E1 | 保存一个 **shell** 条目：`withTerminalIcons` 调用次数**不变**（用例 = `ql_save / ql_start 的 shell 分支不调 withTerminalIcons；ql_terminals 仍补图标（对照）` 的第一段） | spec §6.3 / 审查 I-1 / 索引 K24 | ☑ |
| E2 | 启动一个 **shell** 配置：同上（同一条用例的第二段）；**对照组** = 调 `ql_terminals` → 计数 +1（第三段，防「把补图标整个删掉」蒙对）。粒度：三段合在一条 `it` 里（不是照 `:736-760` 拆两条）—— 一个契约一条用例，代价 = 与既有文件的风格不一致；口径登记索引 K30 | spec §6.3 / §7.1-14 / 索引 K30 | ☑ |
| E3 | 读缓存路径本身：哨兵字节 → 返回的 `icon` 就是那段字节（读路径坏掉必红） | spec §7.1-15 / 索引 K25 | ☑ |
| E4 | 尺寸声明门：`.option-image` / `.select-image` 的 `width`/`height` = **`14px`**（= `1em` 在 `--fs-body` 14px 下的解析值，happy-dom 会解析 `em`）、`object-fit: contain`、`.option-image` 的 `margin-right: 6px`。**不能**区分 `1em` 与写死的 `14px`（渲染等价，K9 要的就是渲染尺寸）；口径登记索引 K31 | spec §7.1-16 / §6.4 / 索引 K26·K31 | ☑ |
| E5 | 既有三条一字不改仍绿：C4 形状门（`:273-287`）、缓存写入门（`:302-330`）、「两次调用不共用数组实例」 | 索引 K19 / task-02 C5·E5 | ☑ |
| E6 | 「图标缓存 ≠ 探测缓存」不被带偏：每次 `ql_terminals` 仍实测终端（既有 C4 第一条一字不改） | RF3 / 前置规格 §6.1 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | G1：`quick-launch-terminals.ts` 一字不改 | `git diff --name-only` 不含该文件 | ☑ |
| F2 | G4：提取仍走 `execFile`，不引 `spawnSync` | `git diff src-main/ql-terminal-icons.ts` 为空（本任务不改提取层） | ☑ |
| F3 | G2/G3：不加 i18n 键、不加依赖、不加 IPC 通道 | `npx vitest run src-main/i18n` 全绿；`git diff package.json pnpm-lock.yaml package-lock.json src-main/ipc-channels*` 为空 | ☑ |
| F4 | G10：只改 B1–B3 三份代码文件（+ B4 文档） | `git diff --name-only` 逐字对照 | ☑ |
| F5 | G9：不 `git add`、不 commit、不 stash | `git status --porcelain` 有改动；`git log --oneline -1` 仍是 `dee5f83` | ☑ |
| F6 | 用例名不改（含 `terminal_icons_are_stable_across_calls_and_come_from_the_disk_cache`） | `git diff` 里该 `it(` 行不在 hunk 内 | ☑ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向三份 | `npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts src-main/quick-launch-terminals.test.ts` | 全绿 | ☑ |
| G2 | 索引 V1（载荷链） | `npx vitest run src-main/quick-launch.test.ts src/modules/QuickLaunch.test.ts` | 全绿 | ☑ |
| G3 | 类型 | `npx tsc --noEmit -p tsconfig.main.json` | 无输出，exit 0 | ☑ |
| G4 | 全量 | `npm test` | `Test Files 53 passed (53)` / `Tests 926 passed (926)`，exit 0 | ☑ |
| G5 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿，键数不变 | ☑ |

## H. 提交门（主代理在验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/main.ts` `src-main/ipc-ql.test.ts` `src/components/Dropdown.test.ts` + `docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md` + `docs/superpowers/plans/2026-10-16-quick-launch-terminal-icons.md` + `docs/superpowers/checks/2026-10-16-quick-launch-terminal-icons/{00-index.md,task-05-*.md,task-06-*.md}`（索引 K24：文档与代码同 commit） | ☑ |
| H2 | commit message（逐字） | `fix(main): 图标只补给 ql_terminals，保存与启动不再付提取代价`（**已提交**，哈希见 `.superpowers/sdd/2026-10-16-quick-launch-terminal-icons/progress.md` 的任务 6 段） | ☑ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☑ |

## I. 完成判据

- [x] D1–D4 四步按序过（先红有证据）
- [x] E1–E6 全部有对应断言且绿
- [x] F1–F6 无越界
- [x] G1–G5 全绿且总数 = 926
- [x] H1–H3 由主代理执行；文档与代码同 commit
- [x] 重新打包 + 重跑 task-05 的 D2/D3（plan 任务 6 步骤 6）

## J. 执行记录（实现者填命令与真实输出）

| # | 步骤 | 命令与真实输出摘要 |
| --- | --- | --- |
| J-1 | A1/A2 起点 | `git log --oneline -8` → HEAD = **`dee5f83`**（五个实现/文档提交 + SDD 账本都在位）。`git status --porcelain` → 6 个 `M`（spec / plan / `00-index.md` / task-02 / task-05 / `.superpowers/sdd/…/progress.md`）+ 1 个 `??`（本表）。**比 A1 预期的「五份文档」多两份**：`progress.md` 与 task-02 表是主代理落账留下的，本任务一行未碰（收尾时它们仍在 `M` 列表里、内容不变）。`git diff --name-only -- src src-main` = **空** → 代码一行未改（A1 的实质判据）。A2 基线按表不重跑；J-9 顺带取到同一数字（923）。 |
| J-2 | A3 三处既有做法取证 | 三处全部读到并照搬，未造新机制：① `src-main/ipc-ql.test.ts:87-92`（改前坐标）`vi.mock('./quick-launch-terminals', importOriginal => …)` 只计数不改行为；② `:736-760`（改前坐标）计数器 + 对照组的断言形状（`beforeX` / `toBe(beforeX)` / 对照 `toBe(beforeX + 1)`）；③ `src/modules/QuickLaunchModal.test.ts:793-803` `injectRealCss()` + `getComputedStyle(el).width === '180px'`。A4 现状取证（改前真实行号）：`main.ts:1046-1058` 无条件 `withTerminalIcons(terminalIconCacheDir(), detectTerminals())`、`:1134` 与 `:1155-1157` 两处只 `(await detectTerminalsAsync()).map((info) => info.id)`、`:112-120` 的 `terminalIconCacheDir()` 里 `try { mkdirSync(d, { recursive: true }); }` —— 四处与描述一致。 |
| J-3 | D1 先红（两条） | 先只写测试、`main.ts` 未改：`npx vitest run src-main/ipc-ql.test.ts`（exit 1）→ `Tests 3 failed \| 29 passed (32)`。两条红逐字对上 D1 的预期：`AssertionError: 保存 shell 配置不得补图标（只取 info.id，规格 §6.3）: expected 22 to be 21`、`…启动 shell 配置不得补图标…: expected 23 to be 22`（计数器 = 新增的 `cap.iconEnrichments`，`withTerminalIcons` 真实调用次数 23）。第三条红是级联：本用例在断言处抛出、没走到自己的 `ql_stop`，`qliconcost01` 留在运行表里，把后面「两个 exe 配置并发 ql_start」的 `ql_states` 断言带红（修复后该级联消失）。**偏差（见报告 §5 疑虑 1）**：§7.1-15 那条在改前是**绿**——读路径本来就工作，「返回真提取的 PNG」只在读路径被破坏时发生，所以 D1 里「15 现在也红」不成立；它的「有牙」改由 J-9 的变异取证。另：§7.1-14 第一版按 `:736-760` 拆成两条 `it`（本文件 +3、全量 927），与 D2「本文件 = 基线 + 2」/ G4「926」的口径不符 → 合并成一条三段式（保存 → 启动 → 对照），合并后重新取红：`git checkout HEAD -- src-main/main.ts`（改前先 `Copy-Item` 备份）→ `npx vitest run src-main/ipc-ql.test.ts -t "不付图标提取的代价"`（exit 1）→ `Tests 1 failed \| 30 skipped (31)`，红在 `保存 shell 配置不得补图标…: expected 1 to be +0`；随后 `Copy-Item` 还原，`git diff --numstat` 回到 `17 11 src-main/main.ts`。 |
| J-4 | D2 实现后定向绿 | 改 `main.ts` 三处（`git diff src-main/main.ts` = **恰好 3 个 hunk**：`@@ -110,13 +110,12 @@`（`terminalIconCacheDir` 删 `mkdirSync`，函数体只剩 `return join(dataDir(), 'cache', 'terminal-icons')`）、`@@ -1047,13 +1046,17 @@`（`detectTerminalsAsync` → `setImmediate(() => resolve(detectTerminals()))` + 注释改成「本函数只探测、不补图标」）、`@@ -1139,7 +1142,10 @@`（`ql_terminals` handler → `withTerminalIcons(terminalIconCacheDir(), await detectTerminalsAsync())`，仍是 `async` 箭头函数）。`:1136` / `:1160-1161` 两个消费方一字未改）。`npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts src-main/quick-launch-terminals.test.ts`（exit 0）→ `Tests 47 passed (47)`；本文件 `31 tests` = 基线 29 + 2（D2 的「+2」）。证据行：`[ipc-ql] withTerminalIcons 真实调用次数 = 8`（改前同文件跑出来是 23）→ 补图标只随 `ql_terminals` 增长。 |
| J-5 | D3 声明门有牙验证（改→红→还原→绿） | 新用例 `icon_image_boxes_are_declared_as_1em_contained_with_6px_gap` 首跑红在期望值写法：`expected '14px' to be '1em'` —— **happy-dom 会把 `em` 按继承字号解析成 px**（探针：`[probe] trigger fontSize = 14px \| img fontSize = 14px \| width = 14px \| height = 14px \| objectFit = contain`，即 `.btn` 的 `var(--fs-body)` = 14px 这条链在 happy-dom 里同样成立，P9/K5）→ 期望值按解析结果写 `'14px'`，注释写清这条门只钉「CSS 里写了这条规则」、不证布局/不证不截断（真机门 §7.2-1 / §7.2-13）。有牙验证：`src/style.css:361` 的 `.option-image` 临时 `width: 1em` → `width: 20px` → `npx vitest run src/components/Dropdown.test.ts -t "icon_image_boxes"`（exit 1）→ `AssertionError: .option-image 的 width 不是 1em（=14px）: expected '20px' to be '14px'`；还原 → `npx vitest run src/components/Dropdown.test.ts`（exit 0）`Tests 11 passed (11)`（基线 10 + 1）。还原证据：`git diff --stat -- src/style.css` = **空**、`git diff --quiet -- src/style.css` **exit 0**（与 HEAD 逐字一致）。表里「回到 2 hunks / +13 −1」是任务 3 当时的工作区坐标（索引 K20）；那次改动已在 HEAD 的 `646d81a` 里，同一形状实测为 `git diff -U0 646d81a^ 646d81a -- src/style.css` → 两个 `@@`（`@@ -352,0 +353,9 @@`、`@@ -359 +368,4 @@`）+ `git diff --numstat` = `13 1`。 |
| J-6 | D4 tsc + 全量 | `npx tsc --noEmit -p tsconfig.main.json` → 无输出，`tsc exit=0`（改注释行号后再跑一次仍 0）。`npm test` → `Test Files 53 passed (53)` / **`Tests 926 passed (926)`**，exit 0 = 基线 923 + 3（`ipc-ql.test.ts` +2、`Dropdown.test.ts` +1）。数字与 G4 逐字一致，未删任何用例。 |
| J-7 | G1/G2/G5 回归 | G1（+ 索引 V6 的第四份）：`npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts src-main/quick-launch-terminals.test.ts src/components/Dropdown.test.ts`（exit 0）→ `Tests 57 passed (57)`（31 + 6 + 9 + 11）。G2（索引 V1 载荷链）：`npx vitest run src-main/quick-launch.test.ts src/modules/QuickLaunch.test.ts`（exit 0）→ `Tests 44 passed (44)`。G5：`npx vitest run src-main/i18n`（exit 0）→ `Tests 18 passed (18)`，四道 i18n 门全绿、键数不变（`git diff --stat -- src-main/i18n package.json pnpm-lock.yaml package-lock.json index.html .gitignore` = 空）。 |
| J-8 | **主代理独立复跑与逐行验收（23:2x–23:4x）**：`npm test`；`npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts src-main/quick-launch-terminals.test.ts src/components/Dropdown.test.ts`；`npx vitest run src-main/quick-launch.test.ts src/modules/QuickLaunch.test.ts src/modules/QuickLaunchModal.test.ts`；`git diff -U0 -- src-main/main.ts \| Select-String "^@@"`；`git diff --quiet -- quick-launch-terminals.ts ql-terminal-icons.ts Dropdown.vue style.css QuickLaunchModal.vue src-main/i18n`；逐行读三份代码 diff | 全量 = \`Test Files 53 passed (53)\` / \`Tests 926 passed (926)\` exit 0；\`TSC_EXIT=0\`；定向四份 = \`Tests 57 passed (57)\`；载荷链三份 = \`Tests 74 passed (74)\`；\`main.ts\` 的 hunk 头 = **5 个，落在三处**（\`:113\`/\`:117\` = terminalIconCacheDir；\`:1050\`/\`:1056\` = detectTerminalsAsync；\`:1142\` = handler）—— 与 B1 的「三处」一致（子代理报的「3 个 hunk」是默认上下文下的分组，同一事实）；六个不得改的文件 \`git diff --quiet\` **exit 0**；\`git diff --name-only\` 源码侧只有 B1–B3 三份。新用例逐行读过：计数器是只计数的透传壳（\`vi.mock('./ql-terminal-icons')\` 其余导出原样）、哨兵用真 \`cacheFileName\` 算键、尺寸门断的是解析后的 \`14px\` 并在注释里写清不能区分 \`1em\`（K31） |
| J-9 | 补充取证：§7.1-15 的「有牙」+ 基线复核 | 变异取证（等价于 D3 的有牙验证，因为这条的目标行为在改前就存在）：临时把 `src-main/ql-terminal-icons.ts:123` 的 `readCachedIcon` 改成直接 `return null`（= 读路径整个失效）→ `npx vitest run src-main/ipc-ql.test.ts -t "哨兵字节"`（exit 1）→ `AssertionError: 返回的不是哨兵字节 = 没有读缓存文件（或缓存键与 cacheFileName 不一致）: expected 'data:image/png;base64,iVBORw0KGgoAAAA…' to be 'data:image/png;base64,cWwtdGVybWluYWw…'` —— 收到的正是真提取的 PNG（`iVBORw0KGgo` = PNG magic 的 base64），正是 I-3 描述的那种红。还原证据：`git diff --quiet -- src-main/ql-terminal-icons.ts` **exit 0**。基线复核（为解释「926 vs 927」而做）：把 `src-main/ipc-ql.test.ts` 与 `src/components/Dropdown.test.ts` 临时 `git checkout HEAD --`（改前先 `Copy-Item` 备份到 `.temp/task06-baseline-probe/`，跑完还原）→ `npm test` → `Tests 923 passed (923)` → **HEAD 的真实基线就是 923**，A2 的数字没有过期；927 那次是我把 §7.1-14 拆成两条 `it`（+4）造成的，已按 D2/G4 的口径合并。 |
| J-10 | 边界核对（F1–F6 的机械证据） | `git diff --name-only` 的源码侧只有三份：`src-main/main.ts`、`src-main/ipc-ql.test.ts`、`src/components/Dropdown.test.ts`（其余 6 份是主代理留下的文档，本任务未碰；`??` 只有本表）。`git diff --quiet` 逐个 exit 0：`src-main/quick-launch-terminals.ts`（F1/G1）、`src-main/ql-terminal-icons.ts`（F2/G4，含 J-9 的临时变异已还原）、`src/components/Dropdown.vue`、`src/style.css`、`src/modules/QuickLaunchModal.vue`。`git diff --stat -- package.json pnpm-lock.yaml package-lock.json src-main/i18n src-main/ipc-channels.ts index.html .gitignore` = 空（F3/G2/G3：无新键、无新依赖、无新通道）。F5：`git log --oneline -1` 仍是 `dee5f83`、`git stash list` 行数 = 0、`git diff --cached --name-only` = 空 → 未 add、未 commit、未 stash。F6：`git diff -U0 src-main/ipc-ql.test.ts \| Select-String 'terminal_icons_are_stable\|两次调用不共用数组实例\|handler 是 async 函数'` = **无命中** → 三条既有用例名不在任何 hunk 里；新增的 `it(` 行只有两条（哨兵 + 代价），`Dropdown.test.ts` 只有一条（尺寸门）。 |
