# 任务 3 报告 · 配置层 `quick-launch-config.ts`

> 简报：`.superpowers/sdd/2026-10-10-quick-launch-card/task-03-brief.md`
> check 表：`docs/superpowers/checks/2026-10-10-quick-launch-card/task-03-quick-launch-config.md`（A→G 已勾，J 段已填真实输出；H 段与 I 段最后一条按 K5 留空）
> 状态：**DONE**（一处「§5.3 六条之外」的实现决策在 §7.2 标出，供验收裁定）

## 1 结论

- 新建 `src-main/quick-launch-config.ts`（167 行）与 `src-main/quick-launch-config.test.ts`（318 行，19 个用例）。
- 严格 TDD：D2 先红（模块不存在）→ 实现 → D4 后绿。最终 `95 passed`（本任务 19 + config.test.ts 76）。
- 类型门 `npx tsc -p tsconfig.main.json --noEmit` 无错；i18n 硬门（`key-coverage` / `no-hardcoded` / `dict`）全绿。
- 未 `git add`、未 commit；`git status --porcelain` 只有这两个新建文件。

## 2 起点核对（A 段）

| 项 | 结果 |
|---|---|
| A1 工作区干净 | `git status --porcelain` 无输出，HEAD=`be3475c` ✅ |
| A2 临时目录写法 | 已读 `src-main/test-utils.ts:5-30`；测试只用 `tmpPath / rm / writeText / readText`（不需要 `mkDir / jp`，本任务不建子目录）✅ |
| A3 YAML 读写口径 | 已读 `src-main/config.ts:45-57`（`parseYaml`）、`:94-104`（`configsLoad`）、`:128-143`（`saveConfigEntry` 整表写回）；照搬 parse/dump 与「读→改→写回」思路，但 `qlLoad` 缺失/空**不抛 MISSING** ✅ |
| 前置任务 2 | `src-main/config.ts:117` 确为 `suggestConfigId(existing: string[], prefix = 'tpl')`；本任务调用 `suggestConfigId(Object.keys(map), 'ql')`（`quick-launch-config.ts:148`）✅ |

## 3 改动范围（B 段）

只两个文件，均为新建：`src-main/quick-launch-config.ts`、`src-main/quick-launch-config.test.ts`。
`config.ts` / `test-utils.ts` / `i18n/dict.ts` / `i18n/err-keys.ts` 一行未改（`git status --porcelain` 可证）。

## 4 接口实现说明（C 段）

九条契约与 brief 逐字一致（脚本逐行比对，命中 `quick-launch-config.ts:12,13,14,15,16,118,135,155,163`）：

```ts
export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
export type QuickLaunchKind = 'shell' | 'exe';
export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }
export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }
export function qlLoad(path: string): QuickLaunchList
export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry, available: TerminalId[]): string
export function qlDelete(path: string, id: string): void
export function validateQuickLaunchName(name: string): boolean
```

内部结构（全部模块私有，不外泄）：

| 位置 | 作用 |
|---|---|
| `QL_ERR`（:25-37）+ `invalidError(key, params)`（:40-42） | K8 口径：词典 key 放常量映射，`t()` 收**变量** key → `key-coverage.test.ts:39-41` 的 `KEY_CALL` 不匹配 → 不报「词典缺键」 |
| `isTerminalId`（:44-46） | 四种终端的类型守卫，加载与保存共用 |
| `parseYamlMap`（:49-61） | 解析失败 → `YAML:`；顶层为 null / 标量 / **数组** → `YAML:`（`config.ts:53` 未判数组；规格 §5.2 写的是「顶层非对象」，故这里补 `Array.isArray`） |
| `readRawMap`（:65-70） | 缺失 / 空 → `{}`（**不抛 MISSING**，check F1）；否则返回未校验的原始映射 |
| `normalizeEntry`（:75-92） | 加载路径的条目校验 + 字段规整；非法返回 `null` → 该 id 进 `invalid` |
| `validateEntry`（:96-115） | 保存路径的 §5.3 校验（1/3/4/5/6 条），通过则返回「只含该类型字段」的条目 |
| `qlSave`（:135-152） | 校验 → 显式 id 格式 → 重名（跳过自身 id）→ `id === null` 走 `suggestConfigId(…, 'ql')` → 整表 `dump` 写回 → 返回最终 id |
| `qlDelete`（:155-160） | `hasOwnProperty` 判定 → 不存在即 `VALIDATION:`；删除后整表写回 |

