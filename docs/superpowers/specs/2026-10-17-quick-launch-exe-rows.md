# 快捷启动弹窗 [程序路径] 的多行输入（[+] / [-] 逐行、按序启动多个程序） 设计规格

> 规格即真相源（AGENTS.md 硬规则 6/7）。实现、验收、偏离处理都以本文为准；代码领先规格不算进步。
> 用户原话（逐字）：「[快捷启动] 卡片 [新建/编辑启动项] 弹窗, 参考 [命令行] 类型, 可以新增和删除命令行输入框, 将 [可执行程序] 类型的 [程序路径] 也做相同修改, 在 [程序路径] 右侧的 [选择文件] 按钮 的右侧添加 [+] 和 [-] 按钮, 配置多个文件路径并启动时, 按顺序启动程序」
> 本次路线：用户在第一道门选的是**「先产出 spec + plan 文档」**——本文与 `docs/superpowers/plans/2026-10-17-quick-launch-exe-rows.md` 先 commit，此时代码一行不改。
> 前置规格与本文对它的关系：
> - `2026-10-10-quick-launch-card-design.md` §5.3（条目校验）/ §7.1（一配置一实例）/ §9.4（表单字段）——该文件已在 `b330a5c` 删除，现存载体是代码与测试，本文按**现存载体**修订（与 2026-10-17 那份规格 §8 的做法一致）。
> - `2026-10-13-quick-launch-elevated-exe` §6.2–§6.7（exe 走 ShellExecuteEx）——本文**不改**它的任何 Win32 口径，只把「一次一条」变成「N 条按序」。
> - `2026-10-14-quick-launch-admin` §6.9（`lpVerb='runas'`）——本文**不改**：开关仍在条目上，对每条路径用同一个 verb。
> - `2026-10-15-quick-launch-exe-path-precheck` §6.1–§6.2（启动前预检）——本文**扩大它的调用位置**：从「每次 `launchShellExe` 内部一次」变成「启动一条配置前对全部路径各一次」，判定函数一字不改。
> - `2026-10-17-quick-launch-cmd-rows` §5-5「**不**给 [可执行程序] 类型加多行（`exe` 只有一条路径）」——**本次明确推翻这一条非目标**（用户原话就是要做它）。那份规格的其余部分（多行命令、`\n` 落盘、`\r` 提交）不受影响。

## 1 需求

「新建/编辑启动项」弹窗在 [类型] = 「可执行程序」时有一行 [程序路径]：一个单行输入框 + 右侧一个 [选择文件] 按钮（改动前 `src/modules/QuickLaunchModal.vue:350-361`）。一条配置只能配**一个**可执行程序。

要做的是：照 [命令行] 类型已经做完的那套手法（`QuickLaunchModal.vue:311-328`），在 [选择文件] 按钮的**右侧**加 [+] / [-]——点 [+] 在当前行下方再开一个同样的路径行，只有默认那一行有 [+]，手动加出来的行右侧只有 [-]，点 [-] 删掉它自己那一行。**每一行都保留自己的 [选择文件] 按钮**（用户选定）。默认那一行本身（高度、单行不换行、按钮位置）一字不改。

「按顺序启动」的语义 = **从上到下依次发起启动，不等待前一个退出**（用户选定）。它描述的是**发起顺序**，不是「前一个退出后才起下一个」。

## 2 现状（改动前，HEAD = `8d5eec1`）

