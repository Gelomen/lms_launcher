# i18n 基座（Slice 0）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（- [ ]）语法来跟踪进度。

**目标：** 落地 i18n 基座（词典 + t() + 主进程语言权威 + 持久化 + 渲染端启动时序），并在设置弹窗提供中英即时切换；托盘菜单同步。

**架构：** 词典为 `src-main/i18n/dict.ts` 单一真源（TS 常量），双端引用；纯函数 `translate` / `resolveSystemLang`；主进程持有当前语言并在 `whenReady` 最先解析；渲染端经 `get_language` 取初值、`set_language` 回写；语言持久化到 `lms_launcher.yaml` 顶层 `language` 字段。

**技术栈：** Electron 28 + Vue 3 + TypeScript + Vitest 2（组件测试用 happy-dom）。

**规格：** `docs/superpowers/specs/2026-09-22-i18n-design.md`

## 全局约束

- 词典单一真源 `src-main/i18n/dict.ts`；**不引入第三方 i18n 依赖**。
- key 命名 `<scope>.<subject>[.<modifier>]`；scope 白名单：`common` / `app` / `tray` / `settings` / `dir` / `launch` / `tpl` / `tplModal` / `gpu` / `log` / `update` / `vram` / `err`。
- 不译边界（规格 §1.2）：llama-server 原生输出、release body 版本 label、`[lms_launcher]` / `MISSING:` / `VALIDATION:` / `YAML:` 前缀、专名与单位、参数 flag 第一行。
- 中文布局冻结；英文按钮用最短动词、下载态仅百分比（本 slice 只涉及设置弹窗与托盘文案）。
- 默认语言跟随系统（`zh` 系 → zh，其余 → en）；手动选择优先并持久化。
- 测试固定 zh（`src/test-setup.ts`）；**现有中文断言不改**。
- 每任务结尾 `npm test` 全绿；提交信息用中文 Conventional Commits。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src-main/i18n/dict.ts`（新建） | zh/en 词典 + `translate` + `resolveSystemLang`（纯函数，无 electron） |
| `src-main/i18n/index.ts`（新建） | 主进程当前语言状态 + `getLang` / `applyLang` / `t`（纯模块，无 electron，便于单测） |
| `src/i18n.ts`（新建） | 渲染端响应式 `t` / `setLang` / `applyLangLocal` / `currentLang` |
| `src/test-setup.ts`（新建） | 每个测试文件前把两端语言固定为 zh |
| `src-main/config.ts`（修改） | `AppConfig.language` + `appConfigLoad` 白名单 |
| `src-main/tray-tooltip.ts`（修改） | 占位文案改为调用方传入 |
| `src-main/main.ts`（修改） | `initI18n` / `buildTrayMenu` / 托盘 t() / `get_language` `set_language` |
| `src/main.ts`（修改） | 先取语言再挂载 |
| `src/modules/SettingsModal.vue`（修改） | 语言下拉 + 既有文案 t() |
| `vitest.config.ts`（修改） | `setupFiles` |

---

### 任务 1：i18n 基座（词典 + 纯函数 + 渲染端包装 + 测试基建）

**文件：**
- 创建：`src-main/i18n/dict.ts`
- 创建：`src-main/i18n/index.ts`
- 创建：`src/i18n.ts`
- 创建：`src/test-setup.ts`
- 创建：`src-main/i18n/dict.test.ts`
- 创建：`src/i18n.test.ts`
- 修改：`vitest.config.ts`
- 修改：`src/main.ts`

- [ ] **步骤 1：编写失败的测试**

`src-main/i18n/dict.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { dict, translate, resolveSystemLang } from './dict';

