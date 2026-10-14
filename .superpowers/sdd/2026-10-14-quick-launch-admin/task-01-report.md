# 任务 1 报告 · 配置层 `admin` 字段

> 执行者：子代理（子代理驱动 · 任务 1）｜时间：2026-10-14 19:41–19:48（Asia/Singapore）
> 输入：`.superpowers/sdd/2026-10-14-quick-launch-admin/task-01-brief.md` · `docs/superpowers/checks/2026-10-14-quick-launch-admin/task-01-config-admin-field.md` · 规格 §6.1 / §4-1 / §4-4 / §8-K4
> 分支：`feat/quick-launch-admin`，HEAD 见「偏离 1」。**未 `git add`、未 commit**（G8），改动全部留在工作区。

## 状态

**DONE** —— 先红后绿、定向与全量全绿、类型门干净、i18n 三门未红、改动范围 = B 段三个文件。
两处需主代理知悉的偏差（都不改判据）见「偏离」；三条疑虑见「遗留疑虑」。

## A 段起点核对（实测）

| 项 | 结果 |
|---|---|
| A1 | 动手前 `git status --porcelain` 无任何已跟踪改动（只有九行 `?? .superpowers/sdd/**/task-0N-brief.md`，索引 K24 属预期）。HEAD 不是 A1 写的 `aaf5e0f` → 见「偏离 1」 |
| A2 | 未重跑（表里已注明由主代理实测：48 files / 835 tests）。收尾门跑的全量 = 839，见 D5 |
| A3 | 锚点逐条核实：`quick-launch-config.ts:14`（`QuickLaunchEntry`，当时无 `admin`）、`:63-80`（`normalizeEntry`，返回字面量在 `:72` / `:77`）、`:84-103`（`validateEntry`，返回字面量在 `:95` / `:100`）、`:138-139`（`qlSave` 的 `map[finalId] = clean;` 与 `writeFileSync(path, dump(map))`）。与表一致 |
| A4 | `node -e` 探针（先 `npx esbuild --bundle` 到 gitignore 的 `.temp/ql-admin-a4/`，再 `node -e` 调真实 `qlLoad`）：改前读手写无 `admin` 键的 yaml → 不报错、`"invalid":[]`；改后同一条目仍 `"invalid":[]` 且多出 `"admin":false`。命令与输出在 check 表 J-5 |

## 改动清单（B 段；实测 `git diff --name-only` 只有这三个文件）

| 文件 | 行 | 改动 |
|---|---|---|
| `src-main/quick-launch-config.ts` | `:14` | `QuickLaunchEntry` 末尾加 `admin?: boolean`（C1：类型上可选） |
| 同上 | `:72` | `return { name, type: 'shell', shell, cmd, admin: e['admin'] === true };`（C2） |
| 同上 | `:77` | `return { name, type: 'exe', exe, admin: e['admin'] === true };`（C2） |
| 同上 | `:95` | `return { name, type: 'shell', shell: e.shell, cmd, admin: e.admin === true };`（C3） |
| 同上 | `:100` | `return { name, type: 'exe', exe, admin: e.admin === true };`（C3） |
| `src-main/quick-launch-config.test.ts` | 新增 `:318-403` | 四条用例（名称逐字取 plan）：`entry_without_admin_loads_as_false`（E1）、`admin_true_round_trips_through_save_and_load`（E2）、`non_boolean_admin_values_normalize_to_false`（E3）、`saved_yaml_contains_an_explicit_admin_key`（E4） |
| 同上 | `:81`、`:82`、`:103`、`:241`、`:250` | 既有 `toEqual` 字面量各加 `, admin: false`（仅此，断言文案一字未改） |
| `src-main/ipc-ql.test.ts` | `:245` 一行 | `toEqual` 加 `, admin: false`（索引 K28）。该文件其它行一字未动：`git diff --stat` = `1 file changed, 1 insertion(+), 1 deletion(-)`，`git diff -U0` 只有 `@@ -245 +245 @@` 一处 hunk |

