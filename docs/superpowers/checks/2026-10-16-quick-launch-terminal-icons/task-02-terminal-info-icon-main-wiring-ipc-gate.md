# 任务 2 · `TerminalInfo.icon` + `main.ts` 接线 + IPC 形状门 — check 表

> 计划：[2026-10-16-quick-launch-terminal-icons.md](../../plans/2026-10-16-quick-launch-terminal-icons.md) §任务 2 · 规格：[2026-10-16-quick-launch-terminal-icons.md](../../specs/2026-10-16-quick-launch-terminal-icons.md) §6.2 / §6.3 / §6.6-1 / §7.1-7 · 关联审查重点 **RF1 RF2 RF3**
> 前置：任务 1（`withTerminalIcons` 已可用并已提交）
> 索引：[00-index.md](00-index.md) 的 G1 G2 G8 G9 G10、RF1 RF2 RF3、**K6**（缓存目录）、**K7**（载荷口径 + 两处旧口径必须同步改）、**K11**（`.gitignore` 加 `cache/`）、**K12**（`ipc-ql.test.ts:279` 的放宽写法）
> 派单输入：spec + plan + 本表三份都交给子代理；子代理不 `git add`、不 commit（G9）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 前置任务 1 已提交 | `git log --oneline -2` | 上一条 = `feat(main): 终端图标提取层（PowerShell System.Drawing + 应用目录磁盘缓存）`；`src-main/ql-terminal-icons.ts` 已在 HEAD 里 | ☐ |
| A2 | 接线点与既有形状属实 | 读 `src-main/main.ts:1040-1042`（`detectTerminalsAsync`：`setImmediate` + `resolve(detectTerminals())`）、`:1126`（`ipcMain.handle('ql_terminals', async ...)`，**本任务不改**）、`:83-86`（`dataDir()`：打包 = exe 目录，dev = `process.cwd()`）、`:105-109`（`updateZipDir()` = `<dataDir>/downloads/` + `mkdirSync` 吞错） | 与本表引用逐字一致 | ☐ |
| A3 | 「只下发 {id,path}」的两处现存载体在位（索引 K7） | 读 `src-main/quick-launch-terminals.ts:9`（注释原文「只下发 { id, path }：标签文案由渲染端 t() 决定」）与 `src-main/ipc-ql.test.ts:279`（`expect(Object.keys(info).sort()).toEqual(['id', 'path'])`） | 两处属实 → 本任务按 C3/C4 改写；前置 spec 文件已被 `b330a5c` 删除（规格 §3-P12），**不要**去改一个不存在的文件 | ☐ |
| A4 | 测试的 cwd 已被换成临时目录（索引 K11） | 读 `src-main/ipc-ql.test.ts:168-175`（`beforeAll` 里 `mkdtempSync` + `process.cwd = () => workDir`）与 `:207-209`（`afterAll` 还原 + 删除） | 属实 → 新增用例断言的缓存目录 = `join(workDir, 'cache', 'terminal-icons')`；**不许**往仓库根写 `cache/` | ☐ |
| A5 | 探测计数门仍在（RF3 的既有牙） | 读 `src-main/ipc-ql.test.ts:34-35`（`cap.termProbes` 计数器）与 C4 那两条用例 | 属实 → 本任务不得把「探测不缓存」改成缓存 | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/quick-launch-terminals.ts` | 改两处：① `:17-20` 的 `TerminalInfo` 加可选 `icon?: string`（注释指向规格 §6.1）；② `:9` 的注释按 C3 改写 | `:26-105`（`systemRoot` / 四个 detect / `whereFirstExisting`）与 `:107-118`（`detectTerminals` 四行判定 + 顺序 + 不缓存）**一字不改**（G1） | ☐ |
| B2 | `src-main/main.ts` | 新增 `terminalIconCacheDir()`（放在 `updateZipDir()`（`:105-109`）之后，同一手法）；`detectTerminalsAsync`（`:1040-1042`）改为 `resolve(withTerminalIcons(terminalIconCacheDir(), detectTerminals()))` | `:1126` 的 handler 一字不改（仍 `async`）；`dataDir()` / `configDir()` 不改；不新增 IPC 通道 | ☐ |
| B3 | `src-main/ipc-ql.test.ts` | 改 `:273-287` 里 C4 第二条的形状断言（C4 段写法）；新增一条用例（C5） | 其余用例一字不改，含「两次调用不共用数组实例」那条与 `cap.termProbes` 计数门（A5） | ☐ |
| B4 | `.gitignore` | 加一行 `cache/`（放在 `logs/` 之后同类） | 其余行一字不动 | ☐ |

## C. 接口契约（逐字）

| # | 契约 | 出处 | ✓ |
| --- | --- | --- | --- |
| C1 | `TerminalInfo` 新增字段：`icon?: string`，注释 = 「该项 exe 的真实图标，PNG 的 data URL（§6.1）。取不到 = 不带这个字段。」 | 规格 §6.3 | ☐ |
| C2 | `detectTerminals()` 的返回**不带** `icon`（探测层不填，索引 K7 推论 K1）；补字段的是 `withTerminalIcons` | 规格 §6.3 | ☐ |
| C3 | `quick-launch-terminals.ts:9` 注释改成：「主进程下发 `{ id, path }`，**可选**带 `icon`（PNG data URL，由 `ql-terminal-icons.ts` 补，见 2026-10-16 规格 §6.1）；标签文案仍由渲染端 `t()` 决定」 | 规格 §6.3 / 索引 K7 | ☐ |
| C4 | `ipc-ql.test.ts:279` 的断言改成三条：必含 `id` 与 `path`；`Object.keys(info)` 里除 `id` / `path` / `icon` 外不得有别的键；若 `typeof info.icon === 'string'` 则以 `data:image/png;base64,` 开头 | 规格 §6.6-1 / 索引 K12 | ☐ |
| C5 | 新增用例名（逐字）：`terminal_icons_are_stable_across_calls_and_come_from_the_disk_cache` —— 两次 `invoke('ql_terminals')` → 两次都有 `cmd` 项；两次该项 `icon` 逐字相等；`join(workDir, 'cache', 'terminal-icons')` 下 `readdirSync` 出现至少一个 `.png` | 规格 §7.1-7 / RF3 | ☐ |
| C6 | `terminalIconCacheDir()` = `join(dataDir(), 'cache', 'terminal-icons')` + `mkdirSync(dir, { recursive: true })` 包 try/catch 吞异常 | 规格 §6.2 | ☐ |
| C7 | 无新 IPC 通道、无新 i18n 键（`ql_terminals` 一条通道带上新字段） | 规格 §6.3 / G2 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期输出 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先改测试（C4 改写 + C5 新增） | — | 只碰 B3 一个文件 | ☐ |
| D2 | 跑红取证 | `npx vitest run src-main/ipc-ql.test.ts` | 新用例红（`icon` 为 `undefined` / 缓存目录不存在）；改写后的 C4 **仍绿**（当前实现不带 `icon`）——两条输出都贴 J 段 | ☐ |
| D3 | 实现 B1/B2/B4 | — | 只碰 B1/B2/B4 三份 | ☐ |
| D4 | 跑绿 | `npx vitest run src-main/ipc-ql.test.ts src-main/ql-terminal-icons.test.ts` | 两个文件全绿 | ☐ |
| D5 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0（`icon?: string` 不破坏任何调用点） | ☐ |
| D6 | 全量 | `npm test` | `Tests 919 passed (919)`（918 + 1），exit 0 | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 钉住什么 | 出处 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | `ql_terminals` 的 handler 仍是 `AsyncFunction`（既有断言 `handlerOf('ql_terminals').constructor.name === 'AsyncFunction'` 不得红） | 接线改成 `await withTerminalIcons(...)` 后通道形态不变 | 规格 §6.3 / 既有 `ipc-ql.test.ts` C4 第一条 | ☐ |
| E2 | 两次调用返回的数组不是同一实例、`id` / `path` 集合一致 | 探测仍不缓存（图标缓存 ≠ 探测缓存） | 规格 §5-2 / RF3 / 索引 K6 | ☐ |
| E3 | 第二次调用的 `icon` 与第一次逐字相等，且第二次不再起提取进程（缓存命中） | 磁盘缓存生效 | 规格 §7.1-7 / RF3 | ☐ |
| E4 | 载荷里除 `id` / `path` / `icon` 外无别的键；`icon` 存在时前缀逐字 | 载荷形状收窄，渲染端可依赖 | 规格 §6.3 / C4 | ☐ |
| E5 | 本机取不到某项图标时（假接缝不可用，本任务不制造）该字段缺席而非空串 | 缺席 ≠ 空串（渲染端 `v-if` 判空） | 规格 §6.1 降级 / 索引 K5 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 怎么验 | ✓ |
| --- | --- | --- | --- |
| F1 | G1：探测层四行判定 / 顺序 / 不缓存一字不动 | `git diff -U0 src-main/quick-launch-terminals.ts` 只允许 `:9` 与 `:17-20` 两处 hunk | ☐ |
| F2 | G2：不新增 i18n 键 | `git diff src-main/i18n` 为空 | ☐ |
| F3 | 索引 K11：不往仓库根写 `cache/` | `git status --porcelain` 不出现 `cache/`；`.gitignore` 已含 `cache/` | ☐ |
| F4 | G9：不 `git add`、不 commit | 收尾时 `git log --oneline -1` 仍是任务 1 的提交 | ☐ |
| F5 | G10：只碰 B1–B4 四份 | `git diff --name-only` 与该表 B 段逐字对照 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/ipc-ql.test.ts` | 全绿；条数 = 原条数 + 1 | ☐ |
| G2 | 索引 V1（跨任务） | `npx vitest run src-main/ipc-ql.test.ts src-main/quick-launch.test.ts src-main/quick-launch-terminals.test.ts` | 三个文件全绿（`quick-launch.ts` 消费 `TerminalInfo.path` 的链未被带偏） | ☐ |
| G3 | 类型 | `npx tsc --noEmit -p tsconfig.main.json` | exit 0 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿 | ☐ |
| G5 | 全量 | `npm test` | `Tests 919 passed (919)`，exit 0 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | 只 `git add src-main/quick-launch-terminals.ts src-main/main.ts src-main/ipc-ql.test.ts .gitignore` | ☐ |
| H2 | commit message（逐字） | `feat(main): ql_terminals 带可选 icon（真实终端图标 data URL，走磁盘缓存）` | ☐ |
| H3 | 勾完整性门 | `node .superpowers/sdd/2026-10-16-quick-launch-terminal-icons/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1–A5 实测过（含两处旧口径载体的原文）
- [ ] B1–B4 落地、无越界（G1 的 diff 只有两处 hunk）
- [ ] C1–C7 与 spec §6.2/§6.3 逐字一致
- [ ] D1→D6 先红后绿，J 段有真实输出
- [ ] E1–E5 全部有对应断言在位
- [ ] F1–F5 无越界
- [ ] G1–G5 全绿，总数 919
- [ ] H1–H3 由主代理执行

## J. 执行记录（实现时填）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | | |
| J-2 | | |
| J-3 | | |
| J-4 | | |
| J-5 | | |
