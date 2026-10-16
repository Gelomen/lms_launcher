# 任务 2 报告 · `TerminalInfo.icon` + `main.ts` 接线 + IPC 形状门

- 计划：`docs/superpowers/plans/2026-10-16-quick-launch-terminal-icons.md` §任务 2（全局约束 G1–G10）
- 规格：`docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md` §6.2 / §6.3 / §6.6-1 / §7.1-7 / §8-Q8 K1 / §9-R4 R7
- check 表：`docs/superpowers/checks/2026-10-16-quick-launch-terminal-icons/task-02-terminal-info-icon-main-wiring-ipc-gate.md`（J 段已填 J-1..J-13；A–I 段的 `☐` 一个没动）
- 状态：**DONE**（TDD 先红后绿；G1–G5 全绿；总数 919 = 918 + 1；无越界；未 `git add`、未 commit、未 stash）
- 起点 HEAD = `2175f9d`（任务 1 的提交），分支 `feat/quick-launch`；收尾时 HEAD 未变（F4）

## 1 改动清单（四份，与 B 段逐字一致；F5/G10 无越界）

| 文件 | 动作 | 内容 |
|---|---|---|
| `src-main/quick-launch-terminals.ts` | 改两处（`git diff -U0` 只有 `@@ -9 +9,2 @@` 与 `@@ -19,0 +21,2 @@` 两个 hunk） | ① `:9` 注释按 C3 改写为「主进程下发 `{ id, path }`，**可选**带 icon（PNG 的 data URL，由 `ql-terminal-icons.ts` 补，见 2026-10-16 规格 §6.1）；标签文案仍由渲染端 `t()` 决定（索引 K7；原口径保留在括号里）」；② `TerminalInfo` 加 C1 逐字注释 + `icon?: string;` |
| `src-main/main.ts` | 三个 hunk | ① `:20` 之后加 `import { withTerminalIcons } from './ql-terminal-icons';`（带一行口径注释）；② `updateZipDir()` 之后新增 `terminalIconCacheDir()` = `join(dataDir(), 'cache', 'terminal-icons')` + `try { mkdirSync(d, { recursive: true }); } catch { }`（C6，同一手法）；③ `detectTerminalsAsync` 改为 `setImmediate(() => resolve(withTerminalIcons(terminalIconCacheDir(), detectTerminals())))`，并在函数 doc 里写清「图标缓存 ≠ 探测缓存」（RF3） |
| `src-main/ipc-ql.test.ts` | 改 C4 第二条的断言 + 新增一条用例 | `:12` 加 `readdirSync` import；`:279` 的 `Object.keys(info).sort() === ['id','path']` 换成 C4 段三条（必含 `id`/`path`；除 `id`/`path`/`icon` 外无别的键；`typeof icon === 'string'` 时前缀逐字）；新增 `terminal_icons_are_stable_across_calls_and_come_from_the_disk_cache`（用例名逐字，C5） |
| `.gitignore` | 加一行 | `cache/`（在 `logs/` 之后同类），其余行未动 |

未改：`main.ts` 的 `ql_terminals` handler（现 `main.ts:1142`，改前 `:1126`；`git diff` 里该处**无 hunk**，字节未变，`async` 形态不变 → E1 的既有断言 `constructor.name === 'AsyncFunction'` 仍绿）；`dataDir()` / `configDir()`；`detectTerminals()` 的四行判定 / 顺序 / 不缓存；`package.json` 与 lockfile（diff 0 字符）；`src-main/i18n`（diff 0 字符）。
## 2 TDD 顺序与真实输出（先红后绿，顺序未颠倒）

### D1 先改测试（只碰 B3 一份）

`git diff --name-only` → `src-main/ipc-ql.test.ts`；`git diff --stat` → `1 file changed, 40 insertions(+), 2 deletions(-)`。

### D2 跑红：`npx vitest run src-main/ipc-ql.test.ts`

```
 ❯ src-main/ipc-ql.test.ts (29 tests | 1 failed) 6166ms
   × C4 · ql_terminals（索引 K10-3：异步、不缓存） > terminal_icons_are_stable_across_calls_and_come_from_the_disk_cache 113ms
     → ENOENT: no such file or directory, scandir 'C:\Users\Gelomen\AppData\Local\Temp\ipc-ql-Frv42d\cache\terminal-icons'
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
```

