# 设置弹窗「变更才落盘、才记日志」实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**规格：** [2026-10-08-settings-save-change-only-design.md](../specs/2026-10-08-settings-save-change-only-design.md)（决策 H1–H10、真值表 P1–P8/L1–L4、验收 V1–V5 都在那里）

**目标：** 设置弹窗点保存时，只有本次真的改了 `lms_launcher.yaml` 才落盘并记日志；无变化则文件与日志都不动。

**架构：** 判定放在 `src-main/config.ts`——决定是否写盘的那一层同时报告是否写了（`{ cfg, changed }`），`main.ts` 只按 `changed` 决定是否 `emitLog`。代理与语言各一个保存函数，共用一套归一化比较。渲染端零改动。

**技术栈：** TypeScript + Electron（主进程）、vitest（`npx vitest run`）、`yaml` 库（`stringify` 省略 `undefined` 键，规格 F8）。

**提交作者：** 本机 `git config` 是 `Agent <agent@dsh>`，而仓库要求作者是仓库主人 → 每次 commit 都带 `--author="Gelomen <gelomenchen@gmail.com>"`。

---

## 文件结构

| 文件 | 本次职责 |
|---|---|
| 修改 `src-main/config.ts` | 新增 `ConfigSaveResult`、`normalizeProxy`、`sameProxy`（私有）；`saveProxy` 改为「校验 → 归一比较 → 变更才写盘」；新增 `saveLanguage` |
| 修改 `src-main/config.test.ts` | 既有的 4 个 `saveProxy` 用例适配新返回类型（规格 F11）；新增 P1–P7 与 L1–L3 的用例 |
| 修改 `src-main/main.ts` | `save_proxy` 加 `changed` 日志门；`set_language` 改用 `saveLanguage`（`applyLang`/重建托盘照常，H10） |
| 不动 | `src/modules/SettingsModal.vue`、`src/i18n.ts`、`src/App.vue`、`src-main/i18n/dict.ts`（规格 §2 非目标、V4） |

`main.ts` 无单测基建（F10），所以判定必须在 `config.ts` 里被测到；`main.ts` 的接线靠 `tsc` + 真机验收（V5）覆盖。

---

### 任务 1：`saveProxy` 变更才落盘

**文件：**
- 修改：`src-main/config.ts:195-211`（`saveProxy`）与其上方新增
- 修改：`src-main/config.test.ts:342-372`（既有用例）+ 新增用例
- 修改：`src-main/main.ts:258-266`（`save_proxy` 日志门）

- [ ] **步骤 1：在 `config.test.ts` 的 `describe('saveProxy')` 上方加 mtime 哨兵辅助**

放在 `describe('saveProxy', …)` 之前（模块顶层）。规格 V1 要求「不写文件」的断言必须有牙：把时间戳钉到 1970，任何 `writeFileSync` 都会把它推回 now（实测钉完读回 `0`，写一次后变成 `1.79e12`）。

```ts
// mtime 哨兵（spec V1）：钉到 1970 后任何一次落盘都会把 mtimeMs 推回 now → 「未变化不写盘」才有牙
function pinMtime(p: string): void { require('node:fs').utimesSync(p, new Date(0), new Date(0)); }
function mtime(p: string): number { return require('node:fs').statSync(p).mtimeMs; }
```

- [ ] **步骤 2：编写失败的测试（新增到 `describe('saveProxy')` 内）**

覆盖真值表 P1/P2/P3/P4/P5/P6/P7。文件内容断言沿用本文件既有的 `require('node:fs').readFileSync` 写法（见 `config.test.ts:324,334`）。

