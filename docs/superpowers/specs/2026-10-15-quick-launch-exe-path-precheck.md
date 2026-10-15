# 快捷启动「可执行程序」启动前预检目标 设计规格

> 规格即真相源（AGENTS.md「术语」SDD）。实现、验收、偏离处理都以本文为准；代码领先规格不算进步。
> 用户原话（逐字）：「[快捷启动] 卡片, 配置可执行程序类型, 不启用管理员权限, 程序路径填写不存在的 .exe 路径, 启动后, 正常弹错误窗口, 日志区的日志却是: [lms_launcher] PROC: E:\V2rayN\v2ray.exe 已取消管理员权限请求」
> 前置规格：`docs/superpowers/specs/2026-10-13-quick-launch-elevated-exe-design.md`（exe 类型走 `ShellExecuteExW`、失败分类 §6.5、风险 §9-R8）、`docs/superpowers/specs/2026-10-14-quick-launch-admin.md`（§6.9 exe 的「管理员」= `lpVerb='runas'`、§6.10 第二份文案映射）。本文修订前者的 §6.5 第一行判据与 §9-R8，其余沿用。

## 1 现象

用户回报（2026-10-15）：可执行程序类型、**不勾**「管理员」、程序路径填一个**不存在**的 `.exe` →

- 弹出一个错误窗口（用户称「正常弹错误窗口」）；
- 日志区却是：

```
[lms_launcher] PROC: E:\V2rayN\v2ray.exe 已取消管理员权限请求
```

「已取消管理员权限请求」与本次操作无关：这条路径上**根本没有 UAC**（未勾管理员、目标也不存在）。

那个「错误窗口」不是本应用的 UI：它是 Shell 自己的系统错误框（前置规格 §3-E19 / §9-R8 已取证并接受）。本应用对启动失败的分工是「渲染端只回落按钮，原因行只由主进程 sys 日志负责」（`src/App.vue:477-478`、`src-main/main.ts:1071`）。

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

## 4 目标

1. 可执行程序类型的 [启动]：目标**不存在 / 不是普通 `.exe` 文件 / 不可访问**时，**不调用 Shell**（不弹系统错误框、不阻塞主线程），日志区一行给出准确原因。
2. `err.proc.uacCancelled`（「已取消管理员权限请求」）只在**真** UAC 取消时出现。
3. 今天能正常工作的写法逐字不变：存在的 `.exe`（绝对路径）、裸名（如 `notepad.exe`，按 PATH 解析）、勾「管理员」的提权路径、[停止] 与退出上报、渲染端反馈。
4. 前置规格的 §6.5 第一行判据与 §9-R8 按本文改写（与实现同一提交），不留「代码领先 spec」。

## 5 非目标

1. **不改** `src-main/ql-elevated.ts:110-115` 那份 1223 映射：它起的是应用自己的 exe（`process.execPath`，必然存在），语境成立（§8-Q9）。
2. **不**把 `hInstApp` 加进 `WinShellApi` 接缝，也不加诊断日志（§8-Q9）。
3. **不**新增渲染端 UI / 弹窗 / 卡片错误区（§8-Q2）。
4. **不**在保存（`ql_save`）时校验路径（§8-Q6）。
5. **不改** `.exe` 过滤对话框（P9：已存在且已有测试钉住）。
6. **不动** llama-server 那条缺 `[lms_launcher] ` 前缀的 `PROC:` 行（前置规格 §8-K8 明确「另立改动」）。
7. **不**为「填目录时 Shell 成功、留下假运行态」（P6）单独设计：本文预检按 §6.1 会把目录挡掉，但不为它另立机制。

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

## 7 验收

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

### 7.2 打包真机硬门（用户执行，§8-Q10）

