# 任务 1 简报（从 spec / plan 逐字抽取，勿改）

> 本简报 = 派单输入三份里的两份全文（规格设计段 + 计划任务段）。第三份是 check 表：
> `docs/superpowers/checks/2026-10-15-quick-launch-exe-path-precheck/task-01-exe-precheck-gate.md`（必须逐行执行并把命令与真实输出填进它的 J 段）。
> 完整规格：`docs/superpowers/specs/2026-10-15-quick-launch-exe-path-precheck.md` · 完整计划：`docs/superpowers/plans/2026-10-15-quick-launch-exe-path-precheck.md`

---

## 2 根因

**`GetLastError() === 1223` 不是「用户在 UAC 点了否」的专属信号。** `src-main/shell-execute.ts:204-209` 把它当作唯一判据；实测**所有**失败类都返回 1223（§3-P1…P5），因为 Shell 在弹自己的错误框、用户点「确定」之后，把这次操作记为 *cancelled*（`ERROR_CANCELLED`）。真正的失败类别在 `SHELLEXECUTEINFO.hInstApp` 里（文件不存在 = 2 = `SE_ERR_FNF`；无效驱动器 / ACL 拒绝 / UAC 点否 = 5 = `SE_ERR_ACCESSDENIED`；成功 > 32），而我们的接缝 `src-main/shell-execute.ts:105` **只回读 `hProcess`，把 `hInstApp` 丢弃了** —— 分类没有料。

所以这是**同一个缺陷的两面**，不是两个缺陷：

1. 判据本身错（1223 撞码）；
2. 该场景本不该走到 Shell：目标不存在时 Shell 会弹系统框并把主线程卡死（实测 6.1–38.9s，§3-P1/P4），我们的日志要等用户点「确定」才出现（前置规格 §9-R8 当时选择「接受」）。

**spec 层面也是错的**：前置规格 §6.5 定的判据就是 `GetLastError`（`2026-10-13-quick-launch-elevated-exe-design.md:153-154`），其 §7.1-4 的单测假设「不存在的 exe → `win32Error=2`」（同文件 `:220`）。那个 `2` 从未在真机上证过；真机给的是 1223（§3-P1）。单测全部注入假 `winShell`，所以一直是绿的。

现状调用链：

| 环节 | 位置 |
|---|---|
| 卡片 [启动] → `ql_start` → `QuickLaunchManager.start()` 的 exe 分支 | `src-main/quick-launch.ts:293-297`（`:294` trim、`:295` 空值 → `VALIDATION:`、`:297` 调 `deps.spawnExe(exe)`） |
| 生产侧适配器 | `src-main/main.ts:1057-1079`（`spawnExeProcess`），接线 `:1089-1092` |
| 实际启动与失败分类 | `src-main/shell-execute.ts:197-212`（`launchShellExe`），`:205` 的 1223 分支 |
| 真 Win32 接缝 | `src-main/shell-execute.ts:84-107`（`winShell.shellExecute`），`:104` 取 `GetLastError`、`:105` 只读 `hProcess` |
| 日志落地 | `src-main/main.ts:1071`（`emitLog('[lms_launcher] ' + e.message, 'sys')`） |
| 渲染端对 `ql_start` 被拒的处理 | `src/App.vue:456-482`（`catch` → `clearQlState` 回落绿 [启动]，不显示原因） |
| 同一判据的第二份拷贝（本文不改，§5-1） | `src-main/ql-elevated.ts:110-115`（`hostStartError`） |

## 3 现状取证（本机实测 2026-10-15，探针 `.temp/ql-diag/missing-exe-probe.cjs`，日志 `.temp/ql-diag/missing-exe-probe.log`，`.temp/` 在 gitignore 内）

探针与生产取值逐字一致：`fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI = 0x44`、`hwnd = null`、`lpDirectory = null`、`nShow = 1`，只换 `lpVerb` 与 `lpFile`。

