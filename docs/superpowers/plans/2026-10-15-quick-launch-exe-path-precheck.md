# 快捷启动「可执行程序」启动前预检 实现计划

> 规格：`docs/superpowers/specs/2026-10-15-quick-launch-exe-path-precheck.md`（下文 §n 全部指它）。
> 执行载体：`subagent-driven-development`（一个任务 = 一个子代理，串行按任务号），任务内部 TDD。
> 分支：`feat/quick-launch`（当前分支，HEAD `6153a87`）。要另起 `fix/ql-exe-path-precheck` 请在「开始实现」时说一声。
> 基线（§3-P8，实测）：`npm test` → `Test Files 52 passed (52)`、`Tests 901 passed (901)`，exit 0。

## 全局约束

- **G1 错误前缀**只用既有五种（前置规格索引 G7；`src-main/quick-launch-config.ts:22`、`quick-launch.ts:12` 的口径）。本次只写 `PROC: `，不新增前缀。
- **G2 词典**只新增 `err.proc.exeNotFound` 一个键（zh `src-main/i18n/dict.ts:301` 之后、en `:645` 之后，§6.3 逐字）。其余文案一律复用既有键。
- **G3 放行路径逐字节不变**：`fMask=0x44`、`nShow=1`、`lpDirectory=null`、`lpVerb` 仍由 `admin` 决定（前置规格 §6.3 / §6.9）；交给 Shell 的 `lpFile` 仍是用户填的**原样字符串**（§6.1 末段 / 索引 K1）。
- **G4 不动**：`src-main/ql-elevated.ts:110-115`（§5-1）、`src-main/process.ts`、llama-server 启动路径、`src/App.vue:456-482`、`src/modules/QuickLaunch*.vue`、`src-main/main.ts:1161-1170`（对话框过滤）、`src-main/shell-execute.ts:205` 的 1223 分支本体。
- **G5 每个任务的收尾门**：`npx tsc --noEmit -p tsconfig.main.json` 干净 + 该任务定向测试绿 + `npm test` 全量绿。（仓库根只有 `tsconfig.main.json`，没有 `tsconfig.json` —— 索引 K27）
- **G6 i18n 三门**（`key-coverage.test.ts` / `dict.test.ts` / `no-hardcoded.test.ts`）任何任务后都不得变红；新代码的字面量里不得有汉字。
- **G7 不新增依赖**：只用内置 `node:fs` / `node:path`；`package.json` 一字不动。
- **G8 子代理不 `git add`、不 commit**；改动留在工作区等验收（AGENTS.md 工作流第 4 步）。
- **G9 只改该任务 B 段列出的文件**，越界即不勾。

## 审查重点（Review Focus）

| 编号 | 重点 | 钉住的任务与测试 |
|---|---|---|
| RF1 | 「不调 Shell」是这次改动的全部价值：不弹系统错误框、不阻塞主线程（P1 实测 6.1–38.9s）。自动化里唯一的牙是「假接缝 `shellExecute` 未被调用」 | 任务 1 `precheck_blocks_before_the_shell_is_called`；任务 2 `exe_path_not_found_never_reaches_the_shell` 断言 spy 计数 0 |
| RF2 | 裸名不得误杀（P10：`notepad.exe` 今天能起） | 任务 1 `existing_exe_and_bare_name_through_PATH_are_launchable`；任务 2 既有 `:330-350` / `:381-416` 的断言一字不改 |
| RF3 | 1223 分支不被削弱：真 UAC 取消仍报 `err.proc.uacCancelled`（P2） | 任务 1 改写 `:352-377`（条目 exe 换成真存在的 `notepad.exe`，假接缝仍返回 1223） |
| RF6 | **别名不得误杀**：WindowsApps 的 app execution alias（`mspaint.exe` / `python.exe` / `code.exe`）今天能被 Shell 起（P13），只认普通文件的预检会把它们判成「不存在」 | 任务 1 `app_execution_alias_in_PATH_is_launchable`（夹具不在时跳过，P15）+ 真机门 §7.2-9 |
| RF4 | 放行时实参逐字不变（`verb` / `nShow` / `parameters`） | 任务 1 既有 `verb_runas_is_passed_through_to_the_shell` / `no_opts_keeps_verb_and_parameters_null` 在夹具换成 `process.execPath` 之后仍绿、断言不改 |
| RF5 | 三份文档同步：前置规格 §6.5 两行表 + §9-R8 与代码同一 commit（§8-K3） | 任务 1 步骤 8 + 该任务 H 段的暂存范围含那份前置规格 |

## 文件结构

