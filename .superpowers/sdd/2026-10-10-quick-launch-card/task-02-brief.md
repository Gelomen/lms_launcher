# 任务 2 简报 · `suggestConfigId` 支持前缀

## 这个任务在项目里的位置

「快捷启动卡片」计划 14 个任务中的第 2 个：给既有 `suggestConfigId` 加一个带默认值的前缀参数，让后面的快捷启动配置层（任务 3）能生成 `ql` 前缀的 id。**默认行为不许变。**

## 你的完成判据（照它逐行执行并勾选）

`docs/superpowers/checks/2026-10-10-quick-launch-card/task-02-suggest-config-id-prefix.md`
（A→I 逐行执行；命令必须真跑，把命令与实际输出摘要填进该表「J. 执行记录」段。J 段空 = 任务未完成）

## 计划 §任务 2（逐字）

```
### 任务 2：suggestConfigId 支持前缀

**文件：** 修改 src-main/config.ts:117-124；测试追加到 src-main/config.test.ts

**接口：** suggestConfigId(existing: string[], prefix = 'tpl'): string

- [ ] 步骤 1：编写失败的测试

it('suggestConfigId 支持自定义前缀且仍满足 id 契约', () => {
  const id = suggestConfigId([], 'ql');
  expect(id.startsWith('ql')).toBe(true);
  expect(validateConfigId(id)).toBe(true);
});
it('suggestConfigId 默认前缀仍是 tpl', () => {
  expect(suggestConfigId([]).startsWith('tpl')).toBe(true);
});

- [ ] 步骤 2：运行测试验证失败 —— npx vitest run src-main/config.test.ts → 第一个用例 FAIL
- [ ] 步骤 3：实现 —— 候选串改 prefix + Date.now().toString(36) + rand()，签名加默认参数
- [ ] 步骤 4：运行测试验证通过 —— npx vitest run src-main/config.test.ts → PASS
- [ ] 步骤 5：Commit —— 由主代理在验收后执行，你不要 git add、不要 commit
```

## 规格（有约束力的权威）

§5.4（第 95 行）：
> `suggestConfigId(existing, prefix = 'tpl')` 泛化出前缀参数，快捷启动用 `'ql'`（默认值不变，既有调用与测试不受影响）。

## 要改的既有代码（已取证，真实行号，HEAD 341319a）

`src-main/config.ts:115-124`：

```ts
// suggest：自动生成唯一配置 id——保存后写入 yaml key，故必须符合 validateConfigId（小写字母开头、[a-z0-9]、≤32）且与现有条目不重名。
// 碰撞概率低（时间戳+随机尾巴），但渲染端可能连续两次秒级保存同一时间戳 → 循环重试直至唯一
export function suggestConfigId(existing: string[]): string {
  const rand = (): string => Math.floor(Math.random() * 10000).toString(16).padStart(4, '0');
  for (let i = 0; i < 100; i++) {
    const candidate = 'tpl' + Date.now().toString(36) + rand();
    if (validateConfigId(candidate) && !existing.includes(candidate)) return candidate;
  }
  throw new Error('VALIDATION: ' + t('err.config.idGen'));
}
```

调用点（已实测）：生产调用点只有 `src-main/main.ts:292`（`return suggestConfigId(existingConfigIds(p));`）——**不改**；测试调用点 `src-main/config.test.ts:138,144`——既有用例一行不改，只在文件里追加两个新用例。
`validateConfigId` 在 `src-main/config.ts:174`（小写字母开头、`[a-z0-9]`、≤32）——**不改**。

## 边界与硬约束（越界即不勾）

- 只碰两个文件：`src-main/config.ts`（只改 117-124 的签名与候选串前缀来源）、`src-main/config.test.ts`（追加两个用例）
- 默认参数必须是 `'tpl'`；防重与 100 次重试逻辑、`VALIDATION: err.config.idGen` 抛错都保留
- 不改 `validateConfigId`、不改 `existingConfigIds`、不改 `main.ts`
- 严格 TDD：先追加用例 → 跑 D2 看红（第一个用例 FAIL）→ 再实现 → 跑 D4 看绿；两次输出都贴进 J 段
- 回归门 G2 要真跑：`npx tsc -p tsconfig.main.json --noEmit` 无错
- **不要 git add、不要 commit、不要派子代理**

## 报告

完整报告写到 `.superpowers/sdd/2026-10-10-quick-launch-card/task-02-report.md`：改了什么、D2/D4/G1/G2/G3 的实际输出摘要、E1–E3 证据、自审、疑虑。
回传只给：状态一行 + 测试小结一行 + 疑虑（若有）。
