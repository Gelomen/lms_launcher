# 快捷启动「可执行程序」启动前预检 — check 表索引

- 计划：[2026-10-15-quick-launch-exe-path-precheck.md](../../plans/2026-10-15-quick-launch-exe-path-precheck.md) · 规格：[2026-10-15-quick-launch-exe-path-precheck.md](../../specs/2026-10-15-quick-launch-exe-path-precheck.md)
- 生成时间：2026-10-15 23:1x（主代理；文档提交 `4c4f15f` 之后、「开始实现」之前）
- 工作基线：分支 `feat/quick-launch`，HEAD `4c4f15f docs: 快捷启动可执行程序启动前预检目标 —— spec + plan（代码一行未改）`；`git status --porcelain` 只要求**无已跟踪改动**（未跟踪的 `.superpowers/`（普查脚本）与 `docs/superpowers/checks/`（本表目录）属预期产物）
- 测试基线（主代理 2026-10-15 22:56 实测）：`npm test` → `Test Files 52 passed (52)` / `Tests 901 passed (901)`，`Duration 14.90s`，exit 0。跑这条命令需要完全访问沙箱
  - 用例数预期（**按 vitest 报的条数**，不是 `it(` 字面计数——`ipc-ql.test.ts:687-702` 的 `for` 循环会生成 3 条，字面计数会少数：实测 `shell-execute.test.ts` = 10、`ipc-ql.test.ts` = **27**）：任务 1 之后全量 = **906**（前者 10 → 15，后者条数不变、只改两处同一字面量，索引 K10）；任务 2 之后 = **907**（后者 27 → 28）。对不上就在该表 J 段说明差在哪，不许默默过（索引 K9）
- 普查：`node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs`（已就位；各表 H3 用它）
- 取证探针（`.temp/ql-diag/`，gitignore 内，规格 §3 的 P1–P12 出处）：`missing-exe-probe.cjs`（六类失败的真实 `GetLastError` / `hInstApp`，与生产同 `fMask=0x44`）、`fs-access-probe.cjs`（`fs.accessSync` 对 ACL 是假阴性、`fs.openSync(p,'r')` 才报 `EPERM`）、日志 `missing-exe-probe.log`

## 清单表

| # | 任务 | 表 | 前置 | 钉住的审查重点 |
| --- | --- | --- | --- | --- |
| 1 | `isLaunchableExe` 预检 + 词典键 + `launchShellExe` 门 | [task-01-exe-precheck-gate.md](task-01-exe-precheck-gate.md) | 无 | RF1 RF2 RF3 RF4 RF5 RF6 |
| 2 | `ipc-ql.test.ts` 的端到端门（Shell 不被调用） | [task-02-ipc-ql-end-to-end-gate.md](task-02-ipc-ql-end-to-end-gate.md) | 任务 1 | RF1 RF2 RF3 |
| 3 | 打包 + 真机清单（用户执行） | [task-03-packaging-realmachine.md](task-03-packaging-realmachine.md) | 任务 1、任务 2 | RF1 RF2 |

派单粒度与顺序按 AGENTS.md 工作流第 4 步：**一次一个子代理，按 1→2→3 串行**（编号即拓扑序）；任务 3 由主代理打包 + 用户真机验收。

## G 组：全局约束（逐条可验证）

| # | 约束 | 怎么验 | 落在哪张表 |
| --- | --- | --- | --- |
| G1 | 错误前缀只用既有五种（`quick-launch-config.ts:22`、`quick-launch.ts:12` 的口径），本次只写 `PROC: ` | 读新增 `throw new Error(…)` 逐字；`Select-String -Pattern "'(VALIDATION\|STATE\|PROC):'" src-main/shell-execute.ts` | T1 C3 / F1 |
| G2 | 词典只新增 `err.proc.exeNotFound` 一个键（zh `dict.ts:301` 之后、en `:645` 之后）；其余文案复用既有键 | `git diff src-main/i18n/dict.ts` 只两行；`npx vitest run src-main/i18n` 三门绿 | T1 B2 / C4 / G4 |
| G3 | 放行路径逐字节不变：`fMask=0x44`（`shell-execute.ts:89`）、`nShow=1`、`lpDirectory=null`（`:95`）、`lpVerb` 仍由 `admin` 决定（`:91`）；`lpFile` 仍是用户原样字符串（`:93`） | `git diff src-main/shell-execute.ts` 逐 hunk：真接缝 `:83-107` 一字未动；既有 verb 两条用例断言一字不改 | T1 B1 / E5 / E6 |
| G4 | 不动 `ql-elevated.ts:110-115`（`hostStartError`）、`process.ts`、llama-server 路径、`App.vue:456-482`、`QuickLaunch*.vue`、`main.ts:1167`（对话框过滤）、`shell-execute.ts:205` 的 1223 分支本体 | `git diff --name-only` 不含这些文件；读 `:205` 现值仍在 | T1 F3 / F4；T2 B 段 |
| G5 | 每任务收尾门：`npx tsc --noEmit -p tsconfig.main.json` 干净 + 定向测试绿 + `npm test` 全绿 | 各表 D / G 段命令逐字 | 全部 |
| G6 | i18n 三门（`key-coverage` / `dict` / `no-hardcoded`）任何任务后不得变红；新代码字面量里不得有汉字 | `npx vitest run src-main/i18n` | T1 G4；T2 G3 |
| G7 | 不新增依赖：只用内置 `node:fs` / `node:path`；`package.json` 一字不动 | `git diff package.json package-lock.json electron-builder.yml` 为空 | T1 F5 |
| G8 | 子代理不 `git add`、不 commit；改动留在工作区等验收 | 各表 A1 的 `git status --porcelain` 证据 + H 段由主代理执行 | 全部 |
| G9 | 只改该任务 B 段列出的文件，越界即不勾 | 每任务末尾 `git diff --name-only` 与 B 段逐字比对 | 全部 |