exit 1。红在 `readdirSync(cacheDir)`（`ipc-ql.test.ts:307`）= **缓存目录不存在**，正是 D2 预期的两种红之一（另一种是 `icon` 为 `undefined`；断言顺序把「目录不存在」放在前面，所以先撞它）。**改写后的 C4 仍绿**（28 passed 含它：当前实现不带 `icon`，三条断言都放行）。红跑同时给出「原条数 = 28」（`29 = 28 + 1`），G1 的「原条数 + 1」由此取证，不靠猜。

### D3 实现 B1/B2/B4 → D4 跑绿：`npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts`

```
 ✓ src-main/ql-terminal-icons.test.ts (6 tests) 1281ms
   ✓ … > real_powershell_seam_extracts_a_png_for_a_known_exe 1219ms
 ✓ src-main/ipc-ql.test.ts (29 tests) 7519ms
 Test Files  2 passed (2)
      Tests  35 passed (35)
```

exit 0。新用例真起了 `powershell.exe`（真接缝，未 mock；任务 1 的真机冒烟也没跳过）。

### D5/G3 类型门：`npx tsc --noEmit -p tsconfig.main.json`

无输出，`TSC_EXIT=0`。

### D6/G5 全量：`npm test`

```
 Test Files  53 passed (53)
      Tests  919 passed (919)
```

`NPM_TEST_EXIT=0` = 918 + 1，与 D6 / 索引 G8 的预期逐字一致，**无差额需要解释**。

### G1–G4 回归门

- G1 定向：`ipc-ql.test.ts (29 tests)` 全绿 = 原 28 + 1。
- G2 / 索引 V1：`npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts src-main/quick-launch-terminals.test.ts` → `Test Files 3 passed (3)` / `Tests 72 passed (72)`。
- G3 类型：exit 0（见上）。
- G4 i18n：`npx vitest run src-main/i18n` → `index 3` / `no-hardcoded 2` / `key-coverage 2` / `dict 11` = `Tests 18 passed (18)`；`git diff src-main/i18n` = 0 字符。
## 3 E 段：每条断言靠什么钉住

| # | 靠什么 | 实测 |
|---|---|---|
| E1 | 既有 `handlerOf('ql_terminals').constructor.name === 'AsyncFunction'`（`ipc-ql.test.ts:267`）一字未改 | 绿（在 29 passed 里）。接线写成 `resolve(withTerminalIcons(...))`（Promise 采纳），handler 本身没动 |
| E2 | 既有「两次调用不共用数组实例」用例一字未改 + 本文件的 `cap.termProbes` 计数器 | 绿；计数器输出：红跑 `detectTerminals 真实调用次数 = 18` → 绿跑 **= 19**（+1 = 新用例的两次调用减去红跑里失败前那一次）→ 每次调用仍实测，图标缓存没把探测缓存带偏 |
| E3 | 新用例：两次 `cmd` 项的 `icon` 逐字相等（`toBe`）+ 第一次后 `.png` ≥ 1 + 第二次前后 `.png` 计数不变 | 绿。「第二次不再起提取进程」本身不在 IPC 层证明（已由任务 1 的假接缝 `calls=0` 钉住）；`.png` 计数不变是**稳定**断言，不是计时 / 睡眠 |
| E4 | 改写后的 C4 三条（必含 `id`/`path`；多余键 = `[]`；`icon` 存在时前缀逐字） | 绿（两次返回都过） |
| E5 | 本任务不制造「取不到图标」的场景（check 表 E5 自己写明「本任务不制造」）：「缺席 ≠ 空串」由任务 1 的 `seam_failure_yields_no_icon_and_throws_nothing` 钉；本任务的 C4 只写「`typeof icon === 'string'` 才断前缀」，不写 `icon: ''` 分支 | 任务 1 的 6 条仍绿（`Tests 6 passed (6)`） |
## 4 自审：与 spec / plan / check 表的偏离与取舍

