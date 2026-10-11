# 任务 2 实现报告 · `suggestConfigId` 支持前缀

> 判据表：`docs/superpowers/checks/2026-10-10-quick-launch-card/task-02-suggest-config-id-prefix.md`
> 简报：`.superpowers/sdd/2026-10-10-quick-launch-card/task-02-brief.md`
> 起点：HEAD `e97f79c`（任务 1 已提交），工作区干净
> 收尾：改动留在工作区，**未 git add、未 commit**（已定口径 K5：提交由主代理验收后执行）

## 1. A 段起点核对（动手前实测）

- A1 `git status --porcelain` → 无输出；`git rev-parse --short HEAD` → `e97f79c`
- A2 `grep -n "suggestConfigId" src-main/*.ts` → 生产调用点仅 `src-main/main.ts:292`（`return suggestConfigId(existingConfigIds(p));`，未改）；测试调用点 `src-main/config.test.ts:138,144`（未改）。全仓复查：除 docs 三份文档外，源码只有 `src-main/config.ts:117`、`src-main/main.ts:8,292`、`src-main/config.test.ts` —— 渲染端无调用点
- A3 `src-main/config.ts:174-178` `validateConfigId`：非空且 ≤32、`^[a-z]`、`^[a-z0-9]+$` —— 与表里预期一致，未改

## 2. 改了什么（B1/B2）

### B1 `src-main/config.ts`（只有 117、120 两行变化）

```diff
-export function suggestConfigId(existing: string[]): string {
+export function suggestConfigId(existing: string[], prefix = 'tpl'): string {
   const rand = (): string => Math.floor(Math.random() * 10000).toString(16).padStart(4, '0');
   for (let i = 0; i < 100; i++) {
-    const candidate = 'tpl' + Date.now().toString(36) + rand();
+    const candidate = prefix + Date.now().toString(36) + rand();
```

签名与 C1 逐字一致，候选串与 C2 逐字一致。`rand()`、100 次重试循环、`validateConfigId(candidate) && !existing.includes(candidate)` 防重、`throw new Error('VALIDATION: ' + t('err.config.idGen'))` 全部原样保留；115-116 注释未动（不含硬编码前缀，无需改）。

### B2 `src-main/config.test.ts`（追加在既有 `suggest_config_id_is_unique_and_yaml_safe` 之后，现 148-155 行）

```ts
  it('suggestConfigId 支持自定义前缀且仍满足 id 契约', () => {
    const id = suggestConfigId([], 'ql');
    expect(id.startsWith('ql')).toBe(true);
    expect(validateConfigId(id)).toBe(true);
  });
  it('suggestConfigId 默认前缀仍是 tpl', () => {
    expect(suggestConfigId([]).startsWith('tpl')).toBe(true);
  });
```

用例文本逐字取自计划 §任务 2 步骤 1。既有 75 个用例一行未改：`git diff` 里该文件只有新增行、无删除行。

## 3. D 段 TDD 真实输出

### D2 先红（只有测试落盘，实现未改）

`npx vitest run src-main/config.test.ts` → exit 1：

```
 ❯ src-main/config.test.ts (76 tests | 1 failed) 294ms
   × config.ts > suggestConfigId 支持自定义前缀且仍满足 id 契约 4ms
     → expected false to be true // Object.is equality
 FAIL  src-main/config.test.ts > config.ts > suggestConfigId 支持自定义前缀且仍满足 id 契约
 ❯ src-main/config.test.ts:150:33
      150|     expect(id.startsWith('ql')).toBe(true);
 Tests  1 failed | 75 passed (76)
```

失败点正是「第二参数被忽略」：旧实现返回 `tpl…`，`startsWith('ql')` 为 false。第二个新用例（默认前缀仍 tpl）此时已绿 —— 它测的是不变量，符合预期。

### D4 后绿（实现后）

`npx vitest run src-main/config.test.ts` → exit 0：

```
 ✓ src-main/config.test.ts (76 tests) 194ms
 Test Files  1 passed (1)
      Tests  76 passed (76)
```

## 4. E 段断言证据（逐条定向跑）

| # | 命令 | 实际输出 | 结论 |
|---|---|---|---|
| E1 | `npx vitest run src-main/config.test.ts -t "suggestConfigId 支持自定义前缀且仍满足 id 契约"` | exit 0，`Tests 1 passed \| 75 skipped (76)` | `ql` 前缀且 `validateConfigId` 为 true |
| E2 | `npx vitest run src-main/config.test.ts -t "suggestConfigId 默认前缀仍是 tpl"` | exit 0，`Tests 1 passed \| 75 skipped (76)` | 默认值仍 `tpl` |
| E3 | `npx vitest run src-main/config.test.ts -t "suggest_config_id_is_unique_and_yaml_safe"` | exit 0，`Tests 1 passed \| 75 skipped (76)` | 既有防重 + 连取 50 个不碰撞用例（`config.test.ts:135-146`）继续绿；防重、100 次重试、`VALIDATION: err.config.idGen` 均未动（diff 可见） |

## 5. G 段回归门

- G1 `npx vitest run src-main/config.test.ts` → exit 0，`Tests 76 passed (76)`（含既有 id 生成用例）
- G2 `npx tsc -p tsconfig.main.json --noEmit` → 无诊断输出，`TSC_EXIT=0`
- G3 `git diff --name-only` → 仅 `src-main/config.test.ts`、`src-main/config.ts`；`git status --porcelain` → 仅这两项 `M`。`git diff -- src-main/config.ts` 只有 2 行变化（签名 + 候选串）
- G3 的口径说明：G3 是在填 J 段之前跑的，因此只反映代码改动范围。填完本表 J 段与本报告后，`git status` 会多出 `docs/superpowers/checks/…/task-02-suggest-config-id-prefix.md`（J 段 + 勾选）与未跟踪的 `.superpowers/sdd/…/task-02-report.md` —— 属流程要求的记录文件，不是实现范围越界
- 额外（超出本表要求）：全量 `npx vitest run` → exit 0，`Test Files 40 passed (40)`、`Tests 669 passed (669)`（含 `src-main/i18n/key-coverage.test.ts`、`no-hardcoded.test.ts` 两份 i18n 硬门；本任务未新增 i18n 键，故本任务表内无 i18n 行）

## 6. 自审

- C1/C2 逐字核对通过：`prefix = 'tpl'` 未加显式类型标注（由 `'tpl'` 推导为 `string`），与计划文本一致；`main.ts:292` 的单参调用在 tsc 下无错（G2 已证）
- F1：默认参数 `'tpl'`，`main.ts` 未改（G3 佐证）
- F2：本期只传 `'ql'`，`ql` 满足契约（E1 断言 `validateConfigId(id) === true`）。函数本身不校验 prefix —— 契约由调用方保证，与规格 §5.4 措辞一致，未额外加校验（不扩范围）
- F3：`validateConfigId`、`existingConfigIds` 未改（diff 范围佐证）
- 未 git add、未 commit、未派子代理

## 7. 疑虑

1. 前缀合法性未校验：若后续任务传入 `'QL'` 或 `'q-l'`，候选串会被 `validateConfigId` 拒掉，100 次重试后抛 `VALIDATION: err.config.idGen`（不会返回坏 id）。规格只要求本期用 `'ql'`，故本任务不加校验；任务 3 的调用点写死 `'ql'` 即可。
2. 用例命名风格：新用例名沿用计划逐字文本（中文），与同文件既有 snake_case 命名不同风格。按「逐字取值」要求保留；如需统一请在验收时说明。
