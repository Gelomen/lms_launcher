# LMS 启动器 i18n 分片规格 · S1 · App 外壳

**日期：** 2026-09-23
**分支：** feat/i18n
**状态：** 已定稿，待实现
**性质：** 分片 S1 的轻量独立规格。S1 仅涉及 2 个文件、无跨进程变更、无新 key scope，按设计总纲 §5 严格标准**不满足**升级判据；本文件是应人工要求单列的评审留档，不改动 §5 判据本身。
**设计权威：** [`2026-09-22-i18n-design.md`](./2026-09-22-i18n-design.md)（§1 非目标、§2 术语、§3 跨切片不变量强制生效）
**分片全表：** [`2026-09-22-i18n-slices.md`](./2026-09-22-i18n-slices.md)（S1 卡）
**实现计划：** [`../plans/2026-09-23-i18n-app-shell.md`](../plans/2026-09-23-i18n-app-shell.md)

> 与设计总纲冲突时以总纲为准。

---

## 1. 范围

### 1.1 目标

把 `src/App.vue` 的**外壳 UI** 接入 i18n，并明确 `index.html` 的 `lang` 策略：

1. 顶栏品牌名 `LMS 启动器` / `LMS Launcher`。
2. 更新 pill：available 与 downloading 两态按钮文案 + `data-tooltip`。
3. winbar 三键（最小化 / 最大化 / 还原 / 关闭）与 GitHub 徽标的 `data-tooltip` + `aria-label`。
4. 退出确认框的 `title` 与 `message`（`ConfirmDialog` 内部按钮见 §1.2）。
5. `index.html` 的 `lang`：**维持 `zh-CN` 静态兜底不改**，运行时由 S0 的 `applyLangLocal` 覆盖。

### 1.2 非目标（本片明确不碰）

| 内容 | 归属 |
|---|---|
| `App.vue` 的 `updateItems` 行名（`name: 'LMS 启动器'`） | S8（复用 `app.brand`，见 §6） |
| `runCheck` / `runDownload` 的 `errorText` 文案 | S8 |
| `onDirValidated` / `onLlamaComplete` / `doStart` / `doStop` 等 `appendSys(...)` sys 日志行 | S10 |
| `ConfirmDialog.vue` 内部 `取消` / `确认` 按钮与默认 aria | S9（`common.*`） |
| 版本号前缀 `v{version}` 与 `document.title`（恒定 `lms_launcher`） | 非文案（数据 / D1 固定） |
| `index.html` 的 `lang` 值 | 维持现状（§4.5） |
| 主进程日志、更新脚本 | S10 / S11 |

---

## 2. 涉及文件

| 文件 | 改动 |
|---|---|
| `src-main/i18n/dict.ts` | 新增 12 个 `app.*` key（zh/en 各 12 条） |
| `src/App.vue` | 新增 `import { t } from './i18n'`；模板 6 组文案 `t()` 化（script 段不动） |
| `src/App.test.ts` | 新增 `describe('i18n / App 外壳（Slice 1）')`：en 冒烟 + 即时切换；既有断言不动 |
| `index.html` | **不改** |
| `docs/superpowers/specs/2026-09-22-i18n-slices.md` | 看板同步（S1 卡链接 + 状态） |

---

## 3. key 契约（`app` scope）

`app` 已在设计总纲 §3.2 白名单内，本片首次使用，无新增 scope。全部 key 全小写点分、2–4 段。

| key | zh | en | 用途 |
|---|---|---|---|
| `app.brand` | `LMS 启动器` | `LMS Launcher` | 顶栏品牌名；**品牌串单一真源**，S8 复用（§6） |
| `app.winbar.github` | `GitHub 仓库` | `GitHub repository` | GitHub 徽标 tooltip + aria |
| `app.winbar.minimize` | `最小化` | `Minimize` | 最小化键 |
| `app.winbar.maximize` | `最大化` | `Maximize` | 最大化键（未最大化时） |
| `app.winbar.restore` | `还原` | `Restore` | 还原键（已最大化时） |
| `app.winbar.close` | `关闭` | `Close` | 关闭键 |
| `app.update.pill.available` | `有新版本!` | `New version!` | 顶栏 pill available 态按钮 |
| `app.update.pill.downloading` | `下载中 {pct}%` | `{pct}%` | 顶栏 pill downloading 态按钮（en 只显示百分比，总纲 §2） |
| `app.update.tip.available` | `发现新版本 v{version}，点击查看并安装` | `Version {version} available, click to view and install` | available 态 tooltip |
| `app.update.tip.downloading` | `下载中 {pct}%，点击查看进度` | `Downloading {pct}%, click to view progress` | downloading 态 tooltip |
| `app.exit.title` | `退出程序` | `Exit` | 退出确认框标题 |
| `app.exit.message` | `将停止 llama-server 并退出，是否确认？` | `llama-server will be stopped. Continue?` | 退出确认框正文 |

