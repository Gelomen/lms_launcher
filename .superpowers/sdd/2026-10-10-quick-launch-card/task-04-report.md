# 任务 4 实现报告 · 终端探测 `quick-launch-terminals.ts`

- 状态：**DONE**
- 起点：HEAD = `5db815f`，工作区干净（A1）
- 交付：新建 `src-main/quick-launch-terminals.ts`（119 行）、`src-main/quick-launch-terminals.test.ts`（30 行）
- 未做：`git add` / `commit`（按索引 K5，交主代理验收后执行）
- check 表：`docs/superpowers/checks/2026-10-10-quick-launch-card/task-04-terminal-detection.md`（A→G 全勾，H 段两行与 I 段最后一条留空）

## 1. A 段 · 起点核对

| 项 | 命令 | 实际输出 |
|---|---|---|
| A1 | `git status --porcelain` | 无输出；`git rev-parse --short HEAD` → `5db815f` |
| A2 | `wsl.exe -l -q`（手跑） | `EXITCODE=1`；stdout 是 UTF-16LE 的「未安装适用于 Windows 的 Linux 子系统…可用 `wsl.exe --install` 安装」提示，**无任何发行版行** |

A2 与规格 §6.3 基线一致（`wsl -l -q` 退出码 1、无发行版）→ D4 的「不含 wsl」预期不变，无需调整。

## 2. D 段 · TDD 循环（先红后绿）

### D1 先落三个用例

`src-main/quick-launch-terminals.test.ts` 三个用例逐字取自计划 §任务 4 步骤 1：`:14`（UTF-16LE 解析）、`:19`（空输出）、`:25`（本机 cmd 可用）。

### D2 红（模块不存在）

```
$ npx vitest run src-main/quick-launch-terminals.test.ts
 ❯ src-main/quick-launch-terminals.test.ts (0 test)
 FAIL  src-main/quick-launch-terminals.test.ts [ src-main/quick-launch-terminals.test.ts ]
Error: Failed to load url ./quick-launch-terminals (resolved id: ./quick-launch-terminals)
  in D:/Dev/Projects/lms_launcher/src-main/quick-launch-terminals.test.ts. Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
exit code 1 → 红，符合「模块不存在」预期。

### D3 实现

按规格 §6.1 四行探测表逐行落地，行号见下文 §4。

### D4 绿

```
$ npx vitest run src-main/quick-launch-terminals.test.ts
 ✓ src-main/quick-launch-terminals.test.ts (3 tests) 148ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
exit code 0 → 全 PASS。

### D4 补充 · 本机真实探测结果（应为 powershell / cmd / pwsh，不含 wsl）

```
$ npx tsc src-main/quick-launch-terminals.ts --target ES2022 --module commonjs --moduleResolution node \
        --strict --esModuleInterop --skipLibCheck --outDir "%TEMP%\ql-t4-probe"
$ node -e "require(process.env.TEMP + '\ql-t4-probe\quick-launch-terminals.js').detectTerminals()"
[{"id":"powershell","path":"C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe"},
 {"id":"cmd","path":"C:\WINDOWS\system32\cmd.exe"},
 {"id":"pwsh","path":"C:\Program Files\PowerShell\7\pwsh.exe"}]
IDS=powershell,cmd,pwsh
```

→ 本机结果 = **powershell / cmd / pwsh，不含 wsl**，与规格 §6.3 完全一致。
（编译输出目录在 %TEMP% 下，不在仓库内，不影响 G3。）

## 3. G 段 · 回归门

| # | 命令 | 实际输出 | 结论 |
|---|---|---|---|
| G1 | `npx vitest run src-main/quick-launch-terminals.test.ts` | `Tests 3 passed (3)`，exit 0 | 通过 |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无任何输出，`TSC_EXIT=0` | 通过（`include: src-main/**/*.ts` 覆盖新文件） |
| G3 | `git diff --name-only` → 只含本任务 check 表（填 J 段所致）；`git status --porcelain` → `?? src-main/quick-launch-terminals.test.ts` + `?? src-main/quick-launch-terminals.ts` | **代码**改动只有 B1 + B2 两个新增文件（报告写在 `.superpowers/`，被 `.gitignore:4` 的 `.*/` 忽略，故不进 status） | 通过（未跟踪文件不进 `git diff`，故用 `git status` 取证） |