| 环节 | 位置（改动前行号） |
|---|---|
| 条目类型：`exe` 是单值字符串 | `src-main/quick-launch-config.ts:14`（`exe?: string`） |
| 加载归一：`exe` 只判 trim 后非空 | `:74-78`（`normalizeEntry` 的 exe 分支） |
| 保存校验：同上，空 → `err.ql.exeRequired` | `:97-100`（`validateEntry` 的 exe 分支） |
| 启动：一次一条，无预检循环 | `src-main/quick-launch.ts:308-327`（`start()` 的 exe 分支：`deps.spawnExe(entry.exe)` 一次） |
| 实例状态：一配置一进程 | `:219-227`（`interface Instance`，字段 `proc: ShellProcess \| ExeProcess`）、`:425-428`（`states()` 直接取那个进程的 `isRunning()`）、`:316-323`（`proc.onExit` 直接转发）、`:404-413`（`stopInternal()` 只停那一个）（锚点按 HEAD=`7008602` 实测校正，裁决 R-A2；本表原写的 `:104-115`/`:143-145`/`:330-333`/`:369-383` 是更早的偏移） |
| 生产侧 exe 适配器 | `src-main/main.ts:1076-1098`（`spawnExeProcess`）、`:1108-1111`（`deps.spawnExe` 从 `qlStartContext` 取 configId / admin） |
| 预检（单条、在 Shell 调用内部） | `src-main/shell-execute.ts:242-261`（`isLaunchableExe`，已导出）、`:272-274`（`launchShellExe` 调它，不可用 → `PROC: err.proc.exeNotFound`） |
| 提权 | `:268-280`（第三参 `verb='runas'`）、`main.ts:1028-1043`（`qlStartContext` 槽） |
| 弹窗：路径那一格 | `src/modules/QuickLaunchModal.vue:69`（`formExe` 单值）、`:115-116`（`exeError` 判据）、`:150`（回填）、`:191-194`（`pickExe` 写单值）、`:213`（保存载荷）、`:350-361`（那一格的模板） |
| 多行命令的既有手法（本次要照抄的样板） | `:74-88`（行模型 + 稳定 id + `splitCmdRows`）、`:177-187`（加/删行）、`:311-328`（同一个 `.field-cell` 内纵向排布 + `v-if="i===0"` 的 [+] / `v-else` 的 [-]）、`:499-502`（`.cmd-cell` 的 flex 列 + `.row-btn` 36px） |
| 卡片列表 | `src/modules/QuickLaunch.vue` 全文不引用 `entry.exe` / `entry.cmd`（实测 grep 0 命中）→ 列表不渲染路径 |

## 3 现状取证（本机实测 2026-10-17；日志在 `.temp/ql-exe-rows-baseline/`，`.temp/` 由 `.gitignore` 的 `.*/` 一行覆盖）

