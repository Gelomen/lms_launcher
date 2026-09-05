# 托盘图标 hover 显示启动控制所选模板 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 系统托盘图标 hover 显示「llama-server 启动控制」当前所选模板完整名；无选择显示「暂无模板配置」（Windows 原生 tooltip）。

**架构：** 渲染端 LaunchBar 在选中态变化时 `invoke('tray-tooltip-update', name|null)`；主进程经纯函数 `trayTooltipText()` 归一化文案后 `tray.setToolTip()`（Electron 28 原生，系统 tooltip 样式）。

**技术栈：** Electron 28 / Vue 3 / TypeScript / vitest（渲染端 happy-dom）。

**规格：** `docs/superpowers/specs/2026-09-05-tray-tooltip-template-design.md`

---

### 任务 1：纯函数 trayTooltipText + 单测

**文件：**
- 创建：`src-main/tray-tooltip.ts`
- 测试：`src-main/tray-tooltip.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { describe, it, expect } from 'vitest';
import { trayTooltipText } from './tray-tooltip';

describe('trayTooltipText', () => {
  it('non_empty_name_returns_trimmed_unchanged', () => {
    expect(trayTooltipText('Qwen3-30B')).toBe('Qwen3-30B');
    expect(trayTooltipText('  日常  ')).toBe('日常');
  });
  it('null_undefined_empty_whitespace_returns_placeholder', () => {
    expect(trayTooltipText(null)).toBe('暂无模板配置');
    expect(trayTooltipText(undefined)).toBe('暂无模板配置');
    expect(trayTooltipText('')).toBe('暂无模板配置');
    expect(trayTooltipText('   ')).toBe('暂无模板配置');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/tray-tooltip.test.ts`
预期：FAIL——Cannot find module './tray-tooltip'

- [ ] **步骤 3：编写最少实现**

```ts
// 托盘图标 hover 提示文案（规格 2026-09-05-tray-tooltip-template-design）：
// 显示启动控制当前所选模板完整名；无选择（null/空/空白）→ 固定占位文案。
// 纯函数，单测覆盖；main.ts 的 ipcMain.handle('tray-tooltip-update') 与 createTray 初始值共用。
export function trayTooltipText(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed : '暂无模板配置';
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/tray-tooltip.test.ts`
预期：PASS（2 个用例）

- [ ] **步骤 5：Commit**

```bash
git add src-main/tray-tooltip.ts src-main/tray-tooltip.test.ts
git commit -m "feat: 托盘 hover 提示纯函数 trayTooltipText——所选模板名 / 暂无模板配置 占位"
```

---

### 任务 2：主进程接线（初始提示 + IPC）

**文件：**
- 修改：`src-main/main.ts`（createTray 函数，约 L87-125；IPC 段，约 L164 起）

- [ ] **步骤 1：createTray 内设置初始 tooltip**

在 `tray.setContextMenu(menu);`（L120）之前插入：

```ts
  // 托盘 hover 提示（规格 2026-09-05-tray-tooltip-template-design）：初始无选择 = 占位文案；
  // 渲染端 LaunchBar 首帧 load() 后经 tray-tooltip-update 推送真实选中模板名。
  tray.setToolTip(trayTooltipText(null));
```

文件头部 import（L1 下方，按现有 import 风格追加一行）：

```ts
import { trayTooltipText } from './tray-tooltip';
```

- [ ] **步骤 2：新增 IPC handler**

在 IPC 段（`ipcMain.handle('get_app_config', ...)` 之后，与其余 handler 同段）插入：

```ts
// tray-tooltip-update（规格 2026-09-05-tray-tooltip-template-design）：渲染端 LaunchBar 选中态
// 变化（load 后 / 切换下拉 / 配置缺失）→ 原生 tray.setToolTip 更新 hover 提示
ipcMain.handle('tray-tooltip-update', (_e, name: string | null): void => {
  if (tray) tray.setToolTip(trayTooltipText(name));
});
```

- [ ] **步骤 3：编译 + 全量测试**

运行：`npm run build && npm test`
预期：tsc 无错；vitest 全绿（含任务 1 新用例）。

- [ ] **步骤 4：Commit**

```bash
git add src-main/main.ts
git commit -m "feat: 托盘初始 hover 提示 + tray-tooltip-update IPC（原生 setToolTip）"
```

---

### 任务 3：渲染端 LaunchBar 推送选中模板名

**文件：**
- 修改：`src/modules/LaunchBar.vue`
- 测试：`src/modules/LaunchBar.test.ts`

- [ ] **步骤 1：补写失败测试（扩展既有 mockLms 记录 invoke 调用）**

把 `src/modules/LaunchBar.test.ts` 顶部 mockLms 替换为记录版（`trayTooltipCalls` 必须先于 mockLms 声明，避免 const TDZ——mockLms 函数体在 describe 内调用时执行，但声明顺序保持清晰）；其余既有用例不动（它们对 invoke 返回值无感知，记录是纯增量）：