跨任务回归门（索引 V 组）：V1 = G1 ✓；V2 计划任务 4 未点名相邻回归文件（只列这两个文件）→ 无；V3 = G2 ✓；V4 本任务无新增文案/错误消息（不调 `t()`）→ 不适用；V5 全量 `npm test` 按索引只在任务 13/14 要求 → 未跑。

## 4. E 段 · 必须钉住的行为断言与证据

| # | 断言 | 证据类型 | 证据 |
|---|---|---|---|
| E1 | UTF-16LE → 发行版名数组 | **用例** | 测试 `:14-16`：`parseWslDistroOutput(Buffer.from('Ubuntu\nDebian\n','utf16le'))` → `['Ubuntu','Debian']`；D4 中 PASS。另手跑复核输出 `["Ubuntu","Debian"]` |
| E2 | 空 Buffer / 仅换行 → `[]` | **用例** | 测试 `:19-22`；D4 中 PASS。手跑：`PARSE_CRLF_ONLY=[]`、真机 `wsl -l -q` 的 stdout → `PARSE_REAL_WSL_OUTPUT=[]` |
| E3 | 真机 `cmd` 存在且 `existsSync(path)` | **用例** | 测试 `:25-29`；D4 中 PASS。手跑 path = `C:\WINDOWS\system32\cmd.exe` |
| E4 | 只返回可用项，不可用项**不进数组**（不是 `path: ''`） | **代码结构** | `quick-launch-terminals.ts:107-119`：四个 `detect*` 返回 `TerminalInfo \| null`，`:113` 只在 `if (info)` 时 `push`；没有任何分支写 `path: ''`。实测：本机数组长度 3、无 wsl 项；把 `SystemRoot` 改坏后 powershell 项**消失**而非留空 path（见 §5 F3 行） |
| E5 | wsl 需「wsl.exe 存在 **且** `wsl -l -q` 退出码 0 **且** 解析出的发行版名非空」 | **代码结构 + 真机** | `:79-80`（`wslExePath()` 为空 → null）、`:87`（`r.error \|\| r.status !== 0` → null）、`:88-89`（`distros.length === 0` → null）。真机 A2 手跑退出码 1 → 三条件第二条即失败；`:68-73` 证明本机 `wsl.exe` 确实存在（`C:\WINDOWS\system32\wsl.exe`），即「存在但无发行版 → 不出现」这条被真实走到 |
| E6 | pwsh 用 `where.exe pwsh` 退出码 0 且首行是存在的文件 | **代码结构 + 真机** | `:45-60`：`spawnSync('where.exe', [name], …)` → `:52` 退出码非 0 或有 error 即 null；`:53-57` 取第一条非空行并要求 `existsSync`，否则 null。真机反证：把 `process.env.PATH` 收窄到 `C:\WINDOWS\system32` 后 pwsh 项消失（`CALL3_after_PATH_without_pwsh=powershell,cmd`）→ 判定确实走 where.exe，不是硬编码路径 |
| E7 | powershell / cmd 用固定路径存在性判定（`%ComSpec%` 回退） | **代码结构** | `:31-34` powershell = `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` + `existsSync`；`:37-42` cmd 先取 `process.env.ComSpec`（存在才用），否则回退 `%SystemRoot%\System32\cmd.exe`；`:26-28` `systemRoot()` 读 `SystemRoot`（回退 `windir`）。真机反证：把 `SystemRoot` 置为不存在目录后 powershell 项消失（`CALL2_after_bad_SystemRoot=cmd,pwsh`），而 cmd 因 `ComSpec` 仍有效而保留 → 两条判定路径都被真实驱动 |

## 5. F 段 · 硬约束