| 编号 | 场景 | 真实输出（原样） |
|---|---|---|
| P1 | 基线 | `npm test` → `Test Files 53 passed (53)`、`Tests 932 passed (932)`，exit 0，`Duration 10.62s`（20:13，留档 `.temp/ql-exe-rows-baseline/baseline.log`） |
| P2 | 生效的 lockfile / 包管理器 | `package-lock.json` mtime `2026-10-17T10:42:09Z`、`node_modules/.package-lock.json` 同一时刻 → **npm 在生效**；`pnpm-lock.yaml` mtime `2026-10-09T13:34:51Z`（陈旧遗留，`node_modules/.pnpm` 是历史混用痕迹）；`package.json` 的 scripts 全部走 `npm test` / `vitest run` / `tsc -p tsconfig.main.json` |
| P3 | 旧格式条目的真实代价 | `glob **/quick_launch.yaml` 全仓 **0 命中**（含 `dist/`、`dist-release/`）；dev 态 `dataDir()` = `process.cwd()`（`main.ts:85-92`）→ 本工作区没有任何历史 exe 条目，「不做旧值兼容」的代价为 0 |
| P4 | 预检函数已存在且已导出 | `isLaunchableExe(exe): boolean`（`shell-execute.ts:242-261`，四步判定：解析候选 → 形状 → `.exe` 扩展名（大小写不敏感，重解析点跳过可访问性）→ `openSync` 可读性）；`launchShellExe:272-274` 已在调 Shell 之前调它 → 「全量预检」**不需要新探测逻辑**，只是把同一个判定挪到循环外 |
| P5 | 停止语义可复用 | `ShellExecProcess.stopGraceful` 对已退出进程第一行就 `return`（`:196-199`）；`terminateTree` 对提权进程 `taskkill` 不可用 → 退回 `TerminateProcess`（`:202-213`）→ 「停全部」= 对每条独立调用，无需新时序、无需新常量 |
| P6 | 提权接线可复用 | `launchShellExe(api, exe, verb)` 的第三参就是逐条的（`:268-280`），`admin` 来自 `qlStartContext`（`main.ts:1028-1043`、`:1108-1111`），且该槽覆盖**一次 `start()` 的同步窗口**（该 handler 在调这两个回调之前没有 await）→ 同一次启动里调 N 次 `spawnExe` 读到的是同一个槽 |
| P7 | 退出聚合是本次唯一的新状态机 | `quick-launch.ts:316-323` 现在把 `proc.onExit` 直接转发给 `deps.onExit`；`:404-409` 的 `finalize()` 无条件 `removeInstance` + 上报（代码里没有 `onInstanceExit` 这个名字，实测无此符号）→ 多进程必须自己数「全部退出」 |
| P8 | 卡片不受影响 | `QuickLaunch.vue` 不引用 `entry.exe` / `entry.cmd`（grep 0 命中）→ 多路径不会出现在卡片行里（与 2026-10-17 规格 P9 同一结论） |
| P9 | 定高门与加行的关系 | 既有门 `modal_height_is_fixed_to_the_shell_form_height_in_both_types`（`QuickLaunchModal.test.ts:970-1010`）数的是 `.flag-grid` 的**直接子控件格** = 3；把多行放进**同一个** `.field-cell` 不增加该数——2026-10-17 规格 P6/P8 已实测：1 行 = `520×218.0`、3 行 = `520×293.3`（每行 +32px 控件高 + 6px 行距 = 38px），无横向滚动条 |
| P10 | 被否掉的落盘方案（登记，不采用） | 用户选定「`exe` 直接改成数组」。对照登记：用 `\n` 连接成单条字符串（2026-10-17 的 cmd 先例）在本机也可行——Windows 文件名不允许 `0x00-0x1F` 控制字符，`\n` 不会与路径本身撞；但它比数组多一处「路径里出现换行」的转义口径，且用户明确选了数组，故不采用 |
| P11 | AGENTS.md 的悬空引用 | `git show d989afa` → AGENTS.md `-101/+36`，删除了「术语」「工作流：任何代码改动都走这条链」「check 表：plan 的逐任务 check 表」三节；现存的第 10 行仍写「（路径与命名见下文「check 表」一节）」→ **该节已不存在**。本次据此不生成 check 表（裁决 R-13），并建议用户修掉这处引用 |

## 4 目标

1. [可执行程序] 类型的 [程序路径] 支持逐行输入多条路径：默认那一行 = 今天这一行，**一字不改**（32px 高、单行、不换行、[选择文件] 在输入框右侧）；[+] 在 [选择文件] 的**右侧**。
2. 点 [+] 在**当前所有行的下方**追加一个空路径行并聚焦它；只有默认行有 [+]，追加行只有 [-]，[-] 删的正是它自己那一行，删中间行不得把后面几行的值串位。
3. **每一行都有自己的 [选择文件] 按钮**，点了只填它自己那一行（不覆盖别的行）。
4. 一条配置存**一组**路径（有序数组），启动时**从上到下依次发起启动，不等待退出**。
5. 启动前对**全部**路径做预检：任一条不可用 → **一条都不启动**，日志与错误指出是哪条。
6. 启动过程中某条失败（UAC 点「否」/ Shell 失败）→ **停止发起后续**，已经起来的进程保持运行，错误按现有 `PROC:` 口径上报。
7. 一条配置在卡片上仍是**一行、一个按钮**：任一进程在跑 = 运行中；[停止] 把这条配置的全部进程停掉；全部退出后按钮才回落。
8. 旧写法（`exe: "C:\\a.exe"` 标量）的条目**直接失效**：进 `invalid`，卡片上不出现（已定后果，见 §7-1）。

