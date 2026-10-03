# LMS 启动器 i18n · S8 检查更新弹窗实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 `src/modules/UpdateModal.vue` 的 17 处与 `src/App.vue` 的 6 处硬编码中文接入 `t()`，英文按 2026-10-03 grill-me 十问定稿落地，中文逐字零回归。

**架构：** 词典单一真源 `src-main/i18n/dict.ts` 新增 25 个 `update.*` key（各 2 语言）；`UpdateModal.vue` 的两张按钮表、中段、提示行、错误回退、标题/aria 换成 `t()`；`App.vue` 的 `updateItems` 行名复用 `app.brand`、5 处 errorText 换成 `t()`；测试追加 1 条 zh 全串回归 + 8 条 en 冒烟 + 2 条 App 级 en 冒烟。不改主进程、不改 CSS、不改事件契约。

**技术栈：** Vue 3 + TypeScript + Vitest（happy-dom）+ 自建轻量 `t()`（零新依赖）。

**规格：** `docs/superpowers/specs/2026-10-03-i18n-update-modal-design.md`

---

## 文件结构

| 文件 | 职责 | 改动 |
|---|---|---|
| `src-main/i18n/dict.ts` | 双语词典单一真源 | 新增 25 key × 2 语言（zh 逐字照抄现状） |
| `src/modules/UpdateModal.vue` | 弹窗全部文案 | import `t`；17 处接入 |
| `src/App.vue` | 行名 + errorText | 6 处接入（`app.brand` 复用 + 5 处 `update.*`） |
| `src/modules/UpdateModal.test.ts` | 弹窗契约测试 | 末尾 1 zh + 8 en（既有 1878 行不动） |
| `src/App.test.ts` | App 级测试 | S1 describe 内追加 2 条 en |
| `docs/superpowers/specs/2026-09-22-i18n-slices.md` | 分片看板 | S8 独立 spec ✅ / 状态 ◐→✅（实现后）+ 变更记录 + S10 回记 |

**不动：** `src/style.css`、`src/components/Dropdown.vue`、`src-main/*`（词典除外）、`App.vue` 的 appendSys 日志行（S10）。

**测试基线（2026-10-03 实测）：** 34 文件 / 560 用例全绿；完成后预期 34 文件 / **570** 用例。

> **环境提示（Windows）：** vitest 偶发 `EBUSY: resource busy or locked`（S6/S7 已记录、非本分片引入）。实测把 TEMP 指到工作区即可确定性全绿：
> ```powershell
> New-Item -ItemType Directory -Force -Path .temp\vitest | Out-Null
> $env:TEMP=(Resolve-Path .temp\vitest).Path; $env:TMP=$env:TEMP
> npm test
> ```

---

## 任务 1：词典新增 25 个 `update.*` key

**文件：**
- 修改：`src-main/i18n/dict.ts:136`（zh 段插入）、`src-main/i18n/dict.ts:266`（en 段插入）

- [ ] **步骤 1：zh 段插入 25 个 key**

在 L136 `'log.link.tip': 'Ctrl + Click 打开链接',` 之后、L137 `  },` 之前插入（**zh 值逐字照抄现状，一个字符都不改**）：

```ts
    // 检查更新弹窗（S8 2026-10-03-i18n-update-modal）：值与 UpdateModal.vue / App.vue 现状中文串逐字一致
    'update.title': '检查更新',
    'update.close': '关闭弹窗',
    'update.btn.check': '检查更新',
    'update.btn.checking': '检查中...',
    'update.btn.download': '下载更新',
    'update.btn.downloading': '下载中 {pct}%',
    'update.btn.restart': '重启应用',
    'update.btn.retry': '重试',
    'update.btn.stopUpdate': '停止并更新',
    'update.btn.switch': '切换版本',
    'update.middle.latest': '已是最新版本',
    'update.middle.newVersion': '新版本: {version}',
    'update.middle.localMissing': '本地版本未检测到',
    'update.hint.unconfigured': '请先在主界面选择 llama.cpp 安装目录',
    'update.hint.stopRunning': 'llama-server 正在运行，点击「停止并更新」停止服务并完成安装',
    'update.hint.stopReady': '更新包已下载完成，点击「停止并更新」完成安装',
    'update.err.unknown': '未知错误',
    'update.err.download': '下载失败',
    'update.err.install': '安装失败',
    'update.err.busy': '文件仍被占用',
    'update.err.check': '检查更新失败',
    'update.err.app.checkUnknown': '检查更新时发生未知错误，请稍后重试。',
    'update.err.app.checkNetwork': '无法连接更新服务器或解析版本信息，请稍后重试。',
    'update.err.app.dev': '开发模式不检查更新',
    'update.err.app.downloadUnknown': '更新下载时发生未知错误，请稍后重试。',
```

