# 「新建模板/编辑」图标化 —— 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框语法来跟踪进度（- [ ] 形式）。

**目标：** 把「启动参数模板」卡片顶部的「新建模板」文字按钮和列表行的「编辑」文字按钮改为内联 SVG 图标按钮（+ / 铅笔），hover 显示自绘 CSS tooltip（「新建模板」/「编辑」），点击行为不变。

**架构：** TemplateModule.vue 替换两处 button 的模板内容并加 data-tooltip + aria-label；style.css 追加 .icon-btn / .icon-btn--sm / ::after tooltip 三类样式（不动既有类）。测试先行改断言。零新依赖、弹窗零改动。

**技术栈：** Vue3 SFC + happy-dom/vitest（@vue/test-utils）+ Electron WebView CSS。

---

**文件结构：**

- 修改：`src/modules/TemplateModule.vue` —— 两处按钮模板替换（顶部新建、行内编辑）。
- 修改：`src/style.css` —— 追加 .icon-btn 三件套样式（新类，不改既有类）。
- 测试：`src/modules/TemplateModule.test.ts` —— 改断言选择器 + 新增顶部按钮用例。

---

### 任务 1：图标按钮（TDD）

**文件：**
- 修改：`src/modules/TemplateModule.vue`（template 区两处）
- 测试：`src/modules/TemplateModule.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 TemplateModule.test.ts 中：

a) 新增用例（放在文件 describe 内，复用现有 stub 注入模式）：

```ts
  it("top_button_is_plus_icon_with_tooltip_opens_new_modal", async () => {
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === "get_configs") return Promise.resolve(CONFIGS);
        if (cmd === "get_params") return Promise.resolve(defaultParams());
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const wrapper = mount(TemplateModule, { attachTo: document.body });
    await flush();

    // 顶部图标按钮：+ 号 SVG + data-tooltip/aria-label=新建模板
    const addBtn = wrapper.findAll("button").find(
      (b) => b.attributes("data-tooltip") === "新建模板",
    )!;
    expect(addBtn).toBeDefined();
    expect(addBtn.attributes("aria-label")).toBe("新建模板");

    // 卡片内（不含 teleport 弹窗）不再出现可点击文字「新建模板」「编辑」
    expect(wrapper.text()).not.toContain("新建模板");
    expect(wrapper.text()).not.toContain("编辑");

    await addBtn.trigger("click");
    await flush();
    const h3 = document.querySelector(".modal-box h3");
    expect(h3?.textContent).toBe("新建模板");
    wrapper.unmount();
  });
```

b) 修改现有用例 list_has_no_delete_and_edit_modal_shows_it：把查找「编辑」按钮的一行

```ts
    const editBtn = wrapper.findAll("button").find((b) => b.text() === "编辑")!;

改为：

```ts
    const editBtn = wrapper.findAll("button").find(
      (b) => b.attributes("data-tooltip") === "编辑",
    )!;

其余断言（不含「删除」、弹窗内删除按钮存在）原样保留。注意：该用例弹窗 teleport 目标是 body——现有代码用 document.querySelectorAll 已能覆盖，不改。

- [ ] **步骤 2：运行测试验证失败**

运行：npx vitest run src/modules/TemplateModule.test.ts

预期：新用例 FAIL（找不到 data-tooltip=新建模板 的按钮）；被改的现有用例 list_has_no_delete_and_edit_modal_shows_it FAIL（editBtn 为 undefined）。其余 2 个用例 PASS。

- [ ] **步骤 3：修改 TemplateModule.vue**

顶部工具行，把：

```html
      <button class="btn btn-secondary" @click="openNew">新建模板</button>

替换为：

```html
      <button class="icon-btn" data-tooltip="新建模板" aria-label="新建模板"
        @click="openNew">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>

列表行，把：

```html
              <button class="btn btn-secondary" style="height: 24px;" @click="openEdit(id)">编辑</button>

替换为：