describe('i18n dict', () => {
  it('zh 与 en 的 key 集合完全一致', () => {
    expect(Object.keys(dict.zh).sort()).toEqual(Object.keys(dict.en).sort());
  });

  it('词典无空值', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const [k, v] of Object.entries(dict[lang])) expect(v, k).not.toBe('');
    }
  });

  it('translate 替换 {name} 占位符', () => {
    expect(translate({ 'a.b': '下载中 {pct}%' }, 'a.b', { pct: 42 })).toBe('下载中 42%');
  });

  it('缺失 key 返回 key 本身', () => {
    expect(translate(dict.zh, 'no.such.key')).toBe('no.such.key');
  });

  it('缺失参数保留占位符原文', () => {
    expect(translate({ 'a.b': '{x} and {y}' }, 'a.b', { x: '1' })).toBe('1 and {y}');
  });

  it('resolveSystemLang：zh 系 → zh，其余 → en', () => {
    expect(resolveSystemLang('zh-CN')).toBe('zh');
    expect(resolveSystemLang('zh-TW')).toBe('zh');
    expect(resolveSystemLang('en-US')).toBe('en');
    expect(resolveSystemLang('ja-JP')).toBe('en');
  });
});
```

`src/i18n.test.ts`：

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('./ipc', () => ({ invoke: (cmd: string, ...args: unknown[]) => invoke(cmd, ...args) }));

import { t, setLang, applyLangLocal } from './i18n';

beforeEach(() => {
  invoke.mockClear();
  applyLangLocal('zh');
});

describe('renderer i18n', () => {
  it('默认中文', () => {
    expect(t('common.cancel')).toBe('取消');
  });

  it('setLang 切英文 + 通知主进程 + 同步 html lang', () => {
    setLang('en');
    expect(t('common.cancel')).toBe('Cancel');
    expect(invoke).toHaveBeenCalledWith('set_language', 'en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('applyLangLocal 不触发 invoke（仅本地）', () => {
    applyLangLocal('en');
    expect(invoke).not.toHaveBeenCalled();
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx vitest run src-main/i18n/dict.test.ts src/i18n.test.ts`
预期：FAIL，报模块 `./dict` / `./i18n` 不存在（无法解析导入）。

- [ ] **步骤 3：实现最少代码**

`src-main/i18n/dict.ts`：

```ts
// i18n 词典单一真源（spec 2026-09-22-i18n-design §3.1）。
// 纯数据 + 纯函数，不 import electron/node——主进程与渲染端共用（渲染端经 ../src-main 相对 import）。
export type Lang = 'zh' | 'en';

export const dict = {
  zh: {
    'common.cancel': '取消',
    'settings.title': '设置',
    'settings.language': '语言',
    'settings.proxy.host': '代理地址',
    'settings.proxy.port': '端口',
    'settings.close': '关闭弹窗',
    'settings.save': '保存',
    'settings.proxy.err.partial': '端口不能为空（或留空禁用代理）',
    'settings.proxy.err.host': '代理地址须为 IPv4 或主机名（不含端口、协议、空格）',
    'settings.proxy.err.port': '端口须为 1–65535 的数字',
    'tray.open': '打开 LMS 启动器',
    'tray.checkUpdate': '检查更新',
    'tray.settings': '设置',
    'tray.exit': '退出',
    'tray.tooltip.empty': '暂无模板配置',
  },
  en: {
    'common.cancel': 'Cancel',
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.proxy.host': 'Proxy host',
    'settings.proxy.port': 'Port',
    'settings.close': 'Close dialog',
    'settings.save': 'Save',
    'settings.proxy.err.partial': 'Port is required (leave both empty to disable proxy)',
    'settings.proxy.err.host': 'Proxy host must be IPv4 or a hostname (no port, scheme, or spaces)',
    'settings.proxy.err.port': 'Port must be a number from 1-65535',
    'tray.open': 'Open LMS Launcher',
    'tray.checkUpdate': 'Check for updates',
    'tray.settings': 'Settings',
    'tray.exit': 'Exit',
    'tray.tooltip.empty': 'No templates',
  },
} as const;

/** 占位符 `{name}` 替换；缺失 key 返回 key 本身；缺失参数保留占位符原文。 */
export function translate(
  table: Readonly<Record<string, string>>,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  const raw = table[key];
  if (raw === undefined) return key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    params[name] !== undefined ? String(params[name]) : m,
  );
}

/** 系统 locale → 语言：zh 系 → zh，其余 → en。 */
export function resolveSystemLang(locale: string): Lang {
  return /^zh/i.test(locale ?? '') ? 'zh' : 'en';
}
```

