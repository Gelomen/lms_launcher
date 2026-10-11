# 任务 3 简报 · 配置层 `quick-launch-config.ts`

## 这个任务在项目里的位置

「快捷启动卡片」计划 14 个任务中的第 3 个：新建 `src-main/quick-launch-config.ts`，负责 `<dataDir>/configs/quick_launch.yaml` 的加载 / 校验 / 保存 / 删除。后面的 IPC（任务 6）、卡片（任务 11）、弹窗（任务 12）都按本文件的接口调用，**签名必须逐字一致**。

## 你的完成判据（照它逐行执行并勾选）

`docs/superpowers/checks/2026-10-10-quick-launch-card/task-03-quick-launch-config.md`
（A→I 逐行执行；命令必须真跑，输出摘要填进该表「J. 执行记录」。H 段与 I 段最后一条留空不勾——按 K5，提交由主代理在验收后执行）

## 计划 §任务 3（逐字）

```
### 任务 3：配置层 quick-launch-config.ts

**文件：** 创建 src-main/quick-launch-config.ts；测试 src-main/quick-launch-config.test.ts（临时目录写法先读 src-main/test-utils.ts 对齐既有约定）

**接口（后续任务据此使用）：**

export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';
export type QuickLaunchKind = 'shell' | 'exe';
export interface QuickLaunchEntry { name: string; type: QuickLaunchKind; shell?: TerminalId; cmd?: string; exe?: string }
export type QuickLaunchMap = Record<string, QuickLaunchEntry>;
export interface QuickLaunchList { items: QuickLaunchMap; invalid: string[] }

export function qlLoad(path: string): QuickLaunchList;   // 缺失/空 → 空表；YAML 坏 → YAML:；坏条目进 invalid
export function qlSave(path: string, id: string | null, entry: QuickLaunchEntry, available: TerminalId[]): string;
export function qlDelete(path: string, id: string): void;
export function validateQuickLaunchName(name: string): boolean;   // trim 后 1..64

- [ ] 步骤 1：编写失败的测试（覆盖规格 §5.2 / §5.3）

expect(qlLoad(缺失路径)).toEqual({ items: {}, invalid: [] });
expect(() => qlLoad(坏yaml路径)).toThrow(/^YAML:/);
// 坏条目跳过：yaml 两条、一条缺 type → items 1 条 + invalid 含该 id
expect(() => qlSave(p, null, { name: '  ', type: 'shell', shell: 'pwsh', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'wsl', cmd: 'x' }, ['pwsh'])).toThrow(/^VALIDATION:/);
expect(() => qlSave(p, null, { name: 'A', type: 'shell', shell: 'pwsh', cmd: '   ' }, ['pwsh'])).toThrow(/^VALIDATION:/);
// 重名（trim 后精确比较）重复保存同名 → 第二次抛 VALIDATION:
// 只写该类型字段：写入 shell 条目后读回，条目上没有 exe 键
// id：id === null 生成 ql 前缀并通过 validateConfigId；显式 id 沿用
expect(() => qlDelete(p, '不存在的id')).toThrow(/^VALIDATION:/);

- [ ] 步骤 2：运行测试验证失败 —— npx vitest run src-main/quick-launch-config.test.ts → FAIL
- [ ] 步骤 3：实现 —— 复用 config.ts 的 parseYaml 思路（缺失/空不抛 MISSING）；保存前跑 §5.3 六条校验；写入前把条目规整为「只含该类型字段」；新 id 用 suggestConfigId(existing, 'ql')；成功后整表写回
- [ ] 步骤 4：运行测试验证通过 —— npx vitest run src-main/quick-launch-config.test.ts src-main/config.test.ts → 全 PASS
- [ ] 步骤 5：Commit —— 由主代理在验收后执行，你不要 git add、不要 commit
```

## 规格（有约束力的权威，逐字）

§5.1 形状：`<dataDir>/configs/quick_launch.yaml`

```yaml
qlx1a2b3c4:
  name: 启动 webui
  type: shell
  shell: pwsh
  cmd: python -m webui
qlp9q8r7s6:
  name: LM Studio
  type: exe
  exe: D:\Tools\LM Studio.exe
```

§5.2 加载语义：

| 情况 | 行为 |
|---|---|
| 文件不存在 / 空文件 | `{ items: {}, invalid: [] }`（**不抛 MISSING**——首次必然没有） |
| YAML 解析失败 / 顶层非对象 | 抛 `YAML:` |
| 单条条目非法 | 跳过该条，id 收进 `invalid`；卡片顶部提示「N 条配置无效，已跳过」 |