不碰进程：去掉注释后文件里没有 `node-pty` / `spawn` / `child_process`；import 只有 `./i18n`、`node:fs`、`yaml`（仓库既有）、`./config`。

## 5 TDD 过程（D 段）

| 步 | 命令 | 实际输出 |
|---|---|---|
| D1 | — | 先写 19 个用例，覆盖 E1–E15（对应表见 §6） |
| D2 | `npx vitest run src-main/quick-launch-config.test.ts` | `FAIL src-main/quick-launch-config.test.ts` · `Error: Failed to load url ./quick-launch-config (resolved id: ./quick-launch-config) in D:/Dev/Projects/lms_launcher/src-main/quick-launch-config.test.ts. Does the file exist?` · `Test Files 1 failed (1)` / `Tests no tests` · exit 1 |
| D3 | — | 实现：六条校验 + 字段规整 + `suggestConfigId(…, 'ql')` + 整表写回 |
| D4 首次 | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | `Tests 1 failed / 94 passed`：`ql_save_rejects_name_longer_than_64_after_trim` 抛 `VALIDATION: undefined`。两个原因：① 实现里 `invalidError` 参数写成 `keyof typeof QL_ERR`，调用处传的却是 QL_ERR 的**取值** → 取到 `undefined`（前缀仍对，所以只有「本该成功却被拒」的用例暴露它）；② 该用例第二条保存的名字与第一条 trim 后同名，重名判定本身正确，是夹具名字选错 |
| D4 | 同上 | `✓ src-main/quick-launch-config.test.ts (19 tests) 173ms` · `✓ src-main/config.test.ts (76 tests) 198ms` · `Test Files 2 passed (2)` / `Tests 95 passed (95)` · exit 0 |

修 ① = `invalidError` 改为收「词典 key 本身」（`quick-launch-config.ts:39-42`）；修 ② = 第二个名字换成另一个 64 字符串（仍验 trim 后计数）。两处都是先看到红再改。

## 6 E1–E15 ↔ 用例对应表