收尾 `git diff --stat`：`src-main/ipc-ql.test.ts` 2 +-、`src-main/quick-launch-config.test.ts` 97 ++…--、`src-main/quick-launch-config.ts` 10 ++--（= 5 增 5 删，正是上表五行）。
`git diff --name-only package.json package-lock.json electron-builder.yml src-main/i18n/` = 空（F2 / F3 / G7）。

## TDD 步骤门（D1→D5，命令与真实输出）

- **D1 先写失败测试 → 跑红**：`npx vitest run src-main/quick-launch-config.test.ts`（19:45:10，exit 1）→ `Test Files 1 failed (1)` / `Tests 4 failed \| 19 passed (23)`。红的正是四条新用例，逐字：`- "admin": false`（@:338）、`- "admin": true`（@:351）、`AssertionError: expected undefined to be false`（@:382）、`expected 'qlmv81m9rv2490: … name: 不勾 …' to match /^ {2}admin: false$/m`（@:396）。既有 19 条仍绿。
- **D2 实现 → 中间态取证**（表外多跑的一次，用来证明「改动只影响断言字面量」）：同命令 exit 1 → `Tests 3 failed \| 20 passed (23)`，三条红 = 旧夹具 `:81` / `:103` / `:241`（`:82` / `:250` 在同一条用例内，被首条断言挡住）——与 plan 步骤 4 列出的五处逐一对应，没有第六处。
- **D3 修夹具 → 跑绿**：`npx vitest run src-main/quick-launch-config.test.ts src-main/ipc-ql.test.ts`（19:46:10，exit 0）→ `Test Files 2 passed (2)` / `Tests 46 passed (46)`；单跑 `quick-launch-config.test.ts`（19:47:51）→ `Tests 23 passed (23)`；单跑 `ipc-ql.test.ts` → `Tests 23 passed (23)`。
- **D4 类型门**：`npx tsc --noEmit -p tsconfig.main.json`（19:46:28）→ 无任何输出，退出码 0（同条命令里追加 `Write-Output "TSC_EXIT=$LASTEXITCODE"` 取证，只回显 `TSC_EXIT=0`）。
- **D5 全量回归**：`npm test`（19:46:43，exit 0）→ **`Test Files 48 passed (48)` / `Tests 839 passed (839)`**，`Duration 9.20s`。839 = 基线 835 + 本任务新增 4；测试文件数仍 48（本任务不新增测试文件，与索引 :7 的「任务 2 之后才 49」一致）。全绿，无 skipped / failed。
- **G4 i18n 三门**：`npx vitest run src-main/i18n`（19:46:28，exit 0）→ `Test Files 4 passed (4)` / `Tests 18 passed (18)`（`index` / `no-hardcoded` / `dict` / `key-coverage` 全绿）。

## E 段断言的落点

- E1 → `entry_without_admin_loads_as_false`（另由 J-5 的 `node -e` 在真实 `qlLoad` 上复核）
- E2 → `admin_true_round_trips_through_save_and_load`：shell 与 exe 两条 `admin: true` 保存→加载逐字不变，并多一步「读回来再保存」（为任务 8 的 `fill()` 回填兜底）
- E3 → `non_boolean_admin_values_normalize_to_false`：加载路径 `"yes"` / `1` / `null` 三条 + 保存路径 `'yes' as unknown as boolean`，并断 `invalid: []`（`admin` 不进 `VALIDATION:`）
- E4 → `saved_yaml_contains_an_explicit_admin_key`：`readText` 字节级断 `/^ {2}admin: false$/m` 与 `/^ {2}admin: true$/m`（调用方没写 `admin` 也显式落 `false`）
- E5 → 既有校验用例（`ql_load_*` / `ql_save_rejects_*` / `ql_delete_*`）断言文案一字未改且全绿；`git diff` 里没有任何 `throw new Error` 行变化

## 偏离 brief / check 表的地方（都不改判据）

