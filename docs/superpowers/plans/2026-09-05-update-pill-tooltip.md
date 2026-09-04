# 顶栏「有新版本!」tooltip 公共样式化 — 实现计划

**目标：** .update-pill（有新版本!/下载中 NN%）的 hover 提示由原生 `:title` 换为项目公共自绘 tooltip 视觉（data-tooltip + 新 .tip-down 向下定位类）。

**规格：** docs/superpowers/specs/2026-09-05-update-pill-tooltip-design.md

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/style.css` | 修改 | .tip-up 规则后新增 .tip-down（同视觉语言，top 定位向下） |
| `src/App.vue` | 修改 | 两个 .update-pill 按钮：:title → tip-down 类 + data-tooltip |
| `src/App.test.ts` | 修改 | 两个更新用例补 data-tooltip/无 title 断言 |

---

### 任务 1：测试先行（TDD）

**文件：** `src/App.test.ts`（修改）

- [x] **步骤 1：补断言（失败）**

「顶栏「有新版本!」点击打开同一 UpdateModal」用例内，pill 定位后补：

```ts```
// hover 提示 = 项目公共 tooltip（data-tooltip + .tip-down），原生 title 不保留
expect(pill.classes()).toContain('tip-down');
expect(pill.attributes('data-tooltip')).toBe('发现新版本 v9.9.9，点击查看并安装');
expect(pill.attributes('title')).toBeUndefined();
```

「downloading 态…」用例内，busy 定位后补：

```ts```
expect(busy.classes()).toContain('tip-down');
expect(busy.attributes('data-tooltip')).toBe('下载中 55%，点击查看进度');
expect(busy.attributes('title')).toBeUndefined();
```

- [x] **步骤 2：运行验证失败** — `pnpm test src/App.test.ts` 确认 2 个新断言红（类/属性尚不存在）。

### 任务 2：实现

- [x] **步骤 3：** `src/style.css` — .tip-up 规则（含重复块）之后插入 .tip-down（规格 §3.1）。
- [x] **步骤 4：** `src/App.vue` — 两个 .update-pill 按钮按规格 §3.2 改类与 data-tooltip，删 :title。
- [x] **步骤 5：** `pnpm test` 全量回归 — 22 文件 286 用例全绿。

### 任务 3：收尾

- [x] **步骤 6：** 手动 dev 验证 tooltip 位置/视觉（规格 §4；代码路径与 .tip-up 同构，待用户 dev 目视确认）。
- [ ] **步骤 7：** 提交 + 规格文档状态改「已实现」。