| E# | 用例（`src-main/quick-launch-config.test.ts` 行号） | 关键断言 |
|---|---|---|
| E1 | `ql_load_missing_file_returns_empty_list_without_MISSING`（:24） | `rm(p)` 后 `qlLoad(p)` 等于 `{ items: {}, invalid: [] }`（不抛 MISSING，兼 check F1） |
| E2 | `ql_load_empty_or_blank_file_returns_empty_list`（:31） | 空文件 / 空格 / 裸换行 / 制表符四种空白 → 空表 |
| E3 | `ql_load_yaml_parse_error_throws_yaml_prefix`（:42）、`ql_load_top_level_not_object_throws_yaml_prefix`（:53） | 未闭合引号、缩进错乱 → `/^YAML:/`；顶层数组、顶层标量 → `/^YAML:/` |
| E4 | `ql_load_skips_entry_missing_type_and_collects_its_id`（:87）、`ql_load_collects_every_invalid_entry_shape`（:109） | 两条中一条缺 `type` → items 1 条 + `invalid` 含该 id；另一例覆盖缺 name / 空白 name / 坏 type / 标量条目 / null 条目 / 缺 cmd / 终端不在四种 / 缺 exe 共 8 种形态，合法条目不受牵连 |
| E5 | `ql_save_rejects_blank_name_and_writes_nothing`（:152） | `name: '  '` 与 `name: ''` → `/^VALIDATION:/`；失败后 `qlLoad` 仍是空表（校验失败不落盘） |
| E6 | `ql_save_rejects_name_longer_than_64_after_trim`（:161） | 64 字符通过；65 → `VALIDATION:`；另一个 64 字符两侧带空格仍通过（按 trim 后计数） |
| E7 | `ql_save_rejects_type_outside_shell_and_exe`（:173） | `type: 'bat'`、缺 `type` → `VALIDATION:` |
| E8 | `ql_save_rejects_terminal_outside_four_or_not_available`（:183） | `shell:'wsl'` 而 available 只有 `['pwsh']` → `VALIDATION:`；`shell:'wt'`（不在四种）即使 available 含它也 → `VALIDATION:`；缺 `shell` → `VALIDATION:`；四种终端各自在 available 内均通过 |
| E9 | `ql_save_rejects_blank_cmd_for_shell_entry`（:196） | `cmd: '   '` 与缺 `cmd` → `VALIDATION:` |
| E10 | `ql_save_rejects_blank_exe_but_never_checks_file_existence`（:205） | `exe: '   '` / 缺 `exe` → `VALIDATION:`；不存在的 `D:\no-such-dir\no-such.exe` 保存成功并读回（不校验文件存在） |
| E11 | `ql_save_rejects_duplicate_name_compared_trimmed_case_sensitive`（:217） | 同名、以及 `'  A  '`（trim 后同名）→ 第二次 `VALIDATION:`；`'a'` 与 `'A'` 区分大小写 → 允许；用同一 id 覆盖保存自己（同名）→ 不报重名 |
| E12 | `ql_save_writes_only_the_fields_of_that_kind`（:232） | 写 shell 条目（故意带 `exe`）后用 `readText` 断言 `not.toMatch(/^\s*exe:/m)`（字节级）；写 exe 条目（故意带 `shell`/`cmd`）后断言无 `shell:` / `cmd:`；`qlLoad` 读回的对象也没有这些键 |
| E13 | `ql_save_generates_ql_prefixed_valid_id_or_keeps_explicit_id`（:257） | `id === null` → `/^ql/` 且 `validateConfigId(id) === true` 且它就是 yaml 的 key；显式 `'qlkeep01'` 原样返回并作为 key；连续生成 5 个 id 互不相同；显式 id 格式非法 → `VALIDATION:`（见 §7.2） |
| E14 | `ql_delete_unknown_id_throws_validation_and_removes_existing_key`（:276） | 不存在的 id → `/^VALIDATION:/`（两次；文件不存在时同样是 VALIDATION 而非 MISSING）；删除后 `qlLoad` 只剩另一条，且 `readText` 断言该 key 已从文件消失 |
| E15 | `validate_quick_launch_name_accepts_trimmed_length_1_to_64`（:291） | `'A'` / `'  A  '` / 64 字符 / 带空格的 64 字符 → true；`''` / 空白 / 换行制表 / 65 字符 → false |
| （补） | `ql_load_reads_the_shape_from_spec_5_1`（:64） | 规格 §5.1 示例 yaml 原样读回（E4 的正面对照） |
| （补） | `ql_save_preserves_other_entries_including_invalid_ones`（:303） | 保存不得抹掉文件里的其它条目，包括 `qlLoad` 判为 invalid 的那些（对应 D3「成功后整表写回」） |

## 7 实现决策与偏离（验收时请逐条裁定）

### 7.1 保存 / 删除走「原始映射」，不走 `qlLoad().items`

若 `qlSave` 以 `qlLoad` 的 `items` 为基线写回，一次保存会把 `invalid` 里的条目从文件里静默删除（用户手改坏的条目再也找不回来）。因此 `readRawMap` 返回未校验映射，保存与删除都在它上面做；`invalid` 条目原样保留，下次加载仍报 invalid。用例：`ql_save_preserves_other_entries_including_invalid_ones`。

### 7.2 显式 id 仍过 `validateConfigId`（§5.3 六条之外的一条守卫）