- [ ] **步骤 2：en 段插入 25 个 key**

在 L266 `'log.link.tip': 'Ctrl + Click to open link',` 之后、L267 `  },` 之前插入：

```ts
    // Update modal (S8 2026-10-03-i18n-update-modal)：按钮遵循总纲 §3.6 最短动词；错误句为适配 194px 中段的短句
    'update.title': 'Check for updates',
    'update.close': 'Close dialog',
    'update.btn.check': 'Check',
    'update.btn.checking': 'Checking...',
    'update.btn.download': 'Download',
    'update.btn.downloading': '{pct}%',
    'update.btn.restart': 'Restart',
    'update.btn.retry': 'Retry',
    'update.btn.stopUpdate': 'Stop & Update',
    'update.btn.switch': 'Switch version',
    'update.middle.latest': 'Up to date',
    'update.middle.newVersion': 'New version: {version}',
    'update.middle.localMissing': 'Local version not detected',
    'update.hint.unconfigured': 'Select a llama.cpp directory on the main screen first',
    'update.hint.stopRunning': 'llama-server is running. Click "Stop & Update" to stop it and finish installing',
    'update.hint.stopReady': 'Update package downloaded. Click "Stop & Update" to finish installing',
    'update.err.unknown': 'Unknown error',
    'update.err.download': 'Download failed',
    'update.err.install': 'Install failed',
    'update.err.busy': 'File still in use',
    'update.err.check': 'Update check failed',
    'update.err.app.checkUnknown': 'Update check failed. Try again.',
    'update.err.app.checkNetwork': 'Update server unreachable.',
    'update.err.app.dev': 'Update checks disabled in dev mode.',
    'update.err.app.downloadUnknown': 'Update download failed. Try again.',
```

- [ ] **步骤 3：运行词典双语对称单测**

运行：`npx vitest run src-main/i18n/dict.test.ts src/i18n.test.ts --reporter=basic`

预期：PASS（zh/en key 集合完全相等、无空值）。

- [ ] **步骤 4：Commit**

```bash
git add src-main/i18n/dict.ts
git commit -m "feat(i18n): 词典新增检查更新弹窗 update.* 25 key（S8）"
```

---

## 任务 2：测试先行（`UpdateModal.test.ts` + `App.test.ts`）

**文件：**
- 测试：`src/modules/UpdateModal.test.ts`（import 区 + 文件末尾）、`src/App.test.ts`（S1 describe 内追加）

- [ ] **步骤 1：`UpdateModal.test.ts` 新增 `applyLangLocal` 导入**

在 L10 `import UpdateModal from './UpdateModal.vue';` 之后新增一行：

```ts
import { applyLangLocal } from '../i18n';
```

（与 `TemplateModal.test.ts:10` 同型；本文件不 `vi.mock`，仅 mock `window.lms`，而 `src/i18n.ts` 只在 `setLang` 内调用 `invoke`，静态 import 无副作用。）

- [ ] **步骤 2：文件末尾（L1876 `});` 之后）追加 S8 测试块**

```ts
// ===== S8（2026-10-03-i18n-update-modal）：检查更新弹窗 23 处文案 i18n =====
describe('UpdateModal i18n（S8）', () => {
  const sevenStates = [
    makeItem({ phase: 'idle' }),
    makeItem({ phase: 'checking' }),
    makeItem({ phase: 'available', version: '0.2.0' }),
    makeItem({ phase: 'downloading', pct: 42 }),
    makeItem({ phase: 'ready', version: '0.2.0' }),
    makeItem({ phase: 'error', errorText: 'boom' }),
    makeItem({ phase: 'up-to-date', version: '0.1.0' }),
  ];
  const labels = () => actionBtns().map((b) => b.textContent?.trim());

  it('zh：标题 / 关闭 aria / 七态按钮 / 中段与现状逐字一致（中文零回归）', () => {
    const w = mountModal({ items: sevenStates });
    expect(document.querySelector('.update-title')?.textContent).toBe('检查更新');
    expect(closeBtn()!.getAttribute('aria-label')).toBe('关闭弹窗');
    expect(labels().slice(0, 6)).toEqual(['检查更新', '检查中...', '下载更新', '下载中 42%', '重启应用', '重试']);
    expect(labels()[6]).toBe('检查更新');
    expect(document.querySelector('.update-row__latest')?.textContent?.trim()).toBe('已是最新版本 0.1.0');
    w.unmount();
  });

  it('en：七态按钮与 up-to-date 中段', () => {
    applyLangLocal('en');
    const w = mountModal({ items: sevenStates });
    expect(labels().slice(0, 6)).toEqual(['Check', 'Checking...', 'Download', '42%', 'Restart', 'Retry']);
    expect(labels()[6]).toBe('Check');
    expect(document.querySelector('.update-row__latest')?.textContent?.trim()).toBe('Up to date 0.1.0');
    applyLangLocal('zh');
    w.unmount();
  });

  it('en：标题与关闭 aria', () => {
    applyLangLocal('en');
    const w = mountModal();
    expect(document.querySelector('.update-title')?.textContent).toBe('Check for updates');
    expect(closeBtn()!.getAttribute('aria-label')).toBe('Close dialog');
    applyLangLocal('zh');
    w.unmount();
  });
});
```