**zh 逐字冻结**：表中 zh 值必须与当前 `App.vue` 的既有中文字面量逐字一致（含 `有新版本!` 的半角 `!`、`，` 全角逗号、`？` 全角问号），以保证既有中文断言零改动通过。

---

## 4. 文案与映射

### 4.1 顶栏品牌与版本号

- `<span class="winbar__name">{{ t('app.brand') }}</span>`。
- 版本号 `<span class="winbar__version">v{{ version }}</span>` **不变**：`v` 为版本号格式的一部分（数据），不译。

### 4.2 更新 pill

| 状态 | 按钮 | tooltip |
|---|---|---|
| available | `t('app.update.pill.available')` | `t('app.update.tip.available', { version: updateState.version })` |
| downloading | `t('app.update.pill.downloading', { pct: updateState.pct })` | `t('app.update.tip.downloading', { pct: updateState.pct })` |

- en 按钮一律最短：available 用 `New version!`，downloading 只显示 `{pct}%`（不回显 "Downloading"）。
- 中文 pill 文案**不改**（保持 `有新版本!` / `下载中 {pct}%`）——本片不触碰冻结的中文布局与文案。
- pill 为自适应宽度（`.update-pill` 无固定像素容器），不需 `html[lang="en"]` 覆盖。

### 4.3 winbar 三键与 GitHub

| 元素 | `data-tooltip` | `aria-label` |
|---|---|---|
| GitHub 徽标 | `t('app.winbar.github')` | 同左 |
| 最小化 | `t('app.winbar.minimize')` | 同左 |
| 最大化 / 还原 | `t(maximized ? 'app.winbar.restore' : 'app.winbar.maximize')` | 同左 |
| 关闭 | `t('app.winbar.close')` | 同左 |

同一元素的 tooltip 与 aria **必须同源**（同一 key），防止两者语言不一致。

### 4.4 退出确认框

- `:title="t('app.exit.title')"`、`:message="t('app.exit.message')"`。
- 组件内部 `取消` / `确认` 按钮归 S9，本片不动。
- 该确认框同时服务「托盘退出」与「更新 ready 后重启」，两者共用本片文案（现状语义不变）。

### 4.5 `index.html` 的 `lang`

- 保持 `<html lang="zh-CN">` **不改**。
- 理由：静态 `lang` 仅覆盖「HTML 解析 → `get_language` IPC 返回」这一挂载前窗口；S0 的 `src/main.ts` 已在 `mount` 前 `applyLangLocal(lang)`，把 `document.documentElement.lang` 设为 `zh-CN` / `en`（总纲 D1）。改成 `en` 只会把同一闪烁转移给中文用户。
- 验证项：英文下 `document.documentElement.lang === 'en'`（S0 已有 `src/i18n.test.ts` 覆盖；本片不重复）。

---

## 5. 行为与时序

- **响应式即时生效**：`t()` 读的是 `src/i18n.ts` 的 `lang` ref；切换语言后，模板与 `data-tooltip` 绑定自动重渲染，无需重挂载（验收 §8.3）。
- **挂载前时序**（S0 已落，本片不改）：`await invoke('get_language')` → `applyLangLocal(lang)` → `createApp(App).mount('#app')`。
- **不新增 IPC、不改 preload、不引入依赖**：本片只消费 S0 的 `t()`。

---

## 6. 跨分片契约