`src-main/i18n/index.ts`：

```ts
// 主进程语言状态（spec §3.3）。纯模块：不 import electron，便于 node 环境单测。
import { dict, translate, type Lang } from './dict';

let current: Lang = 'zh';

export type { Lang } from './dict';

export function getLang(): Lang {
  return current;
}

export function applyLang(lang: Lang): void {
  current = lang;
}

/** 主进程侧 t()：使用当前语言。 */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(dict[current] as Readonly<Record<string, string>>, key, params);
}
```

`src/i18n.ts`：

```ts
// 渲染端 i18n 基座（spec §3.1/§3.3）。词典直接引用主进程侧单一真源（Vite 支持跨目录相对 import）。
import { computed, ref } from 'vue';
import { dict, translate, type Lang } from '../src-main/i18n/dict';
import { invoke } from './ipc';

const lang = ref<Lang>('zh');

/** 当前语言（只读视图，变更请走 setLang / applyLangLocal）。 */
export const currentLang = computed<Lang>(() => lang.value);

export function getLang(): Lang {
  return lang.value;
}

/** 仅改本地状态 + <html lang>，不触碰持久化。启动取初值用。 */
export function applyLangLocal(l: Lang): void {
  lang.value = l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  }
}

/** 用户切换：本地立即生效 + 通知主进程写 yaml / 重建托盘。 */
export function setLang(l: Lang): void {
  applyLangLocal(l);
  void invoke('set_language', l);
}

/** 渲染端响应式 t()：读 lang ref，组件模板/计算属性自动重渲染。 */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(dict[lang.value] as Readonly<Record<string, string>>, key, params);
}
```

`src/test-setup.ts`：

```ts
// 测试固定语言为 zh（spec §3.7）：vitest 为 node 环境，无系统 locale 语义，
// 不显式固定会让「默认跟随系统」在 CI/沙箱（多为 en）下让中文断言批量失败。
import { beforeEach } from 'vitest';
import { applyLang as applyMainLang } from '../src-main/i18n/index';
import { applyLangLocal } from './i18n';

beforeEach(() => {
  applyMainLang('zh');
  try {
    applyLangLocal('zh');
  } catch {
    // node 环境无 document：applyLangLocal 已用 typeof 守卫，此处兜底
  }
});
```

`vitest.config.ts`（修改 test 块）：

```ts
  test: {
    environment: 'node',
    include: ['src-main/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 60000,
  },
```

`src/main.ts`（整文件替换）：

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { invoke } from './ipc'
import { applyLangLocal, type Lang } from './i18n'

// i18n（spec §3.3）：先向主进程取权威语言再挂载，避免默认中文闪烁。
async function boot(): Promise<void> {
  try {
    const lang = await invoke<Lang>('get_language')
    applyLangLocal(lang)
  } catch {
    // 主进程不可达（如纯 vite 预览）：保持默认 zh
  }
  createApp(App).mount('#app')
}

