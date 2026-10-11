# 修复轮 1 审查包 · 任务 3

FIX_BASE = 410c298（上一次审查看到的 HEAD；两个源码文件是**未跟踪**文件，git diff 不显示，故用上一轮审查包里的旧全文与当前文件做 --no-index 对比）
Head = 410c298（按 K5 实现者不提交，改动在工作区）

## git status --porcelain（方括号定界，前导空格 = 未暂存）

```
 M docs/superpowers/checks/2026-10-10-quick-launch-card/task-03-quick-launch-config.md
?? src-main/quick-launch-config.test.ts
?? src-main/quick-launch-config.ts
```

## 修复 diff：src-main/quick-launch-config.ts（左 = 上一轮审查看到的版本，右 = 当前）

```diff
diff --git a/.superpowers/sdd/2026-10-10-quick-launch-card/task-03-prev-config.ts.txt b/src-main/quick-launch-config.ts
index 7bb51b6..a548725 100644
--- a/.superpowers/sdd/2026-10-10-quick-launch-card/task-03-prev-config.ts.txt
+++ b/src-main/quick-launch-config.ts
@@ -22,17 +22,20 @@ const FILE_LABEL = 'quick_launch.yaml';
 // 已定口径 K8（check F3）：err.ql.* 词典键要到任务 8 才落地。key-coverage.test.ts:39-41 的 KEY_CALL
 // 只认「t('字面量')」，写死字面量就报「词典缺键」；这里用常量映射传 key（正则不匹配 → 该守护跳过），
 // 任务 8 落地词典后再把调用点改回字面量 t()。错误前缀只有 YAML: / VALIDATION:（check F2 / 索引 G7）。
+// key 名与计划 :301 / 任务 8 表 D1–D11 逐字一致（索引 K9 / check C6），占位符名见任务 8 表 D 段注：
+// nameTooLong→{max}、nameDup→{name}、typeInvalid→{type}、terminalMissing→{terminal}、notFound→{id}，
+// nameRequired / cmdRequired / exeRequired 无占位符。
+// YAML 与 id 格式**不建 err.ql.* 同义键**（索引 K9）：复用词典既有的 err.config.yamlLoadFail /
+// err.config.yamlEmpty / err.config.idFormat（dict.ts:220-226 / :500-506）。词典里已有这三个键，
+// 所以它们写成字面量 t()——key-coverage 的占位符双向比对（:44 / :131-151）正好守护 {name}/{msg} 拼写。
 const QL_ERR = {
-  yamlLoadFail: 'err.ql.yamlLoadFail',
-  yamlNotObject: 'err.ql.yamlNotObject',
   nameRequired: 'err.ql.nameRequired',
   nameTooLong: 'err.ql.nameTooLong',
-  nameDuplicate: 'err.ql.nameDuplicate',
-  badType: 'err.ql.badType',
-  badTerminal: 'err.ql.badTerminal',
+  nameDup: 'err.ql.nameDup',
+  typeInvalid: 'err.ql.typeInvalid',
+  terminalMissing: 'err.ql.terminalMissing',
   cmdRequired: 'err.ql.cmdRequired',
   exeRequired: 'err.ql.exeRequired',
-  idFormat: 'err.ql.idFormat',
   notFound: 'err.ql.notFound',
 } as const;
 
@@ -52,10 +55,10 @@ function parseYamlMap(s: string): Record<string, unknown> {
     parsed = parse(s);
   } catch (e) {
     const msg = e instanceof Error ? e.message : String(e);
-    throw new Error('YAML: ' + t(QL_ERR.yamlLoadFail, { name: FILE_LABEL, msg }));
+    throw new Error('YAML: ' + t('err.config.yamlLoadFail', { name: FILE_LABEL, msg }));
   }
   if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
-    throw new Error('YAML: ' + t(QL_ERR.yamlNotObject, { name: FILE_LABEL }));
+    throw new Error('YAML: ' + t('err.config.yamlEmpty', { name: FILE_LABEL }));
   }
   return parsed as Record<string, unknown>;
 }
@@ -100,7 +103,7 @@ function validateEntry(entry: QuickLaunchEntry, available: readonly TerminalId[]
   if (name.length > NAME_MAX) throw invalidError(QL_ERR.nameTooLong, { max: NAME_MAX });
   if (e.type === 'shell') {
     if (!isTerminalId(e.shell) || !available.includes(e.shell)) {
-      throw invalidError(QL_ERR.badTerminal, { terminal: String(e.shell ?? '') });
+      throw invalidError(QL_ERR.terminalMissing, { terminal: String(e.shell ?? '') });
     }
     const cmd = typeof e.cmd === 'string' ? e.cmd.trim() : '';
     if (cmd.length === 0) throw invalidError(QL_ERR.cmdRequired);
@@ -111,7 +114,7 @@ function validateEntry(entry: QuickLaunchEntry, available: readonly TerminalId[]
     if (exe.length === 0) throw invalidError(QL_ERR.exeRequired);
     return { name, type: 'exe', exe };
   }
-  throw invalidError(QL_ERR.badType, { type: String(e.type ?? '') });
+  throw invalidError(QL_ERR.typeInvalid, { type: String(e.type ?? '') });
 }
 
 /** 加载（规格 §5.2）：缺失/空 → 空表；YAML 坏或顶层非对象 → YAML:；单条非法 → 跳过该条、id 收进 invalid。 */
@@ -134,7 +137,8 @@ export function qlLoad(path: string): QuickLaunchList {
  */
 export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry, available: TerminalId[]): string {
   const clean = validateEntry(entry, available);
-  if (id !== null && !validateConfigId(id)) throw invalidError(QL_ERR.idFormat, { id });
+  // 词典已有键 → 写字面量 t()，与 config.ts:129 同一写法（无占位符，见索引 K9）
+  if (id !== null && !validateConfigId(id)) throw new Error('VALIDATION: ' + t('err.config.idFormat'));
   const map = readRawMap(path);
   // §5.3-2：与其它条目不重复——trim 后精确比较、区分大小写
   for (const [otherId, raw] of Object.entries(map)) {
@@ -143,7 +147,7 @@ export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry,
       && typeof (raw as Record<string, unknown>)['name'] === 'string'
       ? ((raw as Record<string, unknown>)['name'] as string).trim()
       : '';
-    if (otherName === clean.name) throw invalidError(QL_ERR.nameDuplicate, { name: clean.name });
+    if (otherName === clean.name) throw invalidError(QL_ERR.nameDup, { name: clean.name });
   }
   const finalId = id === null ? suggestConfigId(Object.keys(map), 'ql') : id;
   map[finalId] = clean;
```