```ts
  it('P4 同值再保存 → changed=false 且不写盘（mtime 哨兵）', () => {
    const p = tmpPath('saveproxy_noop.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    pinMtime(p);
    const r = saveProxy(p, '127.0.0.1', '10808');
    expect(r.changed).toBe(false);
    expect(r.cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(mtime(p)).toBe(0);
    rm(p);
  });

  it('P1 文件无 proxy 节 + 输入均空 → changed=false 且不写盘', () => {
    const p = tmpPath('saveproxy_noop_clear.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    const r = saveProxy(p, '  ', '');
    expect(r.changed).toBe(false);
    expect(r.cfg.proxy).toBeUndefined();
    expect(mtime(p)).toBe(0);
    rm(p);
  });

  it('P2 proxy: {} 与无节等价 → 输入均空 changed=false', () => {
    const p = tmpPath('saveproxy_emptyshell.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nproxy: {}\n');
    pinMtime(p);
    const r = saveProxy(p, '', '');
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    rm(p);
  });

  it('P5 端口写成 010808 → 归一后同值，changed=false 且文件仍是 10808', () => {
    const p = tmpPath('saveproxy_leadingzero.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    pinMtime(p);
    const r = saveProxy(p, ' 127.0.0.1 ', '010808');
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(appConfigLoad(p).proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    rm(p);
  });

  it('P3 缺节 → 有值 = 变化：changed=true 且写入', () => {
    const p = tmpPath('saveproxy_add.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    const r = saveProxy(p, '127.0.0.1', '10808');
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    rm(p);
  });

  it('P6 改端口 = 变化：changed=true 且覆盖为新值', () => {
    const p = tmpPath('saveproxy_change.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    const r = saveProxy(p, '127.0.0.1', '7890');
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).proxy).toEqual({ host: '127.0.0.1', port: 7890 });
    rm(p);
  });

  it('P7 有值 → 空 = 变化：changed=true 且 proxy 节从文件消失', () => {
    const p = tmpPath('saveproxy_clear_real.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    const r = saveProxy(p, '', '');
    expect(r.changed).toBe(true);
    expect(require('node:fs').readFileSync(p, 'utf8')).not.toContain('proxy');
    rm(p);
  });
```

- [ ] **步骤 3：运行测试验证失败**

运行：`npx vitest run src-main/config.test.ts`
预期：新增 7 条里至少 3 条红（`changed` 为 `undefined` → `expect(undefined).toBe(false)` 失败；`mtime(p)` 为 now ≠ 0）。这即规格 V1 的「有牙」证据——先记下红的清单再往下做。

- [ ] **步骤 4：编写实现（`src-main/config.ts`，替换原 `saveProxy`）**

原 `saveProxy` 在 `config.ts:195-211`。整段替换为下面三段（`ProxyConfig` 已在 `config.ts:5` 定义，无需新增导入）：

```ts
/** 保存结果：changed = 本次是否真的修改了 yaml；false 表示未落盘，调用方据此不记日志（2026-10-08 settings-save-change-only）。 */
export interface ConfigSaveResult { cfg: AppConfig; changed: boolean; }

/**
 * 代理归一化：host/port 任一缺失或非法 → undefined（= 直连）。
 * 文件侧与输入侧共用同一函数——yaml 缺 proxy 节、proxy: {}、输入框留空三者语义相同（spec H8）。
 */
function normalizeProxy(p: ProxyConfig | undefined): ProxyConfig | undefined {
  const host = typeof p?.host === 'string' ? p.host.trim() : '';
  const port = typeof p?.port === 'number' ? p.port : NaN;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return { host, port };
}

/** 两侧归一后是否为同一代理状态（undefined 只与 undefined 相同）。 */
function sameProxy(a: ProxyConfig | undefined, b: ProxyConfig | undefined): boolean {
  const x = normalizeProxy(a);
  const y = normalizeProxy(b);
  if (x === undefined || y === undefined) return x === y;
  return x.host === y.host && x.port === y.port;
}

/**
 * 保存代理设置（端口走字符串，由主进程校验防注入）；两参均空 = 清除代理。
 * 变更才落盘（2026-10-08 settings-save-change-only）：判定基线是 **yaml 当前内容**（不是内存态，spec H2），
 * 与文件现值归一后相同 → 不写文件、changed=false（调用方据此不记日志）。校验先于判定，throw 契约不变。
 */
export function saveProxy(p: string, host: string, port: string): ConfigSaveResult {
  const cfg = appConfigLoad(p);
  const h = (host ?? '').trim();
  const ps = (port ?? '').trim();
  const clearing = !h && !ps;
  if (!clearing && (!h || !ps)) throw new Error(t('err.config.proxyPortEmpty'));
  let target: ProxyConfig | undefined;
  if (!clearing) {
    const n = Number(ps);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(t('settings.proxy.err.port'));
    target = { host: h, port: n };
  }
  if (sameProxy(cfg.proxy, target)) return { cfg, changed: false }; // 未变：不落盘，mtime 不动
  cfg.proxy = target; // undefined → yaml stringify 省略该键，整节消失（spec F8）
  appConfigSave(p, cfg);
  return { cfg, changed: true };
}
```