```ts
// 记录 invoke 调用（2026-09-05 tray-tooltip-template）：断言 tray-tooltip-update 推送
export const trayTooltipCalls: Array<string | null> = [];
function mockLms(map: Record<string, { name?: string; values: Record<string, string> }>): void {
  trayTooltipCalls.length = 0;
  (window as any).lms = {
    invoke: (cmd: string, ...args: unknown[]) => {
      if (cmd === 'get_configs') return Promise.resolve(map);
      if (cmd === 'tray-tooltip-update') trayTooltipCalls.push(args[0] as string | null);
      return Promise.resolve(undefined);
    },
    onLogLine: () => () => {},
    onProcessExit: () => () => {},
    onTrayExitRequest: () => () => {},
  };
}
```

文件末尾（describe 外或内均可，跟随现有风格放 describe 内末尾）新增用例：

```ts
  describe('tray tooltip sync（spec 2026-09-05-tray-tooltip-template）', () => {
    it('after_load_pushes_selected_template_full_name', async () => {
      mockLms({ a: { name: '模板A', values: {} }, b: { name: '模板B', values: {} } });
      const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
      await flush();
      // 默认选中第一个 → 推送完整名（不截断）
      expect(trayTooltipCalls).toContain('模板A');
      w.unmount();
    });

    it('switching_dropdown_pushes_new_selected_name', async () => {
      mockLms({ a: { name: '模板A', values: {} }, b: { name: '模板B', values: {} } });
      const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
      await flush();
      await w.find('.select-trigger').trigger('click');
      await flush();
      await w.findAll('.dropdown-panel li')[1].trigger('click');
      await flush();
      expect(trayTooltipCalls.at(-1)).toBe('模板B');
      w.unmount();
    });

    it('no_configs_pushes_null_placeholder', async () => {
      mockLms({});
      const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
      await flush();
      expect(trayTooltipCalls.at(-1)).toBeNull();
      w.unmount();
    });
  });
```

注意：`mount` 时 props 与既有用例完全一致；`.dropdown-panel li` 选项顺序 = Object.keys 顺序（a 在前）。若切换用例中面板 li 点击后未收起/未更新（Dropdown 实现细节），改为断言 `trayTooltipCalls` 末元素而非固定时序，以实际 Dropdown @update:value 触发时机为准——但选中值必须来自被点击项。

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/modules/LaunchBar.test.ts`
预期：新增 3 用例 FAIL（组件尚未调用 tray-tooltip-update，trayTooltipCalls 为空）；既有用例仍 PASS。

- [ ] **步骤 3：LaunchBar.vue 实现推送**

a) script 顶部 import 区已含 `invoke`（现有），无需新增。

b) 在 `function full(id: string)`（约 L74）之后新增：

```ts
// 托盘 hover 提示同步（spec 2026-09-05-tray-tooltip-template）：选中完整名；无选择 → null → 主进程显示「暂无模板配置」
function pushTrayTooltip(id: string): void {
  void invoke('tray-tooltip-update', full(id) || null);
}
```

c) `load()` 成功分支：在确定 selected 的 if/else-if/else 链**之后**（即 try 块末尾、`catch` 之前）追加一行：

```ts
    pushTrayTooltip(selected.value);
```

d) `load()` 失败分支（catch 内，`selected.value = '';` 之后）追加：

```ts
    pushTrayTooltip('');
```

e) 模板中下拉的 `@update:value`（约 L115）改为：

```html
@update:value="(v: string) => { selected = v; pushTrayTooltip(v); }"
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/modules/LaunchBar.test.ts`
预期：全部 PASS（既有 5 用例 + 新增 3 用例）。

- [ ] **步骤 5：全量回归**

运行：`npm test`
预期：全绿。

- [ ] **步骤 6：Commit**

```bash
git add src/modules/LaunchBar.vue src/modules/LaunchBar.test.ts
git commit -m "feat: 启动控制选中模板名同步托盘 hover 提示（load/切换/无配置三分支推送）"
```

---

### 任务 4：端到端手动验证（dev）

**文件：** 无代码改动。

- [ ] **步骤 1：启动 dev**

运行：`npm run dev`（vite 1420 + electron 自动开窗）

- [ ] **步骤 2：验证有模板**

在应用内启动控制下拉选一个模板 → 鼠标 hover 任务栏托盘图标（悬停约 0.5-1s）→ 出现 Windows 原生灰底 tooltip，文案 = 该模板完整名。切换下拉到另一模板 → 再次 hover → 文案更新。

- [ ] **步骤 3：验证无模板**

临时备份 `llama_launch_configs.yaml` 并删除（或删空所有模板）→ 重启 dev → hover 托盘 → 文案「暂无模板配置」。验证完还原。

- [ ] **步骤 4：收尾**

`git status` 确认无遗漏改动；无需额外 commit（若无新改动）。