| 文件 | 动作 | 任务 |
|---|---|---|
| `src-main/shell-execute.ts` | 改（新增 `isLaunchableExe`；`launchShellExe` 开头加门） | 1 |
| `src-main/i18n/dict.ts` | 改（zh `:301` 后、en `:645` 后各一行） | 1 |
| `src-main/shell-execute.test.ts` | 改（`:12` 夹具 + 5 条新用例） | 1 |
| `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md` | 改（§6.5 两行表、§7.1-4 的 `win32Error=2` 假设、§9-R8） | 1 |
| `src-main/ipc-ql.test.ts` | 改（只一行：`:353` 的 exe 换成真存在的 `notepad.exe`） | 1 |
| `src-main/ipc-ql.test.ts` | 改（新增一条用例） | 2 |

---

### 任务 1：`isLaunchableExe` 预检 + 词典键 + `launchShellExe` 门

**改什么**：§6.1 / §6.2 / §6.3。先写失败测试，再实现；同一提交里同步前置规格（§8-K3）。

- [ ] **步骤 0：起点核对**：`shell-execute.ts:7-9`（import 段）、`:197-212`（`launchShellExe`，`:205` 的 1223 分支）、`:84-107`（真接缝，**不改**）；`dict.ts:300-301`（zh）、`:644-645`（en）；`shell-execute.test.ts:12`（`EXE` 夹具）、`:49-116`（用例 1-4）、`:174-199`（两条 verb 用例）。
- [ ] **步骤 1：先写失败测试**（`src-main/shell-execute.test.ts`），用例名逐字：
  - `missing_absolute_path_is_not_launchable` —— `'Z:\\no-such-dir\\no-such.exe'` 与 `path.resolve('no-such-zzz-<随机后缀>.exe')` → `false`
  - `directory_and_non_exe_file_are_not_launchable` —— `process.cwd()`（真实目录，P6 同型）与本仓 `package.json` → `false`
  - `existing_exe_and_bare_name_through_PATH_are_launchable` —— `process.execPath` → `true`；把 `path.dirname(process.execPath)` 前置进 `process.env.PATH` 后用 basename 裸名 → `true`；`finally` 里恢复 `process.env.PATH`
  - `precheck_blocks_before_the_shell_is_called` —— `launchShellExe(api, 'Z:\\no-such-dir\\no-such.exe')` 抛错以 `PROC: `开头、含 `t('err.proc.exeNotFound', { exe })`，且 `api.shellExecute` / `pidOf` / `isAlive` **均未被调用**（RF1）
   - `app_execution_alias_in_PATH_is_launchable` —— `PATH` 里的 `mspaint.exe`（WindowsApps 的 app execution alias，P13/P14）→ `true`；该别名不在 `PATH` 时 `it.skipIf` 跳过并注释指向真机门 §7.2-9（P15：`symlinkSync` 造不出夹具，`EPERM`）（RF6）
  - 夹具 `:12` 的 `EXE` 改为 `process.execPath`（机器无关）。用例 1-8 与两条 verb 用例的断言**一字不改**（RF4）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/shell-execute.test.ts` → 5 条新用例失败（`isLaunchableExe is not a function`；预检门不存在 → `shellExecute` 被调用）。
- [ ] **步骤 3：加词典两行**（先改行号大的 en `:645` 之后，再改 zh `:301` 之后，避免行号漂移）：逐字见 §6.3。
- [ ] **步骤 4：实现 `isLaunchableExe`**（§6.1 的解析 1-4 + 判定 1-3）。可访问性判定用 `fs.openSync(候选, 'r')` + `fs.closeSync`，**不用** `fs.accessSync`（P12：它对 ACL 是假阴性）。只用 `node:fs` / `node:path`；解析步骤不导出。判定① 用 `fs.lstatSync`，并对 `isSymbolicLink()` 的候选（app execution alias 等重解析点）**跳过**可访问性判定（§8-Q13 / P13 / P14）——否则 `mspaint.exe` / `python.exe` / `code.exe` 会被误杀成「不存在」。
- [ ] **步骤 5：加预检门**（§6.2，在 `api.shellExecute` 之前）。`:205` 的 1223 分支与 `fMask` / `nShow` / `lpDirectory` 一字不动。
- [ ] **步骤 6：改 `ipc-ql.test.ts` 的**两处**同一字面量**（`:353` 条目值 + `:371` 的 `t('err.proc.uacCancelled', { exe })` 占位值；只改一处会红在 `:371`，索引 K10）：`exe: 'no-such-exe-zzz.exe'` → `exe: 'notepad.exe'`（真存在 → 预检放行），其余断言一字不改：假接缝仍返回 1223 → 仍断言 `err.proc.uacCancelled`（RF3）。**这条归任务 1、不归任务 2**：它是预检生效的直接后果（不存在的 exe 到不了假接缝），留着它任务 1 末尾的全量门不可能绿（索引 K10）。
- [ ] **步骤 7：跑绿 + G5 + G6**：定向 `Tests 15 passed (15)`（原 10 + 新 5）；全量 `Test Files 52 passed (52)`、`Tests 906 passed (906)`（901 + 5）。数字对不上就在 check 表 J 段说明差在哪，不许默默过。
- [ ] **步骤 8：真机复跑取证**：`node .temp/ql-diag/missing-exe-probe.cjs missing` 仍是 `GetLastError=1223 hInstApp=2` —— 证明「Shell 自己给不出可用信息」不是猜的。输出贴 J 段。
- [ ] **步骤 9：同步前置规格** `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md`：§6.5 两行表的第一行加「且已通过 §6.1 预检」的语境；§7.1-4 的「不存在的 exe → `win32Error=2`」标注真机实测为 1223（本文 §3-P1）；§9-R8 改为「已由 2026-10-15 预检取代」并指向本文 §6.1。
- [ ] **步骤 10：Commit（主代理）**：`fix(main): 快捷启动 exe 启动前预检目标（不存在 / 非 .exe / 不可访问不调 Shell）` —— 暂存范围含步骤 9 改的前置规格（RF5）与步骤 6 改的 `src-main/ipc-ql.test.ts`（K10）。

**本任务不覆盖的**：① 「不可访问」分支没有单测（§9-R7：夹具要改 ACL，跨机器不稳；P12 说明 `fs.accessSync` 造不出这个红）→ 由任务 3 的真机门 §7.2-8 覆盖；② 别名那条分支的单测**依赖机器**（P15：`symlinkSync` 造不出夹具，`EPERM`）→ 夹具用 `PATH` 里真实存在的别名，不在时跳过，硬门归真机 §7.2-9（§9-R9 / 索引 K12）。两处 check 表里都写成 `☐（原因 + 去处）`。

---

### 任务 2：`ipc-ql.test.ts` 的端到端门

**改什么**：§7.1-7 / 8。**只改测试**（新增一条用例），生产代码已由任务 1 完成；§7.1-6 那条一行改写已随任务 1 落地（K10）。

- [ ] **步骤 0：起点核对**：`ipc-ql.test.ts:352-377`（既有「exe 启动失败」用例，`:353` 的 `no-such-exe-zzz.exe`、`:358` 替换 `winShell.shellExecute` 的既有做法）、`:330-350` 与 `:381-416`（裸名用例）、`main.ts:1057-1079`（适配器，**不改**）。
- [ ] **步骤 1：先改测试**：
  - 新用例 `exe_path_not_found_never_reaches_the_shell`：条目 exe = `'Z:\\no-such-dir\\no-such.exe'`；把 `winShell.shellExecute` 换成**计数** spy；断言 `ql_start` reject 以 `PROC: `开头、sys 日志含 `t('err.proc.exeNotFound', { exe })`、**spy 调用次数为 0**、`ql_states` 为 `{}`（不残留）
- [ ] **步骤 2：跑红取证**：任务 1 已合并，新用例直接绿 → 用变异取证的红色：临时把 `launchShellExe` 的预检门注释掉，跑 `npx vitest run src-main/ipc-ql.test.ts` → 新用例必红（会走到真 Shell、弹系统框、`shellExecute` 计数 ≥1）。把两次输出贴 J 段，然后**恢复门**。
- [ ] **步骤 3：跑绿 + G5 + G6 + 全量**：`Test Files 52 passed (52)`、`Tests 907 passed (907)`（906 + 1）。
- [ ] **步骤 4：Commit（主代理）**：`test(main): 快捷启动 exe 路径预检的端到端门（Shell 不被调用）`

---

### 任务 3：打包 + 真机清单（用户执行，§8-Q10）

- [ ] **步骤 1：跑 `build.bat`**（主代理），核对产物：`dist-release\\win-unpacked\\lms_launcher.exe` 存在；`resources\\app.asar\\dist-main\\shell-execute.js` 在包里（`npx asar list resources\\app.asar | Select-String shell-execute`）；`koffi` / `@koromix` 仍在 `app.asar.unpacked`。
- [ ] **步骤 2：把 §7.2 的 9 条清单逐字交给用户**，同时交前置 feature 未收尾的真机项（`docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe/task-04-packaged-realmachine.md` 的 E1-E7、`docs/superpowers/checks/2026-10-14-quick-launch-admin/task-09-packaging-realmachine.md` 的真机门）。**不得用「自动化已过」代替这一条。**
- [ ] **步骤 3：等回报**，逐条把「通过 / 不通过 + 现象」填进本任务 check 表 J 段。命中 §9-R1（App Paths 裸名，如 `winword.exe`）时按该行回退口径处理并**同一 commit** 同步 spec / plan / check 表。
- [ ] **步骤 4：Commit（主代理）**：`docs: 快捷启动 exe 预检的真机门清单与回报`
