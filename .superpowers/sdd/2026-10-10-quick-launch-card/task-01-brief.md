# 任务 1 简报 · 公共命名工具 `nextCopyName`

## 这个任务在项目里的位置

「快捷启动卡片」计划的第 1 个任务（共 14 个）：把模板卡里的复制命名逻辑抽成 `src/util/copy-name.ts`，供后面的快捷启动卡片（任务 11）共用。**纯搬移重构，行为不许变。**

## 你的完成判据（照它逐行执行并勾选）

`docs/superpowers/checks/2026-10-10-quick-launch-card/task-01-next-copy-name.md`
（A→I 顺序逐行执行；命令必须真跑，把命令与实际输出摘要填进该表末尾的「J. 执行记录」——J 段空 = 任务未完成）

## 计划 §任务 1（逐字）

```
### 任务 1：公共命名工具 nextCopyName

**文件：** 创建 src/util/copy-name.ts；测试 src/util/copy-name.test.ts；修改 src/modules/TemplateModule.vue（第 73-80 行改为引用）

**接口：** export function nextCopyName(base: string, taken: Set<string>): string

- [ ] 步骤 1：编写失败的测试

import { describe, expect, it } from 'vitest';
import { nextCopyName } from './copy-name';

describe('nextCopyName', () => {
  it('首次复制加 - copy 后缀', () => {
    expect(nextCopyName('Qwen', new Set(['Qwen']))).toBe('Qwen - copy');
  });
  it('已占用时递增编号', () => {
    expect(nextCopyName('Qwen', new Set(['Qwen', 'Qwen - copy']))).toBe('Qwen - copy 2');
  });
  it('源名本身是复制品时剥后缀重算', () => {
    expect(nextCopyName('Qwen - copy', new Set(['Qwen - copy']))).toBe('Qwen - copy 2');
    expect(nextCopyName('Qwen - copy 2', new Set(['Qwen - copy 2']))).toBe('Qwen - copy');
  });
});

- [ ] 步骤 2：运行测试验证失败 —— npx vitest run src/util/copy-name.test.ts → FAIL（无法解析 ./copy-name）
- [ ] 步骤 3：实现 把 TemplateModule.vue 的 COPY_SUFFIX = / - copy( \d+)?$/ 与循环逻辑原样搬入（**行为不许变**）
- [ ] 步骤 4：运行测试验证通过 —— npx vitest run src/util/copy-name.test.ts src/modules/TemplateModule.test.ts → 全 PASS
- [ ] 步骤 5：Commit —— 由主代理在验收后执行，你不要 git add、不要 commit
```

## 规格（有约束力的权威）

§5.4 id 与复制命名（第 96 行）：
> 新建 `src/util/copy-name.ts` 导出 `nextCopyName(base, taken)`，从 `TemplateModule.vue` 原样搬出并改为引用（行为不变，既有测试兜底）。

§12 测试与验收 · 单元 2（第 282 行）：
> `copy-name`：`X` → `X - copy` → `X - copy 2`；源名已含后缀时剥后缀重算。

## 要搬走的既有代码（已取证，真实行号）

`src/modules/TemplateModule.vue` 第 70-80 行（当前 HEAD 341319a）：

```ts
// 复制命名（2026-08-30 spec-template-copy-button，方案 A：递增编号 + 占用检测）：
// 候选 base - copy / base - copy 2 / …，取第一个不在现有 name 集合中的；
// base 本身是复制品（- copy / - copy N 结尾）→ 剥后缀还原原始 base，防止滚成 "X - copy - copy"
const COPY_SUFFIX = / - copy( \d+)?$/;
function nextCopyName(base: string, taken: Set<string>): string {
  const root = base.replace(COPY_SUFFIX, '');
  for (let i = 1; ; i++) {
    const cand = i === 1 ? `${root} - copy` : `${root} - copy ${i}`;
    if (!taken.has(cand)) return cand;
  }
}
```

调用点在同文件第 95 行：`const newName = nextCopyName(src.name ?? '', taken);` —— 改成从 `../util/copy-name` 导入后调用，调用处行为不变。

## 边界与硬约束（越界即不勾）

- 只碰三个文件：新建 `src/util/copy-name.ts`、新建 `src/util/copy-name.test.ts`、修改 `src/modules/TemplateModule.vue`（仅把第 70-80 行的定义替换为 import 引用）
- `src/util/` 目录已存在（`linkify.ts` / `log-search.ts` / `truncate.ts` 及各自 `.test.ts`）：照它们的写法，**不要**新建 `index.ts` 之类的聚合文件
- 搬移不是重写：正则与循环逐字照搬（含空格与 `( \d+)?$`），不加新逻辑、不做多语言后缀、不做可配置后缀（规格 §2 非目标）
- 严格 TDD 顺序：先落测试 → 跑 D2 看红 → 再实现 → 跑 D4 看绿；D2 的失败输出要贴进 J 段
- **不要 `git add`、不要 commit**：改动留在工作区等主代理验收
- 不要派子代理

## 报告

把完整报告写到 `.superpowers/sdd/2026-10-10-quick-launch-card/task-01-report.md`，包含：改了什么、D2/D4/G1/G2 各命令的实际输出摘要、E1–E4 的证据、自审发现、任何疑虑。
回传只给：状态（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）+ 一行测试小结 + 疑虑（若有）。