| # | 约束 | 证据 |
|---|---|---|
| F1 | 每个 `spawnSync` 带 `windowsHide: true` + 3s 超时 | 全文件只有 2 处 `spawnSync`：`:46-51`（where.exe）与 `:81-86`（wsl），两处均 `windowsHide: true`（`:47` / `:82`）+ `timeout: SPAWN_TIMEOUT_MS`（`:48` / `:83`），常量定义在 `:23` = 3000 |
| F2 | 任何异常 → 该项不可用，不得抛出 | `spawnSync` 本身不抛（返回 `r.error`），`:52` / `:87` 把 `r.error`（含 ENOENT / ETIMEDOUT）转成 null；外层 `:111-116` 再包 `try/catch` 兜住任何意外（含 `existsSync` 抛错），catch 分支只注释不抛出 |
| F3 | 不跨调用缓存 | 全文件无 `let` / `var`、无模块级可变状态（grep 无命中），`:107` 每次调用重新跑四个探测。实测：同进程内改 `process.env` 后第二次调用结果随之变化（`CALL1` → `CALL2` → `CALL3`），说明结果不是缓存值 |
| F4 | 只下发 `{ id, path }` | 接口 `:17-20` 只有 `id` / `path` 两个字段；实测 `Object.keys(detectTerminals()[0])` → `["id","path"]`。文件内无任何文案常量 |
| F5 | WSL 只列默认发行版一项 | `:78-91` 最多返回一个 `{ id:'wsl', path: wsl.exe }`；`:88-89` 只用解析结果判断「有没有」，不按下标取多个发行版、不生成多项。无 `-d` 参数、无发行版枚举 |

## 6. C 段 · 接口契约

- C1 `export interface TerminalInfo { id: TerminalId; path: string }` → `:17-20`（`TerminalId` 从 `./quick-launch-config` 以 `import type` 引入，`:15`；未重复定义，源在 `src-main/quick-launch-config.ts:12`）
- C2 `export function parseWslDistroOutput(buf: Buffer): string[]` → `:94-103`，纯函数：不 spawn、不读 env、不碰 fs
- C3 `export function detectTerminals(): TerminalInfo[]` → `:107-119`

## 7. 自审

- 用例只写了计划给的三个，未加第四个（B2 边界写的是「计划给出的 3 个用例」）；E4–E7 依 check 表 I 段「有测试**或代码证据**」以代码行号 + 真机反证取证。
- `whereFirstExisting()` 严格按 §6.1 措辞「**首行**为存在的文件」：取第一条非空行，若该行不是真实文件即判不可用（不回退到第二行）。比「取第一条存在的行」更严，与规格逐字一致。
- `wslExePath()`（`:68-73`）除 `where.exe wsl.exe` 外还留了 `%SystemRoot%\System32\wsl.exe` 的固定路径回退。规格 wsl 行只写「`wsl.exe` 存在」而未指定判定手段，此处沿用 cmd 行「查询 + 固定路径回退」的同口径。若主代理认为只该用 `where.exe`，删 `:71-72` 即可，本机结果不变（`where.exe wsl.exe` 已命中）。
- 返回顺序按规格 §6.1 探测表：powershell → cmd → pwsh → wsl。任务 12 的下拉若要别的顺序（例如 pwsh 优先）需自行排序。
- 第三个用例依赖真机（本机必有 cmd）：这是计划逐字给的用例；本项目是 Windows-only（`build.bat` / `dist-release\win-unpacked`），故可接受。若将来上 Linux CI，该用例会红。
- `tsconfig.main.json:15` 排除 `*.test.ts`，所以 G2 只类型检查实现文件，测试文件由 vitest 转译、不进类型门——这是仓库既有口径，未改动。
- 未 `git add`、未 commit、未派子代理；除两个交付文件与 check 表 J 段外没有改动任何文件。

## 8. 疑虑（供主代理裁决）