> 状态驱动的 llama 行 en 断言（第 4–8 条）追加在**同一个 describe 末尾**，mock 手法直接复用文件内既有用例：未配置提示复刻 L299-318（`get_llama_local_version` 返回 `{ success: false, error: 'unconfigured' }`）；新版本/up-to-date/localMissing 复刻 L486-516、L428-433、L1747-1783；stop-update 两条提示复刻 L689-731；切换版本复刻 L970-1020；错误回退复刻 L798-830（下载失败/安装失败）。断言值：

| 用例 | 断言（en） |
|---|---|
| 4 未配置提示 | `.llama-below` = `Select a llama.cpp directory on the main screen first` |
| 5 新版本中段 / 本地版本未检测到 | `.llama-new-version` = `New version: b10955`；`.llama-middle` = `Local version not detected` |
| 6 up-to-date 中段 | `.llama-state-text` = `Up to date b10997` |
| 7 stop-update 两条提示 | `.llama-below` = `llama-server is running. Click "Stop & Update" to stop it and finish installing`；`installed=false` 分支 = `Update package downloaded. Click "Stop & Update" to finish installing` |
| 8 切换版本 + 错误回退 | `.llama-section .btn-primary` = `Switch version`；`result.error` 缺省时 = `Download failed` / `Install failed`；`.llama-below--error` 兜底 = `Update check failed` |

- [ ] **步骤 3：`App.test.ts` 在 S1 describe（L832 `describe('i18n / App 外壳（Slice 1）')`）内追加 2 条**

复用既有 `applyEn()`（L834-838）与 `mountWithUpdate()`（L868-878）：

```ts
  it('S8：弹窗行名走 app.brand；检查失败 errorText 为英文短句', async () => {
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve(READY);
        case 'get_configs': return Promise.resolve(cfg());
        case 'check_update': return Promise.reject(new Error('net down'));
        default: return Promise.resolve(undefined);
      }
    });
    const w = mount(App);
    await flush();
    trayUpdateHandlers.at(-1)!(); // 托盘「检查更新」→ 打开弹窗（不自动检查）
    await nextTick();
    updateBtns()[0].click(); // 手动「检查更新」→ reject
    await flush();
    await applyEn();
    expect(document.querySelector('.update-modal .update-row__name')?.textContent?.trim()).toBe('LMS Launcher');
    expect(document.querySelector('.update-modal .update-row__error')?.textContent?.trim()).toBe('Update check failed. Try again.');
    w.unmount();
  });

  it('S8：无法连接 / 开发模式 errorText 为英文短句', async () => {
    invoke.mockImplementation((cmd: string): Promise<unknown> => {
      switch (cmd) {
        case 'get_state': return Promise.resolve(READY);
        case 'get_configs': return Promise.resolve(cfg());
        case 'check_update': return Promise.resolve({ available: false, status: 'error' });
        default: return Promise.resolve(undefined);
      }
    });
    const w = mount(App);
    await flush();
    await applyEn();
    trayUpdateHandlers.at(-1)!();
    await nextTick();
    updateBtns()[0].click();
    await flush();
    expect(document.querySelector('.update-modal .update-row__error')?.textContent?.trim()).toBe('Update server unreachable.');
    w.unmount();
  });
```

> `'dev'` 分支同法（`check_update` → `{ available: false, status: 'dev' }`，断言 `Update checks disabled in dev mode.`），可并入第 2 条或另起一条；`try/finally` 把语言复位为 zh（`applyEn` 后补 `applyLangLocal('zh')`，或依赖 `test-setup.ts` 的 beforeEach）——**必须复位**，否则后续用例的 zh 断言会翻红。

- [ ] **步骤 4：运行新测试（预期红）**

运行：`npx vitest run src/modules/UpdateModal.test.ts src/App.test.ts --reporter=basic`

预期：zh 回归通过；en 冒烟失败（词典 key 已加但组件未接 `t()`，实际渲染仍是中文）——这是 TDD 的预期红。

- [ ] **步骤 5：Commit**

```bash
git add src/modules/UpdateModal.test.ts src/App.test.ts
git commit -m "test(i18n): 检查更新弹窗 zh 全串回归 + en 冒烟先行（S8）"
```