| 编号 | 场景 | 真实输出（原样） |
|---|---|---|
| P1 | `E:\V2rayN\no-such-v2ray.exe`，`lpVerb=null`（**不勾管理员**，即用户这次的情形） | `ok=false elapsedMs=6134 GetLastError=1223 hInstApp=2 hProcess=null` —— 弹 Shell 系统框，线程被卡 6.1s |
| P2 | `C:\Windows\System32\notepad.exe`，`lpVerb='runas'`，人在 UAC 点「否」 | `ok=false elapsedMs=1329 GetLastError=1223 hInstApp=5 hProcess=null` |
| P3 | 同 P1 的路径，`lpVerb='runas'`（勾管理员 + 路径不存在） | `ok=false elapsedMs=6901 GetLastError=1223 hInstApp=2 hProcess=null` |
| P4 | `Z:\no-such-dir\no-such.exe`（无效驱动器），`lpVerb=null` | `ok=false elapsedMs=38850 GetLastError=1223 hInstApp=5 hProcess=null` |
| P5 | **存在**的 `.exe`，但 ACL 拒读执行（`icacls <文件> /deny "<用户>:RX"`） | `ok=false elapsedMs=3864 GetLastError=1223 hInstApp=5 hProcess=null` |
| P6 | 填的是**存在的目录**（`D:\Dev\Projects\lms_launcher\.temp`），`lpVerb=null` | `ok=true elapsedMs=55 GetLastError=0 hInstApp=42 hProcess=null` —— Shell 成功（开资源管理器），且**没有进程句柄** |
| P7 | 对照：存在但无文件关联的 `.xyz` | `ok=true elapsedMs=226 GetLastError=0 hInstApp=42`（前置规格 §3-E19 同一条，此处复现） |
| P8 | 基线测试 | `npm test` → `Test Files 52 passed (52)`、`Tests 901 passed (901)`，exit 0（2026-10-15 22:56） |
| P9 | 「选程序」对话框的 `.exe` 过滤**已存在** | `src-main/main.ts:1161-1170`（`filters: [{ extensions: ['exe'] }]`），测试 `src-main/ipc-ql.test.ts:761-773` 已钉住 → 用户那条错路径来自手输或旧构建 |
| P10 | 现有用例依赖**裸名**写法 | `src-main/ipc-ql.test.ts:331`、`:382-383`、`:397` 用 `exe: 'notepad.exe'`（Shell 按 PATH 解析，今天能起）；`:353` 用 `exe: 'no-such-exe-zzz.exe'`。→ 预检若只按 `existsSync` 原样判定会**误杀**裸名 |
| P11 | 词典既有键 | `err.proc.spawnFail`（zh `src-main/i18n/dict.ts:300` / en `:644`，占位符 `{exe}{err}`）、`err.proc.uacCancelled`（`:301` / `:645`，`{exe}`）。字面量键与占位符由 `src-main/i18n/key-coverage.test.ts` 双向守护；源码不得出现中文字面量（`no-hardcoded.test.ts`） |
| P12 | `fs` 侧能不能看出 ACL 拒绝（`.temp/ql-diag/fs-access-probe.cjs`：对 `notepad.exe` 的副本 `icacls /deny "<用户>:RX"`，再 `/reset`） | 拒绝态：`R_OK / W_OK / X_OK / F_OK 全是 ACCESS-OK`（四个全过 = **假阴性**）、`statSync isFile=true`、`openSync(p, 'r') = EPERM`；`/reset` 之后 `openSync = OPEN-OK`。→ libuv 的 `access()` 在 Windows 上只看 `FILE_ATTRIBUTE_READONLY`，**不读 ACL**；可访问性判定只能用 `fs.openSync(候选, 'r')` |

**结论（P1 vs P2）**：`GetLastError` 在「路径不存在」与「真 UAC 取消」两类里同为 1223，无法区分；`hInstApp` 能区分「文件不存在（2）」与「UAC 点否（5）」，但**不能**区分「UAC 点否（5）」与「无效驱动器 / ACL 拒绝（5）」（P2 vs P4/P5）—— 所以单靠 `hInstApp` 也不够，必须把「目标本身不可用」这一类挡在 Shell 之前。

---

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

---

## 6 设计

### 6.1 预检口径（§8-Q4 / Q5 / Q11 / Q12）

新增纯函数（`src-main/shell-execute.ts`，只依赖 `node:fs` / `node:path`，不碰 koffi）：

```
/** 启动前预检：目标必须能解析到一个「存在、是普通文件、扩展名 .exe、可读」的路径。
 *  返回 false 时调用方不得调 Shell（§6.4）。 */
export function isLaunchableExe(exe: string): boolean;
```

解析（内部步骤，不导出）：

1. `path.isAbsolute(exe)`（含盘符或 UNC）→ 候选 = `exe` 原样。
2. 否则若含路径分隔符（相对路径）→ 候选 = `path.resolve(exe)`（按主进程 cwd；与 `lpDirectory=null` 时 Shell 的解析口径一致，`src-main/shell-execute.ts:95`）。
3. 否则（裸名）→ 按 `process.env.PATH` 的目录**顺序**查找；若 `path.extname(exe) === ''`，同一目录内先试原名再试 `exe + '.exe'`。第一个「存在且是普通文件」的即候选。
4. 无候选 → 预检失败。

判定（对候选）：

