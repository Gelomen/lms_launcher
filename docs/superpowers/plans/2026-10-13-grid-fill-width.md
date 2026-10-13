# 快捷启动列填满可用宽度 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 `.grid` 第 3 列（快捷启动）从定宽 `330px` 改为 `minmax(330px, 380px)`，使默认 1400 窗口下四列恰好占满可用宽度、GPU 卡右侧不再留 50px 空白。

**架构：** 单点改动——`src/style.css` 的 `.grid` 一条属性；契约由 `src/App.test.ts` 新增的一个 `describe` 钉住：读 `src/style.css` 的规则文本 + 读 `src-main/main.ts` 的默认窗口宽，把「不留空」写成一条算术断言（改窗口宽或改任一列宽都会红）。真机目视门由用户执行。

**技术栈：** Electron 28 + Vue 3 + TypeScript + vitest（happy-dom）；无新依赖。

**规格：** `docs/superpowers/specs/2026-10-13-grid-fill-width-design.md`（所有取值以规格为准，执行者两份都要读）

## 全局约束

- **只改两处**：`src/style.css:80`（`grid-template-columns` 一行 + 同处 `:78-79` 注释）与 `src/App.test.ts`（新增一个 `describe` + 两个 import）。规格 §5 之外的一律不改。
- **第 3 列取值逐字** = `minmax(330px, 380px)`；第 1/2/4 列仍是 `280px` / `350px` / `330px`；`gap` 与 `--card-pad` 不动（规格 §3）。
- **不写死 1376 / 1400 这类魔数**：可用宽度从 `src-main/main.ts` 现读、间距从 `--card-gap` 现读（规格 §4.1 第 2 条）。
- 行名截断预算 `BUDGET = 30`（`src/modules/QuickLaunch.vue:124`）**不改**（规格 §2 / §6-Q4）。
- 单测命令 `npx vitest run <路径>`，全量 `npm test`；主进程类型检查 `npx tsc -p tsconfig.main.json --noEmit`；CSS 语法门 `npx vite build`。
- 提交信息用 Conventional Commits + 中文（与仓库历史一致）。
- 本期不做的事见规格 §2，**不得顺手扩范围**。

## 审查重点（Review Focus）

规格隐含、单测容易漏掉、且最可能伤到使用者的五条；每条都钉在对应任务的测试或真机清单里：

1. **窗口宽度落在 1350–1399** → 期望仍无横向滚动条（该列先缩回 330 才溢出），而不是像写死 380 那样把溢出区间扩大 50px。钉住：任务 1 的「第 3 列逐字 = `minmax(330px, 380px)`」断言（base 330 是这条行为的唯一载体）+ 真机清单第 3 步。
2. **日后有人改任一列宽或改默认窗口宽** → 期望「不留空」契约立刻红，而不是悄悄把留白加回来。钉住：任务 1 的算术断言（四列上限 + 3×`--card-gap` = 窗口宽 − 2×内边距，两个数都现读）。
3. **有人把它写成 `1fr`（无上限）** → 最大化窗口时快捷启动卡无限拉伸、行内按钮被拉到很远。钉住：任务 1 的逐字断言（`fr` 不在允许值里）。
4. **卡片变宽 50px 后行内按钮换行/错位** → 期望名字 + `[复制][编辑][启动/停止]` 仍在同一行。钉住：真机清单第 4 步 + 任务 1 步骤 5 的 `QuickLaunch.test.ts` 回归。
5. **GPU 卡切卡动画与本列宽度耦合** → 期望动画仍裁在卡片边框处、滑入滑出正常（偏移用 `100%` + 固定 32/16px，理论上无关，但要回归）。钉住：真机清单第 5 步 + 任务 1 步骤 5 的 `App.test.ts` GPU 用例回归。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/style.css:76-82`（修改） | `.grid` 的列定义：第 3 列 → `minmax(330px, 380px)`；`:78-79` 注释同步记录新口径 |
| `src/App.test.ts`（修改，追加在 `:933` 之后） | 网格宽度契约：四列逐字 + 「不留空」算术 |
| 不改 | `src/App.vue`、`src/modules/QuickLaunch.vue`、`src/modules/GpuModule.vue`、`src-main/*`、i18n、`electron-builder.yml`、旧规格文档 |

---

### 任务 1：`.grid` 第 3 列 `minmax` + 宽度契约测试

**文件：**
- 修改：`src/style.css:78-80`
- 测试：`src/App.test.ts`（追加在 `describe('App GPU card mount')` 之后，即现 `:933` 之后；import 加在 `:6` 之前）

- [ ] **步骤 0：记基线（已由主代理完成，check 索引 K6）**

基线由主代理在生成 check 表时实测并写入任务 1 表 A2：`Test Files 47 passed (47)` / `Tests 814 passed (814)`，exit 0（其中 `src/App.test.ts` = 59 tests）。**实现者不重跑全量**；全量只在步骤 5 跑一次，结果必须 = 基线 + 2 个用例（`Tests 816 passed (816)`），且不得有任何减少。

- [ ] **步骤 1：编写失败的测试**

在 `src/App.test.ts` 末尾追加（顶部补 `import { readFileSync } from 'node:fs';` 与 `import { join } from 'node:path';`；`__dirname` 在本文件可用，先例 `src/modules/LogPanel.test.ts:365`）：

```ts
// 2026-10-13-grid-fill-width §4.1：网格宽度契约。happy-dom 不加载外部 CSS（先例 LogPanel.test.ts:365）
// → 断 src/style.css 的规则文本 + src-main/main.ts 的默认窗口宽：两者合起来把「不留空」钉成算术。
describe('App 网格宽度契约（2026-10-13-grid-fill-width）', () => {
  const css = readFileSync(join(__dirname, 'style.css'), 'utf-8');
  const gridRule = css.slice(css.indexOf('.grid {'), css.indexOf('.stack {'));
  const tracksRaw = gridRule.match(/grid-template-columns:\s*([^;]+);/)![1].trim();
  // minmax(...) 内含空格，按空白切会切碎 → 一条 track 一个 token
  const tracks = tracksRaw.match(/(?:minmax\([^)]*\)|\d+px)/g)!;
  const maxOf = (t: string): number => Math.max(...(t.match(/(\d+(?:\.\d+)?)px/g) ?? []).map((s) => parseFloat(s)));

  it('第 3 列 = minmax(330px, 380px)，其余三列不变（规格 §3 / §4.1-1、3）', () => {
    expect(tracksRaw).toBe('280px 350px minmax(330px, 380px) 330px');
    expect(tracks.length).toBe(4);
  });

  it('四列上限 + 3×gap = 默认窗口可用宽度（不留空是算术，规格 §4.1-2）', () => {
    const mainSrc = readFileSync(join(__dirname, '..', 'src-main', 'main.ts'), 'utf-8');
    const winW = Number(mainSrc.match(/width:\s*(\d+),\s*height:/)![1]);
    const gap = Number(css.match(/--card-gap:\s*(\d+)px/)![1]);
    // 前提：.layout 的内边距 = --card-gap（可用宽度 = 窗口宽 − 2×gap）
    expect(css.slice(css.indexOf('.layout {'), css.indexOf('.grid {'))).toMatch(/padding:\s*var\(--card-gap\)/);
    expect(tracks.reduce((a, t) => a + maxOf(t), 0) + 3 * gap).toBe(winW - 2 * gap);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/App.test.ts -t '网格宽度契约'`
预期：FAIL，2 条都红——第 1 条 `expected '280px 350px minmax(330px, 380px) 330px' ... received '280px 350px 330px 330px'`；第 2 条 `expected 1326 to be 1376`（1290 + 36 vs 1400 − 24）。把输出贴进 check 表 J 段。

- [ ] **步骤 3：改 `src/style.css`**

把 `:78-80` 整段（两条注释 + 属性行）替换为：

```css
  /* 第 1/2/4 列绝对固定宽度（左 424→280、模板 520→350、GPU 300→330，2026-09/10 定稿）；
     第 3 列（快捷启动）= minmax(330px, 380px)（2026-10-13-grid-fill-width §3）：有富余就长到 380，
     把四列填满到默认窗口的可用宽度（1340 + 3×12 = 1376 = 1400 − 2×12），右侧不留白；
     窗口收窄时先缩回 330 再溢出（不新增横向滚动区间），上限 380 = 定宽语义（比默认窗口更宽时留白回右，用户 2026-10-13 决定不处理） */
  grid-template-columns: 280px 350px minmax(330px, 380px) 330px;