## 5 非目标

1. **不做调序**：没有 [↑] / [↓]，没有拖拽（用户选定）。要改顺序只能删掉再在末尾重加，或手改 yaml。
2. **不做多选文件对话框**：`ql_pick_exe` 的签名与对话框 `properties` 一字不改（一次只选一个文件）。
3. **不做每行独立的「管理员」开关**：开关仍在条目上，对全部路径用同一个 verb（用户选定）。
4. **不做旧格式兼容 / 不做迁移**：`configs/` 下没有 quick_launch.yaml，`config-migrate.ts` 也不碰它（实测 grep 0 命中）。
5. **不给 exe 行加启动参数 / 工作目录**（沿用 `2026-10-10` §2 的非目标）。
6. **不改 shell 类型的任何行为**：多行命令的落盘（`\n`）与提交（`\r`）口径一字不动。
7. **不改卡片列表**：不显示路径、不显示条数徽标。
8. **不新增依赖、不新增 IPC 通道、不改 `.flag-grid` 的网格结构、不改 `min-height: 218px` / `max-width: 520px`。**

## 6 设计

### 6.1 数据：`exe` 从单值变有序数组

```ts
// src-main/quick-launch-config.ts:14
export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string[]; admin?: boolean }
```

- 键名仍是 `exe`（用户原话「把 exe 改成数组」），值类型是 `string[]`，**顺序即启动顺序**。
- 落盘形状（`yaml` 包 `stringify` 的自然输出）：

```yaml
qla1b2c3d4e5:
  name: 一组工具
  type: exe
  exe:
    - D:\\Tools\\a.exe
    - D:\\Tools\\b.exe
  admin: false
```

- `normalizeEntry` 的 exe 分支（`:74-78`）：`Array.isArray(e['exe'])` 才继续；逐元素 `typeof === 'string'` → trim → 丢弃空串；**结果数组为空 → 该条非法**（进 `invalid`）。**标量字符串一律非法**（§4-8）。
- `validateEntry` 的 exe 分支（`:97-100`）：同样归一；归一后为空 → `throw 'VALIDATION: ' + t('err.ql.exeRequired')`（复用既有键，不新建）。
- 返回的规范条目只含 `{ name, type: 'exe', exe: string[], admin }`（与既有「只含该类型字段」口径一致）。
- 重复路径**不去重**（R-03：用户可能有意把同一个程序起两次）。
- 行数**无上限**（R-04）。

### 6.2 弹窗：行模型与按钮

- 照抄命令行的行模型（`:74-88`）：`interface ExeRow { id: number; text: string }` + 模块内自增序号；`:key` 用 `row.id`，**不用 index**（删中间行不串位）。
- 回填：`entry.exe` 逐条映射成行；`entry` 为 null 或缺 `exe` → 一行空行。
- 加行：`addExeRow()` 在数组末尾追加空行，`await nextTick()` 后聚焦新输入框（与 `addCmdRow` 同一手法）。
- 删行：`removeExeRow(id)` 只删 `rows` 里 id 匹配的那一行；**默认行（index 0）没有 [-]，删不掉**。
- 判据：`exeError` = 「所有行 trim 后全空」→ `t('err.ql.exeRequired')`；报错位置仍在**路径那一格内**（既有门 `empty_exe_shows_the_error_below_the_exe_path_input_not_at_the_top` 的断言不变）。
- 保存载荷：`exe` = 逐行 trim + 丢空行后的数组。
- 每行的 [选择文件]：`pickExe(row)` 只写 `row.text`；`ql_pick_exe` 的调用与取消语义（取消 → 不改值）一字不改。
- 模板：所有行放在**同一个** `.field-cell` 内纵向排布（复用 `.cmd-cell` 的 flex 列 + `gap: 6px` 口径，新增 `.exe-cell` 同规则），**不新增 `.flag-grid` 的网格行** → `controlCells` 仍数到 3、定高推导一字不改（P9）。
- 一行内的按钮顺序：`输入框 → [选择文件] → [+]`（默认行）/ `输入框 → [选择文件] → [-]`（追加行）。[+] / [-] 复用 `.row-btn`（36px、`flex: none`）。
- **[+] / [-] 不带 `.tip-up` 悬浮气泡**，只带 `aria-label`——这是 2026-10-17 规格 P7 的实测结论（气泡把 `.modal-body` 顶出 10px 横向滚动条、弹窗 218 → 227.3），本次照搬，不再重犯。