```html
              <button class="icon-btn icon-btn--sm" data-tooltip="编辑" aria-label="编辑"
                @click="openEdit(id)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 12.5L9.5 5l2 2L4 14.5H2v-2z"
                    stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  <path d="M10.8 3.7l1.4-1.4a1.6 1.6 0 0 1 2.3 0l1.2 1.2a1.6 1.6 0 0 1 0 2.3L14 8"
                    stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                </svg>
              </button>

- [ ] **步骤 4：运行测试验证通过**

运行：npx vitest run src/modules/TemplateModule.test.ts

预期：全部 PASS（含新用例 + 修改后的现有用例）。

- [ ] **步骤 5：Commit**

```sh
git add src/modules/TemplateModule.vue src/modules/TemplateModule.test.ts
git commit -m "feat(template): 新建模板/编辑改为 SVG 图标按钮（data-tooltip + aria-label）"
```

### 任务 2：CSS（.icon-btn + tooltip）

**文件：**
- 修改：`src/style.css`（末尾追加，不改既有类）

- [ ] **步骤 1：在 style.css 末尾追加**

```css

/* ---- 图标按钮 + tooltip（2026-08-25）：「新建模板」+ / 行内「编辑」铅笔 ---- */
.icon-btn {
  width: var(--h-control); height: var(--h-control);   /* 32x32，与输入框/下拉等高 */
  display: inline-flex; align-items: center; justify-content: center;
  background: #fff;
  border: 1px solid var(--control-border);
  border-radius: var(--radius-btn);
  color: var(--muted);           /* 图标色随文字色（stroke=currentColor） */
  cursor: pointer;
  padding: 0;
}
.icon-btn:hover { background: #F6F7F8; color: var(--text); }  /* 与 .btn:hover 同语言 */
.icon-btn--sm { width: 24px; height: 24px; }                 /* 行内编辑按钮（替代原 height:24px） */
/* tooltip：hover 立即显示，按钮上方居中；深灰底白字；pointer-events:none 不挡点击 */
.icon-btn { position: relative; }
.icon-btn::after {
  content: attr(data-tooltip);
  position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  background: #374151; color: #fff;
  font-size: var(--fs-label); line-height: 1.4; white-space: nowrap;
  padding: 2px 8px; border-radius: 6px;
  z-index: 30;                    /* 高于 .dropdown-panel(20)，避免被下拉遮 */
  pointer-events: none;
  opacity: 0;
}
.icon-btn:hover::after { opacity: 1; }
```

- [ ] **步骤 2：运行测试确认无回归**

运行：npx vitest run（全量）

预期：全部 PASS。CSS 不参与单测；此步只守回归底线。

- [ ] **步骤 3：Commit**

```sh
git add src/style.css
git commit -m "style(template): .icon-btn 图标按钮 + CSS tooltip（上方居中、深灰底）"
```

### 任务 3：dev 窗口人工验收

- [ ] **步骤 1：启动 dev**

运行：npm run dev（vite :1420 + electron）

- [ ] **步骤 2：逐项核对**

1. 「启动参数模板」卡片右上角是 + 号图标按钮（32x32、白底细边框）。
2. hover「+」→ 上方立即出现深色气泡「新建模板」。
3. 点「+」→ 弹窗打开，h3 = 「新建模板」（行为不变）。
4. 列表行是铅笔图标（24x24）；hover → 气泡「编辑」；点击 → 弹窗 h3 = 「编辑模板」。
5. tooltip 不遮挡下拉弹层、不挡住按钮点击。

- [ ] **步骤 3：全量测试收尾**

运行：npx vitest run，预期全绿。无 commit（纯验收）。

---

## 自检记录

- 规格覆盖：B1/B2 → 任务 1 步骤 3；B3 → 任务 2 步骤 1；测试 3 条 → 任务 1 步骤 1a/1b；验收 → 任务 3。无遗漏。
- 占位符：无 TODO/待定；所有代码块完整。
- 一致性：选择器统一为 data-tooltip（aria-label 仅辅助）；SVG path 数据在步骤中直接给出。