§5.3 校验规则（保存路径，抛 `VALIDATION:`）：
1. `name` trim 后非空且长度 ≤ 64。
2. `name` 与其它条目不重复（trim 后精确比较，区分大小写）。
3. `type` ∈ `{'shell','exe'}`。
4. `shell` 类型：`shell` ∈ 四种之一且**该终端当前可用**；`cmd` trim 后非空。
5. `exe` 类型：`exe` trim 后非空（不校验文件存在，启动时反馈）。
6. 写入时只写该类型字段（shell 丢 `exe`，exe 丢 `shell`/`cmd`）。

§5.4：`suggestConfigId(existing, prefix = 'tpl')` 已支持前缀（任务 2 已实现），快捷启动用 `'ql'`。

§12 单元 1：quick-launch-config：缺失/空 → 空表；YAML 坏 → `YAML:`；坏条目进 `invalid`；名字空/超长/重名 → `VALIDATION:`；shell 缺 `cmd` → `VALIDATION:`；只写该类型字段；id 前缀 `ql`。

## 前序任务已交付的接口（已提交/已验收）

- 任务 2（已验收）：`src-main/config.ts:117` 现为 `export function suggestConfigId(existing: string[], prefix = 'tpl'): string` → 本任务用 `suggestConfigId(existingIds, 'ql')`。`validateConfigId` 在 `src-main/config.ts:174`（小写字母开头、`[a-z0-9]`、≤32），用它校验生成的 id。

## 要复用的既有写法（已取证，真实行号）

- 临时目录夹具：`src-main/test-utils.ts:5-30` 提供 `tmpPath / rm / writeText / readText / mkDir / jp`——**用它们，不要自己造夹具**；字节级断言（证明「某个键没有落盘」）用 `readText`（check 表 E12 要求）。
- YAML 读写口径：`src-main/config.ts:45-57` 的 `parseYaml(path, s, name)`（解析失败 → `YAML: t('err.config.yamlLoad', …)`；顶层非对象 → `YAML:`）与 `import { parse, stringify as dump } from 'yaml'`（`config.ts:3`）。**思路照搬，但不要改 config.ts**；缺失/空文件在 qlLoad 里**不得**抛 `MISSING:`（与 `configsLoad` 语义不同，见 check 表 F1）。
- 整表写回写法参考 `config.ts:128-143` 的 `saveConfigEntry`（读→改→`writeFileSync(path, dump(map))`）。

## 已定口径 K8（必须遵守，否则 i18n 硬门红）

`err.ql.*` 词典键要到任务 8 才落地。因此本任务：
- 错误消息**不得写中文字面量**（`no-hardcoded.test.ts:136-148` 是硬门）；
- **不得写 `t('err.ql.xxx')` 这种字面量 key**（`key-coverage.test.ts:39-45` 的 `KEY_CALL` 只认字面量 key，词典缺键就红）；
- 做法：把 key 放进常量映射或用拼接传参，例如 `const QL_ERR = { nameRequired: 'err.ql.nameRequired', … };` 然后 `throw new Error('VALIDATION: ' + t(QL_ERR.nameRequired));`（变量传 key → 该守护跳过）；
- **不要改 `src-main/i18n/dict.ts`，不要改 `src-main/i18n/err-keys.ts`**（`IPC_ERROR_KEYS` 由 `dict.test.ts` 守护，键未落地就登记会红）；
- 测试只断 `/^VALIDATION:/`、`/^YAML:/` 前缀，不断译文。

## 边界与硬约束（越界即不勾）

- 只碰两个文件：新建 `src-main/quick-launch-config.ts`、新建 `src-main/quick-launch-config.test.ts`（G3：`git diff --name-only` 只含这两个）
- 只做加载/校验/保存/删除，**不碰进程**（不 import node-pty、不 spawn）
- 不引入新依赖：YAML 用仓库既有 `yaml` 包
- 错误前缀只用 `YAML:` / `VALIDATION:`
- 严格 TDD：先写覆盖 E1–E15 的测试 → 跑 D2 看红（模块不存在）→ 实现 → 跑 D4 看绿；两次输出都进 J 段
- 回归门 G2 要真跑：`npx tsc -p tsconfig.main.json --noEmit` 无错
- **不要 git add、不要 commit、不要派子代理**

## 报告

完整报告写到 `.superpowers/sdd/2026-10-10-quick-launch-card/task-03-report.md`：接口实现说明、D2/D4/G1/G2/G3 实际输出摘要、E1–E15 与用例的对应表、自审、疑虑。
回传只给：状态一行 + 测试小结一行 + 疑虑（若有）。