1. `app.brand` 是 `LMS 启动器` / `LMS Launcher` 的**单一真源**。S8 处理 `App.vue` 的 `updateItems` 行名时**直接复用** `app.brand`，不再定义 `update.row.launcher` 之类的重复 key。
2. 本片不触碰 S8 / S9 / S10 归属的字符串（§1.2），避免 `App.vue` 同文件多分片并行冲突。
3. 后续分片若需 `app` scope 新 key，按总纲 §3.2 登记，保持 2–4 段全小写。

---

## 7. 测试策略

- 既有中文断言**零改动**（zh 值逐字冻结，见 §3）。
- `src-main/i18n/dict.test.ts` 的「zh/en key 集合一致」「无空值」自动覆盖新增 key 的成对性；追加逐字值断言防止误改 zh 文案。
- `src/App.test.ts` 新增 `describe('i18n / App 外壳（Slice 1）')`：
  - en 下断言品牌、pill（available/downloading）、三键 tooltip+aria、GitHub tooltip、退出框 title/message；
  - 一条「已挂载实例 zh → en 即时重渲染」用例。
  - **动态 `await import('./i18n')`** 获取 `applyLangLocal`：`src/test-setup.ts` 已记录「静态 import 会在 `vi.mock('./ipc')` 注册前把 i18n 绑到真实 ipc（模块图预加载分叉）」的坑，故沿用延迟 import 模式。
- `src/test-setup.ts` 每用例前把两端语言重置为 zh；本片的 en 用例通过用例内 `applyLangLocal('en')` 覆盖，不污染其他用例。
- 每任务结束 `npm test`（= `vitest run`）全绿。

---

## 8. 验收清单

1. 中文界面零回归：既有 `src/App.test.ts` 断言全绿。
2. 切 en 后：品牌 `LMS Launcher`、pill（`New version!` / `{pct}%`）、三键与 GitHub 的 tooltip+aria、退出框 `Exit` / `llama-server will be stopped. Continue?` 全部英文。
3. 即时切换：已挂载实例从 zh 切 en，无需重挂载即更新（含 `data-tooltip` 属性）。
4. `document.documentElement.lang` 随切换为 `zh-CN` / `en`（S0 已覆盖）。
5. `npm test` 全绿。
6. **人工布局验收（英文）**：默认窗口宽度下 winbar 品牌 + pill + 三键不换行、不重叠；`.confirm-box`（360px）内 title/message 不溢出。
7. `index.html` 保持 `lang="zh-CN"`（`git diff index.html` 为空）。

---

## 9. 风险与开放问题

| # | 风险 | 处置 |
|---|---|---|
| R1 | en pill `New version!` / 品牌 `LMS Launcher` 比中文长，挤压 winbar | pill/winbar 自适应无固定容器；验收 §8.6 目视确认，必要时后续分片再加 `html[lang="en"]` 覆盖 |
| R2 | `app.brand` 被 S8 复用后，任一分片误改文案导致另一处联动变化 | 复用是刻意设计（单一真源）；§6 登记 + `dict.test.ts` 逐字断言 |
| R3 | App.test.ts 新增 en 用例若静态 import `./i18n` 触发 S0 记录的 mock 分叉 | 强制动态 `await import('./i18n')`（§7） |
| R4 | `ConfirmDialog` 的按钮仍为中文，导致英文下出现中英混排 | 已知边界：按钮归 S9；本片验收只覆盖 title/message，S9 完成后自然消除 |

---

## 10. 决策台账（本次 grill 定稿）

1. 交付物：轻量独立 spec + plan（§5 判据例外，理由见文首「性质」）。
2. `index.html`：维持 `zh-CN` 不改。
3. 更新 pill：英文最短（`New version!` / `{pct}%`），中文不变。
4. 品牌串 key：`app.brand`，S8 复用。
5. winbar 英文：`Minimize` / `Maximize` / `Restore` / `Close` / `GitHub repository`。
6. 退出框英文：title `Exit`，message `llama-server will be stopped. Continue?`。
7. key 命名：保留 `pill` 段（`app.update.pill.*`），tooltip 用 `app.update.tip.*`。
8. 测试：`App.test.ts` 内新增 describe（动态 import i18n）。
9. 英文布局：单列人工验收。
10. 看板：S1 链接 + 状态 ◐ + 变更记录。