### 6.3 启动：全量预检 → 依次发起，不等退出

`QuickLaunchManager.start()` 的 exe 分支（`quick-launch.ts:308-327`）改为：

1. `const paths = entry.exe`（已由配置层归一为非空数组）。
2. **预检循环**：对每条路径调 `deps.checkExe(path)`（新增接缝，见 §6.4）。任一条返回 false → `throw new Error('PROC: ' + t('err.proc.exeNotFound', { exe: path }))`，**此时一次 `spawnExe` 都没调**（要么全起，要么都不起）。
3. **启动循环**：按数组顺序逐条 `deps.spawnExe(path)`，**不 await、不观察退出**；把返回的进程按启动顺序 push 进 `inst.procs`。
4. 第 3 步里某条抛错（UAC 取消 / Shell 失败）→ **停止发起后续**，把已经起来的进程留在 `inst.procs` 里（实例保持运行），原样抛出该错误（`PROC:` 前缀不变，`main.ts:1085-1091` 的日志分工不变）。
5. 每条成功启动各写一行 `log.launcher.start.cmd`（`{cmd}` = 该条路径），与今天单条时的写法逐字相同，只是 N 条各一行。

### 6.4 接缝：`QlDeps.checkExe`

```ts
// src-main/quick-launch.ts（QlDeps 新增一行）
checkExe(exe: string): boolean;   // 生产侧 = isLaunchableExe（shell-execute.ts:242，已导出）
```

- 为什么走接缝而不是直接 `import { isLaunchableExe }`：`quick-launch.test.ts` 的 exe 用例用的是 `notepad.exe` / `a.exe` 这类**本机不存在**的假路径（`:186`、`:394`），直接 import 会让它们全部预检失败；本文件的既有边界就是「可测性靠 deps 注入假实现」（`:167-172`）。
- `main.ts` 的接线：`checkExe: (exe) => isLaunchableExe(exe)`（该文件已 import `shell-execute`，只多一个具名导入）。
- `launchShellExe` 内部的预检（`shell-execute.ts:272-274`）**保留不动**：它是「不可用的目标不得调 Shell」的最后一道牙（2026-10-15 §6.2 / RF1），删掉它就退化成弹系统错误框 + 卡主线程 6.1–38.9s。

### 6.5 状态与停止：一条配置 = 一个实例、N 个进程

- `Instance.proc` → `Instance.procs: Array<ShellProcess | ExeProcess>` + 与 `procs` 同序的 `procExited: boolean[]`（按启动顺序）。类型写成 `ShellProcess[]` 会在类型上撒谎——exe 进程没有 `write`/`resize`/`onData`（`ExeProcess`，`:206-210`）；`states()`/`stop()` 只用两者共有的 `isRunning`/`stopGraceful`/`onExit`（裁决 R-A2）。`exited` 仍是**单一布尔**，语义 = 「全部退出」，`exitCode` = 最后退出者。shell 分支仍是「一个」，用同一个数组装（`procs.length === 1`），不改 shell 路径的任何时序。
- `isRunning()` = `procs.some(p => p.isRunning())`（任一存活即运行中）。
- `stop()`：按**启动顺序**逐个 `stopGraceful(STOP_TIMEOUT_SECS)`（R-09：与 `instances` 插入序一致，代码最省；已退出的进程 `stopGraceful` 自己会直接 return，见 P5），全部返回后才 `removeInstance` + 上报退出。`stopping` 标志与 `ql_states` 的形状不变。
- 退出上报：每个进程的 `onExit` 只把它的 `exitCode` 记进实例；**当且仅当所有进程都已退出**才 `removeInstance` + `deps.onExit(configId, 最后一个退出的 exitCode)`。中途不重复发 `ql-exit`（渲染端按钮回落只发生一次）。
- 每条进程退出仍各写一行 `log.app.exit`（`{code}` 逐条），与今天单条时的写法逐字相同。
- `stopAll()` 不改（它按实例遍历，聚合后的实例天然被一次 `stop()` 覆盖）。
- 卡片侧（`QuickLaunch.vue` / `App.vue`）不改：`ql_states` 的 `{running, stopping}` 形状一字不动。