打包产物（`build.bat` → `dist-release\win-unpacked\`）上手工跑，逐条回报现象：

1. 新建可执行程序条目，路径填 `E:\V2rayN\no-such-v2ray.exe`，不勾管理员 → 点 [启动]：**不弹任何系统错误框**，按钮回落绿 [启动]，日志区出现 `[lms_launcher] PROC: E:\V2rayN\no-such-v2ray.exe 不存在、不是 .exe 文件或不可访问`，且该行在点击后**立即**出现（不等用户点「确定」）。
2. 同条目勾上「管理员」→ 与第 1 条同（P3 那条 1223 不再出现）。
3. 路径填一个存在的目录（如 `D:\Dev\Projects`）→ 同第 1 条的日志文案；**不**打开资源管理器窗口。
4. 路径填 `C:\Windows\System32\notepad.exe`（不勾管理员）→ 记事本正常打开，既有日志行为不变。
5. 路径填裸名 `notepad.exe` → 与第 4 条同样能起（裸名按 PATH 解析）。
6. 路径填一个 `requireAdministrator` 的 exe 并勾管理员，在 UAC 点「否」→ 日志是 `[lms_launcher] PROC: <exe> 已取消管理员权限请求`（前置规格 §7.2-3 的口径不变）。
7. 命令行类型（终端）启动 / 提权终端 / [停止]：与今天一致，无新增日志行。
8. 把某个存在的 `.exe`（自己的副本，别动系统文件）`icacls <文件> /deny "<用户>:RX"` 后填进路径 → 点 [启动] 报第 1 条那条「不可访问」文案，**不**是「已取消管理员权限请求」；验完 `icacls <文件> /reset` 还原。（这条只能真机跑：P12 说明 `fs.accessSync` 测不出 ACL，单测里造这个夹具要改 ACL、不稳，见 §9-R7）

## 8 已定口径（grill-me 逐项确认，2026-10-15）

| # | 口径 | 依据 |
|---|---|---|
| Q1 | 靠「调用前预检目标」把「路径不存在」与「UAC 取消」分开，不靠错误码 | 用户选定（P1/P2 同码；`hInstApp` 也只分得开一半：P4/P5 与 P2 同为 5） |
| Q2 | 失败反馈**只写日志区**，不新增弹窗 / 卡片错误区 | 用户选定（先选「应用内弹窗」，后改回「只写日志区」）；与 `App.vue:477-478` / `main.ts:1071` 既有分工一致 |
| Q3 | —— | 因 Q2 改回「只写日志区」而作废（弹窗覆盖范围不再适用） |
| Q4 | 预检口径：必须是**存在的普通文件**且扩展名 `.exe` | 用户选定（原话「必须是 .exe 存在才放行」）；P6 证明目录会被 Shell 判成功、留下假运行态 |
| Q5 | 只认 `.exe`：`.bat` / `.cmd` / `.lnk` / `.msi` 一并拒 | 用户选定（与对话框过滤口径一致，P9） |
| Q6 | 只在点 [启动] 时校验，保存时不拦 | 用户选定（文件可能被移动 / 删除、外部改 yaml 会绕过保存校验） |
| Q7 | 新增**一条**合并文案 `err.proc.exeNotFound` | 用户选定（不拆两条，不复用 `spawnFail` 拼接） |
| Q8 | 预检落在 `launchShellExe` 开头 | 用户选定；`main.ts:1065` 是其唯一生产调用方，提权宿主不经此处 |
| Q9 | `ql-elevated.ts:110` 那份拷贝不动；不引入 `hInstApp` | 用户选定（宿主 exe = `process.execPath` 必然存在；当前无可复现的病） |
| Q10 | 验收含打包产物真机清单 | 用户选定（这个 1223 撞码当初就是靠真机才发现，单测盖不住） |
| Q11 | 预检加可访问性检查，机制用 `fs.openSync(候选, 'r')`（**不是** `fs.accessSync` R_OK） | 用户选定「加一道可访问性检查」；P5 实测「存在但 ACL 拒读」同样回 1223、会被误报成 UAC 取消；机制按 P12 实测取 `openSync` |
| Q12 | 裸名 / 相对路径按 PATH / cwd 解析后再检，不直接拒 | 用户选定；P10 证明裸名今天能用，直接 `existsSync` 会误杀 |
| K1 | 放行时交给 Shell 的实参仍是用户原样字符串，不改写为解析后的绝对路径 | 由 Q12 推论：改写会让 `toHaveBeenCalledWith(EXE, 1)` 类断言与 Shell 语义跟着变 |
| K2 | 扩展名比较大小写不敏感；无扩展名的裸名按「补 `.exe`」再找一次 | 由 Q4 / Q12 推论：与「只认 `.exe`」一致，且 Windows 路径不区分大小写 |
| K3 | 前置规格 §6.5 两行表与 §9-R8 在实现同一提交里同步改写 | AGENTS.md「偏离 spec：先改 spec / plan / check 表（同一 commit）再改代码」 |

## 9 风险与未验证项

| # | 风险 | 处理 |
|---|---|---|
| R1 | **App Paths 不模拟**：只靠注册表 `App Paths` 解析的裸名（如 `winword.exe`）今天能被 Shell 起，本文的 PATH 查找会判「不存在」 | 已知边界，登记不修。真机若出现 → 加 `reg query` 一步，另立改动 |
| R2 | **TOCTOU**：预检通过后文件被删 / 驱动器被拔 → 仍走 Shell → 1223 → 报「已取消管理员权限请求」 | 接受（窗口极窄）。不为此把文案改中性是 Q7 / Q2 的决定 |
| R3 | **ACL「可读但不可执行」未取证**：`openSync(p, 'r')` 通过、Shell 仍可能失败（P5 只测了「拒读 + 拒执行」） | 未验证项。真机若出现，现象是 1223 → 误报 UAC 取消；届时另立改动 |
| R7 | 「不可访问」这条分支**没有单测**：夹具要改 ACL（`icacls /deny`），在 CI / 别的机器上不稳；且 P12 证明 `fs.accessSync` 造不出这个红 | 由真机门 §7.2-8 覆盖；check 表里该行写成 `☐（原因 + 去处）`，不留空 |
| R4 | 手输带引号的路径（`"E:\a.exe"`）→ 预检失败 → 报「不存在」 | 接受：对话框给的是不带引号的绝对路径；引号本就不是合法路径字符 |
| R5 | 相对路径按主进程 cwd 解析（与 Shell 的 `lpDirectory=null` 一致），不额外提示 | 接受：与今天 Shell 的行为同口径 |
| R6 | 预检把 `node:fs` / `node:path` 引入 `shell-execute.ts` | 无打包影响（内置模块）；koffi 边界不变 |