`quick-launch-config.ts:137`：`id !== null && !validateConfigId(id)` → `VALIDATION:`。理由：id 就是 yaml 的 key，必须满足 `validateConfigId`（小写字母开头、`[a-z0-9]`、≤32），与 `config.ts:129 saveConfigEntry` 同一口径；否则任务 6 的 `ql_save` 会把不合规的 key 写进文件。check 表 E13 只要求「显式 id 沿用」，这条属于额外守卫，已用测试钉住（`:257` 用例里 `'Bad ID'` → `VALIDATION:`）。**若认为不该加：删掉 :137 一行并同步删该断言即可，其余不受影响。**

### 7.3 加载路径的校验范围

`normalizeEntry` 只判 §5.3 的 1/3/4/5 条（形状与必填），**不判** §5.3-2（重名）与 §5.3-4 的「终端当前可用」——两者只在保存路径成立（§5.2 只说「单条条目非法」，加载时也没有 available 参数）。name 超 64 在加载路径按非法处理（进 `invalid`），与保存路径同一标准。

### 7.4 加载即规整

`qlLoad` 返回的条目一律 trim 过 name/cmd/exe，且只含该类型字段（异类键丢弃）。这样「items 里的条目形状规范」对加载与保存两条路径同时成立，卡片（任务 11）与弹窗（任务 12）不必再防脏数据。

### 7.5 `qlDelete` 用 `hasOwnProperty` 而非 `in`

`'toString' in {}` 为 true，用 `in` 会把原型链上的名字当成存在的条目。改用 `Object.prototype.hasOwnProperty.call`（:157）。

### 7.6 K8 落地方式

`QL_ERR` 常量映射 + `invalidError(key: string)`（:25-42）。**未改** `dict.ts` / `err-keys.ts`。测试只断 `/^VALIDATION:/`、`/^YAML:/` 前缀。
副作用（预期内）：跑本任务测试时 stderr 会打印若干 `[i18n] missing key: err.ql.* (lang=zh)`——`i18n/index.ts:19-21` 在非 production 下对缺 key 的告警，任务 8 落地词典后自动消失。

## 8 回归门实际输出（G 段 + 索引 V4）

| # | 命令 | 输出摘要 |
|---|---|---|
| G1 | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | `Test Files 2 passed (2)` / `Tests 95 passed (95)` |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无诊断输出，回显 `TSC_EXIT=0` |
| G3 | `git diff --name-only` / `git diff --name-only HEAD` / `git status --porcelain` | 前两条无输出（两个文件新建未跟踪，按 K5 未 `git add`）；`git status --porcelain` 只有 `?? src-main/quick-launch-config.ts`、`?? src-main/quick-launch-config.test.ts` |
| V4 | `npx vitest run src-main/i18n src/i18n.test.ts` | `Test Files 5 passed (5)` / `Tests 22 passed (22)`（`key-coverage`、`no-hardcoded`、`dict`、`index`、`src/i18n`） |

注：G3 的「只含 B1-B2」在「未 add」前提下只能靠 `git status --porcelain` 证明——`git diff --name-only` 对未跟踪文件恒为空。主代理按 H1 暂存后跑 `git diff --name-only --cached` 应恰好是这两个文件。

## 9 自审

- A/B/C/D/E/F 全部成立（见 check 表勾选与 J 段真实输出）；H 段与 I 段最后一条按 K5 留空未勾。
- 未越界：没做规格 §2 非目标（参数、工作目录、多发行版 WSL、排序、录制回放、命令历史、日志落盘），没碰进程，没引新依赖，没改词典与 `err-keys.ts`。
- 未跑全量 `npm test`：索引 V5 把全量门钉在任务 13 步骤 4 与任务 14 之前；本任务只新增文件、无既有文件被改，`tsc` 与 i18n 守护已覆盖跨文件影响面。

## 10 疑虑 / 留给主代理