### 6.6 文案（i18n）

新增两个键，zh / en 两处同增，组件里以字面量 `t('…')` 出现（`key-coverage` / `dict` / `no-hardcoded` 三门不得变红）：

| 键 | zh | en |
|---|---|---|
| `ql.modal.btn.addExe` | 新增程序路径 | Add program path |
| `ql.modal.btn.removeExe` | 删除该行 | Remove this line |

- **不复用** `ql.modal.btn.addCmd`（「新增命令行」用在 exe 行上是错文案）。
- 错误文案复用既有键：`err.ql.exeRequired`（「程序路径不能为空」）、`err.proc.exeNotFound`（`{exe}` = 失败那条路径）。

## 7 边界与风险

1. **旧条目静默消失**（已定，用户选定）：`exe` 为标量的条目进 `invalid`，卡片行不出现、不报错、不提示。本工作区代价为 0（P3）；打包安装若在他处有旧条目，用户重填一次。
2. **「依次启动」不是「依次等待」**：GUI 程序会几乎同时都在。这是用户选定的语义，不是实现妥协；§9-R2 的真机判据就是它。
3. **N 条提权路径 = N 次 UAC**：`runas` 逐条弹。用户选定「一个开关对全部生效」，这条是其直接后果，登记。
4. **中途失败留下半启动状态**（§6.3-4）：已起的进程不回滚杀掉。这是用户选定的失败策略（「已起的保留运行」），与单条时代的「失败不残留状态」不同，差异在 §9-R7 里核对。
5. **聚合 `isRunning()` 让按钮在最后一个进程退出前不回落**：用户选定。副作用：起多个时以最后一个的存活时间为准。
6. **`checkExe` 与 `launchShellExe` 内部预检重复一次**：同一条路径被判定两次（一次在循环里、一次在 Shell 调用前）。代价是纯 fs 调用（`lstatSync` / `openSync`），微秒级；换来的是「不得删掉最后一道牙」（§6.4）。登记，不优化。
7. **`exe` 载荷形状变了**：`QuickLaunchEntry` 是渲染端 `import type` 的（`QuickLaunchModal.vue:13`）。**实测校正（R-A2）**：本仓唯一的 tsc 门是 `tsconfig.main.json`，`include` 只有 `src-main/**/*.ts`、`exclude` 排掉 `*.test.ts`，且没有渲染端 tsconfig、`npm test` = `vitest run`（不做类型检查）→ **渲染端的旧用法不会被 tsc 暴露**，只能由 `QuickLaunchModal.test.ts` 的运行时断言暴露（任务 3 的 G9 门守它）。据此任务 1 之后 `src/` 仍全绿不是侥幸，是因为运行时没人读 `entry.exe`（P8）。
8. **shell / 提权宿主 / PTY 无关**：本次只动 exe 分支，shell 分支一行不碰。

## 8 既有测试门的处置（改动前逐条实测定位）

