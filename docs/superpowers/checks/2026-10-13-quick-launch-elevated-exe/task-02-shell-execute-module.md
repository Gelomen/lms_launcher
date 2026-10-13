# 任务 2 · `src-main/shell-execute.ts` —— Win32 接缝与进程生命周期 — check 表

> 计划：[2026-10-13-quick-launch-elevated-exe.md](../../plans/2026-10-13-quick-launch-elevated-exe.md) §任务 2 · 规格：[2026-10-13-quick-launch-elevated-exe-design.md](../../specs/2026-10-13-quick-launch-elevated-exe-design.md) §6.2-§6.7 / §7.1 · 关联审查重点 **R1 / R2 / R3 / R5**（索引 R 组）
> 前置：任务 1（要 `import koffi`；索引清单表第 14 行）
> 现状锚点（本表生成时实测）：`src-main/shell-execute.ts` 与 `src-main/shell-execute.test.ts` **都不存在**；`src-main/process.ts:32-36`（spawn）/ `:37-47`（`child.on("error")` → `PROC:`）/ `:71-92`（`stopGraceful`）/ `:82`（100ms 轮询）/ `:87`（taskkill）；`src-main/quick-launch.ts:171`（接缝签名）/ `:29`（`POLL_MS = 100`）/ `:32`（`FORCE_EXIT_WAIT_MS = 1000`）/ `:108-115`（`onExit` 已退出立即补发的先例）；`src-main/i18n/index.ts` 导出 `t`；`src-main/i18n/dict.ts:299`（zh）/ `:641`（en）= `err.proc.spawnFail`
> 索引：[00-index.md](00-index.md) 的 G1-G5、G8-G11、K1 / K3 / K4 / K11

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 起点 = 任务 1 已提交 | `git log --oneline -1`；`git status --porcelain`；`existsSync node_modules/koffi` | HEAD = 任务 1 的 `build: 引入 koffi …` 提交；`node_modules/koffi` 与平台包都在 | ☐ |
| A2 | 全量基线（索引 G9：由主代理实测，子代理不重跑） | `npm test` | 起点 47 / 826；本任务后应为 48 / 834 | ☑（主代理实测 2026-10-13 19:25：`Test Files 47 passed (47)` / `Tests 826 passed (826)`，exit 0 —— 规格 E18。本表静态佐证：仓库现有 `*.test.ts` 恰 47 份，新增 `src-main/shell-execute.test.ts` 后为 48 份，与 plan 步骤 5 的 `Test Files 48 passed (48)` 一致；`Tests 834` = 826 + 8 属预期，尚未实测） |
| A3 | 锚点行号属实 | 读 `process.ts:32-47` / `:71-92` / `:82` / `:87`、`quick-launch.ts:171` / `:29` / `:32` / `:108-115`、`dict.ts:299` / `:641` | 与本表引用一致 | ☑（本表生成时实测：`process.ts:32-36` = `spawn(exe, args, { stdio: ["ignore","pipe","pipe"], shell: false, … })`；`:37-47` = `child.on("error")` → `console.error('PROC: …')` + `onExitCb(-1, 'PROC: ' + t('err.proc.spawnFail', { exe, err }))`；`:71-92` = `stopGraceful`（:74 幂等守卫、:82 `await new Promise((r) => setTimeout(r, 100))`、:87 `execFileSync("taskkill", ["/T","/F","-PID", String(pid)])`）；`quick-launch.ts:171` = `spawnExe(exe: string): { onExit…; stopGraceful…; isRunning… }`、:29 = `const POLL_MS = 100`、:32 = `const FORCE_EXIT_WAIT_MS = 1000`、:108-115 = 已退出立即补发；`dict.ts:299`（zh）/ :641（en）= `err.proc.spawnFail`；`src-main/shell-execute.ts` 与 `.test.ts` 均不存在） |
| A4 | plan 步骤 3 的「utf16le 先例 = `process.ts:87`」不实 | 读 `process.ts:87`；`grep utf16le` | 出处按实测更正 | ☑（本表生成时实测：`process.ts:87` 是 `execFileSync("taskkill", …)`，**没有** encoding 处理；仓库真正的 utf16le 先例是 `src-main/quick-launch-terminals.ts:96`（`buf.toString('utf16le')`）。另两处 taskkill 先例用的是 `-PID`（`process.ts:87`、`quick-launch.ts:134`），plan 的 `killTree` 写 `/PID` —— 两种写法 taskkill 都接受：按 plan 逐字 `/PID` 落笔，出处引用按实测。请主代理把这条登记进索引 K 组） |
| A5 | 类型门不覆盖测试文件（预期事实，不是缺陷） | 读 `tsconfig.main.json` | `exclude` 含 `src-main/**/*.test.ts`；无 `noUnusedParameters` | ☑（本表生成时实测：`tsconfig.main.json:15` = `"exclude": ["src-main/**/*.test.ts", "src-main/test-utils.ts"]`；`compilerOptions` 只有 target / module / moduleResolution / strict / esModuleInterop / skipLibCheck / outDir / rootDir / types / forceConsistentCasingInFileNames，无 `noUnusedParameters`、无 `noUnusedLocals` → 步骤 5 的 tsc 门不检查新测试文件的类型，测试的类型正确性只靠 vitest 跑起来守） |
| A6 | 前置任务 | 读索引清单表 | 任务 1（要 import koffi） | ☑（索引第 14 行） |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/shell-execute.ts` | 新建：`WinShellApi` + `winShell` + `launchShellExe` + `ShellExecProcess` | 只这一个模块；不 import `process.ts`、不改 `main.ts`（接线在任务 3） | ☐ |
| B2 | `src-main/shell-execute.test.ts` | 新建：规格 §7.1 的 8 条（7 条假接缝 + 1 条真接缝冒烟） | 既有任何测试文件一字不改 | ☐ |
| B3 | `src-main/i18n/dict.ts` | zh 在 :299 之后插一行、en 在 :641 之后插一行（**先改行号大的 en，再改 zh**） | 只两条键，其余词典一字不动；不登记 `err-keys.ts` 的 `IPC_ERROR_KEYS`。**必须与本任务同一提交**（索引 K15）：实现里的字面量调用点会让 `key-coverage.test.ts:117-129` 在缺键时报红 | ☐ |
| B4 | 其余全部文件 | 不改 | `main.ts` / `quick-launch.ts` / `process.ts` / `src/App.vue` / `src/modules/*` / `quick-launch-terminals.ts` / `package.json` / `electron-builder.yml`（任务 1 已改完）都不动 | ☐ |

## C. 接口契约

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `WinShellApi` 七个方法逐字：`shellExecute(file: string, nShow: number): { ok: boolean; handle: unknown; win32Error: number }`、`pidOf(handle): number`、`isAlive(handle): boolean`、`exitCodeOf(handle): number`、`terminate(handle, code): boolean`、`close(handle): void`、`killTree(pid: number): boolean` | 规格 §6.2 | ☐ |
| C2 | `export const winShell: WinShellApi` —— 普通对象、方法内惰性 `koffi.load`（首次调用才加载，测试替换属性时不必碰 koffi） | 规格 §6.2 / plan 步骤 3 | ☐ |
| C3 | `export function launchShellExe(api: WinShellApi, exe: string): ShellExecProcess`：构造即启动，失败抛 `PROC:` | 规格 §6.2 | ☐ |
| C4 | `class ShellExecProcess { readonly pid: number; onExit(cb); isRunning(); stopGraceful(timeoutSecs): Promise<void>; drainExit(): number \| null }` | 规格 §6.2 | ☐ |
| C5 | `ShellExecuteExW` 取值逐字：`cbSize = koffi.sizeof(SHELLEXECUTEINFOW)`（x64 = 112）、`fMask = 0x40 \| 0x04`、`lpVerb = null`（**不是 `"runas"`**）、`nShow = 1`、`lpParameters = null`、`lpDirectory = null` | 规格 §6.3 / 索引 G4 / K3 / K4 | ☐ |
| C6 | koffi 声明逐字：`koffi.struct('SHELLEXECUTEINFOW', { cbSize:'uint32', fMask:'uint32', hwnd:'void *', lpVerb:'str16', lpFile:'str16', lpParameters:'str16', lpDirectory:'str16', nShow:'int', hInstApp:'void *', lpIDList:'void *', lpClass:'str16', hkeyClass:'void *', dwHotKey:'uint32', hIcon:'void *', hProcess:'void *' })` + `koffi.load('shell32.dll').func('bool ShellExecuteExW(SHELLEXECUTEINFOW *psei)')`；**不能把 `'struct'` 当类型名**（实测 `Unknown or invalid type name 'struct'`） | plan 步骤 3 / 规格 E13 | ☐ |
| C7 | `koffi.load('kernel32.dll')` 取 `GetProcessId` / `WaitForSingleObject` / `GetExitCodeProcess` / `TerminateProcess` / `CloseHandle` / `GetLastError`；`GetLastError` 必须在 `ShellExecuteExW` 返回 false 后**立刻**取，中间不插别的 Win32 调用 | plan 步骤 3 / 规格 §6.5 | ☐ |
| C8 | 抛错文案：`win32Error === 1223` → `'PROC: ' + t('err.proc.uacCancelled', { exe })`；其他 `ok === false` → `'PROC: ' + t('err.proc.spawnFail', { exe, err: 'win32=' + GetLastError() })`；调用点必须是**字面量** key | 规格 §6.5 / 索引 G5 | ☐ |
| C9 | 轮询 `setInterval(…, 100)`；退出分支必须 `clearInterval` + `api.close(handle)` + 只触发一次 `onExit`；`stopGraceful` 五步（`killTree` → 每 100ms 轮询到 timeoutSecs → `terminate(handle, 1)` → 再等 1000ms → `stopping` 幂等） | 规格 §6.4 / §6.7 / plan 步骤 3 | ☐ |
| C10 | `killTree` = `spawnSync('taskkill', ['/T','/F','/PID', String(pid)], { windowsHide: true, encoding: 'utf16le' })` → `status === 0` | plan 步骤 3（出处按 A4 更正） | ☐ |
| C11 | 返回给调用方的形状 = `QlDeps.spawnExe` 的返回类型逐字 + `pid`（实测 `quick-launch.ts:171`） | 规格 §6.2 / 索引 G3 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败的测试（8 条，见 E1-E8） | — | 用例落盘（假 `WinShellApi` 用 `vi.fn()`，句柄用 `{ id: 'h1' }` 代替真 `HANDLE`） | ☐ |
| D2 | 步骤 2：验证红 | `npx vitest run src-main/shell-execute.test.ts` | FAIL —— `Failed to load ... shell-execute`（模块不存在）；输出贴进本表 J 段 | ☐ |
| D3 | 步骤 3：实现 `src-main/shell-execute.ts` | — | 见 C1-C11（含「踩过的坑」逐条照做） | ☐ |
| D4 | 步骤 4：定向绿 | `npx vitest run src-main/shell-execute.test.ts` | PASS，8 条全绿（`Tests 8 passed (8)`） | ☐ |
| D5 | 步骤 5-1：类型门 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出、exit 0 | ☐ |
| D6 | 步骤 5-2：全量 | `npm test` | `Test Files 48 passed (48)` / `Tests 834 passed (834)`（= 基线 826 + 8，全在新文件）；**先处理 G3 的 i18n 冲突** | ☐ |

## E. 必须钉住的行为断言（规格 §7.1 的 8 条逐条；「变异」列 = 靠什么变异测试证明它有牙 + 预期红因，只写预期，实现时在 J 段取证）

| # | 断言 | 出处 | 变异取证（预期） | ✓ |
|---|---|---|---|---|
| E1 | 启动成功：`launchShellExe(api, 'E:\\QiYou\\QiYou.exe')` → `pid === 4242`、`isRunning()` 为真、`pidOf` 收到 `shellExecute` 返回的那个句柄 | 规格 §7.1-1 | 变异：把 `pidOf` 的实参换成别的（或把 `pid` 写死 0）→ 预期红因 `expected "spy" to be called with arguments: [ { id: 'h1' } ]` / `expected 0 to be 4242` | ☐ |
| E2 | 退出只上报一次：`isAlive` 第二次起返回 `false`、`exitCodeOf` 返回 7 → `onExit` 收到 `7` 且**只一次**；`close` 被调用；再等 300ms 不会有第二次回调（定时器已清） | 规格 §7.1-2 / §6.4 / §9-R6 / 索引 R5 | 变异：删掉 `clearInterval` → 预期红因 `expected "spy" to be called 1 times, but got 2 times`；删掉 `api.close(handle)` → 预期红因 `expected "spy" to have been called at least once, but it was never called` | ☐ |
| E3 | UAC 取消：`{ ok: false, handle: null, win32Error: 1223 }` → `expect(() => launchShellExe(api, EXE)).toThrow(/^PROC: /)` 且消息含 `t('err.proc.uacCancelled', { exe })`；`pidOf` / `isAlive` 均未被调用（不进入轮询、无定时器残留） | 规格 §7.1-3 / §6.5 / 索引 R1 | 变异：删掉 1223 分支（统一走 `err.proc.spawnFail`）→ 预期红因 `expected 'PROC: E:\\QiYou\\QiYou.exe 启动失败: win32=1223' to contain 'E:\\QiYou\\QiYou.exe 已取消管理员权限请求'`；去掉 `'PROC: '` 前缀 → 预期红因 `expected '…' to match /^PROC: /` | ☐ |
| E4 | 其他失败：`win32Error: 2` → 消息含 `t('err.proc.spawnFail', { exe, err: 'win32=2' })` | 规格 §7.1-4 / §6.5 | 变异：把 `err` 写成裸码 `'2'`（漏 `win32=`）→ 预期红因 `expected '… 启动失败: 2' to contain '… 启动失败: win32=2'`；把 key 误写成 `err.proc.uacCancelled` → 含译文断言同样红 | ☐ |
| E5 | 提权进程停止兜底：`killTree` 返回 `false`（规格 E9）→ `stopGraceful(0)` 后 `terminate` 被调用且**第二参数为 1** | 规格 §7.1-5 / §6.7 第 3 步 / E9 / E10 / 索引 R2 | 变异：写成 `terminate(handle, 0)` → 预期红因 `expected "spy" to be called with arguments: [ { id: 'h1' }, 1 ]`；删掉兜底 → 同一断言以 never called 红 | ☐ |
| E6 | 非提权进程不多此一举：`killTree` 返回 `true` 且 `isAlive` 随即 `false` → `terminate` **未**被调用 | 规格 §7.1-6 / 索引 R3 | 变异：无条件 `terminate` → 预期红因 `expected "spy" to not be called at all, but actually been called 1 times`。（真机侧「不多弹一次 UAC」单测抓不到，靠 C5 的 `lpVerb = null` 源码逐字 + 真机清单第 4 步守） | ☐ |
| E7 | `stopGraceful` 幂等：连调两次 → 第二次立即返回（`killTree` 只被调用一次） | 规格 §7.1-7 / §6.7 第 5 步；先例 `process.ts:74`（实测） | 变异：去掉 `stopping` 标志 → 预期红因 `expected "spy" to be called 1 times, but got 2 times` | ☐ |
| E8 | 真接缝冒烟：`winShell.shellExecute('Z:\\\\no-such-dir\\\\no-such.exe', 1)` → `ok === false`（不锁具体错误码）；同时证明「打包环境之外 koffi 绑定可用」 | 规格 §7.1-8 / E12 | 这条**不守** `fMask` 取值（去掉 `0x04` 仍返回 `ok=false`）→ 取值的牙在 C5 / C6 的源码逐字核对与真机清单第 3 步（不弹 Shell 自带错误框）；本条只在「真抛异常 vs 返回 ok=false」处有牙：把实现改成 `throw` → 预期红因未捕获异常 / `TypeError`，用例直接红 | ☐ |

## F. 本任务相关的硬约束（索引 G 组子集）

| # | 约束 | 索引 | ✓ |
|---|---|---|---|
| F1 | 只新建 B1 / B2 两个文件 | G1 | ☐ |
| F2 | 不改 `process.ts`、不改 `quick-launch.ts` 任何可执行语句、不改 `main.ts` / 渲染端 | G2 | ☐ |
| F3 | 返回形状逐字 = `QlDeps.spawnExe`（`quick-launch.ts:171`）+ `pid` | G3 | ☐ |
| F4 | Win32 取值逐字（`fMask`、`lpVerb = null`、`nShow = 1`、`cbSize`、`lpParameters` / `lpDirectory` = null） | G4 / K3 / K4 | ☐ |
| F5 | 前缀只用 `PROC:`；新键只有 `err.proc.uacCancelled`（占位符只有 `{exe}`）；调用点必须字面量 `t('…')` | G5 | ☐ |
| F6 | 命令口径：定向 `npx vitest run <路径>`、类型 `npx tsc -p tsconfig.main.json --noEmit`、全量 `npm test` | G8 | ☐ |
| F7 | 计数 = 基线 + 8（48 / 834），任何既有用例减少都不算过 | G9 / K11 | ☐ |
| F8 | 不扩范围：不做提权进程的进程树终止、不加参数 / cwd、不加提权额外日志、不做 manifest 检测 | G11 / 规格 §5 | ☐ |
| F9 | 源码零中文字面量：`no-hardcoded.test.ts:10` 的白名单只有 `src-main/i18n/dict.ts`（中文注释可以，字符串字面量不行） | G5 / R6 | ☐ |
| F10 | 子代理不 `git add`、不 commit（H 段归主代理） | G10 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/shell-execute.test.ts` | `Tests 8 passed (8)`，exit 0 | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无输出、exit 0（注意 `tsconfig.main.json:15` 排除 `*.test.ts`，见 A5） | ☐ |
| G3 | `npx vitest run src-main/i18n/key-coverage.test.ts` —— 调用点与词典键的双向覆盖 | 全绿。**排序已定（索引 K15）**：两条词典键随本任务落地（见 B3 / plan 任务 2 步骤 2b），所以 `t('err.proc.uacCancelled', { exe })` 的调用点与键同一提交出现，不会出现「有调用点、无键」的红 | ☐ |
| G4 | `npm test` | `Test Files 48 passed (48)` / `Tests 834 passed (834)`，exit 0；「无减少」按索引 K11 的算术判据 | ☐ |
| G5 | `npx vitest run src-main/i18n/dict.test.ts src-main/i18n/key-coverage.test.ts src-main/i18n/no-hardcoded.test.ts` | 全绿（若 G3 未提前处理，`key-coverage` 第一条必红，红因见 G3） | ☐ |
| G6 | `git diff --name-only` | 恰为三个文件：`src-main/shell-execute.ts`、`src-main/shell-execute.test.ts`、`src-main/i18n/dict.ts`（索引 K15）；不含 `main.ts` / `quick-launch.ts` / `process.ts` | ☐ |

## H. 提交门（**由主代理在验收通过后执行**；子代理不 `git add`、不 commit —— 索引 G10）

| # | 项 | 命令 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 = 三个文件（plan 步骤 6 逐字，含词典键 —— 索引 K15） | `git add src-main/shell-execute.ts src-main/shell-execute.test.ts src-main/i18n/dict.ts` | ☐ |
| H2 | commit message 逐字（plan 步骤 6） | `git commit -m "feat(main): shell-execute.ts —— ShellExecuteEx 提权启动与句柄生命周期，含 err.proc.uacCancelled 词典键（规格 §6.2-§6.7 / §6.5）"` | ☐ |
| H3 | 勾完整性门：本表 `裸☐=0` 且 `I段 -[ ]=0`，退出码 0 | `node .superpowers/sdd/2026-10-13-quick-launch-elevated-exe/tick-census.mjs` | ☐ |

## I. 完成判据

- [ ] B1-B4 / C1-C11 / D1-D6（含步骤 2b 的两条词典键）/ E1-E8 / F1-F10 / G1-G6 全部成立并落勾（跨任务排序已按索引 K15 定死）
- [ ] J 段有真实命令与真实输出（含 D2 的红输出、D4 的 8 条绿输出、E1-E8 的变异取证）
- [ ] H1-H3 由主代理在验收通过后执行

## J. 执行记录（命令 + 真实输出摘要）

| 命令 / 动作 | 真实输出摘要 | 判定 |
|---|---|---|
| （实现时填） | | |
