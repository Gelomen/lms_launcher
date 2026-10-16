# 任务 1 报告 · `ql-terminal-icons.ts` —— 缓存 + PowerShell 提取接缝

- 计划：`docs/superpowers/plans/2026-10-16-quick-launch-terminal-icons.md` §任务 1
- 规格：`docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md` §6.1 / §6.2 / §7.1-1..6 / §8-Q1 Q2 Q6 Q7 K2 K3 K4 / §9-R1 R5 R8
- check 表：`docs/superpowers/checks/2026-10-16-quick-launch-terminal-icons/task-01-ql-terminal-icons-cache-and-powershell-seam.md`（J 段已填 J-1..J-13）
- 状态：**DONE_WITH_CONCERNS**（功能与门全绿；concerns 全是文档措辞与类型声明的偏差，见 §5，没有一处影响行为）
- 起点 HEAD = `50c9e77`（check 表 commit），分支 `feat/quick-launch`；**未 git add、未 commit、未 stash**（G9）

## 1 改动清单（只新建两份，B3 未越界）

| 文件 | 动作 | 内容 |
|---|---|---|
| `src-main/ql-terminal-icons.ts` | 新建（189 行） | `ExtractIcons`（C1）、`powershellExtract`（C2/C3）、`cacheFileName`（C4）、`withTerminalIcons`（C5/C6）+ 规格 §6.1 那段 PowerShell 脚本常量 |
| `src-main/ql-terminal-icons.test.ts` | 新建（6 条用例） | E1–E6 用例名与断言逐字；假接缝经 `withTerminalIcons` 第四参注入，**未** mock `node:child_process` |

既有文件一字未改：`git diff src-main/quick-launch-terminals.ts` = 0 字节；`git diff package.json pnpm-lock.yaml package-lock.json` = 0 字节。
唯一被改的既有文件是 check 表的 **J 段**（交付 1 要求），A–I 段的 `☐` 一个没动（普查脚本复跑：本表 `裸☐=43`、`I段 -[ ]=8`、`☑=0`，与改前一致）。

## 2 TDD 顺序与真实输出

### D1 先写测试 → D2 跑红

`npx vitest run src-main/ql-terminal-icons.test.ts`（实现文件不存在时）：

```
 ❯ src-main/ql-terminal-icons.test.ts (0 test)
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src-main/ql-terminal-icons.test.ts [ src-main/ql-terminal-icons.test.ts ]
Error: Failed to load url ./ql-terminal-icons (resolved id: ./ql-terminal-icons) in D:/Dev/Projects/lms_launcher/src-main/ql-terminal-icons.test.ts. Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

exit 1。失败原因是**被测模块解析不到**，不是断言写错（0 条用例被收集，连断言都没执行到）。措辞与 check 表 D2 预期的 `Cannot find module` 不同 —— 见 §5-D。

### D3 实现 → D4 跑绿

`npx vitest run src-main/ql-terminal-icons.test.ts`：

```
 ✓ src-main/ql-terminal-icons.test.ts (6 tests) 1271ms
   ✓ ... > real_powershell_seam_extracts_a_png_for_a_known_exe 1225ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

真机冒烟**没有跳过**：本机 `C:\\WINDOWS\\System32\\cmd.exe` 在位，断言解码后前 8 字节 = `89504e470d0a1a0a` 通过。

### D5 类型门

第一次 `npx tsc --noEmit -p tsconfig.main.json` → exit 2：

```
src-main/ql-terminal-icons.ts(86,7): error TS2353: Object literal may only specify known properties,
and 'stdio' does not exist in type 'ExecFileOptionsWithStringEncoding'.
```

修的是**类型声明**，不是取值（见 §5-C）。修完复跑：无输出，`TSC_EXIT=0`。

### D6/G5 全量（最终代码上跑的，非修改前）

`npm test` → exit 0：

```
 Test Files  53 passed (53)
      Tests  918 passed (918)
```

= 基线 912 + 6，与 A2 / D6 / 索引 G8 的预期逐字一致，无差额需要解释。

### G1–G4 回归门

- G1 定向：`Tests 6 passed (6)`
- G2 相邻：`npx vitest run src-main/quick-launch-terminals.test.ts src-main/ipc-ql.test.ts` → 9 + 28 全绿，条数不变
- G3 类型：`TSC_EXIT=0`
- G4 i18n：`npx vitest run src-main/i18n` → `index 3` / `no-hardcoded 2` / `dict 11` / `key-coverage 2` 全绿（未新增键）
- 合并跑一次的实际输出：`Test Files 6 passed (6)` / `Tests 55 passed (55)`

### A4 / A5 / D7 探针真数（本机四个 exe 都在位：powershell.exe、cmd.exe、wsl.exe、pwsh 7）

A4 `node .temp/ql-term-icon-probe/encoded-batch.cjs <4 真实 exe> <1 不存在>`：

