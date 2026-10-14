# 任务 1 · 配置层 `admin` 字段 — check 表

> 计划：[2026-10-14-quick-launch-admin.md](../../plans/2026-10-14-quick-launch-admin.md) §任务 1 · 规格：[2026-10-14-quick-launch-admin.md](../../specs/2026-10-14-quick-launch-admin.md) §6.1 / §4-1 / §4-4 · 关联审查重点 **RF2**（索引 R 组）
> 前置：无（本 feature 第一个任务）
> 现状锚点（本表生成时实测，2026-10-14）：`src-main/quick-launch-config.ts:14`（`QuickLaunchEntry`）、`:63-80`（`normalizeEntry`，返回字面量在 `:72` / `:77`）、`:84-103`（`validateEntry`，返回字面量在 `:95` / `:100`）、`:138-139`（`qlSave` 把 `clean` 整表写回）；既有 `toEqual` 夹具：`src-main/quick-launch-config.test.ts:81`、`:82`、`:103`、`:241`、`:250`
> 索引：[00-index.md](00-index.md) 的 G1-G9、K4、**K28**（`ipc-ql.test.ts:245` 属本任务的夹具修正）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| A1 | 起点 = 文档提交，工作区无代码改动 | `git log --oneline -1`；`git status --porcelain` | HEAD = `aaf5e0f docs: 快捷启动启动项的管理员权限开关 —— spec + plan（代码一行未改）`；porcelain 不含 `src/` / `src-main/` 文件 | ☐ |
| A2 | 全量基线（索引头部「测试基线」行：由主代理实测，子代理不重跑） | `npm test` | `Test Files 48 passed (48)` / `Tests 835 passed (835)`，exit 0；本任务后用例数只增不减 | ☑（主代理实测 2026-10-14 19:07：`Test Files 48 passed (48)` / `Tests 835 passed (835)`、`Duration 9.35s`、exit 0；与本表生成时的静态计数 48 份 `*.test.ts` 一致。跑 `npm test` 需要完全访问沙箱，见索引 K23） |
| A3 | 锚点行号属实 | 读 `quick-launch-config.ts:14` / `:63-80` / `:84-103` / `:138-139` | 与本表引用一致（当前没有 `admin` 字段；两个函数各返回两处对象字面量） | ☐ |
| A4 | 旧配置（无 `admin` 键）仍能加载 | `node -e` 读一份手写 yaml 跑 `qlLoad` | 不报错、条目不进 `invalid` | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
| --- | --- | --- | --- | --- |
| B1 | `src-main/quick-launch-config.ts` | 改：`:14` 加 `admin?: boolean`；`:72` / `:77` / `:95` / `:100` 的返回字面量加 `admin` | 只加字段与规整；不新增校验规则、不碰 `VALIDATION:` 文案、不碰 IPC | ☐ |
| B2 | `src-main/quick-launch-config.test.ts` | 改：新增 4 条用例 + 修 5 处既有 `toEqual` 字面量 | 不动其它用例的断言文案 | ☐ |
| B3 | `src-main/ipc-ql.test.ts` | 改：**只**在 `:245` 的 `toEqual` 字面量里加 `admin: false`（`ql_list` 断的是加载结果，本任务之后必红 = 索引 K28） | 该文件其它行一字不动；渲染端夹具（`src/modules/QuickLaunchModal.test.ts`）仍归任务 8 | ☐ |

## C. 接口契约

