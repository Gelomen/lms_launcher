# 任务 3 · 配置层 `quick-launch-config.ts` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 3 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §5.1 / §5.2 / §5.3 / §12.1
> 前置：任务 2（新 id 走 `suggestConfigId(existing, 'ql')`）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☑ |
| A2 | 临时目录写法对齐 | 读 `src-main/test-utils.ts` | 用 `tmpPath / rm / writeText / readText / mkDir / jp`，不自己造夹具 | ☑ |
| A3 | YAML 读写口径对齐 | 读 `src-main/config.ts` 的 `configsLoad`（第 94-104 行）与 `dump` | 复用其 parse/dump 思路，但**缺失/空不抛 MISSING** | ☑ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/quick-launch-config.ts` | 新建 | 只做加载/校验/保存/删除，不碰进程 | ☑ |
| B2 | `src-main/quick-launch-config.test.ts` | 新建 | 覆盖 §5.2 / §5.3 全部行 | ☑ |

## C. 接口契约（逐字一致，后续任务据此调用）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `export type TerminalId = 'pwsh' \| 'powershell' \| 'cmd' \| 'wsl';` | 计划 / 规格 §5.1 | ☑ |
| C2 | `export type QuickLaunchKind = 'shell' \| 'exe';` | 同上 | ☑ |
| C3 | `export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }` | 同上 | ☑ |
| C4 | `export type QuickLaunchMap = Record<string, QuickLaunchEntry>;` / `export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }` | 同上 | ☑ |
| C5 | `qlLoad(path): QuickLaunchList` / `qlSave(path, id: string \| null, entry, available: TerminalId[]): string` / `qlDelete(path, id): void` / `validateQuickLaunchName(name): boolean` | 计划 §任务 3 接口 | ☑ |
| C6 | 错误 key 名与计划 :301 / 任务 8 表 D 段逐字一致：`err.ql.nameRequired` / `nameDup` / `nameTooLong` / `typeInvalid` / `terminalMissing` / `cmdRequired` / `exeRequired` / `notFound`；YAML 与 id 格式**复用**既有 `err.config.yamlLoadFail` / `err.config.yamlEmpty` / `err.config.idFormat`，不建 `err.ql.*` 同义键；占位符名见任务 8 表 D 段注（索引 K9） | 任务 3 审查 Important #1；计划 :301 | ☑ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（覆盖 §5.2 / §5.3） | — | E 组断言全部有对应用例 | ☑ |
| D2 | 步骤 2：验证失败 | `npx vitest run src-main/quick-launch-config.test.ts` | FAIL（模块不存在） | ☑ |
| D3 | 步骤 3：实现 | — | 保存前跑 §5.3 六条校验；写入前规整字段；新 id 用 `suggestConfigId(existing, 'ql')`；成功后整表写回 | ☑ |
| D4 | 步骤 4：验证通过 | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | 全 PASS | ☑ |

## E. 必须钉住的行为断言

| # | 断言 | 期望 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | 文件不存在 → `{ items: {}, invalid: [] }`（**不抛 MISSING**） | `qlLoad(缺失路径)` | 规格 §5.2 | ☑ |
| E2 | 空文件 → 同上 |  | 规格 §5.2 | ☑ |
| E3 | YAML 解析失败 / 顶层非对象 → 抛 `/^YAML:/` |  | 规格 §5.2 | ☑ |
| E4 | 单条非法（如缺 `type`）→ 跳过该条，id 进 `invalid`，其余照常返回 | yaml 两条、一条坏 → items 1 条 + invalid 含该 id | 规格 §5.2 | ☑ |
| E5 | `name` trim 后空 → `/^VALIDATION:/` | `{ name: '  ', type: 'shell', ... }` | 规格 §5.3-1 | ☑ |
| E6 | `name` 超 64 → `VALIDATION:` |  | 规格 §5.3-1 | ☑ |
| E7 | `type` 不在 `{'shell','exe'}` → `VALIDATION:` |  | 规格 §5.3-3 | ☑ |
| E8 | `shell` 不在四种之内，或该终端不在 `available` 里 → `VALIDATION:` | `shell:'wsl'` 而 available 只有 `['pwsh']` | 规格 §5.3-4 | ☑ |
| E9 | `shell` 类型 `cmd` trim 后空 → `VALIDATION:` | `cmd: '   '` | 规格 §5.3-4 | ☑ |
| E10 | `exe` 类型 `exe` trim 后空 → `VALIDATION:`；**不校验文件存在** |  | 规格 §5.3-5 | ☑ |
| E11 | 重名（trim 后精确比较、区分大小写）→ 第二次保存抛 `VALIDATION:` |  | 规格 §5.3-2 | ☑ |
| E12 | 只写该类型字段：写 shell 条目后读回，条目上**没有 `exe` 键**；exe 条目没有 `shell`/`cmd` 键 | 用 `readText` 做字节级断言 | 规格 §5.3-6 | ☑ |
| E13 | `id === null` → 生成 `ql` 前缀且通过 `validateConfigId`；显式 id 沿用并原样返回 |  | 规格 §5.4 / §8 | ☑ |
| E14 | `qlDelete` 不存在的 id → `/^VALIDATION:/`；存在的 id → 删除后读回该键消失 |  | 规格 §8 | ☑ |
| E15 | `validateQuickLaunchName`：trim 后 1..64 为 true，其余 false |  | 计划 接口 | ☑ |
| E16 | `qlSave` 的**显式 id** 也必须通过 `validateConfigId`，否则抛 `VALIDATION:`（id 就是 yaml 的 key，与 `config.ts:129 saveConfigEntry` 同口径）；`id === null` 仍走 `suggestConfigId(existing, 'ql')` | 用例：显式 `'Bad ID'` → `VALIDATION:` | 任务 3 审查 Important #2：裁定保留并补登记（索引 K9）；§5.3 未列，但它是键契约的必要守卫 | ☑ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 缺失/空**不得**抛 `MISSING:`（与 `configsLoad` 语义不同） | 首次使用即报错，卡片打不开 | ☑ |
| F2 | 错误前缀只用 `YAML:` / `VALIDATION:`（G7） | 渲染端无法分类显示 | ☑ |
| F3 | 主进程错误消息走 `t()`，但**不得写字面量 key**：用常量映射或拼接（`t(QL_ERR.x)` / `t('err.ql.' + k)`）；不改 `src-main/i18n/dict.ts`、不改 `err-keys.ts`（口径见 `00-index.md` K8，任务 8 落地词典后再改回字面量） | 写字面量 → `key-coverage` 报「词典缺键」红；写中文硬编码 → `no-hardcoded` 红 | ☑ |
| F4 | 不引入新依赖（用仓库既有 `yaml`） | 违反 G1/G2 | ☑ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | 全 PASS | ☑ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☑ |
| G3 | `git diff --name-only` | 只含 B1-B2 | ☑ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/quick-launch-config.ts src-main/quick-launch-config.test.ts` → 已执行（主代理，修复轮 1 复审通过后） | ☑ |
| H2 | 提交信息逐字 | `feat(config): 快捷启动配置层（quick_launch.yaml）` → `c5aeb04`（2 files, +488）；口径与文档另做 `410c298`（docs，与代码分开） | ☑ |

