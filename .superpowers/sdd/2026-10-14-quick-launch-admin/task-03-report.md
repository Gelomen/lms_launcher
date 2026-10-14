# 任务 3 报告 · 可执行程序的「管理员」= `runas`

> 派单：主代理（2026-10-14 20:1x，起点 HEAD `dbf4f09`）· 分支 `feat/quick-launch-admin`
> 输入：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-03-brief.md` + `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-03-exe-runas.md` + 规格 §6.9 / §6.4-3 / §6.10
> 本表 A-I 段的勾**未落**（按 G8：验收归主代理）；C4 与 J 段按派单要求填了真实行号与真实输出。

## 1 状态

**完成，等验收。** 未 `git add`、未 commit（G8）。改动只落在 B 段四个文件（G9）。

收尾门全绿：

| 门 | 命令 | 结果 |
|---|---|---|
| 类型门（R-01 / K27） | `npx tsc --noEmit -p tsconfig.main.json` | 无输出，`TSC_EXIT=0` |
| 定向 G1 | `npx vitest run src-main/shell-execute.test.ts src-main/ipc-ql.test.ts` | `Test Files 2 passed (2)` / `Tests 34 passed (34)` |
| 相邻回归 G2 | `npx vitest run src-main/ipc-ql.test.ts` | `Tests 24 passed (24)`，`:326-346` 的既有 exe 用例一字未改（`git diff` 该文件是纯新增 39 行） |
| i18n G4 | `npx vitest run src-main/i18n` | `Test Files 4 passed (4)` / `Tests 18 passed (18)` |
| 全量 G5 | `npm test` | `Test Files 49 passed (49)` / `Tests 847 passed (847)`，`Duration 8.81s`，exit 0 |

计数只增不减：起点 49 份 / 844 条 → 现在 49 份 / **847** 条（+3：`shell-execute.test.ts` 两条、`ipc-ql.test.ts` 一条）。

## 2 改动文件与真实行号（改后实测行号）

### `src-main/shell-execute.ts`（+18 / -7）

| 位置 | 内容 |
|---|---|
| `:14-18` | `WinShellApi.shellExecute` 加可选第三参，逐字 = C1：`shellExecute(file: string, nShow: number, opts?: { verb?: string \| null; parameters?: string \| null }): { ok: boolean; handle: unknown; win32Error: number }`（`\| null` 在类型内，索引 K29 / R-04） |
| `:84` | 真实现形参跟着走：`shellExecute(file, nShow, opts) {` |
| `:91` | `lpVerb: opts?.verb ?? null,`（原 `:87` 的 `lpVerb: null`；原注释逐字保留，另加一行说明 `runas`） |
| `:94` | `lpParameters: opts?.parameters ?? null,`（原 `:89`） |
| `:197-203` | `launchShellExe(api, exe, verb?)`（逐字 = C2）+ 第三参透传（见 §5 偏离 5 的写法与取证） |

**未动**（B1 边界）：`fMask`（`:92`，改前 `:85`）、`nShow`、`lpDirectory`、`ShellExecProcess` 的 100ms 句柄轮询、`killTree`、`ERROR_CANCELLED = 1223` 的分类（`PROC: err.proc.uacCancelled` / `PROC: err.proc.spawnFail` 一字未改，G1）。

### `src-main/shell-execute.test.ts`（+48 / -0，纯新增）

| 位置 | 内容 |
|---|---|
| `:6-7`（文件头注释） | 加两行来源说明（用例名逐字取 plan 任务 3 步骤 1） |
| `:31-45` | 测试工具 `recordingApi()`：只记录每次调用的完整实参数组 |
| `:174-184` | `it('verb_runas_is_passed_through_to_the_shell')` —— E1 的守测试 |
| `:186-199` | `it('no_opts_keeps_verb_and_parameters_null')` —— E2 / RF2 的守测试 |

既有用例 1-8（含 `:71-84` 的 uac 用例）**一字未改**：`git diff --numstat` = `48 0`（零删除行）。

### `src-main/main.ts`（+14 / -6）—— 逐字按 C3（索引 K16 / 裁决 R-03）

| C3 | 改后行号 | 内容 |
|---|---|---|
| ① | `:1016` | `let qlStartContext: { configId: string; available: Set<TerminalId>; admin: boolean } \| null = null;` |
| ① 连带 | `:1026` | `qlStartContextOrThrow` 的返回类型同步加宽（见 §5 偏离 4） |
| ② | `:1126` | `qlStartContext = { configId: id, available, admin: entry.admin === true };` |
| ③ | `:1055` / `:1063` | `function spawnExeProcess(exe: string, configId: string \| null, admin: boolean)` → `proc = launchShellExe(winShell, exe, admin ? 'runas' : null);` |
| ④ | `:1087-1090` | `spawnExe: (exe) => { const ctx = qlStartContextOrThrow('spawnExe'); return spawnExeProcess(exe, ctx.configId, ctx.admin); }`（C3 ③ 逐字） |

**未动**：`:1088` 的 `qlStartContextOrThrow('spawnExe')` 槽守卫调用仍在（E4）；`emitLog('[lms_launcher] ' + …, 'sys')` 的分工与前缀不变；`ql_start` 的探测、`hasOwnProperty`、`finally` 清槽一字不动；`QlDeps.spawnExe(exe)`（`quick-launch.ts:171`）签名不动（R-03）。注释里加了两段来源说明（槽的 `admin` 条目、`spawnExeProcess` 的 `admin` 形参）。

### `src-main/ipc-ql.test.ts`（+39 / -0，纯新增）

| 位置 | 内容 |
|---|---|
| `:375-413` | 新增用例 `exe 提权形状门：admin:true → shellExecute 收到 verb=runas；admin 缺省 → null（规格 §6.9 / 索引 G3、K29）`：保存 `admin:true` 与不带 `admin` 的两条 exe 条目 → `ql_start` → 断到假接缝的实参是 `['runas', null]`、`parameters` 都是 `null`、`nShow` 都是 `1`；并钉 §6.10 的 `err.proc.uacCancelled` 日志行里 `{exe}` 是用户那一行的 `notepad.exe`（不是宿主 exe）与「失败不残留状态」 |

其它通道用例零改动（`git diff` 只有这一处 hunk）。

## 3 TDD 每步：命令与真实输出

### D1 先改测试 → 红

`npx vitest run src-main/shell-execute.test.ts`（20:22:20）

```
 ❯ src-main/shell-execute.test.ts (10 tests | 2 failed) 2454ms
   × … > verb_runas_is_passed_through_to_the_shell 4ms
     → expected undefined to be 'runas' // Object.is equality
   × … > no_opts_keeps_verb_and_parameters_null 1ms
     → expected undefined to be defined
 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
```

红的原因正确：现签名没有第三参，接缝收到的第三实参是 `undefined`；既有 8 条全绿。

### D2 实现 `shell-execute.ts` → 绿

`npx vitest run src-main/shell-execute.test.ts`（20:22:54）

```
 ✓ src-main/shell-execute.test.ts (10 tests) 2454ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### D3 先加 `ipc-ql` 形状门 → 红，再改 `main.ts` → 绿

红（20:23:32，`npx vitest run src-main/ipc-ql.test.ts`）：

```
 ❯ src-main/ipc-ql.test.ts (24 tests | 1 failed) 4724ms
   × … > exe 提权形状门：admin:true → shellExecute 收到 verb=runas；admin 缺省 → null …
     → expected [ null, null ] to deeply equal [ 'runas', null ]
 Test Files  1 failed (1)
      Tests  1 failed | 23 passed (24)
```

绿（20:24:17，同一命令，改完 `main.ts` 之后）：

```
 ✓ src-main/ipc-ql.test.ts (24 tests) 4690ms
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

### D4 / G 段

```
# G1 定向（20:24:35）
 Test Files  2 passed (2)
      Tests  34 passed (34)

# G3 类型门
 npx tsc --noEmit -p tsconfig.main.json  →  无诊断，TSC_EXIT=0

# G4 i18n 三门（20:24:44）
 ✓ src-main/i18n/index.test.ts (3 tests)   ✓ src-main/i18n/no-hardcoded.test.ts (2 tests)
 ✓ src-main/i18n/dict.test.ts (11 tests)   ✓ src-main/i18n/key-coverage.test.ts (2 tests)
 Test Files  4 passed (4) / Tests 18 passed (18)

# G5 全量（20:24:51）
 Test Files  49 passed (49)
      Tests  847 passed (847)
   Duration  8.81s
```

## 4 必须钉住的断言（E 段）落点

| # | 断言 | 守测试 | 结果 |
|---|---|---|---|
| E1 | `admin:true` → 假 api 收到 `verb === 'runas'` | `verb_runas_is_passed_through_to_the_shell`（单元）+ `ipc-ql` 形状门（接线） | 绿 |
| E2 | 无 `admin` → `verb` / `parameters` 都是 `null` | `no_opts_keeps_verb_and_parameters_null`（两种调用形状：不传第三参 / 显式 `null`）+ `ipc-ql` 形状门的 `[null, null]` | 绿 |
| E3 | UAC 取消仍映射到 `err.proc.uacCancelled`，`{exe}` 是用户路径 | 既有 uac 用例（文案未改）+ `ipc-ql` 既有日志断言 + 新用例里 `uacCancelled(notepad.exe)` 的等待 | 绿 |
| E4 | `main.ts` 的槽守卫仍在（不静默降级） | `git diff` 显示 `qlStartContextOrThrow('spawnExe')` 保留；`ipc-ql` 的「两个 exe 配置并发 ql_start」等槽用例全绿 | 绿 |

## 5 偏离与理由

1. **A1 的「porcelain 干净」不成立（先于我）**：我接手时 `git status --porcelain` 已有三个 `M`：`.superpowers/sdd/…/progress.md`、`.superpowers/sdd/…/task-02-report.md`、`docs/superpowers/checks/…/task-02-frame-protocol.md`。这三行是主代理留下的任务 2 文档更正（`progress.md` 里写明「并入任务 3 的 docs 提交」）。实质判据（索引 K24：porcelain 不含 `src/` / `src-main/`）成立；HEAD 确为 `dbf4f09`（任务 2 的验收文档提交，索引 K30 口径）。我一个字都没动它们。
2. **A2 的基线数字是任务 2 落地前测的**：表里写 `48 / 835`（索引头部 19:07 实测）。任务 2 新增 `ql-host-protocol.test.ts` 后起点实际是 `49 / 844`（与派单说明一致）。我按「只增不减」核对：最终 `49 / 847`。
3. **A3 的锚点有一处偏一行**：表头写「`fMask = 0x40\|0x04` 在 `:86`」，改前实测在 `:85`（`:86` 是 `hwnd: null`）。其余锚点逐条对上：`:14` 接口、`:80-102` 真实现、`lpVerb: null` 在 `:87`、`lpParameters: null` 在 `:89`、`:191-201` `launchShellExe`、`main.ts:1013` / `:1050-1072` / `:1082` / `:1118`、`quick-launch-config.ts:14` 的 `admin?: boolean`（A4 成立）。
4. **C3 ① 的连带改动（第五处）**：`qlStartContextOrThrow`（现 `:1026`）的返回类型必须与槽同步加宽 `admin: boolean`，否则 `:1089` 的 `ctx.admin` 过不了类型门。B3 写的是「四处」，这是 ① 的必要连带，只改一行类型注解，未触碰守卫的 `STATE:` 抛出与消息。
5. **`launchShellExe` 的透传写法：`verb` 缺省时不构造 `opts`**（`:201-203`）：
   ```ts
   const r = verb === undefined
     ? api.shellExecute(exe, SW_SHOWNORMAL)
     : api.shellExecute(exe, SW_SHOWNORMAL, { verb });
   ```
   取证：临时探针 `src-main/tmp-arity-probe.test.ts`（跑完即删，最终 `git diff --name-only` 不含它）实测 vitest 的 `toHaveBeenCalledWith(EXE, 1)` **不容多出来的第三实参**——显式 `undefined` 也算多（两条探针都红）。既有用例 1 正是这条断言，而 B2 的边界是「不改既有断言文案」，所以不能给它补第三参。两条路径到真实现的取值都是 `lpVerb = null` / `lpParameters = null`（`opts?.verb ?? null`），G3 / RF2 不破；`main.ts` 走的是显式 `null` 那条（K29 的实参形状），被新用例钉住。
6. **新用例不真起提权进程**：假接缝返回 `{ok:false, win32Error:1223}`。真 `runas` 会弹 UAC 并把主进程同步阻塞 5.7–5.9s（规格 §3-P11），且 Shell 的弹窗压不住（E19 / 索引 R8、K17）——那会把自动化门变成人工门。既有 `:350-354` 的注释就是这个理由，我沿用同一手法。
7. 未新增词典键（G2）：`git diff` 不含 `src-main/i18n/dict.ts`；新用例只复用 `err.proc.uacCancelled`。未碰 `src-main/process.ts` 与 llama-server 路径（G4）。

## 6 疑虑（留给主代理 / 后续任务）

1. **真机门没跑**：`runas` 的 UAC 弹窗、5.7s 同步阻塞、提权后 `taskkill` 打不到进程树（E9）都只在假接缝上钉了形状。exe 提权的真机验收要并入 §7.2 那次构建（与前置任务 4 未勾的 E1-E7 同批）。
2. **`launchShellExe` 的第三参只有 `verb`**（C2 逐字）。任务 6 起提权宿主时要传 `parameters`，那条路按规格 §6.4-3 直接调 `winShell.shellExecute(..., { verb, parameters })`，别顺手给 `launchShellExe` 加形参（它的边界是 exe 类型，规格 §5 明确 exe 条目没有参数字段）。
3. **`spawnExeProcess` 的 `admin` 只有一个来源**（`ql_start` 写的槽）。任务 7 的 shell 提权走 `createElevatedShellProcess`，不要复用这条 exe 路径；`admin` 的取值口径（`entry.admin === true`）已在 `:1126` 一处，两处别各写一份。
4. **`ipc-ql.test.ts` 的 `guardOf()`（`:109-112`）仍按两字段类型断言槽**，不看 `admin`。它不是类型门覆盖的文件（`tsconfig.main.json:15` 排除 `*.test.ts`），也不影响判据；要不要顺手加宽归主代理定，我没动（B4 边界：不动其它通道用例）。