## R 组：审查重点 → 钉住它的地方

| # | 风险 | 期望行为 | 钉住 |
| --- | --- | --- | --- |
| RF1 | 「不调 Shell」没真发生：预检形同虚设，仍走 Shell → 弹系统框 + 主线程卡死 6.1–38.9s（§3-P1/P4） | 预检失败时 `api.shellExecute` **一次都不被调用** | T1 E4（`precheck_blocks_before_the_shell_is_called`）、T2 E1（spy 计数 0） |
| RF2 | 裸名被误杀（§3-P10：`notepad.exe` 今天能起，`ipc-ql.test.ts:331` / `:397` 就靠它） | 裸名按 PATH 解析后放行；既有裸名用例一字不改 | T1 E3、T2 E3 |
| RF3 | 1223 分支被削弱：真 UAC 点「否」不再给可辨文案（§3-P2） | 目标通过预检、Shell 仍回 1223 → 仍 `err.proc.uacCancelled` | T1 E6（既有用例 3 不改）、T2 E2（`:352-377` 改写后仍断言 uacCancelled） |
| RF4 | 放行时实参被改写（换成解析后的绝对路径 / `nShow` 跟着变） | `lpFile` = 用户原样字符串；`verb` / `nShow` / `parameters` 取值不变 | T1 E5（两条 verb 用例一字不改） |
| RF5 | 代码领先 spec：前置规格 §6.5 / §7.1-4 / §9-R8 还写着旧判据与「接受弹窗」 | 三份文档同一 commit 同步（§8-K3） | T1 B4 / D7 / H1 |
| RF6 | **别名被误杀**：WindowsApps 的 app execution alias（`mspaint.exe` / `python.exe` / `code.exe`）今天能被 Shell 起（P13），只认普通文件就判它们「不存在」 | 重解析点放行：`lstatSync.isSymbolicLink()` 即通过，只查扩展名、跳过可访问性判定（P14） | T1 E8（`app_execution_alias_in_PATH_is_launchable`）、T3 C9（真机 §7.2-9） |

## V 组：跨任务回归门

| 时机 | 必须跑 | 预期 |
| --- | --- | --- |
| 任务 1 末尾 | `npx vitest run src-main/shell-execute.test.ts src-main/ipc-ql.test.ts`；`npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts`；`npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n`；`npm test` | 定向 15 passed；`ipc-ql.test.ts` 只允许 `:353` 一行改动（K10）且仍绿；`quick-launch.test.ts` 未改仍绿；tsc 无输出；i18n 全绿；全量 906 |
| 任务 2 末尾 | `npx vitest run src-main/ipc-ql.test.ts`；tsc；i18n 三门；`npm test` | 该文件 30 passed；全量 907；`:330-350` / `:381-416` 一字未改且绿 |
| 任务 3 | `build.bat`；`npx asar list dist-release\\win-unpacked\\resources\\app.asar` | 产物含 `dist-main/shell-execute.js`；`koffi` / `@koromix` 仍在 `app.asar.unpacked`；真机 8 条逐条回报 |
| 每个任务验收前（主代理） | 独立复跑该表 G 段全部命令 | 与 J 段同值；不接受实现者自述 |

## K 组：已定口径（本表生成时已定，不再作为待决）