```

只改这一处；`.grid` 的 `display` / `gap` 与文件其余部分一行不动。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/App.test.ts`
预期：PASS，含新增 2 条；`Test Files 1 passed (1)`、`Tests N passed (N)` 且 N = 基线该文件计数 + 2。

- [ ] **步骤 5：相邻回归 + 全量 + 语法/类型门**

运行：`npx vitest run src/modules/LogPanel.test.ts src/modules/QuickLaunch.test.ts src/modules/TemplateModule.test.ts`（三份都会读 `style.css` 文本）
预期：全绿。
运行：`npx vite build`
预期：exit 0（CSS 语法门）。
运行：`npx tsc -p tsconfig.main.json --noEmit`
预期：无输出、exit 0。
运行：`npm test`
预期：全绿，计数 = 步骤 0 基线 + 2（本任务新增 2 条），无减少。

- [ ] **步骤 6：Commit（由主代理在验收通过后执行）**

```bash
git add src/style.css src/App.test.ts
git commit -m "fix: 快捷启动列改 minmax(330px, 380px)，四列填满默认窗口可用宽度"
```

---

### 任务 2：真机目视门（用户执行）

**文件：**
- 记录：`docs/superpowers/checks/2026-10-13-grid-fill-width/task-02-realmachine-visual.md`（J 段填真实回报）

- [ ] **步骤 1：把清单交给用户**（逐字，规格 §4.2）

1. 默认 1400×950 窗口：GPU 卡右缘到窗口右缘只剩一条 12px 内边距，无空白
2. 无横向滚动条
3. 把窗口拖到约 1360 宽：仍无横向滚动条（快捷启动列自动缩到约 340）
4. 快捷启动行：名字 + `[复制][编辑][启动/停止]` 仍在同一行，按钮未换行/未错位
5. GPU 卡（多卡时）切卡动画仍裁在卡片边框处、滑入滑出正常

- [ ] **步骤 2：等回报并把结果填进该任务 check 表的 J 段**（逐条：通过 / 不通过 + 现象）。本实现环境起不了 Electron GUI（规格 §4.2 取证），**不得用「自动化已过」代替这一条**。

- [ ] **步骤 3：收尾**

全部通过 → 在 `docs/superpowers/checks/2026-10-13-grid-fill-width/00-index.md` 的 K 组登记真机结论，并把规格状态行改为「已实现 + 真机已验收」；任一条不通过 → 工作区改动打回（丢弃或重派），先改规格/plan/check 表再改代码。