## 同期 check 表 diff（docs，主代理与实现者的记录，不属于代码范围）

```diff
diff --git a/docs/superpowers/checks/2026-10-10-quick-launch-card/task-03-quick-launch-config.md b/docs/superpowers/checks/2026-10-10-quick-launch-card/task-03-quick-launch-config.md
index eb5891d..1d79879 100644
--- a/docs/superpowers/checks/2026-10-10-quick-launch-card/task-03-quick-launch-config.md
+++ b/docs/superpowers/checks/2026-10-10-quick-launch-card/task-03-quick-launch-config.md
@@ -27,7 +27,7 @@
 | C3 | `export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }` | 同上 | ☑ |
 | C4 | `export type QuickLaunchMap = Record<string, QuickLaunchEntry>;` / `export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }` | 同上 | ☑ |
 | C5 | `qlLoad(path): QuickLaunchList` / `qlSave(path, id: string \| null, entry, available: TerminalId[]): string` / `qlDelete(path, id): void` / `validateQuickLaunchName(name): boolean` | 计划 §任务 3 接口 | ☑ |
-| C6 | 错误 key 名与计划 :301 / 任务 8 表 D 段逐字一致：`err.ql.nameRequired` / `nameDup` / `nameTooLong` / `typeInvalid` / `terminalMissing` / `cmdRequired` / `exeRequired` / `notFound`；YAML 与 id 格式**复用**既有 `err.config.yamlLoadFail` / `err.config.yamlEmpty` / `err.config.idFormat`，不建 `err.ql.*` 同义键；占位符名见任务 8 表 D 段注（索引 K9） | 任务 3 审查 Important #1；计划 :301 | ☐ |
+| C6 | 错误 key 名与计划 :301 / 任务 8 表 D 段逐字一致：`err.ql.nameRequired` / `nameDup` / `nameTooLong` / `typeInvalid` / `terminalMissing` / `cmdRequired` / `exeRequired` / `notFound`；YAML 与 id 格式**复用**既有 `err.config.yamlLoadFail` / `err.config.yamlEmpty` / `err.config.idFormat`，不建 `err.ql.*` 同义键；占位符名见任务 8 表 D 段注（索引 K9） | 任务 3 审查 Important #1；计划 :301 | ☑ |
 
 ## D. TDD 步骤门
 
@@ -57,7 +57,7 @@
 | E13 | `id === null` → 生成 `ql` 前缀且通过 `validateConfigId`；显式 id 沿用并原样返回 |  | 规格 §5.4 / §8 | ☑ |
 | E14 | `qlDelete` 不存在的 id → `/^VALIDATION:/`；存在的 id → 删除后读回该键消失 |  | 规格 §8 | ☑ |
 | E15 | `validateQuickLaunchName`：trim 后 1..64 为 true，其余 false |  | 计划 接口 | ☑ |
-| E16 | `qlSave` 的**显式 id** 也必须通过 `validateConfigId`，否则抛 `VALIDATION:`（id 就是 yaml 的 key，与 `config.ts:129 saveConfigEntry` 同口径）；`id === null` 仍走 `suggestConfigId(existing, 'ql')` | 用例：显式 `'Bad ID'` → `VALIDATION:` | 任务 3 审查 Important #2：裁定保留并补登记（索引 K9）；§5.3 未列，但它是键契约的必要守卫 | ☐ |
+| E16 | `qlSave` 的**显式 id** 也必须通过 `validateConfigId`，否则抛 `VALIDATION:`（id 就是 yaml 的 key，与 `config.ts:129 saveConfigEntry` 同口径）；`id === null` 仍走 `suggestConfigId(existing, 'ql')` | 用例：显式 `'Bad ID'` → `VALIDATION:` | 任务 3 审查 Important #2：裁定保留并补登记（索引 K9）；§5.3 未列，但它是键契约的必要守卫 | ☑ |
 
 ## F. 本任务相关的硬约束
 
@@ -103,3 +103,4 @@
 | G3 | `git diff --name-only`；`git status --porcelain` | 填本表之前跑：`git diff --name-only` 与 `git diff --name-only HEAD` 均无输出（两个源文件新建未跟踪，按 K5 未 `git add`），`git status --porcelain` 只有 `?? src-main/quick-launch-config.ts`、`?? src-main/quick-launch-config.test.ts`。填完本表后再跑：`git diff --name-only` 只多出本表一个 docs 文件，`git status --porcelain` 为 ` M` 本表 + 上述两个 `??`（报告写在 `.superpowers/` 下，被 gitignore，不进 status） | 代码改动 = B1-B2 两个文件，未暂存未提交；主代理按 H1 暂存后跑 `git diff --name-only --cached` 应恰好是这两个 |
 | C1-C5 核对 | 逐行比对 brief 的 9 条签名与 `src-main/quick-launch-config.ts:12-16`、`:118`、`:135`、`:155`、`:163` | 9/9 逐字一致；文件内 import 只有 `./i18n`、`node:fs`、`yaml`、`./config`（无新依赖）；去掉注释后无 `node-pty` / `spawn` / `child_process`；出现的错误前缀只有 `YAML: ` 与 `VALIDATION: ` | C1-C5 / B1 / F2 / F4 成立 |
 | V4（索引跨任务门，本任务新增错误消息） | `npx vitest run src-main/i18n src/i18n.test.ts` | `Test Files 5 passed (5)` / `Tests 22 passed (22)`（含 `key-coverage`、`no-hardcoded`、`dict`） | F3 成立：未写字面量 key、未写汉字；测试日志里的 `[i18n] missing key: err.ql.*` 是 K8 预期现象，任务 8 落地词典后消失 |
+| 修复轮 1（审查 Important #1 → C6 / E16） | 改名原因：`QL_ERR` 原写 `nameDuplicate` / `badType` / `badTerminal`，与计划 :301、任务 8 表 D2 / D3 / D4 已登记的 `nameDup` / `typeInvalid` / `terminalMissing` 不一致；另有 `err.ql.yamlLoadFail` / `err.ql.yamlNotObject` / `err.ql.idFormat` 三个凭空新增的同义键，词典里已有 `err.config.yamlLoadFail`（`dict.ts:220` / `:500`）、`err.config.yamlEmpty`（`:221` / `:501`）、`err.config.idFormat`（`:226` / `:506`）。改动：`:31-40` 映射改名并删掉那三条；`:58` 改 `t('err.config.yamlLoadFail', { name, msg })`、`:61` 改 `t('err.config.yamlEmpty', { name })`、`:141` 改 `t('err.config.idFormat')`（去掉原传的 `{ id }`），三处写法与 `config.ts:51` / `:54` / `:129` 逐字同构；`:106` 取 `QL_ERR.terminalMissing`（占位符 `{terminal}` 不变）、`:117` 取 `QL_ERR.typeInvalid`（`{type}` 不变）、`:150` 取 `QL_ERR.nameDup`（`{name}` 不变）；`:103` `err.ql.nameTooLong` 与 `{max}` 保持（已登记任务 8 D11）；`:141` 的 `validateConfigId` 守卫代码未动（E16） | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` → `✓ src-main/quick-launch-config.test.ts (19 tests)`、`✓ src-main/config.test.ts (76 tests)`、`Test Files 2 passed (2)`、`Tests 95 passed (95)`、exit 0（stderr 的缺 key 告警现为 `err.ql.terminalMissing` / `err.ql.nameDup` 等新名，无 `err.config.*` 告警，说明复用键已取到译文）。`npx tsc -p tsconfig.main.json --noEmit` → 无诊断输出、exit 0。`npx vitest run src-main/i18n src/i18n.test.ts` → `Test Files 5 passed (5)`、`Tests 22 passed (22)`、exit 0。反向探针：把 `:58` 的 `{ msg }` 临时写成 `{ message: msg }` 后 `npx vitest run src-main/i18n/key-coverage.test.ts` → `FAIL … 调用点传的占位符名与词典取值里的 {name} 双向一致`、`+ "file": "src-main/quick-launch-config.ts"`、exit 1，随后已还原 | C6 / E16 成立。副带效果（审查者的「顺带」）：复用词典既有键后这三处走字面量 `t()`，占位符名进入 `key-coverage` 的双向比对（`:44` / `:131-151`），探针已证；`err.ql.*` 五处仍靠常量映射（K8），其占位符名要等任务 8 改回字面量时才受守护，故任务 8 表 D 段注已逐字登记占位符名。`git status --porcelain` 只有本表 ` M` 与两个 `??` 源文件，`dict.ts` / `err-keys.ts` 一行未改 |
```

## 测试文件 src-main/quick-launch-config.test.ts：本轮未改动（实现者声明），故不重复附全文。