```
C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -> 1604 b64 chars = 1203 bytes, PNG magic=89504e470d0a1a0a
C:\WINDOWS\System32\cmd.exe -> 836 b64 chars = 625 bytes, PNG magic=89504e470d0a1a0a
C:\WINDOWS\System32\wsl.exe -> 2144 b64 chars = 1608 bytes, PNG magic=89504e470d0a1a0a
C:\Program Files\PowerShell\7\pwsh.exe -> 2160 b64 chars = 1619 bytes, PNG magic=89504e470d0a1a0a
C:\WINDOWS\System32\no-such-zzz.exe -> null
elapsedMs=1385 stdoutBytes=6981 psPath=C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe psExists=true
```

A5（第一次）：`noop = 1290 / 134 / 138 ms`，`batch-4 = 911 / 216 / 224 ms`（len=6935）
D7（本轮复跑，要求贴真实毫秒）：`noop = 1285 / 130 / 131 ms`，**`batch-4 = 897 / 219 / 221 ms`**（len=6935）
→ 提取净增 767 / 89 / 90 ms；powershell.exe 冷启动双峰复现（首轮 1.3s）。8000ms 是冷启动余量，与 K8 一致。

## 3 契约逐条自查（C1–C7）

| # | 核对结果 |
|---|---|
| C1 | `export type ExtractIcons = (exePaths: string[]) => Promise<Record<string, string \| null> \| null>` —— 逐字 |
| C2 | 可执行文件 = `join(process.env.SystemRoot \|\| process.env.windir \|\| 'C:\\WINDOWS', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')`（`systemRoot()` 与 `quick-launch-terminals.ts:26-28` 同口径）；参数 = `['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand', base64(utf16le)]`；选项 = `{ windowsHide: true, timeout: 8000, maxBuffer: 1 << 20, encoding: 'utf-8', stdio: ['ignore','pipe','pipe'] }`（`EXEC_OPTIONS`，五个取值逐字） |
| C3 | 脚本常量按行 join，与规格 §6.1 那段一行不差（`$ErrorActionPreference='Stop'` → `Add-Type` → here-string 灌 `JSON.stringify(exePaths)` → `ConvertFrom-Json` → 逐项 `ExtractAssociatedIcon` + `ToBitmap().Save(ms, Png)` + `ToBase64String` → `catch` 置 `$null` → `ConvertTo-Json -Compress`）；真机冒烟 = 该形状可用的直接证据 |
| C4 | `createHash('sha1').update(path.win32.resolve(exePath).toLowerCase()).digest('hex') + '.png'`，纯函数、不碰 fs |
| C5 | 签名与默认参数逐字；返回新数组、每项浅拷贝；只有拿到图标的项加 `icon`；E5 断言入参未被改写 |
| C6 | `'data:image/png;base64,' + b64` 前缀逐字 |
| C7 | 未新增 IPC、未新增 i18n 键、未改 `package.json`（`git diff` = 0 字节） |

## 4 自审发现 → 是否修了

| # | 发现 | 处理 |
|---|---|---|
| S1 | 首版**注释**里写了 `spawnSync` / `console.*` / `emitLog` 三个字面量 → F3/F4 的 grep 各命中 1（在注释里，不在代码里） | **已修**：注释改成中文措辞（「不起同步进程」「不往标准输出打印」），复跑计数 `spawnSync=0 / console=0 / emitLog=0` |
| S2 | 首版把 C2 的选项写成调用点内联对象 → tsc TS2353（`stdio` 不在 `ExecFileOptionsWithStringEncoding` 里） | **已修**：提为具名 `EXEC_OPTIONS` + 本地类型 `ExecFileOptionsWithStdio`（见 §5-C），取值一字未改；复跑 tsc exit 0 |
| S3 | 注释里出现 `size` / `mtime` 字样，可能被 F5 的 grep 误读成「键里带了大小/时间」 | **已修**：改成「文件大小 / 修改时间」中文措辞，复跑 `mtime / statSync / size` 计数 = 0 |
| S4 | 测试里 `import type { TerminalId } from './quick-launch-terminals'` —— 该模块只 import 未 re-export 这个类型，会成假依赖 | **已修**：改用 `TerminalInfo['id']`，测试的 import 面收窄到 check F2 允许的范围（外加 `node:os`，见 §5-E） |
| S5 | 检查汉字是否只在注释里（G2 硬门）：逐行列出含汉字的行，全部是 `//` / `/** */` / `/* */`；i18n `no-hardcoded` 门绿 | 无需改动 |
| S6 | 检查是否往仓库根写了文件：`git status --porcelain` 无 `cache/`、无临时目录；夹具全在 `os.tmpdir()` 下且 `afterEach` 删除 | 无需改动 |
| S7 | 检查「一次调用多项未命中 = 一次进程」：实现按 `icons` / `misses` 去重后只调 `extract` 一次；E3 钉住 `calls.length === 1` 与实参 | 无需改动 |
| S8 | `powershellExtract([])` 的行为规格未定义 | 实现里加了 `if (exePaths.length === 0) return {}`（不起进程）。经 `withTerminalIcons` 走不到这条路（`misses.length > 0` 才调），无测试钉它 —— 登记，不扩范围 |