1. §7.2 的显式 id 格式守卫是「§5.3 六条」之外的行为，请确认是否符合 plan 意图（删除成本：一行 + 一条断言）。
2. `qlLoad` 把「name 超 64」的条目判为非法（进 `invalid`）。规格没直接写这条，是由 §5.3-1 的长度上限推出；若加载路径应当宽容保留，需改 `normalizeEntry:79`。
3. 测试日志里的 `[i18n] missing key: err.ql.*` 告警会存在到任务 8，属 K8 预期，不是失败。
4. 本任务不创建真实的 `<dataDir>/configs/quick_launch.yaml`（夹具只在 `os.tmpdir()/lms_launcher_test` 下），与 `configsLoad` 一样「不代为创建文件」；首次打开卡片由 `qlLoad` 返回空表。

---

# 修复轮 1（2026-10-11）· 任务审查 Important #1：`QL_ERR` key 名与计划 / check 表登记清单不一致

状态：**DONE**。范围只有 key 名与占位符；未动词典（`dict.ts` / `err-keys.ts` 一行未改），未动次要项（`__proto__`、`available` 数组防御、加载路径夹具、抽 `str()` 等按主代理裁决留给最终整分支审查），未 `git add`、未 commit。

## 11.1 改动前后对照（`src-main/quick-launch-config.ts`；旧行号 = 修复前 167 行版本，新行号 = 修复后）

| 旧行 | 修复前 | 新行 | 修复后 | 依据 |
|---|---|---|---|---|
| :26 | `yamlLoadFail: 'err.ql.yamlLoadFail',` | —（删除） | 映射里不再有该条 | 索引 K9 / 任务 8 表 D 段注「不新增、直接复用词典已有键」 |
| :27 | `yamlNotObject: 'err.ql.yamlNotObject',` | —（删除） | 同上 | 同上 |
| :30 | `nameDuplicate: 'err.ql.nameDuplicate',` | :34 | `nameDup: 'err.ql.nameDup',` | 计划 :301、任务 8 D2 |
| :31 | `badType: 'err.ql.badType',` | :35 | `typeInvalid: 'err.ql.typeInvalid',` | 计划 :301、任务 8 D3 |
| :32 | `badTerminal: 'err.ql.badTerminal',` | :36 | `terminalMissing: 'err.ql.terminalMissing',` | 计划 :301、任务 8 D4 |
| :35 | `idFormat: 'err.ql.idFormat',` | —（删除） | 映射里不再有该条 | 复用 `err.config.idFormat` |
| :22-24（注释） | 只说明 K8 的传 key 方式 | :25-30（新增注释） | 逐字列出占位符名与「YAML / id 格式复用 `err.config.*`」的口径，附 `dict.ts:220-226 / :500-506` 取证 | 任务 8 表 D 段占位符注 |
| :55 | `throw new Error('YAML: ' + t(QL_ERR.yamlLoadFail, { name: FILE_LABEL, msg }));` | :58 | `throw new Error('YAML: ' + t('err.config.yamlLoadFail', { name: FILE_LABEL, msg }));` | `dict.ts:220` 取值就是 `{name} 失败: {msg}`；写法与 `config.ts:51` 同构 |
| :58 | `throw new Error('YAML: ' + t(QL_ERR.yamlNotObject, { name: FILE_LABEL }));` | :61 | `throw new Error('YAML: ' + t('err.config.yamlEmpty', { name: FILE_LABEL }));` | `dict.ts:221`；与 `config.ts:54` 同构 |
| :103 | `throw invalidError(QL_ERR.badTerminal, { terminal: String(e.shell ?? '') });` | :106 | `throw invalidError(QL_ERR.terminalMissing, { terminal: String(e.shell ?? '') });`（占位符 `{terminal}` 不变） | 主代理裁决 4 |
| :114 | `throw invalidError(QL_ERR.badType, { type: String(e.type ?? '') });` | :117 | `throw invalidError(QL_ERR.typeInvalid, { type: String(e.type ?? '') });`（`{type}` 不变） | 同上 |
| :137 | `if (id !== null && !validateConfigId(id)) throw invalidError(QL_ERR.idFormat, { id });` | :140-141 | `// 词典已有键 → 写字面量 t()，与 config.ts:129 同一写法（无占位符，见索引 K9）` + `if (id !== null && !validateConfigId(id)) throw new Error('VALIDATION: ' + t('err.config.idFormat'));`（**`{ id }` 已去掉**，`dict.ts:226` 无占位符） | 裁决 2；守卫本身保留（E16 / K9） |
| :146 | `if (otherName === clean.name) throw invalidError(QL_ERR.nameDuplicate, { name: clean.name });` | :150 | `if (otherName === clean.name) throw invalidError(QL_ERR.nameDup, { name: clean.name });`（`{name}` 不变） | 裁决 1 / 4 |
| :100 | `throw invalidError(QL_ERR.nameTooLong, { max: NAME_MAX });` | :103 | **未改**（键名 `err.ql.nameTooLong` 与 `{max}` 正是裁决 3 要求的写法） | 计划 :301、任务 8 D11 |
| :157 | `… throw invalidError(QL_ERR.notFound, { id });` | :161 | **未改**（`err.ql.notFound` + `{id}` 已符合） | 裁决 4 |

