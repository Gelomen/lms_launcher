# 任务 6 报告 · 修复轮：图标只补给 `ql_terminals`（最终审查 I-1 / I-3 / M-1）

- 计划：`docs/superpowers/plans/2026-10-16-quick-launch-terminal-icons.md` §任务 6（全局约束 G1–G10）
- 规格：`docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md` §6.2（建目录归属 / 去重 / 不校验 magic）/ **§6.3（补图标的调用点只有一处）** / §6.4 / **§7.1 的 14–16** / §9-R9 R10 R11
- check 表：`docs/superpowers/checks/2026-10-16-quick-launch-terminal-icons/task-06-fix-icons-only-for-ql-terminals.md`（**J 段已填 J-1..J-7 + J-9/J-10，J-8 留给主代理；A–I 段的 `☐` 一个没动**：改后实测 `☑=0` / `☐=38` / `I 段 -[ ]=6`，与改前一致；普查脚本 `node .superpowers/sdd/…/tick-census.mjs` exit 0，本表 `☑=0 裸☐=37 I段 -[ ]=6 H2=未提交`；表格列数普查 0 处不一致）
- 索引：G1 G2 G3 G4 G5 G8 G9 G10、RF1 RF3、**K24 K25 K26 K27 K28**、K19（用例名不改）、K21（声明门要有牙）、K17/K20（旧行号按「取证时位置」读）
- 状态：**DONE_WITH_CONCERNS**（TDD 先红后绿、顺序未颠倒；G1–G5 全绿；总数 `Tests 926 passed (926)` = 923 + 3；`tsc` exit 0；无越界；未 `git add`、未 commit、未 stash）——三条疑虑见 §5
- 起点 HEAD = `dee5f83`（分支 `feat/quick-launch`）；收尾时 `git log --oneline -1` 仍是 `dee5f83`、`git stash list` 行数 0、`git diff --cached` 空（F5 / G9）

## 1 改动清单（三份，与 B 段逐字一致；G10 无越界）

| 文件 | 动作 | 内容（改后真实行号；表里的旧行号按索引 K20 是改前坐标） |
|---|---|---|
| `src-main/main.ts` | 改三处（`git diff` = **恰好 3 个 hunk**，`+17/−11`） | ① `:1045-1060`（原 `:1046-1058`）`detectTerminalsAsync`：`setImmediate(() => resolve(withTerminalIcons(terminalIconCacheDir(), detectTerminals())))` → `setImmediate(() => resolve(detectTerminals()))`，签名与「先让出一拍」不变；doc 注释改成「**本函数只探测、不补图标**」并写清两个消费方（`ql_save:1136`、`ql_start:1160-1161`）只取 `.map(info => info.id)` 的代价。② `:1147`（原 `:1142`）`ql_terminals` handler → `async (): Promise<TerminalInfo[]> => withTerminalIcons(terminalIconCacheDir(), await detectTerminalsAsync())`（仍是 `AsyncFunction`，`ipc-ql.test.ts` 的形状门绿；保留 K10-3 的「先让出一拍」）。③ `:112-118`（原 `:112-120`）`terminalIconCacheDir()` 删掉 `try { mkdirSync(d, { recursive: true }); }`，函数体只剩 `return join(dataDir(), 'cache', 'terminal-icons')`，注释改成「只算路径、不建目录；建目录只在提取层 `ql-terminal-icons.ts:151-155` 做一次」。 |
| `src-main/ipc-ql.test.ts` | 加计数器透传壳 + 新增 2 条用例 + 降级两处措辞（`+77/−3`） | ① `cap.iconEnrichments` + `vi.mock('./ql-terminal-icons', importOriginal => …)` 只计数不改行为（照 `:87-92` 的 `detectTerminals` 壳）；② C4 内新增「`ql_terminals` 的 icon 来自缓存文件本身：哨兵字节原样返回，不是重新提取的 PNG」（§7.1-15 / K25）；③ 新增 describe「任务 6 · 修复轮 I-1（规格 §7.1-14 / 索引 K24）」内一条三段式用例「`ql_save` / `ql_start` 的 shell 分支不调 `withTerminalIcons`；`ql_terminals` 仍补图标（对照）」（保存 → 启动 → 对照，断言形状照 `:736-760`）；④ `:317-323` 注释与 `:343` 断言消息把「磁盘缓存生效」降级为「写入生效 + 键稳定」，并指向哨兵那条（K25）；⑤ `afterAll` 增一行 `[ipc-ql] withTerminalIcons 真实调用次数 = N` 的证据输出。 |
| `src/components/Dropdown.test.ts` | 新增 1 条用例（`+39/−0`） | `icon_image_boxes_are_declared_as_1em_contained_with_6px_gap`（§7.1-16 / K26）：注入真实 `src/style.css`（同一个 `__real-css__` id 去重，照本文件 `:241-246` 的 K21 手法）→ `getComputedStyle` 断 `.select-image` 与 `.option-image` 的 width/height = `14px`（= `1em` 在 `--fs-body` 14px 下的解析值）、`object-fit: contain`、`.option-image` 的 `margin-right: 6px`；注释写清这条只钉「CSS 里写了这条规则」，**不**证宽度/不截断（那归真机门 §7.2-1 / §7.2-13）。 |