- [ ] **步骤 5：同步既有 4 个用例（规格 F11）**

`config.test.ts:342-372` 里两处 `const cfg = saveProxy(…)`（`:346`、`:354`）改为解构，断言逐字不变：

```ts
const { cfg } = saveProxy(p, '127.0.0.1 ', ' 10808 ');   // 原 :346
const { cfg } = saveProxy(p, '  ', '');                    // 原 :354
```

两处 `expect(() => saveProxy(…)).toThrow(…)`（`:361`、`:367-369`）不动——throw 契约保持原样（规格 §5.1）。

- [ ] **步骤 6：运行测试验证通过**

运行：`npx vitest run src-main/config.test.ts`
预期：`saveProxy` 全部用例（既有 4 + 新增 7）PASS。

- [ ] **步骤 7：接线 `main.ts` 的日志门**

`src-main/main.ts:258-266` 整段替换（日志文案与 `emitLog` 形式不动，只加 `changed` 门）：

```ts
// save_proxy：持久化更新代理（host/port 均为空 = 清空代理，行为回落到直连）；saveProxy 的 throw 原样传给渲染端 reject
ipcMain.handle('save_proxy', async (_e, host: string, port: string) => {
  const [p] = yamlPaths();
  const { cfg, changed } = saveProxy(p, host, port);
  // 变更才记日志（2026-10-08 settings-save-change-only）：与 yaml 归一后同值 → 日志区一行都不加
  if (changed) {
    const on = cfg.proxy?.host && cfg.proxy?.port
      ? t('log.launcher.settings.proxySaved', { url: `http://${cfg.proxy.host}:${cfg.proxy.port}` })
      : t('log.launcher.settings.proxyCleared');
    emitLog('[lms_launcher] ' + on, 'sys');
  }
  return 'ok';
});
```

- [ ] **步骤 8：类型检查**

运行：`npx tsc -p tsconfig.main.json`
预期：无输出（无错）。返回类型变了，`main.ts` 若没接线会在此处报错——所以第 7 步必须在提交前完成。

- [ ] **步骤 9：Commit**

```bash
git add src-main/config.ts src-main/config.test.ts src-main/main.ts
git commit --author="Gelomen <gelomenchen@gmail.com>" -m "fix(config): 代理保存改为变更才落盘，未变化不再记日志"
```

---

### 任务 2：`saveLanguage` 变更才落盘

**文件：**
- 修改：`src-main/config.ts`（新增 `saveLanguage`；`config.ts:1` 的 i18n 导入补 `type Lang`）
- 修改：`src-main/config.test.ts`（新增 `describe('saveLanguage')`；`:3` 的导入补 `saveLanguage`）
- 修改：`src-main/main.ts:246-256`（`set_language`）

- [ ] **步骤 1：编写失败的测试**

```ts
describe('saveLanguage', () => {
  it('L1 文件缺 language 键 → changed=true 且写入（spec H6）', () => {
    const p = tmpPath('lang_add.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    const r = saveLanguage(p, 'zh');
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).language).toBe('zh');
    rm(p);
  });

  it('L2 同值 → changed=false 且不写盘（mtime 哨兵）', () => {
    const p = tmpPath('lang_noop.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', language: 'zh' });
    pinMtime(p);
    const r = saveLanguage(p, 'zh');
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    rm(p);
  });

  it('L3 不同值 → changed=true 且写入，且不丢 llama_dir', () => {
    const p = tmpPath('lang_change.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', language: 'zh' });
    const r = saveLanguage(p, 'en');
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).language).toBe('en');
    expect(appConfigLoad(p).llama_dir).toBe('/x');
    rm(p);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/config.test.ts`
预期：FAIL，报错形如 `saveLanguage is not a function`（导入不存在时 vitest 会在收集阶段报 `No export saveLanguage is defined in module`）。

- [ ] **步骤 3：编写最少实现**

`config.ts:1` 改为：

```ts
import { t, type Lang } from './i18n';
```

在 `saveProxy` 之后新增：

```ts
/**
 * 保存语言（2026-10-08 settings-save-change-only）：与 **yaml 里的 language** 比较，不用 getLang()——
 * 运行期语言可能来自系统 locale（main.ts initI18n），文件缺键时用户选值仍算变化（spec H2/H6、L1）。
 * 相同 → 不写文件、changed=false；调用方（set_language）仍照常 applyLang + 重建托盘（spec H10）。
 */