1. `fs.statSync` 成功且 `isFile()`；
2. `path.extname(候选).toLowerCase() === '.exe'`（大小写不敏感，`.EXE` 放行）；
3. `fs.openSync(候选, 'r')` 成功并随即 `fs.closeSync(fd)`（P5：ACL 拒读时 Shell 也失败、同样回 1223）。**不用** `fs.accessSync(候选, R_OK)` —— P12 实测它对 ACL 拒绝是假阴性。

三项任一不满足 → `false`。**放行时交给 Shell 的实参仍是用户填的原样字符串 `exe`**，不替换成解析后的绝对路径（索引 K1）。

### 6.2 落点（§8-Q8）

`launchShellExe`（`src-main/shell-execute.ts:197`）在调用 `api.shellExecute` **之前**：

```
if (!isLaunchableExe(exe)) {
  throw new Error('PROC: ' + t('err.proc.exeNotFound', { exe }));
}
```

- 一处盖住 exe 类型的全部启动路径（`main.ts:1065` 是 `launchShellExe` 的唯一生产调用方）；提权宿主那条走 `winShell.shellExecute`（`src-main/ql-elevated.ts:141`），不经此处，不受影响。
- 抛错在 `api.shellExecute` 之前 → 「假接缝里 Shell 未被调用」就是「不弹系统框、不阻塞」的牙（§7.1-4）。
- 前缀仍是 `PROC: `（前置规格索引 G7 五种前缀口径）；适配器 `src-main/main.ts:1066-1072` 的 `emitLog('[lms_launcher] ' + e.message, 'sys')` 一字不改。

### 6.3 文案与词典键（§8-Q7）

新增**一条合并文案**，zh / en 各一行，紧跟既有 `err.proc.uacCancelled` 之后（`src-main/i18n/dict.ts:301` / `:645` 之后）：

```
'err.proc.exeNotFound': '{exe} 不存在、不是 .exe 文件或不可访问',
'err.proc.exeNotFound': '{exe} does not exist, is not an .exe file, or is not accessible',
```

- 占位符只有 `{exe}`（`key-coverage.test.ts` 的占位符双向核对）。
- 三种情形（不存在 / 不是普通 `.exe` / 不可访问）共用这一条，不拆键。
- 日志行最终形状（sys 通道口径，前置规格 §8-K8）：`[lms_launcher] PROC: <用户填的 exe> 不存在、不是 .exe 文件或不可访问`。

### 6.4 与既有 1223 分支的关系

`src-main/shell-execute.ts:205` 的 `win32Error === ERROR_CANCELLED → err.proc.uacCancelled` **保留**，但语境收窄为「目标已通过 §6.1 预检、Shell 仍返回 1223」= 真 UAC 取消（P2）。前置规格 §6.5 的两行表按此改写，并删掉 §9-R8「接受 Shell 的系统错误框」这条（预检后该框在 exe 类型这条路上不再出现）—— 索引 K3。

### 6.5 渲染端与日志通道

不改。`src/App.vue:456-482` 仍只做按钮回落；原因行仍只由 `src-main/main.ts:1071` 写 sys 通道（§8-Q2 选定「只写日志区」）。

---

### 7.1 自动化（先红后绿）

`src-main/shell-execute.test.ts`：

1. `isLaunchableExe`：不存在的绝对路径（`Z:\no-such-dir\no-such.exe` 与临时目录下的 `no-such-zzz.exe`）→ `false`。
2. `isLaunchableExe`：存在的目录（P6 同型）→ `false`；存在的非 `.exe` 文件（本仓 `package.json`）→ `false`。
3. `isLaunchableExe`：`process.execPath`（必然存在的 `.exe`）→ `true`；把它的目录临时前置进 `process.env.PATH` 后用**裸名**（basename）→ `true`（P10 的「裸名不得误杀」）。
4. `launchShellExe` 预检门：不存在的绝对路径 + 假接缝 → 抛错以 `PROC: `开头且含 `t('err.proc.exeNotFound', { exe })`，且 `api.shellExecute` / `pidOf` / `isAlive` **均未被调用**。
5. 既有用例的 `EXE`（`src-main/shell-execute.test.ts:12` 的 `E:\QiYou\QiYou.exe`，机器相关）改为 `process.execPath`；用例 1-8 与两条 verb 用例的断言不变。

`src-main/ipc-ql.test.ts`：

6. 既有「exe 启动失败」用例（`:352-377`）：条目 exe 从 `no-such-exe-zzz.exe` 改为 `notepad.exe`（真存在，预检放行），假接缝仍返回 1223 → 断言仍是 `err.proc.uacCancelled`（证明 1223 分支未被削弱）。
7. 新用例：条目 exe = `Z:\no-such-dir\no-such.exe` → `ql_start` reject 以 `PROC: `开头；sys 日志含 `t('err.proc.exeNotFound', { exe })`；替换过的 `winShell.shellExecute` **一次都没被调用**（不弹系统框、不阻塞的端到端牙）；`ql_states` 不残留。
8. 既有裸名用例（`:330-350`、`:381-416`）不改断言，作为「裸名仍可用」的回归门。