| 既有门 | 位置 | 处置 |
|---|---|---|
| `qlLoad` 的 exe 条目断言（`exe: 'D:\\Tools\\LM Studio.exe'`） | `src-main/quick-launch-config.test.ts:76/:82/:334/:339/:348/:352` | **改写**为数组（`exe: ['D:\\Tools\\LM Studio.exe']`），断言意图不变 |
| yaml fixture 里的 `exe: a.exe` 标量写法 | 同上 `:116/:119/:123/:367/:372/:377` | **改写**为序列写法；**另新增**一条「标量写法 → 进 invalid」的门（§4-8 的牙） |
| `qlSave` 的 exe 载荷（`exe: 'a.exe'` 等） | 同上 `:156/:165-168/:208-211/:220-225/:245/:250/:260-267/:270/:279-280/:311/:398` | **改写**为数组；`:208-209`（空串 / 缺字段 → `VALIDATION:`）保留意图，改成空数组 / 全空串 |
| 「shell 条目不得落盘 `exe` 键」的字节级门 | 同上 `:236-240` | **不动**（`exe` 键仍不落盘） |
| `EXE_ENTRY` 与 exe 启动用例 | `src-main/quick-launch.test.ts:186/:348/:394` | **改写**为数组；`:348`（`exe: '  '` → `VALIDATION:`）改成 `exe: ['  ']` |
| 假 `ExeProcess` 与 `deps.spawnExe` 假接缝 | 同上 `:79-81/:165-172` | **扩展**：支持多条路径、支持注入 `checkExe` 的返回值 |
| exe 端到端形状门（`{tabId: null}`、每配置一个新 `ShellExecProcess`） | `src-main/ipc-ql.test.ts:278/:415-416/:437` | **改写**载荷为数组；断言意图（每配置一实例、不动 llama-server 单例）**不变** |
| 路径不存在 → `PROC: err.proc.exeNotFound`、且不调 Shell | 同上 `:470/:493-496` | **不动**（单条时语义与今天逐字相同；新增「多条里有一条不存在 → 一次 `shellExecute` 都不调」的门） |
| 提权 on/off 两条门 | 同上 `:510-535` | **改写**载荷为数组，断言不变 |
| 「exe 分支不付终端探测代价」 | 同上 `:784` | **不动** |
| 两个 exe 配置并发 `ql_start` | 同上 `:870-900` | **改写**载荷为数组，断言不变 |
| exe 态一行输入框 + [选择文件] | `src/modules/QuickLaunchModal.test.ts:165-199` | **改写**：默认行 = 输入框 + [选择文件] + [+]，且**没有** [-] |
| 空路径报错在路径那一格内 | 同上 `:419-449` | **不动**（判据改成「全空」后照样绿） |
| 保存载荷 `toEqual({..., exe: 'D:\\Tools\\notepad.exe', ...})` | 同上 `:578/:1168` | **改写**为 `exe: ['D:\\Tools\\notepad.exe']` |
| 编辑态回填单值 | 同上 `:1117` | **改写**为数组，并新增「两条路径 → 两个输入框」的门 |
| 「管理员」行在路径行之上 | 同上 `:1079-1107` | **不动** |
| 定高门（两态 `controlCells` = 3、`min-height: 218px`） | 同上 `:970-1010` | **不动**（§6.2 的布局手法保证它照样绿） |
| 多行命令的四条门 | 同上 `:298-418` | **不动**（shell 分支一行不碰） |

## 9 真机核对清单（用户执行，dev 或打包版）