## 5 与 spec / plan / check 表的偏离（都不改文档，交主代理裁决）

| # | 偏离 | 依据与影响 |
|---|---|---|
| A | **plan 步骤 3 写「`execFile`（`promisify`）」，我写成内联 Promise 包装**（`execFileText`） | check 表 F2 把新文件的 import 限定在 `node:child_process` / `node:crypto` / `node:fs` / `node:path` / `./quick-launch-terminals`，其中**没有 `node:util`**（`promisify` 的来源）。内联包装与 `promisify(execFile)` 语义等价（同一个回调 → Promise），且同时满足 G4/K2「异步、不阻塞主线程」与 F2 白名单。**这是 plan 与 check 表的口径冲突**：若主代理要字面 `promisify`，需按 AGENTS.md「先改文档再改代码」给 F2 补一行 `node:util`，我再改代码 |
| B | 无 | 接口签名、脚本、参数、选项、缓存键、data URL 前缀均逐字照 C1–C6 |
| C | 新增一个**本地类型** `type ExecFileOptionsWithStdio = ExecFileOptionsWithStringEncoding & { stdio: ['ignore','pipe','pipe'] }` | @types/node 26 的 `ExecFileOptions` 不声明 `stdio`（`grep interface ExecFileOptions` 见 `node_modules/@types/node/child_process.d.ts:941-951`），但 `execFile` 运行时把它转给 spawn —— 探针 `encoded-batch.cjs:31` / `latency2.cjs:11` 都带这个 stdio 实测通过。C2 的五个取值一字未改，只是补类型声明让 tsc 过门 |
| D | **D2 的措辞**：check 表预期 `Cannot find module './ql-terminal-icons'`，实际是 Vite 的 `Failed to load url ./ql-terminal-icons … Does the file exist?`，且显示 `Tests no tests`（0 条被收集）而非「6 条全部失败」 | vitest 2.1 走 Vite 解析器，模块找不到时整个文件加载失败，不逐条报失败。语义等价（红 = 找不到被测模块，不是断言写错），但字面不符 → 建议主代理把 D2 的预期改成实际措辞（或注明「等价措辞」） |
| E | 测试文件 import 了 `node:os`（`tmpdir()`） | plan 步骤 1 明确要求夹具用 `fs.mkdtempSync(path.join(os.tmpdir(), 'ql-icons-'))`；check F2 的 import 白名单写在 B1（实现文件）那一行，未覆盖 B2。按 plan 执行，登记以免验收时被当成越界 |
| F | check 表 E6 说「索引 K11 的同类做法」，但索引 K11 讲的是 `.gitignore` 加 `cache/` | 真正的同类先例是 `src-main/shell-execute.test.ts:205-222`（夹具不在 → `it.skipIf` + 注释指向真机门），规格 §9-R8 也指这个口径。我按 E6 的**要求**做了（`it.skipIf` + 注释指向规格 §7.2-1），注释里引的是真实先例的行号。文档引用错位，未改文档 |
| G | 缓存目录不可写时的行为按规格 §6.2 实现（写失败仍返回本次 data URL），不是 plan G5 那句「缓存目录不可写 → 该项无图标」 | 两处口径不一致：§6.2 更具体（「写失败（只读目录等）不影响本次返回的 data URL」），G5 的实质是「不抛出、不写日志」。实现两者都满足（不抛、不写日志），图标照常返回。登记给主代理 |
| H | A1 的 HEAD 写 `5c4313d`、F6 同 | 按主代理派单说明与索引 PF1，以当前 HEAD `50c9e77`（就是 check 表 commit）读「HEAD 是文档 commit、工作区无已跟踪改动」，不改文档 |

## 6 留给主代理的验收点

- H1 暂存范围：只 `git add src-main/ql-terminal-icons.ts src-main/ql-terminal-icons.test.ts`；本表 J 段属文档改动，按 AGENTS.md 与代码提交分开
- H2 commit message 逐字：`feat(main): 终端图标提取层（PowerShell System.Drawing + 应用目录磁盘缓存）`
- H3 普查脚本已跑：`node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → exit 0，本表 `☑=0 / 裸☐=43 / I段 -[ ]=8`（落勾是验收动作，我没动）
- 验收时值得逐行看的三处：① `EXEC_OPTIONS` 的五个取值是否认 C2（含 `stdio` 的本地类型补声明，§5-C）；② 真机冒烟那条**未跳过**，J-6 有真实耗时；③ §5-A 与 §5-G 两处 plan/check 口径冲突需要裁决