| # | 口径 | 依据 | 落在哪张表 |
| --- | --- | --- | --- |
| K1 | 放行时交给 Shell 的实参仍是用户填的**原样字符串**，不改写为解析后的绝对路径 | 规格 §8-K1（由 Q12 推论）；改写会让 `toHaveBeenCalledWith(EXE, 1)` 类断言与 Shell 语义跟着变 | T1 C3 / E5 |
| K2 | 扩展名比较大小写不敏感；无扩展名的裸名按「补 `.exe`」再找一次 | 规格 §8-K2 | T1 C2 |
| K3 | 前置规格 §6.5 两行表 + §7.1-4 的 `win32Error=2` 假设 + §9-R8 与代码**同一 commit** | 规格 §8-K3 / AGENTS.md「偏离 spec」 | T1 B4 / D7 / H1 |
| K4 | 可访问性判定用 `fs.openSync(候选, 'r')` + `closeSync`，**不用** `fs.accessSync` | §3-P12 实测：ACL 拒绝态下 `R_OK/W_OK/X_OK/F_OK` 全过（假阴性）、`statSync isFile=true`，只有 `openSync` 报 `EPERM` | T1 C2 / E1 |
| K5 | 「不可访问」分支**没有单测**，由真机门 §7.2-8 覆盖；表里写成 `☐（原因 + 去处）` | 规格 §9-R7（夹具要改 ACL，跨机器不稳；P12 说明 `accessSync` 造不出这个红） | T1 E7；T3 C/E |
| K6 | `shell-execute.test.ts:12` 的 `E:\\QiYou\\QiYou.exe` 夹具换成 `process.execPath` | 机器相关（本机 E: 盘恰好有该文件，别的机器没有）；`process.execPath` 必然是存在的 `.exe`，预检放行、假接缝不真起进程 | T1 B3 / D4 |
| K7 | `shell-execute.ts:30` 与 `:100-101` 的注释现在写着「不加 existsSync 预检（§9-R8）」、「不要顺手加 existsSync 预检」——与新预检**直接矛盾**，必须同步改注释 | 读 `:30` / `:100-101` 现值（本表生成时实测）；留着就是注释与代码互相指认 | T1 B1 / D3 |
| K8 | 任务 2 的「先红」用**变异取证**：临时注释掉 `launchShellExe` 的门跑一次红，再恢复 | 任务 1 已合并 → 新用例直接绿，TDD 的红只能靠变异复现（AGENTS.md「不接受自述完成」） | T2 D2 |
| K9 | 用例数预期：任务 1 后全量 **906**、任务 2 后 **907**；对不上要在 J 段说明差在哪 | 基线 901 + 新增条数；条数按 vitest 口径（见 K13） | T1 G5；T2 G4 |
| K13 | **条数口径 = vitest 报的条数**，不是 `it(` 字面计数 | 实现期偏离 6（任务 1 续做轮 2 提出，主代理复核）：`ipc-ql.test.ts` 的 `it(` 字面 24 条 + `:687-702` 循环生成 3 条 = vitest 报 **27**；本表原写 29 是错的（字面计数与循环都数错）。实测：`npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts` → `Tests 61 passed (61)`（27 + 34） | 本表头部；T1 D8 / G2；T2 A2 / D3 |
| K10 | `ipc-ql.test.ts` 的夹具改写（`no-such-exe-zzz.exe` → `notepad.exe`）**共两处**（`:353` 条目值 + `:371` 的 `t('err.proc.uacCancelled', { exe })` 占位值），**归任务 1**，不归任务 2 | 实现期偏离 1（任务 1 子代理提出）：预检生效后，不存在的 exe 到不了假接缝，那条端到端用例必红 → 它是预检的直接后果，不是新能力的门；留在任务 2 会让任务 1 末尾的全量门永远不可能绿 | T1 B5 / D6 / G2 / G5；T2 A2 |
| K11 | **重解析点算可启动**：`lstatSync` 成功且 `isSymbolicLink()` → 只查扩展名，跳过 `openSync` 可访问性判定 | 实现期偏离 2 + 取证 P13（Shell 起得了裸名与全路径别名：`ok=true hInstApp=42 pid=9548` / `pid=15972`）、P14（别名只有 `lstatSync` 看得见，`statSync`/`openSync`/`realpathSync` 全 `EACCES`）。规格 §8-Q13 / §6.1 判定① 第二支 | T1 C6 / E8；T3 C9 |
| K12 | 别名那条分支的单测**依赖机器**：夹具用 `PATH` 里真实存在的 `mspaint.exe`，不在时 `it.skipIf` 跳过 | P15：`fs.symlinkSync(target, link, 'file')` → `EPERM`（无 `SeCreateSymbolicLinkPrivilege`、未开开发者模式）→ 造不出夹具；硬门归真机 §7.2-9（规格 §9-R9） | T1 E8（写成 `☐（原因 + 去处）` 的机器条件）；T3 C9 |