1. 无阻塞性疑虑。唯一可讨论点是上面 `wslExePath()` 的固定路径回退（§7 第 3 条），属对「wsl.exe 存在」的判定手段选择，不影响本机结果与验收。
2. 提示任务 5 / 6：`detectTerminals()` 是同步阻塞调用（最坏 2 次 `spawnSync` × 3s）。任务 6 若在 `ql_terminals` IPC 里直接调用，最坏约 6s 才回弹窗；规格 §6.1 已明确「每次打开弹窗实时探测」，故本任务按同步实现，超时上限是规格给的 3s。若任务 6 需要更快返回，可在该任务里并行化或降级，不改本文件语义。

---

## 9. 修复轮 1 · 补 E8 / E9 注入式回归用例（任务 4 审查 Important #1，索引 K10 (2)）

- 触发：任务审查判定「任务质量：通过」，但 Important #1（标注「计划强制」）指出 E4–E7 全无自动化覆盖——本机永远观察不到「wsl 可用」，把 `:84` 的 `encoding: 'buffer'` 改成 `'utf-8'`、或把 `:89` 的 `distros.length === 0` 写反，原三条用例仍会全绿。主代理已把口径写进文档（commit `fdc2770`：索引 K10 + 本任务表 B2/E8/E9/F6）。
- 起点：HEAD = `fdc2770`；两个源码文件仍是工作区未跟踪状态（`?? src-main/quick-launch-terminals.ts` / `?? src-main/quick-launch-terminals.test.ts`）。

### 9.1 改了哪几行

| 文件 | 改动 | 说明 |
|---|---|---|
| `src-main/quick-launch-terminals.ts` | **零改动** | 未加注入参数、未改判定手段。C1 `TerminalInfo` / C2 `parseWslDistroOutput` / C3 `detectTerminals` 的导出签名一字未改。改前改后 `Get-FileHash` 一致：`8BFDE9E37D2875B95CED44ED4529D004556F1E96F1523B084FDA1E3717A5E125`（119 行） |
| `src-main/quick-launch-terminals.test.ts` | 30 行 → 180 行 | E1/E2/E3 三个用例（`:101-120`）**逐字未动**——用脚本把该 `describe` 块与改动前逐行比对，结果 `identical: true`。新增：注入通道 `:19-47`、夹具与假进程脚本 `:49-99`、E8 三个用例 `:122-155`、E9 三个用例 `:157-180` |
| 本任务 check 表 | B2 / E8 / E9 三行 ☐ → ☑；J 段追加 8 行 | F6 在 `fdc2770` 里已是 ☑（口径登记），本轮无需再动；除这些行与 J 段外未改该表 |

### 9.2 注入方式（K10 (2) 的首选做法，未走「给内部函数加注入参数」的退路）

- `:19-47`：`vi.hoisted` 建 `spawnHub`（`impl` + `calls`），`vi.mock('node:child_process')` 用 `vi.importActual` 展开真实模块后只替换 `spawnSync`；**未装脚本时委托真实 `spawnSync`**，所以 E3 真机用例的行为完全不变。仓库已有同写法先例：`src-main/llama-update-download.test.ts:4-35`。
- `:75-84`：`detectWithInjectedSpawn()` = 装脚本 → `vi.resetModules()` → 动态 `await import('./quick-launch-terminals')` → 调 `detectTerminals()`。ESM/CJS 没有卡住这条路（vitest 2.1.9 / node 环境）。
- `:36-44`：假 `spawnSync` 按调用方请求的 `encoding` 交付 stdout（`'buffer'` → 原始字节 Buffer，否则按该编码解码）——真机语义，不替实现兜底，这样 `:84` 被改动时不会被夹具掩盖。
- **不 mock `node:fs`**：「文件是否存在」走真实 fs，存在的文件取 `process.execPath`（跑 vitest 的 node 可执行文件，必然存在），不存在的取常量 `MISSING_PATH`（`:49-50`）；`:76-78` 先断言夹具本身成立，避免夹具失效导致断言空转。
- `:86-93` 记录实际发生的 `spawnSync` 调用；E8①② 先断言「`where.exe wsl.exe` 命中过 + `-l -q` 确实跑过」再断言「数组里没有 wsl」，否则「无 wsl」可能只是因为 `wsl.exe` 没被定位到（空断言）。
- E8③ 额外钉 `wsl -l -q` 的调用选项：`windowsHide: true` / `timeout: 3000`（F1）、`encoding: 'buffer'`（规格 §6.1 的 UTF-16LE 要求）——见 9.4 为什么必须钉这一条。

