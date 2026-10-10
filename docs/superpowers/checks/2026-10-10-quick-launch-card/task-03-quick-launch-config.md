# 任务 3 · 配置层 `quick-launch-config.ts` — check 表

> 计划：[计划文档](../../plans/2026-10-10-quick-launch-card.md) §任务 3 · 规格：[规格文档](../../specs/2026-10-10-quick-launch-card-design.md) §5.1 / §5.2 / §5.3 / §12.1
> 前置：任务 2（新 id 走 `suggestConfigId(existing, 'ql')`）

## A. 起点核对（动手前）

| # | 检查项 | 怎么验 | 预期 | ✓ |
|---|---|---|---|---|
| A1 | 工作区干净 | `git status --porcelain` | 无输出 | ☐ |
| A2 | 临时目录写法对齐 | 读 `src-main/test-utils.ts` | 用 `tmpPath / rm / writeText / readText / mkDir / jp`，不自己造夹具 | ☐ |
| A3 | YAML 读写口径对齐 | 读 `src-main/config.ts` 的 `configsLoad`（第 94-104 行）与 `dump` | 复用其 parse/dump 思路，但**缺失/空不抛 MISSING** | ☐ |

## B. 改动范围

| # | 文件 | 动作 | 边界 | ✓ |
|---|---|---|---|---|
| B1 | `src-main/quick-launch-config.ts` | 新建 | 只做加载/校验/保存/删除，不碰进程 | ☐ |
| B2 | `src-main/quick-launch-config.test.ts` | 新建 | 覆盖 §5.2 / §5.3 全部行 | ☐ |

## C. 接口契约（逐字一致，后续任务据此调用）

| # | 契约 | 出处 | ✓ |
|---|---|---|---|
| C1 | `export type TerminalId = 'pwsh' \| 'powershell' \| 'cmd' \| 'wsl';` | 计划 / 规格 §5.1 | ☐ |
| C2 | `export type QuickLaunchKind = 'shell' \| 'exe';` | 同上 | ☐ |
| C3 | `export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }` | 同上 | ☐ |
| C4 | `export type QuickLaunchMap = Record<string, QuickLaunchEntry>;` / `export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }` | 同上 | ☐ |
| C5 | `qlLoad(path): QuickLaunchList` / `qlSave(path, id: string \| null, entry, available: TerminalId[]): string` / `qlDelete(path, id): void` / `validateQuickLaunchName(name): boolean` | 计划 §任务 3 接口 | ☐ |

## D. TDD 步骤门

| # | 步骤 | 命令 | 预期 | ✓ |
|---|---|---|---|---|
| D1 | 步骤 1：先写失败测试（覆盖 §5.2 / §5.3） | — | E 组断言全部有对应用例 | ☐ |
| D2 | 步骤 2：验证失败 | `npx vitest run src-main/quick-launch-config.test.ts` | FAIL（模块不存在） | ☐ |
| D3 | 步骤 3：实现 | — | 保存前跑 §5.3 六条校验；写入前规整字段；新 id 用 `suggestConfigId(existing, 'ql')`；成功后整表写回 | ☐ |
| D4 | 步骤 4：验证通过 | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | 全 PASS | ☐ |

## E. 必须钉住的行为断言

| # | 断言 | 期望 | 出处 | ✓ |
|---|---|---|---|---|
| E1 | 文件不存在 → `{ items: {}, invalid: [] }`（**不抛 MISSING**） | `qlLoad(缺失路径)` | 规格 §5.2 | ☐ |
| E2 | 空文件 → 同上 |  | 规格 §5.2 | ☐ |
| E3 | YAML 解析失败 / 顶层非对象 → 抛 `/^YAML:/` |  | 规格 §5.2 | ☐ |
| E4 | 单条非法（如缺 `type`）→ 跳过该条，id 进 `invalid`，其余照常返回 | yaml 两条、一条坏 → items 1 条 + invalid 含该 id | 规格 §5.2 | ☐ |
| E5 | `name` trim 后空 → `/^VALIDATION:/` | `{ name: '  ', type: 'shell', ... }` | 规格 §5.3-1 | ☐ |
| E6 | `name` 超 64 → `VALIDATION:` |  | 规格 §5.3-1 | ☐ |
| E7 | `type` 不在 `{'shell','exe'}` → `VALIDATION:` |  | 规格 §5.3-3 | ☐ |
| E8 | `shell` 不在四种之内，或该终端不在 `available` 里 → `VALIDATION:` | `shell:'wsl'` 而 available 只有 `['pwsh']` | 规格 §5.3-4 | ☐ |
| E9 | `shell` 类型 `cmd` trim 后空 → `VALIDATION:` | `cmd: '   '` | 规格 §5.3-4 | ☐ |
| E10 | `exe` 类型 `exe` trim 后空 → `VALIDATION:`；**不校验文件存在** |  | 规格 §5.3-5 | ☐ |
| E11 | 重名（trim 后精确比较、区分大小写）→ 第二次保存抛 `VALIDATION:` |  | 规格 §5.3-2 | ☐ |
| E12 | 只写该类型字段：写 shell 条目后读回，条目上**没有 `exe` 键**；exe 条目没有 `shell`/`cmd` 键 | 用 `readText` 做字节级断言 | 规格 §5.3-6 | ☐ |
| E13 | `id === null` → 生成 `ql` 前缀且通过 `validateConfigId`；显式 id 沿用并原样返回 |  | 规格 §5.4 / §8 | ☐ |
| E14 | `qlDelete` 不存在的 id → `/^VALIDATION:/`；存在的 id → 删除后读回该键消失 |  | 规格 §8 | ☐ |
| E15 | `validateQuickLaunchName`：trim 后 1..64 为 true，其余 false |  | 计划 接口 | ☐ |

## F. 本任务相关的硬约束

| # | 约束 | 违反的后果 | ✓ |
|---|---|---|---|
| F1 | 缺失/空**不得**抛 `MISSING:`（与 `configsLoad` 语义不同） | 首次使用即报错，卡片打不开 | ☐ |
| F2 | 错误前缀只用 `YAML:` / `VALIDATION:`（G7） | 渲染端无法分类显示 | ☐ |
| F3 | 主进程错误消息走 `t()`（`err.ql.*` 键在任务 8 落地；本任务先用键名或占位，并在 J 里记录） | `no-hardcoded` 硬门红 | ☐ |
| F4 | 不引入新依赖（用仓库既有 `yaml`） | 违反 G1/G2 | ☐ |

## G. 回归门

| # | 命令 | 预期 | ✓ |
|---|---|---|---|
| G1 | `npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts` | 全 PASS | ☐ |
| G2 | `npx tsc -p tsconfig.main.json --noEmit` | 无错 | ☐ |
| G3 | `git diff --name-only` | 只含 B1-B2 | ☐ |

## H. 提交门

| # | 检查项 | 命令 / 值 | ✓ |
|---|---|---|---|
| H1 | 暂存范围 | `git add src-main/quick-launch-config.ts src-main/quick-launch-config.test.ts` | ☐ |
| H2 | 提交信息逐字 | `feat(config): 快捷启动配置层（quick_launch.yaml）` | ☐ |

## I. 完成判据

- [ ] E1-E15 全部有测试
- [ ] D2 先红、D4 后绿
- [ ] G1-G3 通过
- [ ] H1-H2 完成

## J. 执行记录（实现时填写）

| 步骤 | 命令 | 实际输出（摘要） | 结论 |
|---|---|---|---|
| D2 |  |  |  |
| D4 |  |  |  |