export function saveLanguage(p: string, lang: Lang): ConfigSaveResult {
  const cfg = appConfigLoad(p);
  if (cfg.language === lang) return { cfg, changed: false };
  cfg.language = lang;
  appConfigSave(p, cfg);
  return { cfg, changed: true };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/config.test.ts`
预期：`saveLanguage` 3 条 PASS；`language_round_trips_and_survives_incremental_saves`（`config.test.ts:218-228`）仍绿。

- [ ] **步骤 5：接线 `main.ts`**

`src-main/main.ts:246-256` 中 `const cfg = appConfigLoad(p);` 与 `appConfigSave(p, { ...cfg, language: lang });` 两行替换为一行；`applyLang` 与重建托盘/tooltip 保持无条件执行（H10）：

```ts
ipcMain.handle('set_language', (_e, lang: Lang): void => {
  if (lang !== 'zh' && lang !== 'en') return; // IPC 边界防御（任务 3 控制器裁定 B-b）：渲染端 devtools 可传任意值
  applyLang(lang);
  // 变更才落盘（2026-10-08 settings-save-change-only）：与 yaml 里的 language 相同 → 不写文件。
  // applyLang 与重建托盘照常：幂等，且能纠正被外部改过的 yaml（spec H10）
  saveLanguage(yamlPaths()[0], lang);
  if (tray) {
    tray.setToolTip(trayTooltipText(trayTooltipName, t('tray.tooltip.empty')));
    tray.setContextMenu(buildTrayMenu());
  }
});
```

`main.ts:8` 的 `from './config'` 导入补 `saveLanguage`。`appConfigSave` 在 `main.ts:451,965` 仍在用，不要删。

- [ ] **步骤 6：类型检查**

运行：`npx tsc -p tsconfig.main.json`
预期：无输出。

- [ ] **步骤 7：Commit**

```bash
git add src-main/config.ts src-main/config.test.ts src-main/main.ts
git commit --author="Gelomen <gelomenchen@gmail.com>" -m "fix(config): 语言保存改为变更才落盘，重复选同一语言不再改写 yaml"
```

---

### 任务 3：全量验证与边界自检

**文件：** 无新增改动（只验证；发现问题就地修）

- [ ] **步骤 1：全量测试（规格 V2）**

运行：`npx vitest run`
预期：全绿。若出现 `%TEMP%` 的 `EBUSY`，属已知环境噪声（历史 progress 记录），重跑该文件即可。

- [ ] **步骤 2：类型检查（规格 V3）**

运行：`npx tsc -p tsconfig.main.json`
预期：无输出。

- [ ] **步骤 3：非目标边界自检（规格 V4）**

运行：`git diff --name-only HEAD~2`
预期：只出现 `src-main/config.ts`、`src-main/config.test.ts`、`src-main/main.ts`（`docs/` 下的规格与计划除外）。若出现 `dict.ts` / `SettingsModal.vue` / `i18n.ts` / `App.vue`，说明越界，回退那部分改动。

- [ ] **步骤 4：真机验收清单（规格 V5，交给人工）**

`npm run dev` 后按 V5 的 5 条逐条走：空配置直接保存无日志、填值恰好一条、原样再保存与 `010808` 均无日志且文件仍为 `10808`、清空恰好一条 `已清空代理` 且节消失、语言重复选不改 mtime / 切换后 yaml 与托盘同步。

- [ ] **步骤 5：Commit（文档）**

```bash
git add docs/superpowers
git commit --author="Gelomen <gelomenchen@gmail.com>" -m "docs(specs): 设置弹窗「变更才落盘、才记日志」的规格与实现计划"
```

---

## 实现期修订（2026-10-08，任务 1 审查后）

- **发现既有缺陷**：`config.ts:38` 的 `EMPTY_APP_CONFIG` 是模块级共享对象，`appConfigLoad` 在「文件缺失」「文件存在但内容为空」两条 fallback 下原样返回它，`saveProxy`/`saveLlamaDir` 随后就地写脏。旧代码无条件落盘所以不可见；本计划把 `appConfigLoad` 的结果当判定基线（H2），污染就变成真实缺陷（yaml 缺失时用户填的代理若等于脏值 → 判「未变化」→ 永不落盘）。表现为任务 1 步骤 6 里 P4/P5 报 `ENOENT utimesSync`。
- **裁定**：改根因，不用测试夹具绕开——删掉单例，改为每次新建的 `emptyAppConfig()` 工厂，两处 fallback 都用它（已并入规格 F14/H11/V6）。`saveProxy` 与其余测试代码保持本计划逐字未改。
- **追加要求**：为 `appConfigLoad` 的契约本身补守护用例（两条 fallback 路径，写脏后再读仍须干净），并补齐真值表缺项：P2「只有 host」的畸形节、P8 的「不写文件」半边、只改 host 不改 port、P2 断言 `changed:false` 时返回的是文件原样 `{}`。

## 最终整分支审查后的跟进（2026-10-09）

- **I-1（已修）**：`main.ts:697/770/803` 三处内联 `cfg.proxy?.host && cfg.proxy?.port ? … : undefined` 是弱谓词（不 trim、不校验类型与范围），而 `update-http.ts:5` 的 `buildProxyUri` 与 `normalizeProxy` 规则同构且已有测试、`main.ts:34` 早已 import。后果是本次改动放大的：文件里 `port` 写成字符串时，用户清空代理 → 两侧都归一为「无代理」→ `changed=false` → 不写盘，而更新下载仍在用这个代理——「清除代理」成了静默无操作。修法：三处换成 `buildProxyUri(cfg) ?? undefined`（已并入规格 H8 前提与 V7）。
- **I-2（不在本次范围，已记入规格非目标）**：`set_llama_update_config`（`main.ts:958-976`）与 `set_vram_total`（`:451-454`）仍是无条件写盘 + 无条件记日志，与本次修掉的是同一症状；后续复用 `ConfigSaveResult` 模式。
- 其余 Minor（`yamlPaths()[0]` 写法、`saveLanguage` 不校验 `lang`、`appConfigLoad` 两条路径返回形状不同、`saveLlamaDir` 注释）未处理，属打磨。

## 自检（写完后照规格复核）

- **规格覆盖度**：P1→任务 1 步骤 2 用例 2；P2→用例 3；P3→用例 5；P4→用例 1；P5→用例 4；P6→用例 6；P7→用例 7；P8→既有 throw 用例（任务 1 步骤 5 保持不动）。L1/L2/L3→任务 2 步骤 1；L4→`main.ts` 既有 IPC 守卫（任务 2 步骤 5 保留）。G1→任务 1 步骤 7；G2→mtime 哨兵用例；G3→任务 2；G4→判定全部在 `config.ts`。H10→任务 2 步骤 5 保留 `applyLang`/重建托盘。
- **占位符扫描**：无「待定/TODO/类似上文」；每个代码步骤都给了完整代码与命令。
- **一致性**：`ConfigSaveResult`、`saveProxy`、`saveLanguage`、`normalizeProxy`、`sameProxy`、`pinMtime`、`mtime` 在各任务中同名同签名；`main.ts` 一律用 `const { cfg, changed } = saveProxy(…)` 与 `saveLanguage(yamlPaths()[0], lang)`。