| # | 步骤 | 预期 |
|---|---|---|
| R1 | 打开一条**已有**单路径配置的编辑弹窗（先把 yaml 写成序列） | 与今天完全一样：一行、218px、[选择文件] 右侧多一个 [+] |
| R2 | 点 [+] 两次，三行分别选三个 .exe，保存，启动该配置 | 弹窗按行长高、无横向滚动条；三个程序**按从上到下的顺序发起**，**不等待**前一个退出（几乎同时都在） |
| R3 | 中间留一行空，保存后重开该配置 | 空行不在配置里（yaml 里只有两条）；重开时按两条回填 |
| R4 | 点第二行的 [-] | 删掉的正是第二行，第三行的路径还在；默认行没有 [-] |
| R5 | 每行的 [选择文件] 分别点一次 | 只填它自己那一行，其他行不变 |
| R6 | 把第二行的路径手改成不存在的文件，保存，启动 | **一个程序都不起**；日志一行 `PROC:` 指出是哪条；按钮回落 |
| R7 | 三条路径，第二条在 UAC 点「否」 | 第一条已起的窗口**保留**；第三条不起；日志一行取消原因（带该条路径名）；按钮回落 |
| R8 | 启动多条，关掉其中两个窗口 | 卡片按钮仍是 [停止]（任一在跑即运行中）；三个都关掉后按钮才回落 [启动]，`log.app.exit` 三行 |
| R9 | 启动多条后点 [停止] | 全部被停掉，按钮回落；已自己退出的那条不报错 |
| R10 | 勾选「管理员」+ 两条提权程序 | 两次 UAC 提示，两条都以 `runas` 起 |
| R11 | 手工把 yaml 的 `exe` 写回标量（`exe: D:\\a.exe`） | 该条**不出现**在卡片上（进 invalid），其他条目正常 |
| R12 | [类型] = 命令行 | 多行命令的一切行为与今天一字不差（本次不碰） |

## 10 已定口径与裁决（本次由主代理代用户作出，供复核）

| # | 口径 | 依据 |
|---|---|---|
| R-01 | 字段名保持 `exe`，类型 `string[]`，不引入 `exes` | 用户原话「把 exe 改成数组」；少一个键名就少一处双写 |
| R-02 | 空行：逐行 trim + 丢弃；全空 → 复用 `err.ql.exeRequired`，报错位置仍在路径那一格内 | 与 2026-10-17 的 cmd 先例逐字一致；既有门 `:419-449` 不改 |
| R-03 | 重复路径不去重 | 用户可能有意把同一程序起两次；去重是猜用户意图 |
| R-04 | 行数无上限 | 与 cmd 先例一致；上限是凭空的约束，没有依据 |
| R-05 | 新增 `ql.modal.btn.addExe` / `removeExe` 两键，不复用 cmd 的键 | 「新增命令行」用在 exe 行上是错文案；`key-coverage` 门要求字面量键与词典逐字 |
| R-06 | 保存时**不**校验文件存在性（只判非空） | 沿用 `2026-10-10` §5.3-5「exe 只判非空，启动时反馈」；存在性只在 §6.3 的启动预检里判 |
| R-07 | 预检走新接缝 `QlDeps.checkExe`，生产侧接已导出的 `isLaunchableExe` | §6.4；直接 import 会把 `quick-launch.test.ts` 的假路径全部判死，且破坏该文件「靠 deps 注入假实现」的既有边界 |
| R-08 | 每条各写一行 `log.launcher.start.cmd` / `log.app.exit`；`ql-exit` 只在全部退出时发一次 | 用户选定「聚合为一个实例」；逐条日志保留可诊断性，单次 `ql-exit` 保证按钮只回落一次 |
| R-09 | [停止] 按启动顺序逐个停 | 与 `instances` 插入序一致，代码最省；`stopGraceful` 对已退出进程是 no-op（P5），顺序不影响结果 |
| R-10 | 不做调序、不做多选、不做每行独立提权 | 用户逐条选定（AGENTS.md 红线 1：不得顺手扩范围） |
| R-11 | 多行放在**同一个** `.field-cell` 内，复用 `.cmd-cell` 的 flex 列口径；[+] / [-] 不带气泡 | P9 / 2026-10-17 规格 P7-P8 的实测结论，不是审美选择 |
| R-12 | 卡片列表不改 | P8：`QuickLaunch.vue` 不渲染 `entry.exe` |
| R-13 | **本次不生成 check 表** | AGENTS.md 的「check 表」一节已在 `d989afa` 删除（P11），第 10 行的引用是悬空引用；最近的先例（2026-10-17 cmd-rows）也未生成。同一职责由 plan 的「全局约束 G 组 + 审查重点 RF 组 + 执行记录留白表」承担。**建议**：请修掉 AGENTS.md 第 10 行的引用，或补回该节 |
