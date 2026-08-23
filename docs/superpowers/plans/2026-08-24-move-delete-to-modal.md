# 模板删除按钮挪入编辑弹窗（左下角）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把模板列表行的「删除」按钮挪进编辑弹窗左下角，仅编辑模式显示；删除逻辑（confirm/invoke）随按钮一起移入 TemplateModal，成功后由 TemplateModule 关窗并刷新列表。

**架构：** TemplateModal 自持删除流程（与它已有的 save_config 调用同层），新事件 `(e: 'deleted', id)` 上抛给 TemplateModule——后者的职责回到「开关弹窗 + reload + 通知 App」，不再直接操作 delete IPC。列表行只留「编辑」。

**技术栈：** Vue 3 `<script setup>` + @vue/test-utils（happy-dom）+ vitest；IPC 走 window.lms.invoke（delete_config 已存在，主进程/preload/ipc.ts 零改动）。

**规格：** docs/superpowers/spec/2026-08-24-move-delete-to-modal-design.md

---

## 文件结构

| 文件 | 动作 | 职责变化 |
|------|------|----------|
| src/modules/TemplateModal.vue | 修改 | 新增 onDelete()（confirm + delete_config）、'deleted' emit、modal-actions 左下角删除按钮（仅 isEdit） |
| src/modules/TemplateModule.vue | 修改 | 列表行删除按钮与 onDelete 函数移除；监听 'deleted' → 关窗 + reload + emit('changed') |
| src/modules/TemplateModal.test.ts | 测试新增 | 删除契约：编辑/新建模式显隐、confirm=true → emit('deleted')+invoke、失败进 saveError |
| src/modules/TemplateModule.test.ts | 测试新增 | 列表无删除按钮；点「编辑」后弹窗出现删除按钮 |