1. **A1 的 HEAD 预期已过期**：表写 `aaf5e0f`，实测 HEAD = `b2026e2 docs: 实现前预检裁决 R-01–R-04（类型门命令、ipc-ql:245 夹具归任务 1、K16 落定、第三参类型）+ SDD 账本` —— 主代理在派单前把 R-01–R-04 落成了一次文档提交。性质与 A1 的要求一致（纯文档、代码一行未改、无已跟踪改动），A1 的实质判据成立。**建议主代理把 A1 的 HEAD 串更新为 `b2026e2`**（按 AGENTS.md「后续更新」流程走 K 组登记；我没动 A 段）。
2. **A4 的 `node -e` 需要一个可 require 的产物**：`qlLoad` 是 TS，`node -e` 直接接不住。做法：先 `npx esbuild src-main/quick-launch-config.ts --bundle --platform=node --format=cjs --outfile=.temp/ql-admin-a4/qlc.cjs`，再跑表里那条 `node -e`。产物落在 gitignore 的 `.temp/ql-admin-a4/`（AGENTS.md 指定的临时目录），仓库零新增文件。
3. **J 段多了 J-7 / J-8 两行**（单跑 `ipc-ql.test.ts`、跑 `npx vitest run src-main/i18n`）：G2 / G4 两行的证据只能落在 J 段。A–I 段的勾一个没落，其它行一字未动。
4. **D2 与 D3 之间多跑了一次定向测试**（见上）：plan 步骤 5 要求「除这一处之外还有别处变红就停下报告」，这次跑就是那条门的证据（结论：没有别处变红）。
5. **曾短暂在 `QuickLaunchEntry` 上方加两行注释，随即删掉**：为把 diff 收在正好 5 行，并保住 `:14` / `:72` / `:77` / `:95` / `:100` 与 `:138-139` 这些被文档引用的行号不漂移（理由规格 §6.1 已写明，代码不必复述）。最终 diff 里没有任何注释改动。

## 遗留疑虑（请主代理定夺，我没有自行扩范围）

1. **「总是显式落盘」的作用面**：`qlSave` 只把**本次保存的那一条**经 `validateEntry` 规整出 `admin`；文件里其它条目走 `readRawMap` 原样写回（既有语义，连 invalid 条目都保留）。因此老配置里未被编辑过的条目在 yaml 中仍**没有** `admin` 键，直到它被保存一次。这与 §4-4「老配置 = 与今天逐字节一致」及 §6.1「实现点 = `validateEntry` + `:138`」读起来一致；若「总是显式」要理解成「整份文件所有条目都补齐 `admin`」，就需要额外动作——本任务按 §6.1 字面实现，没有多做。
2. **E4 的字节级断言绑在 `yaml` 包默认的 2 空格缩进**上（`/^ {2}admin: false$/m`）。与该文件既有的字节级断言（`:239-240` 的 `/^ql[0-9a-z]+:$/m` 与 `not.toMatch(/^\s*exe:/m)`）同一口径；若将来给 `dump()` 传缩进选项，这条会红——属可接受的显式耦合。
3. **`admin` 的「非真即假」没有任何提示**（规格 §6.1 末条明确不新增校验规则）：`admin: 'yes'` 这类脏值会被静默规整为 `false`，并在下次保存时落盘成 `admin: false`。行为已由 E3 钉住；提醒一句：这是设计选择，不是遗漏。

## 未做的事（按分工留给主代理）

- 不落 A–I 段的勾、不跑 H3 的落勾门。普查跑过：`node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → exit 0，本表 `☑=1 裸☐=31 I段 -[ ]=7 H2=未提交`（未提交表的正常状态；J 段填表后表格列数已核：J 段每行 3 列）。
- 不 `git add` / 不 commit：H1 暂存范围（三个文件）与 H2 逐字 message `feat: 快捷启动配置增加 admin 字段（总是显式落盘）` 归主代理验收后执行。
- 未动 spec / plan / 其它 check 表 / 词典 / `package.json` / `electron-builder.yml`。