`nameRequired` / `cmdRequired` / `exeRequired` 三处仍无占位符（:102 / :109 / :114），符合裁决 4。测试文件一行未改：19 个用例只断 `/^VALIDATION:/`、`/^YAML:/` 前缀，与 key 名无关（`badType01` / `badTerm01` 是夹具 id，不是 key）。

## 11.2 本轮跑过的命令与真实输出

| # | 命令 | 实际输出（摘要） |
|---|---|---|
| G1 | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | `✓ src-main/quick-launch-config.test.ts (19 tests) 191ms` · `✓ src-main/config.test.ts (76 tests) 194ms` · `Test Files 2 passed (2)` / `Tests 95 passed (95)` · exit 0。stderr 的缺 key 告警已变成新名（`err.ql.terminalMissing` / `err.ql.cmdRequired` / `err.ql.exeRequired` / `err.ql.nameDup` / `err.ql.notFound`），且**没有** `err.config.*` 告警 → 复用的三个键确实取到译文 |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无任何诊断输出，回显 `G2_EXIT=0` |
| V4 | `npx vitest run src-main/i18n src/i18n.test.ts` | `Test Files 5 passed (5)` / `Tests 22 passed (22)`（`index` / `key-coverage` / `no-hardcoded` / `dict` / `src/i18n`）· exit 0 |
| 反向探针 | 临时把 :58 的 `{ msg }` 写成 `{ message: msg }`，跑 `npx vitest run src-main/i18n/key-coverage.test.ts` | `FAIL … 调用点传的占位符名与词典取值里的 {name} 双向一致` · `+ "file": "src-main/quick-launch-config.ts"` · `Tests 1 failed ∥ 1 passed (2)` · exit 1 → **已还原**（还原后重跑 G1/G2/V4 全绿，见上三行） |
| G3 | `git status --porcelain` · `git diff --name-only` · `git rev-parse --short HEAD` | ` M docs/superpowers/checks/…/task-03-quick-launch-config.md` + `?? src-main/quick-launch-config.ts` + `?? src-main/quick-launch-config.test.ts`；HEAD=`410c298`。词典与 `err-keys.ts` 不在改动列表里 |

## 11.3 副带效果与残留缺口（审查者「顺带」那条）

- 复用的三个键词典里已存在，因此写成**字面量** `t()`：`key-coverage.test.ts` 的 `KEY_CALL`（:39-41）与 `CALL_WITH_PARAMS`（:44）都会覆盖它们 → `{name}` / `{msg}` 的拼写从此受双向比对守护（反向探针已证）。
- `err.ql.*` 八处仍走常量映射（K8 要求，词典未落地前写字面量必红），其占位符名 `{max}` / `{name}` / `{type}` / `{terminal}` / `{id}` **本轮仍无守护**；已逐字写进任务 8 表 D 段注与本文件 :25-30 注释，任务 8 把调用点改回字面量 `t()` 时该守护自动生效。
- check 表只按要求改了三处：C6 ☐→☑、E16 ☐→☑、J 段新增「修复轮 1」一行（含改名原因、命令、真实输出）。表其余行未动。