**未改（实测 `git diff --quiet` 逐个 exit 0）**：`src-main/quick-launch-terminals.ts`（F1 / G1）、`src-main/ql-terminal-icons.ts`（F2 / G4；J-9 的临时变异已还原）、`src/components/Dropdown.vue`、`src/style.css`（D3 的临时改动已还原）、`src/modules/QuickLaunchModal.vue`、`src-main/i18n`、`package.json` 与两份 lockfile、`src-main/ipc-channels.ts`、`index.html`、`.gitignore`。两个消费方 `:1136` / `:1161` 一字未改（`git diff` 里出现的 `info.id` 只有我新写的注释）。既有用例名 `terminal_icons_are_stable_across_calls_and_come_from_the_disk_cache` / 「两次调用不共用数组实例」/「handler 是 async 函数」在 `git diff -U0` 中**无命中** = F6 / K19 的机械证据。

## 2 TDD 顺序与真实输出（先红后绿，顺序未颠倒）

### D1 先红（只写测试，`main.ts` 一行未改）

`npx vitest run src-main/ipc-ql.test.ts`（exit 1）→ `Tests 3 failed | 29 passed (32)`：

```
× 任务 6 · 修复轮 I-1 … > ql_save：shell 条目不调 withTerminalIcons；ql_terminals 仍补图标（对照）
  → 保存 shell 配置不得补图标（只取 info.id，规格 §6.3）: expected 22 to be 21
× 任务 6 · 修复轮 I-1 … > ql_start：shell 配置不调 withTerminalIcons；ql_terminals 仍补图标（对照）
  → 启动 shell 配置不得补图标（只取 info.id，规格 §6.3）: expected 23 to be 22
stdout: [ipc-ql] withTerminalIcons 真实调用次数 = 23
```

红因正是 I-1 描述的那个（`ql_save` / `ql_start` 的 shell 分支也在补图标）。第三条红是级联：新用例在断言处抛出、没走到自己的 `ql_stop`，`qliconcost01` 留在运行表里，把后面「两个 exe 配置并发 ql_start」的 `ql_states` 断言带红 —— 修复后该级联消失（D2 全绿）。

**两条偏差，都记在 J-3 / J-9：**

1. **§7.1-15 在改前是绿**，不是 D1 预期的「15 现在也红」。原因：读缓存这条路径在改前**本来就工作**（`withTerminalIcons` 先读缓存、未命中才提取），所以「返回真提取的 PNG 而不是哨兵」只在读路径被破坏时发生。它的「有牙」改由变异取证（见 §3 的 K25 段），与 D3 的有牙验证同一手法。
2. §7.1-14 第一版按 `:736-760` 的先例拆成两条 `it` → 本文件 +3、全量 `Tests 927 passed (927)`，与 D2「本文件 = 基线 + 2」/ G4「926」冲突。已按表口径合并成一条三段式（保存 → 启动 → 对照），**合并后重新取红**：`git checkout HEAD -- src-main/main.ts`（改前 `Copy-Item` 备份）→ `npx vitest run src-main/ipc-ql.test.ts -t "不付图标提取的代价"`（exit 1）→ `Tests 1 failed | 30 skipped (31)`，红在 `保存 shell 配置不得补图标…: expected 1 to be +0`；随后还原 `main.ts`（`git diff --numstat` 回到 `17 11`）。

### D2 实现 `main.ts` 三处 → 定向绿

`npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts src-main/quick-launch-terminals.test.ts`（exit 0）→ `Tests 47 passed (47)`，本文件 `31 tests` = 基线 29 + 2。证据行：`[ipc-ql] withTerminalIcons 真实调用次数 = 8`（改前同一文件是 23）→ 补图标只随 `ql_terminals` 增长，不随保存/启动增长。

### D3 尺寸声明门 + 有牙验证

首跑红在期望值写法：`expected '14px' to be '1em'`。探针取证：`[probe] trigger fontSize = 14px | img fontSize = 14px | width = 14px | height = 14px | objectFit = contain` —— **happy-dom 会把 `em` 按继承字号解析成 px**，且 `.btn` 的 `font-size: var(--fs-body)` = 14px 这条链在 happy-dom 里同样成立（正是 §3-P9 / 索引 K5 的取值链）。→ 期望值按解析结果写 `'14px'`，注释写清这条门的分工。

有牙验证（K21）：`src/style.css:361` 的 `.option-image` 临时 `width: 1em` → `width: 20px` → `npx vitest run src/components/Dropdown.test.ts -t "icon_image_boxes"`（exit 1）→ `AssertionError: .option-image 的 width 不是 1em（=14px）: expected '20px' to be '14px'`；还原 → `npx vitest run src/components/Dropdown.test.ts`（exit 0）`Tests 11 passed (11)`（基线 10 + 1）。还原证据：`git diff --stat -- src/style.css` = 空、`git diff --quiet -- src/style.css` **exit 0**。表里「回到 2 hunks / +13 −1」是任务 3 当时的工作区坐标（K20）；那次改动现在在 HEAD 的 `646d81a` 里，同一形状实测为 `git diff -U0 646d81a^ 646d81a -- src/style.css` → 两个 `@@` + `--numstat` = `13 1`。

### D4 收尾门

`npx tsc --noEmit -p tsconfig.main.json` → 无输出、`tsc exit=0`（改注释行号后再跑一次仍 0）。`npm test` → `Test Files 53 passed (53)` / **`Tests 926 passed (926)`**，exit 0。

## 3 新用例钉住的东西（逐条对 E 段）

| E | 断言在哪 | 有牙的证据 |
|---|---|---|
| E1 保存 shell 条目不补图标 | `cap.iconEnrichments` 在 `ql_save` 前后相等 | D1 红：`expected 22 to be 21`（改前） |
| E2 启动 shell 配置不补图标 + 对照 | 同一条用例第二段；第三段 `ql_terminals` → `+1` | D1 红：`expected 23 to be 22`；对照段防「把补图标整个删掉也全绿」 |
| E3 读缓存路径本身 | 哨兵字节：`cacheFileName(exe)` 算出的路径写入非 PNG 字节 → 返回的 `icon` 正是那段字节的 base64 | 变异取证：临时把 `ql-terminal-icons.ts` 的 `readCachedIcon` 改成直接 `return null` → 该用例红：`expected 'data:image/png;base64,iVBORw0KGgoAAAA…' to be 'data:image/png;base64,cWwtdGVybWluYWw…'`（收到的正是真提取的 PNG，`iVBORw0KGgo` = PNG magic 的 base64）；还原后 `git diff --quiet` exit 0 |
| E4 尺寸声明门 | `.select-image` / `.option-image` 的 width/height = `14px`（= `1em`）、`object-fit: contain`、`margin-right: 6px` | D3 变异：`width: 20px` → 红在 `.option-image` 那一行 |
| E5 `ql_terminals` 仍带图标 | 既有 C4 形状门（`{id,path,icon}`）+ 新用例的对照段 | 47/57 全绿；`handler 是 async 函数` 那条仍绿 |
| E6 载荷链不变 | 未新增/删除字段、未新增通道 | G2 `Tests 44 passed (44)`；`git diff src-main/ipc-channels.ts` = 空 |

原 `:315` / `:324`（现 `:334` / `:344`）两条**保留**，只把「磁盘缓存生效」降级为「写入生效 + 键稳定」并指向哨兵那条（K25 / K19：用例名一字未改）。

## 4 回归门与边界（G1–G5 / F1–F6）