void boot()
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx vitest run src-main/i18n/dict.test.ts src/i18n.test.ts`
预期：PASS（dict 6 例 + renderer 3 例）。

- [ ] **步骤 5：Commit**

```bash
git add src-main/i18n src/i18n.ts src/i18n.test.ts src/test-setup.ts vitest.config.ts src/main.ts
git commit -m "feat(i18n): 基座——dict/translate/resolveSystemLang + 渲染端 t/setLang + 测试固定 zh"
```

---

### 任务 2：语言持久化（lms_launcher.yaml）

**文件：**
- 修改：`src-main/config.ts`（`AppConfig` 接口 + `appConfigLoad`）
- 测试：`src-main/config.test.ts`（追加用例）

- [ ] **步骤 1：编写失败的测试**

在 `src-main/config.test.ts` 的 `describe('config.ts', ...)` 内追加：

```ts
  it('language_round_trips_and_survives_incremental_saves', () => {
    const p = tmpPath('app_lang.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', language: 'en' });
    expect(appConfigLoad(p).language).toBe('en');
    // 增量保存（saveLlamaDir / saveProxy 均基于 ...cfg）不得丢语言
    saveLlamaDir(p, '/y');
    expect(appConfigLoad(p).language).toBe('en');
    expect(appConfigLoad(p).llama_dir).toBe('/y');
    rm(p);
  });
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/config.test.ts -t language_round_trips`
预期：FAIL —— `language` 为 `undefined`（白名单未读）。

- [ ] **步骤 3：实现最少代码**

`src-main/config.ts` 的 `AppConfig` 增加字段：

```ts
export interface AppConfig {
  llama_dir: string;
  vram_total_gb?: number;
  proxy?: ProxyConfig;
  update?: LlamaUpdateConfig;
  /** i18n（spec §3.4）：用户选择的语言；缺省 = 跟随系统。 */
  language?: 'zh' | 'en';
}
```

`appConfigLoad` 的返回对象增加白名单字段：

```ts
    return {
      llama_dir: parsed?.llama_dir ?? '',
      vram_total_gb: parsed?.vram_total_gb,
      proxy: parsed?.proxy,
      update: parsed?.update,
      language: parsed?.language,
    };
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/config.test.ts`
预期：PASS（含新用例）。

- [ ] **步骤 5：Commit**

```bash
git add src-main/config.ts src-main/config.test.ts
git commit -m "feat(i18n): lms_launcher.yaml 顶层 language 字段（AppConfig + appConfigLoad 白名单）"
```

---

### 任务 3：主进程接线（语言初值 + 托盘 t() + get/set_language IPC）

**文件：**
- 修改：`src-main/tray-tooltip.ts`
- 修改：`src-main/tray-tooltip.test.ts`
- 修改：`src-main/main.ts`

- [ ] **步骤 1：编写失败的测试**

`src-main/tray-tooltip.test.ts`（整文件替换）：

```ts
import { describe, it, expect } from 'vitest';
import { trayTooltipText } from './tray-tooltip';

const EMPTY = '暂无模板配置';

