# 顶栏「重启以更新」按钮保持显示 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。
> 设计权威：`docs/superpowers/specs/2026-10-05-update-pill-ready-design.md`

**目标：** 自动更新下载完成后，winbar 左上角 pill 保持显示并变「重启以更新」，点击仍只打开「检查更新」弹窗。

**架构：** App.vue 的 pill 是模板 `v-if` 链，现只有 `available` / `downloading` 两个分支；下载完成把相位切到 `ready` 后面临无分支可渲染 → 按钮消失。本计划在链尾补第三个分支，并为 pill/tooltip 各加一个双语词条；不动状态机、不动主进程、不新增 CSS。

**技术栈：** Vue 3 `<script setup>` + vitest + happy-dom + `@vue/test-utils`；i18n 词典真源在 `src-main/i18n/dict.ts`（渲染端经 `src/i18n.ts` 的响应式 `t()` 读取）。

**基线事实（实现前实测）：** `master` 工作树干净，HEAD `b7ca398`；`npm test` = 35 文件 / **584 用例，583 通过 + 1 失败**（失败点为 `src-main/i18n/no-hardcoded.test.ts`，成因见任务 1）。完成后期望 **586 用例全绿**。

---

## 文件结构

| 文件 | 责任 | 任务 |
|---|---|---|
| `src-main/i18n/no-hardcoded.test.ts` | 恢复 `!PENDING.has(rel)` 跳过 + 文件末尾换行（修复 `6a1d692` 回归） | 任务 1（独立，可与 2/3 并行） |
| `src-main/i18n/dict.test.ts` | S1 zh/en 两条用例各追加 2 条逐字断言 | 任务 2 |
| `src-main/i18n/dict.ts` | zh/en 各新增 `app.update.pill.ready` / `app.update.tip.ready` | 任务 2 |
| `src/App.test.ts` | update describe 内新增 2 条用例（中文核心回归 + 英文文案） | 任务 3 |
| `src/App.vue` | pill `v-if` 链尾部新增 `ready` 分支 | 任务 3 |

**写作用域与依赖：** 任务 1 文件独立可并行；**任务 3 依赖任务 2**（词条缺失时 pill 会渲染成 key 字符串，用例 A 必然失败）；任务 2 与任务 3 触及不同文件，但必须串行执行（先 2 后 3）。

---

## 任务 1：修复守护用例回归（`6a1d692`）

**文件：**
- 修改：`src-main/i18n/no-hardcoded.test.ts:143-152`（第一个 `it`）、文件末尾换行

**背景：** 提交 `6a1d692` 把该用例从
`targets().filter((f) => !EXCLUDE.has(f) && !PENDING.has(f))`
改写成只跳过 `EXCLUDE`，导致仍列在 `PENDING` 的 `src-main/main.ts` 也被硬断言 → HEAD 上该用例红。用例名本身就是「待清理清单**之外**的文件」。

- [ ] **步骤 1：恢复 PENDING 跳过**

把 `src-main/i18n/no-hardcoded.test.ts` 中这段：

```ts
  it('待清理清单之外的文件,字符串字面量不含汉字', () => {
    const failures = [];
    for (const rel of targets()) {
      if (EXCLUDE.has(rel)) continue;
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      const found = literalText(src).match(HAS_HAN);
      if (found) failures.push({ file: rel, char: found[0] });
    }
    expect(failures).toEqual([]);
  });
```

改为：

```ts
  it('待清理清单之外的文件,字符串字面量不含汉字', () => {
    const failures = [];
    for (const rel of targets()) {
      if (EXCLUDE.has(rel) || PENDING.has(rel)) continue; // PENDING = 待清理清单，之外的文件才硬断言
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      const found = literalText(src).match(HAS_HAN);
      if (found) failures.push({ file: rel, char: found[0] });
    }
    expect(failures).toEqual([]);
  });
```

- [ ] **步骤 2：恢复文件末尾换行**

该文件当前以 `});` 结尾且**无换行符**（`6a1d692` 引入）。在文件最后一个字符 `;` 之后补一个 `\n`（保存后 git 不再显示 `\ No newline at end of file`）。

- [ ] **步骤 3：运行守护用例验证转绿**

运行：

```bash
npx vitest run src-main/i18n/no-hardcoded.test.ts
```

预期：**3 passed**（修复前为 2 passed / 1 failed）。

- [ ] **步骤 4：Commit**

```bash
git add src-main/i18n/no-hardcoded.test.ts
git commit -m "fix(test): restore PENDING skip in no-hardcoded guard (S11 regression)"
```

---

## 任务 2：i18n 词条（先断言，后词条）

**文件：**
- 测试：`src-main/i18n/dict.test.ts:34-54`（两条 S1 用例）
- 实现：`src-main/i18n/dict.ts`（zh `app.update.*` 区、en `app.update.*` 区）