### 9.3 命令与真实输出

| # | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| 1 | `npx vitest run src-main/quick-launch-terminals.test.ts` | `✓ src-main/quick-launch-terminals.test.ts (9 tests) 168ms` / `Test Files 1 passed (1)` / `Tests 9 passed (9)`（exit 0） | E1/E2/E3 + E8①②③ + E9①②③ 全绿 |
| 2 | `npx vitest run src-main/quick-launch-terminals.test.ts src-main/quick-launch-config.test.ts` | `Test Files 2 passed (2)` / `Tests 28 passed (28)`（exit 0） | 相邻回归无异常。（config 用例打印 `[i18n] missing key: err.ql.*` 的 stderr 是任务 3 既有现象，用例本身全绿，与本任务无关） |
| 3 | `npx tsc -p tsconfig.main.json --noEmit` | 无任何输出；`TSC_EXIT=0` | 类型门无错 |
| 4 | `git status --porcelain` / `git diff --name-only` / `git rev-parse --short HEAD` | `?? src-main/quick-launch-terminals.test.ts`、`?? src-main/quick-launch-terminals.ts`；diff 只含本 check 表；HEAD 仍 `fdc2770` | 未 `git add`、未 commit；改动范围 = B1 + B2 + check 表 |
| 5 | 临时建 `src-main/ql-t4-tmp-delegation.test.ts`（同样的 mock 形态但 `impl = null`，断言 `detectTerminals()` 仍走真实实现；跑完即删，已确认 `Test-Path` = False） | `SEEN_CALLS= ["where.exe pwsh","where.exe wsl.exe","C:\\Windows\\System32\\wsl.exe -l -q"]` / `IDS= ["powershell","cmd","pwsh"]`（1 passed，exit 0） | 未装脚本时委托真实 `spawnSync` → 「E3 行为不变」是实测而非推测；顺带独立复现 D4 基线（无 wsl）与 F6 的固定路径回退分支 |

### 9.4 反向自检（这条发现「修好了」的证据）

| 变异 | 命令 | 真实输出 | 结论 |
|---|---|---|---|
| A：`:89` `if (distros.length === 0)` → `if (distros.length > 0)` | 跑定向 → 还原 | `Tests 2 failed / 7 passed (9)`（exit 1）：E8② `expected [ 'powershell', 'cmd', 'wsl' ] to not include 'wsl'`；E8③ `expected [] to have a length of 1 but got +0` | 判定写反即红。**同一变异下原三条用例仍全绿** → 正是审查者指出的缺口，现已补上 |
| B：`:84` `encoding: 'buffer'` → `encoding: 'utf-8'` | 跑定向 → 还原 | `Tests 1 failed / 8 passed (9)`（exit 1）：E8③ `expected 'utf-8' to be 'buffer'`（`:153` 的选项断言抓出） | encoding 被改即红。诚实记录：仅靠数组级断言抓不到这个变异——ASCII 发行版名经「utf-8 解码 + 剥 NUL」后仍能解析出 `Ubuntu`，所以 E8③ 必须钉住请求的 `encoding` 才守得住 `:84` |
| 还原后重跑 | 定向 + 相邻 + `tsc` | `Tests 9 passed (9)` / `Tests 28 passed (28)` / `TSC_EXIT=0`；`:84` / `:89` 已复原，实现文件哈希与改动前一致 | 全绿 |

### 9.5 本轮自审与留给主代理的两点

