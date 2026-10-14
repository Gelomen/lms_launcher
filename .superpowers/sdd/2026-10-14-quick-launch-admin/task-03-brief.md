任务 3 简报（从 plan 逐字抽取，勿改）

### 任务 3：可执行程序的「管理员」= `runas`

**改什么**：`WinShellApi.shellExecute` 加可选第三参（§6.9 / §6.4-3）；`launchShellExe` 透传 `verb`；`main.ts:1050-1072` 的适配器从 `qlStartContextOrThrow(...)` 取当前条目的 `admin`。

`@
shellExecute(file: string, nShow: number, opts?: { verb?: string | null; parameters?: string | null }):
  { ok: boolean; handle: unknown; win32Error: number };
export function launchShellExe(api: WinShellApi, exe: string, verb?: string | null): ShellExecProcess;
`@

- [ ] **步骤 0：起点核对**：`shell-execute.ts:14`（接口）、`:80-102`（真实现，`lpVerb: null` 在 `:87`、`lpParameters: null` 在 `:89`）、`:191-201`（`launchShellExe`）、`main.ts:1050-1072`、`main.ts:1082`（槽守卫接线，**不删**）。
- [ ] **步骤 1：先改测试**（`shell-execute.test.ts`）：`verb_runas_is_passed_through_to_the_shell`（假 api 记录入参）、`no_opts_keeps_verb_and_parameters_null`（RF2 的门）、`uac_cancelled_still_maps_to_err_proc_uacCancelled`（沿用既有用例，不改文案）。
- [ ] **步骤 2：跑红**：`npx vitest run src-main/shell-execute.test.ts`。
- [ ] **步骤 3：实现**：`:87` → `lpVerb: opts?.verb ?? null`；`:89` → `lpParameters: opts?.parameters ?? null`；`launchShellExe` 第三参透传。**其余取值逐字不动**（`fMask`、`nShow`、`lpDirectory`）。
- [ ] **步骤 4：改 `main.ts`**：`spawnExeProcess(exe, configId)` 的签名加 `admin: boolean`（或从 `qlStartContextOrThrow` 的槽里取当前 entry 的 `admin`——两种都行，选定后写进该任务 check 表的 C 段），`admin===true` 时传 `'runas'`。
- [ ] **步骤 5：`ipc-ql.test.ts` 加形状门**：保存 `admin:true` 的 exe 条目 → `ql_start` 走假 `WinShellApi` 时收到 `verb='runas'`；`admin` 缺省 → `null`。
- [ ] **步骤 6：跑绿 + G5 + G6**。
- [ ] **步骤 7：Commit（主代理）**：`feat: 可执行程序启动项的管理员开关走 ShellExecuteEx runas`

---