## I. 完成判据

- [x] E1-E15 全部有测试
- [x] D2 先红、D4 后绿
- [x] G1-G3 通过
- [x] H1-H2 完成（`c5aeb04`）

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| A1 | `git status --porcelain` 与 `git rev-parse --short HEAD`（动手前） | HEAD=`be3475c`，`git status --porcelain` 无输出（工作区干净） | 起点成立 |
| D2 | `npx vitest run src-main/quick-launch-config.test.ts` | `FAIL  src-main/quick-launch-config.test.ts [ ... ]` · `Error: Failed to load url ./quick-launch-config (resolved id: ./quick-launch-config) ... Does the file exist?` · `Test Files 1 failed (1)` / `Tests no tests` · exit 1 | 先红成立（模块不存在） |
| D4（首次） | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | `Tests 1 failed / 94 passed` — 失败用例 `ql_save_rejects_name_longer_than_64_after_trim` 抛 `VALIDATION: undefined`。两处原因：实现里 `invalidError` 把「映射属性名」当 key 传给 `t()`（应传 QL_ERR 的取值）；该用例第二条保存与第一条 trim 后同名，重名判定本身是对的（夹具名字选错） | 红→修实现 `invalidError(key: string, …)`（quick-launch-config.ts:40-42）+ 改用例第二个名字，再跑见下行 |
| D4 | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | `✓ src-main/quick-launch-config.test.ts (19 tests) 173ms` · `✓ src-main/config.test.ts (76 tests) 198ms` · `Test Files 2 passed (2)` / `Tests 95 passed (95)` · exit 0 | 后绿成立（D4 = G1） |
| G1 | 同 D4 命令 | `Test Files 2 passed (2)` / `Tests 95 passed (95)` | 通过 |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无任何诊断输出，回显 `TSC_EXIT=0` | 类型门通过 |
| G3 | `git diff --name-only`；`git status --porcelain` | 填本表之前跑：`git diff --name-only` 与 `git diff --name-only HEAD` 均无输出（两个源文件新建未跟踪，按 K5 未 `git add`），`git status --porcelain` 只有 `?? src-main/quick-launch-config.ts`、`?? src-main/quick-launch-config.test.ts`。填完本表后再跑：`git diff --name-only` 只多出本表一个 docs 文件，`git status --porcelain` 为 ` M` 本表 + 上述两个 `??`（报告写在 `.superpowers/` 下，被 gitignore，不进 status） | 代码改动 = B1-B2 两个文件，未暂存未提交；主代理按 H1 暂存后跑 `git diff --name-only --cached` 应恰好是这两个 |
| C1-C5 核对 | 逐行比对 brief 的 9 条签名与 `src-main/quick-launch-config.ts:12-16`、`:118`、`:135`、`:155`、`:163` | 9/9 逐字一致；文件内 import 只有 `./i18n`、`node:fs`、`yaml`、`./config`（无新依赖）；去掉注释后无 `node-pty` / `spawn` / `child_process`；出现的错误前缀只有 `YAML: ` 与 `VALIDATION: ` | C1-C5 / B1 / F2 / F4 成立 |
| V4（索引跨任务门，本任务新增错误消息） | `npx vitest run src-main/i18n src/i18n.test.ts` | `Test Files 5 passed (5)` / `Tests 22 passed (22)`（含 `key-coverage`、`no-hardcoded`、`dict`） | F3 成立：未写字面量 key、未写汉字；测试日志里的 `[i18n] missing key: err.ql.*` 是 K8 预期现象，任务 8 落地词典后消失 |
| 修复轮 1（审查 Important #1 → C6 / E16） | 改名原因：`QL_ERR` 原写 `nameDuplicate` / `badType` / `badTerminal`，与计划 :301、任务 8 表 D2 / D3 / D4 已登记的 `nameDup` / `typeInvalid` / `terminalMissing` 不一致；另有 `err.ql.yamlLoadFail` / `err.ql.yamlNotObject` / `err.ql.idFormat` 三个凭空新增的同义键，词典里已有 `err.config.yamlLoadFail`（`dict.ts:220` / `:500`）、`err.config.yamlEmpty`（`:221` / `:501`）、`err.config.idFormat`（`:226` / `:506`）。改动：`:31-40` 映射改名并删掉那三条；`:58` 改 `t('err.config.yamlLoadFail', { name, msg })`、`:61` 改 `t('err.config.yamlEmpty', { name })`、`:141` 改 `t('err.config.idFormat')`（去掉原传的 `{ id }`），三处写法与 `config.ts:51` / `:54` / `:129` 逐字同构；`:106` 取 `QL_ERR.terminalMissing`（占位符 `{terminal}` 不变）、`:117` 取 `QL_ERR.typeInvalid`（`{type}` 不变）、`:150` 取 `QL_ERR.nameDup`（`{name}` 不变）；`:103` `err.ql.nameTooLong` 与 `{max}` 保持（已登记任务 8 D11）；`:141` 的 `validateConfigId` 守卫代码未动（E16） | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` → `✓ src-main/quick-launch-config.test.ts (19 tests)`、`✓ src-main/config.test.ts (76 tests)`、`Test Files 2 passed (2)`、`Tests 95 passed (95)`、exit 0（stderr 的缺 key 告警现为 `err.ql.terminalMissing` / `err.ql.nameDup` 等新名，无 `err.config.*` 告警，说明复用键已取到译文）。`npx tsc -p tsconfig.main.json --noEmit` → 无诊断输出、exit 0。`npx vitest run src-main/i18n src/i18n.test.ts` → `Test Files 5 passed (5)`、`Tests 22 passed (22)`、exit 0。反向探针：把 `:58` 的 `{ msg }` 临时写成 `{ message: msg }` 后 `npx vitest run src-main/i18n/key-coverage.test.ts` → `FAIL … 调用点传的占位符名与词典取值里的 {name} 双向一致`、`+ "file": "src-main/quick-launch-config.ts"`、exit 1，随后已还原 | C6 / E16 成立。副带效果（审查者的「顺带」）：复用词典既有键后这三处走字面量 `t()`，占位符名进入 `key-coverage` 的双向比对（`:44` / `:131-151`），探针已证；`err.ql.*` 五处仍靠常量映射（K8），其占位符名要等任务 8 改回字面量时才受守护，故任务 8 表 D 段注已逐字登记占位符名。`git status --porcelain` 只有本表 ` M` 与两个 `??` 源文件，`dict.ts` / `err-keys.ts` 一行未改 |
| 验收（主代理复跑，修复后） | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts`；`npx vitest run src-main/i18n src/i18n.test.ts`；`npx tsc -p tsconfig.main.json --noEmit`；`git status --porcelain`；grep 本文件的 `err\.ql\.` / `err\.config\.` | `Tests 95 passed (95)` exit 0；`Tests 22 passed (22)` exit 0；`TSC_EXIT=0`；范围 = 两个新建源文件 + 本表；键名实测为计划 :301 的 8 个 `err.ql.*` + 复用的 3 个 `err.config.*`（:32-39 / :58 / :61 / :141） | 与 J 段自述一致；定向复审：两条发现均 ADDRESSED、无新破坏 → 验收通过 |