1. **C4 用例名保留 vs「注释里的『只含 {id,path}』改成新口径」**：plan 任务 2 步骤 1 那句自相矛盾 —— 字符串「只含 {id,path}」在该用例里**只**出现在 `it()` 标题里，没有另一处注释。按「用例名保留」执行（标题一字未改），把 §6.3 的新口径写进断言旁的注释（`ipc-ql.test.ts:279-281`）。check 表 B3 / C4 也只要求改断言。若主代理要的是改标题，改一行即可，不影响任何断言。
2. **新用例多加了一条断言**：`第二次不得再往缓存目录写新文件`（`.png` 计数不变）。派单明确允许这种稳定断言、并禁止计时 / 睡眠。C5 要求的三条（两次都有 `cmd`、`icon` 逐字相等、`.png` ≥ 1）都在。
3. **`main.ts` 除 B2 点名的两处外还有两处必要配套**：`:20` 之后的一行 import（不 import 就编译不过），以及 `detectTerminalsAsync` 的 doc 注释扩三行（原注释只说「不跨调用缓存」，接线后必须写清「图标缓存 ≠ 探测缓存」，否则注释与代码相反）。都在 B2 那份文件内，且 B2 的边界（handler 一字不改 / `dataDir()` 不改 / 不新增 IPC 通道）全部守住。
4. **`icon?: string` 的注释按 C1 逐字写「（§6.1）」**：该文件头部 `:3-7` 指的是**旧** spec（2026-10-10）的 §6.1（探测表），单看这行会歧义；消歧靠同一文件 `:9` 的新注释（明确写「见 2026-10-16 规格 §6.1」）。`:3-7` 不改 —— B1 只允许两处 hunk（G1 / F1）。
5. **行号漂移**：`main.ts` 净增 16 行，`ql_terminals` handler 从 `:1126` 移到 `:1142`。check 表 / plan 里的行号是改前坐标，按索引 K17 的口径**不改写文档里的历史行号**；本报告给出改后真实行号。
6. **`cache/` 只在测试临时目录里出现**：`ipc-ql.test.ts:168-175` 把 `process.cwd` 换成 `mkdtempSync` 的 workDir，`dataDir()` 因此指向它；`afterAll` 的 `rmSync(workDir)` 连带删掉缓存。收尾核对：`git status --porcelain` 无 `cache/`、仓库根 `Test-Path cache` = False、`.gitignore` 含 `cache/` 行 = True（F3 / 索引 K11）。dev 态跑应用才在仓库根生成 `cache/terminal-icons/`，那是 `.gitignore` 那一行的用途。
7. **文档一行未改**：spec / plan / 索引 / 本表 A–I 段都没动（本表只填 J 段）。普查脚本：`task-02 … ☑=0 裸☐=40 I段 -[ ]=8 H2=未提交`、`CENSUS_EXIT=0`（落勾与 H1–H3 是主代理验收后的动作）。表格列数已核：全表每行未转义 `|` 的数与表头一致（J-4 里 vitest 输出含 `|`，已转义为 `\|`）。

## 5 疑虑（不阻塞，交给主代理裁）

- **新用例对「PowerShell 可用」是硬断言**：`第一次就必须带 icon`。在 §9-R1（约束语言模式 / WDAC 禁 `Add-Type`）的机器上产品按 Q5 降级（无图标），但这条用例会**红**而不是跳过 —— spec §7.1-7 要求「两次 `icon` 逐字相等 + 出现 `.png`」，没有给「R1 机器上跳过」的口径。这与任务 1 的既有做法一致（`real_powershell_seam_extracts_a_png_for_a_known_exe` 只在 `cmd.exe` 路径不在时 `it.skipIf`，不对语言模式豁免）。本机 FullLanguage（§3-P1），实测绿。要不要为 R1 机器加豁免，是主代理的决定，我没有自行加。
- 跑 `ipc-ql.test.ts` 现在会多起一次 `powershell.exe`（C5 用例的性质，spec §7.1-7 要求真接缝）：绿跑的 `ql-terminal-icons.test.ts 1281ms` 与 `ipc-ql.test.ts 7519ms` 都含真实进程时间。不是缺陷，只是成本变化，登记在此以免日后被当成回归。
- 本任务未跑 `build.bat` / 真机门（§7.2 属任务 5）；未跑 `key-coverage` 之外的其它渲染端门（B 段未涉及渲染端，G5 全量已覆盖）。

## 6 留给主代理（H 段）

- H1 暂存：`git add src-main/quick-launch-terminals.ts src-main/main.ts src-main/ipc-ql.test.ts .gitignore`（我未 `git add`、未 commit、未 stash，G9 / F4）
- H2 commit message（逐字）：`feat(main): ql_terminals 带可选 icon（真实终端图标 data URL，走磁盘缓存）`
- H3 落勾普查：验收通过后把本表 A–I 的 `☐` 改 `☑`，再跑 `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs`
- 真机门 §7.2-3（`<exe 目录>\cache\terminal-icons\` 下有 `.png`，数量 = 本机可用终端数）属任务 5。