describe('trayTooltipText', () => {
  it('non_empty_name_returns_trimmed_unchanged', () => {
    expect(trayTooltipText('Qwen3-30B', EMPTY)).toBe('Qwen3-30B');
    expect(trayTooltipText('  日常  ', EMPTY)).toBe('日常');
  });
  it('null_undefined_empty_whitespace_returns_placeholder', () => {
    expect(trayTooltipText(null, EMPTY)).toBe(EMPTY);
    expect(trayTooltipText(undefined, EMPTY)).toBe(EMPTY);
    expect(trayTooltipText('', EMPTY)).toBe(EMPTY);
    expect(trayTooltipText('   ', EMPTY)).toBe(EMPTY);
  });
  it('placeholder_is_injected_by_caller(支持 i18n)', () => {
    expect(trayTooltipText(null, 'No templates')).toBe('No templates');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/tray-tooltip.test.ts`
预期：FAIL —— 第二个参数不存在 / 仍返回硬编码中文。

- [ ] **步骤 3：实现最少代码**

`src-main/tray-tooltip.ts`（整文件替换）：

```ts
// 托盘图标 hover 提示文案（spec 2026-09-05-tray-tooltip-template + 2026-09-22 i18n §3.3）：
// 显示启动控制当前所选模板完整名；无选择（null/空/空白）→ 返回调用方传入的占位文案
// （占位文案由 main.ts 提供 t('tray.tooltip.empty')，使本函数保持纯函数且支持 i18n）。
export function trayTooltipText(name: string | null | undefined, emptyText: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed : emptyText;
}
```

`src-main/main.ts` 改动（4 处）：

1）顶部 import 增加：

```ts
import { applyLang, getLang, t, resolveSystemLang, type Lang } from './i18n';
```

2）在 `dataDir()` 附近新增 `initI18n`：

```ts
// i18n（spec §3.3）：主进程为语言权威，whenReady 最先解析。托盘菜单、启动检测日志、
// 更新日志回显全部使用该初值。用户选择（yaml.language）优先于系统 locale。
function initI18n(): void {
  const [p] = yamlPaths();
  const configured = appConfigLoad(p).language;
  applyLang(configured ?? resolveSystemLang(app.getLocale()));
}
```

3）`createTray` 重构为 `buildTrayMenu()` + `createTray()`，并新增 `trayTooltipName`：

```ts
let trayTooltipName: string | null = null; // 当前选中模板名（语言切换时重建 tooltip 用）
function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: t('tray.open'), click: () => {
      restoreWindow();
    } },
    { label: t('tray.checkUpdate'), click: () => {
      const win = mainWin();
      if (win) {
        win.show(); win.focus();
        win.webContents.send('tray-update-request', {});
      }
    } },
    { label: t('tray.settings'), click: () => {
      const win = mainWin();
      if (win) {
        win.show(); win.focus();
        win.webContents.send('tray-settings-request', {});
      }
    } },
    { label: t('tray.exit'), click: () => {
      const win = mainWin();
      if (win) {
        win.show(); win.focus();
        win.webContents.send('tray-exit-request', {});
      }
    } },
  ]);
}
function createTray(): void {
  const icon = nativeImage.createFromPath(appIconPath());
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(trayTooltipText(trayTooltipName, t('tray.tooltip.empty')));
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => {
    restoreWindow();
  });
}
```

4）`tray-tooltip-update` handler 与新增语言 IPC：

```ts
ipcMain.handle('tray-tooltip-update', (_e, name: string | null): void => {
  trayTooltipName = name;
  if (tray) tray.setToolTip(trayTooltipText(name, t('tray.tooltip.empty')));
});
// i18n（spec §3.3）：渲染端启动取初值；设置弹窗切换后主进程写 yaml + 重建托盘菜单。
ipcMain.handle('get_language', (): Lang => getLang());
ipcMain.handle('set_language', (_e, lang: Lang): void => {
  applyLang(lang);
  const [p] = yamlPaths();
  const cfg = appConfigLoad(p);
  appConfigSave(p, { ...cfg, language: lang });
  if (tray) {
    tray.setToolTip(trayTooltipText(trayTooltipName, t('tray.tooltip.empty')));
    tray.setContextMenu(buildTrayMenu());
  }
});
```

5）`whenReady` 回调首行加 `initI18n();`（在 `Menu.setApplicationMenu(null)` 之前）。

- [ ] **步骤 4：验证通过**

运行：`npx vitest run src-main/tray-tooltip.test.ts`
预期：PASS（3 例）。

运行：`npx tsc -p tsconfig.main.json`
预期：退出码 0（主进程类型检查通过）。

- [ ] **步骤 5：Commit**

```bash
git add src-main/tray-tooltip.ts src-main/tray-tooltip.test.ts src-main/main.ts
git commit -m "feat(i18n): 主进程语言权威——initI18n/buildTrayMenu 托盘 t()/get_language/set_language IPC + trayTooltipText 占位文案外置"
```

---

### 任务 4：设置弹窗语言切换

**文件：**
- 修改：`src/modules/SettingsModal.vue`
- 修改：`src/modules/SettingsModal.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `src/modules/SettingsModal.test.ts` 的 describe 内追加：

```ts
  it('切换语言 → 调用 set_language 且界面文案变为英文', async () => {
    mountModal(); await flush();
    const trigger = document.querySelector('.modal-body .dropdown .select-trigger') as HTMLButtonElement | null;
    if (!trigger) throw new Error('language dropdown not found');
    trigger.click(); await flush();
    const options = Array.from(document.querySelectorAll('.dropdown-panel .option')) as HTMLElement[];
    const en = options.find((o) => (o.textContent || '').trim() === 'English');
    if (!en) throw new Error('English option not found');
    en.click(); await flush();
    expect(invoke).toHaveBeenCalledWith('set_language', 'en');
    expect(document.querySelector('.modal-title')!.textContent).toBe('Settings');
  });
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/modules/SettingsModal.test.ts -t 切换语言`
预期：FAIL —— 找不到语言下拉（`.dropdown` 不存在）。

- [ ] **步骤 3：实现最少代码**

`src/modules/SettingsModal.vue` script 增加：

```ts
import Dropdown from '../components/Dropdown.vue';
import { currentLang, setLang, t, type Lang } from '../i18n';

// 语言选项：语言名用自名（中文 / English），不随当前语言翻译。
const langOptions = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];
function onLangChange(v: string): void {
  setLang(v as Lang);
}
```