回归门：`npm test` 全量绿（基线 P8 = 52 files / 901 tests，新增后只增不减）；`npx tsc --noEmit` exit 0；`key-coverage` / `no-hardcoded` 两道 i18n 硬门绿。

---

### 任务 1：`isLaunchableExe` 预检 + 词典键 + `launchShellExe` 门

**改什么**：§6.1 / §6.2 / §6.3。先写失败测试，再实现；同一提交里同步前置规格（§8-K3）。

- [ ] **步骤 0：起点核对**：`shell-execute.ts:7-9`（import 段）、`:197-212`（`launchShellExe`，`:205` 的 1223 分支）、`:84-107`（真接缝，**不改**）；`dict.ts:300-301`（zh）、`:644-645`（en）；`shell-execute.test.ts:12`（`EXE` 夹具）、`:49-116`（用例 1-4）、`:174-199`（两条 verb 用例）。
- [ ] **步骤 1：先写失败测试**（`src-main/shell-execute.test.ts`），用例名逐字：
  - `missing_absolute_path_is_not_launchable` —— `'Z:\\no-such-dir\\no-such.exe'` 与 `path.resolve('no-such-zzz-<随机后缀>.exe')` → `false`
  - `directory_and_non_exe_file_are_not_launchable` —— `process.cwd()`（真实目录，P6 同型）与本仓 `package.json` → `false`
  - `existing_exe_and_bare_name_through_PATH_are_launchable` —— `process.execPath` → `true`；把 `path.dirname(process.execPath)` 前置进 `process.env.PATH` 后用 basename 裸名 → `true`；`finally` 里恢复 `process.env.PATH`
  - `precheck_blocks_before_the_shell_is_called` —— `launchShellExe(api, 'Z:\\no-such-dir\\no-such.exe')` 抛错以 `PROC: `开头、含 `t('err.proc.exeNotFound', { exe })`，且 `api.shellExecute` / `pidOf` / `isAlive` **均未被调用**（RF1）
  - 夹具 `:12` 的 `EXE` 改为 `process.execPath`（机器无关）。用例 1-8 与两条 verb 用例的断言**一字不改**（RF4）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/shell-execute.test.ts` → 4 条新用例失败（`isLaunchableExe is not a function`；预检门不存在 → `shellExecute` 被调用）。
- [ ] **步骤 3：加词典两行**（先改行号大的 en `:645` 之后，再改 zh `:301` 之后，避免行号漂移）：逐字见 §6.3。
- [ ] **步骤 4：实现 `isLaunchableExe`**（§6.1 的解析 1-4 + 判定 1-3）。可访问性判定用 `fs.openSync(候选, 'r')` + `fs.closeSync`，**不用** `fs.accessSync`（P12：它对 ACL 是假阴性）。只用 `node:fs` / `node:path`；解析步骤不导出。
- [ ] **步骤 5：加预检门**（§6.2，在 `api.shellExecute` 之前）。`:205` 的 1223 分支与 `fMask` / `nShow` / `lpDirectory` 一字不动。
- [ ] **步骤 6：跑绿 + G5 + G6**：定向 `Tests 14 passed (14)`（原 10 + 新 4）；全量 `Test Files 52 passed (52)`、`Tests 905 passed (905)`。数字对不上就在 check 表 J 段说明差在哪，不许默默过。
- [ ] **步骤 7：真机复跑取证**：`node .temp/ql-diag/missing-exe-probe.cjs missing` 仍是 `GetLastError=1223 hInstApp=2` —— 证明「Shell 自己给不出可用信息」不是猜的。输出贴 J 段。
- [ ] **步骤 8：同步前置规格** `docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md`：§6.5 两行表的第一行加「且已通过 §6.1 预检」的语境；§7.1-4 的「不存在的 exe → `win32Error=2`」标注真机实测为 1223（本文 §3-P1）；§9-R8 改为「已由 2026-10-15 预检取代」并指向本文 §6.1。
- [ ] **步骤 9：Commit（主代理）**：`fix(main): 快捷启动 exe 启动前预检目标（不存在 / 非 .exe / 不可访问不调 Shell）` —— 暂存范围含步骤 8 改的前置规格（RF5）。

**本任务不覆盖的**：「不可访问」分支没有单测（§9-R7：夹具要改 ACL，跨机器不稳；P12 说明 `fs.accessSync` 造不出这个红）。由任务 3 的真机门 §7.2-8 覆盖，check 表里写成 `☐（原因 + 去处）`。

---