| # | 契约 | 逐字 | ✓ |
| --- | --- | --- | --- |
| C1 | `QuickLaunchEntry` 的字段 | `admin?: boolean`（类型上可选，落盘总是显式写）—— 规格 §6.1 / §8-K4 | ☐ |
| C2 | 加载路径的规整 | `admin: e['admin'] === true`（只有字面量 `true` 为真）—— 规格 §6.1 | ☐ |
| C3 | 保存路径的规整 | `admin: e.admin === true`，随 `qlSave:138` 整表写回 → yaml 里必有 `admin: true\|false` | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| D1 | 先写失败测试（plan 任务 1 步骤 1 的四条） | `npx vitest run src-main/quick-launch-config.test.ts` | 新用例全红（断言多出 `admin` 键），既有用例仍绿 | ☐ |
| D2 | 实现 `:14` / `:72` / `:77` / `:95` / `:100` | `npx vitest run src-main/quick-launch-config.test.ts` | 该文件全绿 | ☐ |
| D3 | 修既有 `toEqual` 夹具（`quick-launch-config.test.ts:81` / `:82` / `:103` / `:241` / `:250` + `ipc-ql.test.ts:245` 加 `admin: false`） | `npx vitest run src-main/quick-launch-config.test.ts src-main/ipc-ql.test.ts` | 全绿；改动只在断言字面量里 | ☐ |
| D4 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 无输出、exit 0 | ☐ |
| D5 | 全量回归 | `npm test` | 与索引头部「测试基线」行基线一致（用例数只增不减） | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 出处 | 由哪条测试守 | ✓ |
| --- | --- | --- | --- | --- |
| E1 | 无 `admin` 键的旧条目加载后 `admin === false` | 规格 §4-4 / §6.1 | `entry_without_admin_loads_as_false` | ☐ |
| E2 | `admin: true` 经保存→加载往返不变 | 规格 §4-1 / §6.1 | `admin_true_round_trips_through_save_and_load` | ☐ |
| E3 | `'yes'` / `1` / `null` 一律规整为 `false` | 规格 §6.1 | `non_boolean_admin_values_normalize_to_false` | ☐ |
| E4 | 保存后的 yaml 原文**显式含** `admin: false` | 规格 §8-K4 | `saved_yaml_contains_an_explicit_admin_key` | ☐ |
| E5 | 不勾选路径不变：`VALIDATION:` 各条规则与文案一字未改 | 规格 §4-4 / 索引 G3 | 既有校验用例全绿（不改断言文案） | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 出处 | ✓ |
| --- | --- | --- | --- |
| F1 | 错误前缀只有 `YAML:` / `VALIDATION:` | 索引 G1（`quick-launch-config.ts:22`） | ☐ |
| F2 | 不新增词典键 | 索引 G2 | ☐ |
| F3 | 不新增依赖、不改 `package.json` | 索引 G7 | ☐ |
| F4 | 只改 B 段两个文件 | 索引 G9 | ☐ |

## G. 回归门

| # | 门 | 命令 | 预期 | ✓ |
| --- | --- | --- | --- | --- |
| G1 | 定向 | `npx vitest run src-main/quick-launch-config.test.ts` | 全绿 | ☐ |
| G2 | 相邻回归（配置层的使用方） | `npx vitest run src-main/ipc-ql.test.ts` | 全绿；该文件的改动**只有** `:245` 一行（`git diff` 只此一处，索引 K28） | ☐ |
| G3 | 类型门 | `npx tsc --noEmit -p tsconfig.main.json` | 干净 | ☐ |
| G4 | i18n 三门 | `npx vitest run src-main/i18n` | 全绿（本任务不碰词典） | ☐ |
| G5 | 全量 | `npm test` | 全绿 | ☐ |

## H. 提交门（主代理验收通过后执行）

| # | 项 | 内容 | ✓ |
| --- | --- | --- | --- |
| H1 | 暂存范围 | `src-main/quick-launch-config.ts`、`src-main/quick-launch-config.test.ts`、`src-main/ipc-ql.test.ts` | ☐ |
| H2 | commit message 逐字 | `feat: 快捷启动配置增加 admin 字段（总是显式落盘）` | ☐ |
| H3 | 勾完整性普查 | `node .superpowers/sdd/2026-10-14-quick-launch-admin/tick-census.mjs` → 本表 `裸☐=0` 且 `I段 -[ ]=0` | ☐ |

## I. 完成判据

- [ ] A1-A4 成立
- [ ] B1-B3 之外没有文件被改
- [ ] C1-C3 逐字一致
- [ ] D1→D5 顺序执行且先红后绿
- [ ] E1-E5 有对应测试且绿
- [ ] G1-G5 全绿
- [ ] J 段每条命令都有真实输出
## J. 执行记录（实现时填命令与真实输出）

| # | 命令 | 真实输出摘要 |
| --- | --- | --- |
| J-1 | `git log --oneline -1 && git status --porcelain` |  |
| J-2 | `npm test` |  |
| J-3 | `npx vitest run src-main/quick-launch-config.test.ts` |  |
| J-4 | `npx tsc --noEmit -p tsconfig.main.json` |  |
| J-5 | `node -e "qlLoad 读一份无 admin 键的 yaml"` |  |
| J-6 | `git diff --stat src-main/ipc-ql.test.ts` |  |