不改：src/ipc.ts、src-main/*（delete_config handler 与 preload 白名单泛化透传，零改动）。

---

### 任务 1：TemplateModal 删除契约测试（RED）

**文件：**
- 测试：`src/modules/TemplateModal.test.ts`

- [ ] **步骤 1：新增 3 个失败用例**

在 `src/modules/TemplateModal.test.ts` 顶部 import 行（第 4 行）加入 `vi`：

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
```

先把现有 `mountModal` 改为返回 wrapper（原调用点 `mountModal();` 不受影响，返回值可忽略）：

```ts
function mountModal() {
  return mount(TemplateModal, {
    attachTo: document.body,
    props: { open: true, id: '', values: {}, paramsMeta, existingIds: [] },
  });
}
```

再在 setInput 辅助函数之后、describe('TemplateModal') 之外，新增独立 describe（沿用同文件 mock 基建）：

```ts
// ---- 删除契约（2026-08-24 挪入弹窗）----
// 编辑模式挂载：id='qwen38'（isEdit 成立），返回 wrapper 供 emitted() 断言
function mountEdit(): ReturnType<typeof mount> {
  return mount(TemplateModal, {
    attachTo: document.body,
    props: { open: true, id: 'qwen38', values: {}, paramsMeta, existingIds: ['qwen38'] },
  });
}

function findDeleteBtn(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('.modal-actions button')].find(
    (b) => (b.textContent ?? '').includes('删除'),
  ) as HTMLButtonElement | undefined;
}

describe('TemplateModal delete', () => {
  it('delete_button_only_when_editing', async () => {
    calls = []; mockLms();
    const wNew = mountModal(); await flush();
    expect(findDeleteBtn()).toBeUndefined(); // 新建模式：无删除按钮
    wNew.unmount();

    const wEdit = mountEdit(); await flush();
    expect(findDeleteBtn()).toBeDefined(); // 编辑模式：左下角出现删除按钮
    wEdit.unmount();
  });

  it('deletes_when_confirmed', async () => {
    calls = []; mockLms(); const w = mountEdit(); await flush();
    vi.stubGlobal('confirm', () => true);
    try {
      findDeleteBtn()!.click();
      await flush();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(calls.find((c) => c.cmd === 'delete_config')).toEqual({ cmd: 'delete_config', args: ['qwen38'] });
    expect(w.emitted('deleted')?.[0]).toEqual(['qwen38']);
    document.body.innerHTML = '';
  });

  it('delete_error_shown_in_modal_without_deleted_emit', async () => {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => { calls.push({ cmd, args }); return Promise.reject(new Error('VALIDATION: 配置不存在')); },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const w = mountEdit(); await flush();
    vi.stubGlobal('confirm', () => true);
    try {
      findDeleteBtn()!.click();
      await flush();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(w.emitted('deleted')).toBeUndefined(); // 失败不 emit、不关窗
    expect(document.querySelector('.modal-box')?.textContent).toContain('VALIDATION: 配置不存在');
    document.body.innerHTML = '';
  });
});
```

- [ ] **步骤 2：运行验证 RED**

运行：`npx vitest run src/modules/TemplateModal.test.ts`
预期：**3 个新用例 FAIL**——找不到 .modal-actions 里的「删除」按钮（findDeleteBtn() 为 undefined → toBeDefined / 点击 undefined 报 TypeError）；现有 2 个保存用例仍 PASS。

---

### 任务 2：TemplateModal 实现删除（GREEN）

**文件：**
- 修改：`src/modules/TemplateModal.vue`

- [ ] **步骤 3：扩展 emits 与新增 onDelete()**

第 23 行 emit 声明替换为：

```ts
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void; (e: 'deleted', id: string): void }>();
```

在第 136 行 `function close(): void { emit('close'); }` **之前**插入：

```ts
// 删除（规格 2026-08-24）：仅编辑模式渲染；confirm 文案沿用列表行原句；失败进 saveError 区展示，不关窗
async function onDelete(): Promise<void> {
  if (!confirm('删除配置「' + props.id + '」？将从 llama_launch_configs.yaml 移除。')) return;
  try {
    await invoke('delete_config', props.id);
    emit('deleted', props.id);
  } catch (e) {
    saveError.value = errMsg(e); // VALIDATION / IO / MISSING 前缀原样展示
  }
}
```

（confirm / invoke / errMsg 均已在本文件 import，无需新增依赖。）

- [ ] **步骤 4：modal-actions 加删除按钮 + CSS 贴左**

template 里 `.modal-actions` 块（第 186–191 行）替换为：

```html
<div class="modal-actions">
  <button v-if="isEdit" class="btn btn-secondary btn-delete" @click="onDelete">删除</button>
  <button class="btn btn-secondary" @click="close">取消</button>
  <button class="btn btn-primary" :disabled="saving" @click="save">
    {{ saving ? '保存中…' : '保存' }}
  </button>
</div>
```

scoped style 里 `.modal-actions` 规则之后追加：

```css
/* 删除按钮贴弹窗左下角（取消/保存仍右对齐） */
.modal-actions .btn-delete { margin-right: auto; }
```

- [ ] **步骤 5：运行验证 GREEN**

运行：`npx vitest run src/modules/TemplateModal.test.ts`
预期：**5/5 PASS**（2 旧 + 3 新）。

- [ ] **步骤 6：Commit**

```bash
git add src/modules/TemplateModal.vue src/modules/TemplateModal.test.ts
git commit -m "feat: 模板删除按钮进入编辑弹窗左下角（delete 逻辑入 modal）"
```

---

### 任务 3：TemplateModule 收走删除入口（RED→GREEN）

**文件：**
- 修改：`src/modules/TemplateModule.vue`
- 测试：`src/modules/TemplateModule.test.ts`

- [ ] **步骤 7：新增失败用例——列表无删除、编辑弹窗有删除**

在 `src/modules/TemplateModule.test.ts` 的 describe 块内追加（与现有用例同一 mock 模式）：

```ts
it('list_has_no_delete_and_edit_modal_shows_it', async () => {
  (window as any).lms = {
    invoke: (cmd: string) => {
      if (cmd === 'get_configs') return Promise.resolve(CONFIGS);
      if (cmd === 'get_params') return Promise.resolve(defaultParams());
      return Promise.resolve(null);
    },
    onLogLine: () => () => {},
    onProcessExit: () => () => {},
    onTrayExitRequest: () => () => {},
  };
  const wrapper = mount(TemplateModule, { attachTo: document.body });
  await flush();

  // 列表行不再渲染删除按钮（新建模板 / 编辑除外，均不出现「删除」字样）
  expect(wrapper.text()).not.toContain('删除');

  // 点「编辑」→ teleport 到 body 的弹窗 modal-actions 最左出现删除按钮
  const editBtn = wrapper.findAll('button').find((b) => b.text() === '编辑')!;
  await editBtn.trigger('click');
  await flush();
  const del = [...document.querySelectorAll('.modal-actions button')].find(
    (b) => (b.textContent ?? '').includes('删除'),
  );
  expect(del).toBeDefined();
  wrapper.unmount();
});
```

- [ ] **步骤 8：运行验证 RED**

运行：`npx vitest run src/modules/TemplateModule.test.ts`
预期：**新用例 FAIL**——列表行此刻仍渲染「删除」按钮，首个断言 `not.toContain('删除')` 失败；旧用例 PASS。

- [ ] **步骤 9：TemplateModule 移除列表删除、监听 deleted 事件**

第 48–58 行 onDelete 函数**整段删除**，替换为（位置不变）：

```ts
// 删除已挪入弹窗左下角（TemplateModal.onDelete）；成功后由它 emit('deleted') → 关窗 + 刷新
function onDeleted(): void { modalOpen.value = false; void (async () => { await reload(); emit('changed'); })(); }
```

template 表格行（第 77–80 行 td）替换为只留编辑按钮：

```html
<td style="text-align: right; white-space: nowrap;">
  <button class="btn btn-secondary" style="height: 24px;" @click="openEdit(id)">编辑</button>
</td>
```

（去掉删除按钮后「编辑」右侧再无兄弟按钮，margin-right: 4px 一并删去。）

TemplateModal 标签（第 87–96 行）的绑定追加一行：

```html
<TemplateModal
  :open="modalOpen"
  :id="editingId ?? ''"
  :values="configs && editingId ? configs[editingId]?.values ?? {} : {}"
  :desc="configs && editingId ? configs[editingId]?.desc ?? undefined : undefined"
  :params-meta="paramsMeta"
  :existing-ids="configs ? Object.keys(configs) : []"
  @saved="onSaved"
  @deleted="onDeleted"
  @close="modalOpen = false"
/>
```

- [ ] **步骤 10：运行验证 GREEN**

运行：`npx vitest run`（全量）
预期：**全部 PASS**——TemplateModule 2/2、TemplateModal 5/5、src-main 全部既有绿。

- [ ] **步骤 11：Commit**

```bash
git add src/modules/TemplateModule.vue src/modules/TemplateModule.test.ts
git commit -m "feat: 模板列表删除按钮移除，改由编辑弹窗左下角触发（onDeleted 关窗+刷新）"
```