- G1 + 索引 V6：`npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts src-main/quick-launch-terminals.test.ts src/components/Dropdown.test.ts`（exit 0）→ `Tests 57 passed (57)`（31 + 6 + 9 + 11）。
- G2（V1 载荷链）：`npx vitest run src-main/quick-launch.test.ts src/modules/QuickLaunch.test.ts`（exit 0）→ `Tests 44 passed (44)`。
- G3：`npx tsc --noEmit -p tsconfig.main.json` exit 0。
- G4：`npm test` → `Tests 926 passed (926)` / 53 files。基线复核：把两份测试文件临时 `git checkout HEAD --`（备份在 `.temp/task06-baseline-probe/`，跑完还原）→ `npm test` → **`Tests 923 passed (923)`** → A2 的 923 没有过期，927 只出现在我把 §7.1-14 拆成两条的那一次。
- G5：`npx vitest run src-main/i18n`（exit 0）→ `Tests 18 passed (18)`；`git diff --stat -- src-main/i18n package.json pnpm-lock.yaml package-lock.json index.html .gitignore` = 空（无新键 / 无新依赖 / 无新通道；新代码字面量无汉字，`no-hardcoded` 门 exit 0）。
- F1–F6：见 §1 末段与 J-10。`git diff --name-only` 源码侧只有 B 段那三份；`??` 只有本表。
- K27 的三条已接受代价（损坏缓存永久命中 / 无在途合并 / `systemRoot()` 重复）**一行未动**：`ql-terminal-icons.ts` 与 `quick-launch-terminals.ts` 的 diff 均为 0 字符。

## 5 疑虑与偏差（三条，都不自行改文档）

1. **D1 对 §7.1-15 的预期不成立**（「15 现在也红：返回的是真提取的 PNG」）。改前读路径就是好的，任何忠实于 §7.1-15 的写法在改前都会绿；这条的「红」只能靠破坏读路径来产生（已按 D3 的有牙手法取证）。若主代理要把这条口径固化，建议在 `00-index.md` 的 K 组或本表 D1 行登记一行（我不能改文档）。
2. **`§7.1-14` 的用例粒度与表里的数字冲突**：照 `:736-760` 的先例拆成两条（save / start 各一条）→ 本文件 +3、全量 927；按 D2「本文件 = 基线 + 2」/ G4「926」→ 必须是一条多段用例。我按**表**的口径实现（合并版），并在 J-3 留了两版的红证据。如果主代理更看重「一条用例一个行为」，需要先把 D2/G4 的数字改成 +3 / 927（文档先改），再拆回来。
3. **A1 的 porcelain 预期偏少**：实际是 6 个 `M`（多出 `.superpowers/sdd/…/progress.md` 与 `task-02-…md`）+ 1 个 `??`。两份都是主代理落账留下的，本任务未触碰；A1 的实质判据（`git diff --name-only -- src src-main` 为空）成立。

另外两点实现口径，供验收时判断：

- **`§7.1-16` 的期望值写成 `14px` 而不是字面 `1em`**：happy-dom 的 `getComputedStyle` 会把 `em` 按继承字号解析成 px（实测 14px）。因此这条门能抓「规则被删 / 尺寸被改 / `object-fit` 被去 / 间距被改」，**不能**区分 `width: 1em` 与 `width: 14px`（两者渲染等价）。要连「必须写 em」也钉住，需要再加一条读 CSS 文本的断言 —— 本次未加（E4 未列，避免超出契约范围）。
- **`ql_terminals` handler 用 `await detectTerminalsAsync()`**（而不是 spec §6.3 里 `resolve(withTerminalIcons(terminalIconCacheDir(), await detectTerminals()))` 的字面写法）：这是 plan 步骤 2 说的「等价写法」，好处是保留索引 K10-3 的「先让出一拍」行为，且不改动 `detectTerminalsAsync` 的签名（C1 要求签名不变）。

## 6 留给主代理（H 段与后续门）

- H1/H2：暂存三份代码 + 已在工作区的 spec / plan / `00-index.md` / task-02 / task-05 / 本表，commit message 逐字：`fix(main): 图标只补给 ql_terminals，保存与启动不再付提取代价`。H3：`node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs`（本次实测 exit 0，本表未提交 → 裸 ☐ 属正常）+ 验收后落 A–I 的勾。
- 任务 6 步骤 6：`cmd /c build.bat` 重新打包 + 重跑 task-05 的 D2/D3（产物变了，旧证据作废）+ 按 §7.2 的 15 条重发真机清单（K28）。本实现环境跑不了真机 UI，`§7.1-16` 只是声明门，宽度/不截断仍归真机门 §7.2-1。