- 未改探测语义：判定手段、顺序、`{id,path}` 形状、`windowsHide` / `timeout`、不缓存，全部原样；未动 `src-main/quick-launch-config.ts`；未顺手修审查列的次要项（`systemRoot()` 兜底注释、先 `existsSync` 再 `where.exe` 的优化、把每行都当发行版名）——仍留在账本交最终整分支审查。
- E8③ 里「`wsl.exe` 的定位结果」用 `process.execPath` 充当，是为了跨机器可跑（不依赖本机真有 wsl）；断言只关心「数组里的 wsl 项 path = 定位到的那个路径」，与真实 wsl.exe 无关。
- 提示 1：check 表 I 段的完成判据仍写「E1-E7 有测试或代码证据」，没有 E8/E9 行。按本轮指令「除 B2/E8/E9/F6 与 J 段外不要改这张表」，我没有动 I 段——请主代理决定是否补一行。
- 提示 2：F6 在 `fdc2770` 里已经是 ☑，本轮只翻了 B2 / E8 / E9 三行。

---

## 10. 修复轮 2 · 两条 Minor（E8①/E9① 夹具不具区分力 + E8① 钉死定位手段）

- 触发：修复轮 1 的定向复审结论为「所有发现均已解决，无新 Critical/Important 破坏」，附 5 条 Minor；主代理裁定本轮只修其中两条。其余三条（委托兜底无用例、异常路径/超时无用例、解析侧宽松）与既记的 `systemRoot()` 注释、`existsSync` 顺序优化仍留账本，交最终整分支审查。
- 起点：HEAD = `fdc2770`；两个源码文件仍是工作区未跟踪（`?? src-main/quick-launch-terminals.ts` / `.test.ts`）。
- 改动范围：只有 `src-main/quick-launch-terminals.test.ts`（180 → 191 行）与本任务 check 表 J 段（追加 8 行）。**实现文件 `src-main/quick-launch-terminals.ts` 一字未改**：改动前、C-1 还原后、C-2 还原后三次 `Get-FileHash` 同为 `8BFDE9E37D2875B95CED44ED4529D004556F1E96F1523B084FDA1E3717A5E125`（119 行）。E1/E2/E3 三个真机用例逐字未动；E8②③ / E9②③ 未动；check 表 B/C/E/F/G/H/I 段未动。

### 10.1 改了哪三处（照复审者的修法逐字执行）

| # | 位置 | 改动 | 为什么这样改 |
|---|---|---|---|
| 1 | 测试 `:132`（E8① 夹具） | `wslList: { status: 1, stdout: utf16leBytes('') }` → `{ status: 1, stdout: utf16leBytes('Ubuntu\r\n') }` | 空 Buffer 时「不可用」由下游独立得出（`impl:95` → `[]` → `:89` null），删掉退出码判定也不会红。非 0 + 非空合法输出才是本机真实形态（check A2：退出码 1 + 一段非空 UTF-16LE 提示）；此时去掉 `impl:87` 就会出现幽灵 `wsl` 项 |
| 2 | 测试 `:169`（E9① 夹具） | `wherePwsh: { status: 1, stdout: Buffer.alloc(0) }` → `{ status: 1, stdout: utf8Bytes(REAL_PATH + '\r\n') }` | 同理：空 stdout 时 `impl:53-59` 独立得出 null。首行给一个真实存在的文件，去掉 `impl:52` 的退出码判定就会出现幽灵 `pwsh` 项 |
| 3 | 测试 原 `:130` → 新 `:137`（E8① 前提断言换形） | 删 `expect(whereCalls('wsl.exe')).toHaveLength(1)`，改为 `expect(wslQueryCalls()[0].cmd).toBe(REAL_PATH)`；`expect(wslQueryCalls()).toHaveLength(1)` 保留 | 前者把「定位 wsl.exe 的手段」钉成必须调 `where.exe` 一次，与 K10 (1) / F6 允许的两条等价路径（`where.exe` 命中 **或** `%SystemRoot%\System32\wsl.exe` 回退，`impl:68-73`）冲突；后者只要求「`-l -q` 打的是定位到的那个 wsl.exe」，同样排除空断言，但不数 `where.exe` 的调用次数 |
| — | 两处夹具各加注释 | 写明「非 0 状态必须配非空且合法的 stdout」的理由 | 防止后人为了「简化夹具」把 stdout 改回空 Buffer 而悄悄失去区分力 |