---

## 任务 3：组件接入 `t()`

**文件：**
- 修改：`src/modules/UpdateModal.vue`（17 处）、`src/App.vue`（6 处）

- [ ] **步骤 1：`UpdateModal.vue` 导入 `t`**

```ts
import { t } from '../i18n';
```

- [ ] **步骤 2：两张按钮表接 `t()`**

按规格 §4.2 逐行替换 `BUTTONS`（L381-390）与 `LLAMA_BUTTONS`（L466-476）的 `label`；`llamaBtnLabel()`（L512-517）的 `'切换版本'` → `t('update.btn.switch')`。

- [ ] **步骤 3：中段 / 提示行 / 错误回退 / 标题与 aria**

按规格 §4.3（`middleText` L431、`llamaMiddle` L559-568）、§4.4（`llamaBelow` L576-591）、§4.5（L224/L275/L313/L318）、§4.6（L600-601）逐处替换。

- [ ] **步骤 4：`App.vue` 6 处**

按规格 §4.7：L53 行名 → `t('app.brand')`；L219 / L235 / L239 / L252 / L268 的 errorText → `t('update.err.app.*')` / `t('update.err.unknown')`。**L261 的 `includes('尚无更新任务')` 与所有 `appendSys` 行保持原样。**

- [ ] **步骤 5：跑全量测试**

运行：`npm test`（必要时先按环境提示设置 TEMP）

预期：**34 文件 / 570 用例**全绿。

- [ ] **步骤 6：自查无残留中文硬编码**

运行：`Select-String -Path src/modules/UpdateModal.vue,src/App.vue -Pattern '\p{IsCJKUnifiedIdeographs}'`（或用编辑器搜索）

预期：仅剩注释行、`llama.cpp` 专名、以及 `App.vue` 的 appendSys 日志行（S10 范畴）。

- [ ] **步骤 7：Commit**

```bash
git add src/modules/UpdateModal.vue src/App.vue
git commit -m "feat(i18n): 检查更新弹窗 23 处文案接入 t()（S8）"
```

---

## 任务 4：收尾验证与看板

- [ ] **步骤 1：全量测试 + 构建**

```powershell
New-Item -ItemType Directory -Force -Path .temp\vitest | Out-Null
$env:TEMP=(Resolve-Path .temp\vitest).Path; $env:TMP=$env:TEMP
npm test
npm run build
```

预期：34 文件 / 570 用例全绿 + build 通过（无新增 TS/构建告警）。

- [ ] **步骤 2：写 S10 回记**

在 `docs/superpowers/specs/2026-09-22-i18n-slices.md` 的 S10 分片卡「S2 回记」之后追加：

```markdown
- **S8 回记（2026-10-03）**：`App.vue:261` 的 `r.reason.includes('尚无更新任务')` 匹配主进程中文 reason（`src-main/main.ts:505`）。本分片英文化该 reason 时必须二选一：(a) 同步改渲染端匹配串（英文/中性串），或 (b) 主进程返回结构化 `reasonCode`（跨进程契约变更 → 按设计总纲 §5 判据处理）。两种情况都必须补一条 App 级回归（现有 `App.test.ts:762` 的 mock reason 是中文，无法守护该路径）。
```

- [ ] **步骤 3：看板收尾**

`2026-09-22-i18n-slices.md`：S8「独立 spec」列保持 ✅、状态 ◐→✅、变更记录追加一行（含 commits 与用例数）。

- [ ] **步骤 4：Commit**

```bash
git add docs/superpowers/specs/2026-09-22-i18n-slices.md
git commit -m "docs(i18n): S8 分片卡标记完成 + S10 跨进程耦合回记"
```

- [ ] **步骤 5：人工英文目视验收（留待用户）**

运行应用切到 English：弹窗标题、行名 `LMS Launcher`、七态按钮、切换版本 `Switch version`、中段、提示行、错误红字；确认按钮不超 99.03px、名称列/按钮列仍对称、卡片不溢出、中段红色短句可读。

---

## 完成判据

1. `npm test` 全绿：**34 文件 / 570 用例**（基线 560 + 10）。
2. `npm run build` 通过。
3. `UpdateModal.vue` + `App.vue` 中除注释、`llama.cpp` 专名、appendSys 日志行（S10）外无硬编码中文 UI 串。
4. 词典新增 25 个 `update.*` key，zh/en key 集合一致（`dict.test.ts` 通过）。
5. zh 文案与现状逐字一致；既有 186 处中文断言零改动全绿。
6. 看板：S8 状态 ✅ + 变更记录；S10 分片卡含 S8 回记。
7. 零 CSS 改动；`src-main/*` 零改动（词典除外）。