`validate()` 的三条错误文案改为 `t()`：

```ts
  if ((h && !p) || (!h && p)) return t('settings.proxy.err.partial');
  if (h && !PROXY_HOST_RE.test(h)) return t('settings.proxy.err.host');
  if (p) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return t('settings.proxy.err.port');
  }
```

template 改动：标题/标签/aria 用 `t()`，并在 `proxy-row` 之前插入语言行：

```html
        <div class="modal-title">{{ t('settings.title') }}</div>
        <button type="button" class="modal-close" :aria-label="t('settings.close')" @click="emit('close')">
```

```html
        <div class="form-row">
          <label class="label">{{ t('settings.language') }}</label>
          <Dropdown :value="currentLang" :options="langOptions" @update:value="onLangChange" />
        </div>
        <div class="proxy-row">
```

```html
            <label class="label" for="proxy-host">{{ t('settings.proxy.host') }}</label>
```

```html
            <label class="label" for="proxy-port">{{ t('settings.proxy.port') }}</label>
```

```html
        <button type="button" class="modal-save" :disabled="saving" :aria-label="t('settings.save')" @click="save">
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/modules/SettingsModal.test.ts`
预期：PASS（原 7 例 + 新 1 例）。

- [ ] **步骤 5：Commit**

```bash
git add src/modules/SettingsModal.vue src/modules/SettingsModal.test.ts
git commit -m "feat(i18n): 设置弹窗新增语言切换（中文/English 即时生效）+ 现有文案 t() 化"
```

---

### 任务 5：全量验证与中文回归

**文件：** 无（仅验证）。

- [ ] **步骤 1：全量测试**

运行：`npm test`
预期：全部 PASS，无失败。

- [ ] **步骤 2：构建验证**

运行：`npm run build`
预期：`vite build` 与 `tsc -p tsconfig.main.json` 均退出码 0。

- [ ] **步骤 3：中文回归自检**

运行：`git diff --stat master..HEAD -- src`
预期：只应出现在本计划列出的文件；`src/modules/SettingsModal.vue` 之外的中文界面文件未被改动。

- [ ] **步骤 4：手工验收清单（开发者本机 `npm run dev`）**

1. 托盘右键菜单显示中文四项；hover 无选择时显示「暂无模板配置」。
2. 设置弹窗语言切到 English：弹窗标题/标签/按钮 aria/校验提示立即变英文；托盘菜单与 hover 占位同步变英文。
3. 重启应用：语言保持 English。
4. 手动删除 `lms_launcher.yaml` 的 `language` 字段后重启：回到跟随系统（本机 zh 环境下为中文）。
5. 中文界面与改动前逐像素核对：除设置弹窗新增「语言」一行外无其它差异。

- [ ] **步骤 5：更新分片卡状态**

把 `docs/superpowers/specs/2026-09-22-i18n-design.md` §4 表中 S0 行的 `☐` 改为 `✅`，并 commit：

```bash
git add docs/superpowers/specs/2026-09-22-i18n-design.md
git commit -m "docs(i18n): 分片卡 S0 标记完成"
```

---

## 自检记录

- **规格覆盖度**：spec §3.1（dict/t/双端引用）→ 任务 1；§3.2（key 命名）→ 任务 1 词典；§3.3（主进程权威/时序/IPC）→ 任务 1+3；§3.4（持久化）→ 任务 2；§3.6（英文文案规则）→ 任务 1 词典 + 任务 4；§3.7（测试固定 zh）→ 任务 1；§6.2（修改文件清单）→ 任务 1/2/3/4；§6.4（验收点）→ 任务 5。无遗漏。
- **占位符扫描**：无 TODO/待定；每个代码步骤均有完整代码。
- **类型一致性**：`Lang` 由 `src-main/i18n/dict.ts` 定义，`src-main/i18n/index.ts` 与 `src/i18n.ts` 均 re-export；`t(key, params?)` 双端同签名；`trayTooltipText(name, emptyText)` 在测试与 main.ts 调用一致。