### 10.2 命令与真实输出

| # | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| 1 | `npx vitest run src-main/quick-launch-terminals.test.ts` | `✓ src-main/quick-launch-terminals.test.ts (9 tests) 172ms` / `Test Files 1 passed (1)` / `Tests 9 passed (9)`（exit 0） | 定向全绿 |
| 2 | `npx vitest run src-main/quick-launch-terminals.test.ts src-main/quick-launch-config.test.ts` | `Test Files 2 passed (2)` / `Tests 28 passed (28)`（exit 0；config 的 `[i18n] missing key: err.ql.*` 是任务 3 既有现象） | 相邻回归无异常 |
| 3 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出；`TSC_EXIT=0` | 类型门无错 |
| 4 | `Get-FileHash src-main/quick-launch-terminals.ts`（改动前 / C-1 还原后 / C-2 还原后）+ 行数 | 三次均 `8BFDE9E37D2875B95CED44ED4529D004556F1E96F1523B084FDA1E3717A5E125`；119 行；`:52` / `:87` 逐字复原 | 实现文件未被改动 |
| 5 | `git status --porcelain`；`git diff --name-only`；`git rev-parse --short HEAD` | 两个 `??` 源码文件；diff 只含本任务 check 表；HEAD 仍 `fdc2770` | 未 `git add`、未 commit；范围 = B2 + check 表 J 段 |

### 10.3 反向自检 C（本轮的关键证据：三条件里的「退出码 0」现在被钉住了）

| 变异 | 命令 | 真实输出 | 结论 |
|---|---|---|---|
| C-1：`impl:87` `if (r.error \|\| r.status !== 0) return null;` → `if (r.error) return null;` | 跑定向 → 还原 | `Tests 1 failed \| 8 passed (9)`（exit 1）：E8① `expected [ 'powershell', 'cmd', 'wsl' ] to not include 'wsl'` —— 幽灵 wsl 项出现，且**只有 E8① 红** | 「退出码 0」现被 E8① 独立钉住。旧夹具（空 Buffer）下同一变异全绿 = 复审者指出的缺口，已补 |
| C-2：`impl:52` `if (r.error \|\| r.status !== 0) return null;` → `if (r.error) return null;` | 跑定向 → 还原 | `Tests 1 failed \| 8 passed (9)`（exit 1）：E9① `expected [ 'powershell', 'cmd', 'pwsh' ] to not include 'pwsh'` —— 幽灵 pwsh 项出现，且**只有 E9① 红** | 同上：pwsh 行的退出码条件现被 E9① 独立钉住 |
| 还原后重跑 | 定向 + 相邻 + `tsc` | `Tests 9 passed (9)` / `Tests 28 passed (28)` / `TSC_EXIT=0`；`:52` / `:87` 已复原，实现哈希与改动前一致 | 全绿 |

### 10.4 自审与一点说明（供主代理）

- 两次变异都只让目标用例红（`1 failed | 8 passed`），说明夹具改动没有把其它用例变成对同一变形的隐式依赖，也没有互相掩盖。
- 诚实边界：新断言 `wslQueryCalls()[0].cmd === REAL_PATH` 与 E8③ `:155` 同形状——它不再数 `where.exe` 的调用次数（调用顺序、是否先 `existsSync` 都不被钉），但定位结果的**路径身份**仍来自夹具里 `where.exe` 的命中行。若将来重构成「只走 `%SystemRoot%\System32\wsl.exe`」，E8①/E8③ 会红，需同步让夹具里的回退路径也真实存在。这是「断言必须有一个确定可引用的路径」的固有代价，与 E8③ 一致，不是本轮新增的缺陷。
- 未新增用例、未改探测语义、未动其它 Minor；check 表只在 J 段追加。