- [ ] **步骤 1：写失败的断言（zh）**

在 `src-main/i18n/dict.test.ts` 的 `it('S1：app.* 的 zh 值与既有界面文案逐字一致', ...)` 中，`expect(dict.zh['app.update.tip.downloading'])...` 一行之后追加：

```ts
    expect(dict.zh['app.update.pill.ready']).toBe('重启以更新');
    expect(dict.zh['app.update.tip.ready']).toBe('新版本 v{version} 已下载，点击查看并重启更新');
```

- [ ] **步骤 2：写失败的断言（en）**

在 `it('S1：app.* 的 en 值为最短文案（下载态仅百分比）', ...)` 中，`expect(dict.en['app.update.tip.downloading'])...` 一行之后追加：

```ts
    expect(dict.en['app.update.pill.ready']).toBe('Restart to update');
    expect(dict.en['app.update.tip.ready']).toBe('Version {version} downloaded, click to view and restart');
```

- [ ] **步骤 3：运行测试验证失败**

运行：

```bash
npx vitest run src-main/i18n/dict.test.ts
```

预期：**FAIL**，两条 S1 用例报 `expected undefined to be '重启以更新'` / `expected undefined to be 'Restart to update'`（其余 6 条用例仍通过）。

- [ ] **步骤 4：zh 词条落地**

在 `src-main/i18n/dict.ts` 的 zh 词典中，`'app.update.tip.downloading': '下载中 {pct}%，点击查看进度',` 一行之后插入：

```ts
    'app.update.pill.ready': '重启以更新',
    'app.update.tip.ready': '新版本 v{version} 已下载，点击查看并重启更新',
```

- [ ] **步骤 5：en 词条落地**

在 `src-main/i18n/dict.ts` 的 en 词典中，`'app.update.tip.downloading': 'Downloading {pct}%, click to view progress',` 一行之后插入：

```ts
    'app.update.pill.ready': 'Restart to update',
    'app.update.tip.ready': 'Version {version} downloaded, click to view and restart',
```

- [ ] **步骤 6：运行测试验证通过**

运行：

```bash
npx vitest run src-main/i18n/dict.test.ts
```

预期：**8 passed**（含「zh 与 en 的 key 集合完全一致」——新 key 双语对称）。

- [ ] **步骤 7：Commit**

```bash
git add src-main/i18n/dict.ts src-main/i18n/dict.test.ts
git commit -m "feat(i18n): add app.update.pill.ready / app.update.tip.ready"
```

---

## 任务 3：App.vue 补 ready 分支（先用例，后实现）

**文件：**
- 测试：`src/App.test.ts`（`describe('App update modal (入口统一 + 共用退出确认 + 七态流转)')` 内，`updateBtns()` 助手函数之后）
- 实现：`src/App.vue:314-326`

- [ ] **步骤 1：写失败的核心回归用例（中文）**

在 `src/App.test.ts` 的 `function updateBtns() { ... }` 之后插入：

```ts
  it('下载完成 → 顶栏 pill 不消失：文本变「重启以更新」，点击仍只开弹窗（不直接重启）', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush(); // 启动静默检查 → available
    trayUpdateHandlers.at(-1)(); // 开弹窗（零自动检查）
    await flush();
    updateBtns()[0].click(); // 「下载更新」→ download_update 在途
    await flush();
    updateProgressHandlers.at(-1)!({ pct: 55 }); // 进度事件 → downloading 55%
    await flush();
    expect(w.find('.update-pill--busy').text()).toContain('下载中 55%');
    (document.querySelector('.update-modal .update-close') as HTMLButtonElement).click(); // 关闭弹窗，下载继续
    await flush();
    ctrl.download.resolve({ ok: true }); // 下载完成 → phase = ready
    await flush();
    // 关键回归：pill 仍在（此前 ready 态无 v-if 分支 → 按钮消失）
    const pill = w.find('.update-pill');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toBe('重启以更新');
    expect(pill.classes()).not.toContain('update-pill--busy'); // 回落实心紫
    expect(pill.classes()).toContain('tip-down');
    expect(pill.attributes('data-tooltip')).toBe('新版本 v9.9.9 已下载，点击查看并重启更新');
    expect(pill.attributes('title')).toBeUndefined();
    // 点击 → 只开弹窗（与 available 态同入口），不弹退出确认框
    await pill.trigger('click');
    await flush();
    expect(document.querySelector('.update-modal')).not.toBeNull();
    expect(document.querySelector('.confirm-box')).toBeNull();
    // 弹窗内动作按钮仍是「重启应用」（文案未变）
    expect(updateBtns()[0].textContent).toContain('重启应用');
    w.unmount();
  });
```

- [ ] **步骤 2：写英文文案用例**

紧接上一条用例之后插入：

```ts
  it('ready 态 pill 英文文案与 tooltip', async () => {
    const { w, ctrl } = makeUpdateMount();
    ctrl.checkScript = [AVAILABLE];
    await flush();
    trayUpdateHandlers.at(-1)();
    await flush();
    updateBtns()[0].click();
    await flush();
    ctrl.download.resolve({ ok: true }); // 直接下载完成 → ready
    await flush();
    const { applyLangLocal } = await import('./i18n'); // S0 坑：延迟 import，避免抢在 vi.mock('./ipc') 之前绑定真实 ipc
    applyLangLocal('en');
    await nextTick();
    const pill = w.find('.update-pill');
    expect(pill.text()).toBe('Restart to update');
    expect(pill.attributes('data-tooltip')).toBe('Version 9.9.9 downloaded, click to view and restart');
    applyLangLocal('zh'); // 复位语言，避免污染后续用例
    w.unmount();
  });
```

- [ ] **步骤 3：运行测试验证失败**

运行：

```bash
npx vitest run src/App.test.ts -t "下载完成 → 顶栏 pill 不消失"
```

预期：**FAIL** —— `pill.exists()` 为 `false`（`ready` 态无 `v-if` 分支，按钮不渲染）；`data-tooltip` 断言拿到 `undefined`。

（同理 `npx vitest run src/App.test.ts -t "ready 态 pill 英文文案"` 亦 FAIL。）

- [ ] **步骤 4：模板补第三个分支**

在 `src/App.vue` 的 downloading 按钮（`v-else-if="updateState.phase === 'downloading'"` 那个 `<button>`）之后插入：

```html
        <!-- 2026-10-05：下载完成（ready）→ 按钮保持显示（此前 v-if 链无 ready 分支导致消失），
             文案「重启以更新」；点击仍只打开检查更新弹窗 -->
        <button
          v-else-if="updateState.phase === 'ready'"
          type="button"
          class="update-pill tip-down"
          :data-tooltip="t('app.update.tip.ready', { version: updateState.version })"
          @click="updateOpen = true">{{ t('app.update.pill.ready') }}</button>
```

- [ ] **步骤 5：运行测试验证通过**

运行：

```bash
npx vitest run src/App.test.ts
```

预期：**全绿**（原有用例零回归 + 新增 2 条通过）。

- [ ] **步骤 6：Commit**

```bash
git add src/App.vue src/App.test.ts
git commit -m 'fix(App): keep update pill visible after download (重启以更新)'
```

---

## 任务 4：收口验证

- [ ] **步骤 1：定向三文件**

```bash
npx vitest run src/App.test.ts src-main/i18n/dict.test.ts src-main/i18n/no-hardcoded.test.ts
```

预期：全绿（3 文件；`no-hardcoded` 为 3 passed）。

- [ ] **步骤 2：全量测试**

```bash
npm test
```

预期：**35 文件 / 586 用例全绿**（基线 584 = 583 通过 + 1 失败；新增 2 条 App 用例；`dict.test.ts` 只加断言不加用例）。

- [ ] **步骤 3：构建**

```bash
npm run build
```

预期：`vite build` 与 `tsc -p tsconfig.main.json` 零错误。

- [ ] **步骤 4：交付说明**

向用户报告：改动 5 个文件（`src/App.vue`、`src-main/i18n/dict.ts`、`src/App.test.ts`、`src-main/i18n/dict.test.ts`、`src-main/i18n/no-hardcoded.test.ts`）、测试与构建结果，并说明 **人工真机验收需打包版 + 远端更高版本**（dev 模式 `check_update` 直接返回 `status:'dev'`，走不通该流程，spec §9 A6）。

---

## 自检

- [ ] 三个分支互斥且顺序正确：available → downloading → ready（`v-if` / `v-else-if` / `v-else-if`）
- [ ] ready 分支 class 为 `update-pill tip-down`，**不含** `update-pill--busy`，无 `title`，无 `disabled`
- [ ] ready 分支 `@click` 为 `updateOpen = true`（不直接 `run_update`）
- [ ] zh/en 各新增 2 个 key，值为 spec §6 定稿文案，key 名一致
- [ ] `update.btn.restart`（「重启应用」/ `"Restart"`）零改动
- [ ] 未改 `src/modules/UpdateModal.vue`、`src/style.css`、`src-main/main.ts`、状态机与 IPC
- [ ] `no-hardcoded.test.ts` 仅恢复 `PENDING.has` 跳过 + 末尾换行，未改 `PENDING` 内容
- [ ] 全量 `npm test` 586 用例全绿；`npm run build` 零错误
