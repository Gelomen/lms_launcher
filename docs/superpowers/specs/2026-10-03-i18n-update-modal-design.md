# LMS 启动器 i18n · S8 检查更新弹窗设计

**日期：** 2026-10-03
**分支：** feat/i18n
**分片：** S8（检查更新弹窗）
**设计权威：** `2026-09-22-i18n-design.md`（跨切片不变量）+ `2026-09-22-i18n-slices.md`（分片卡）
**性质：** S8 轻量独立规格（分片卡未标「建议展开」：2 个渲染端文件、23 处文案、无跨进程契约变更；按 S2–S7 先例展开 spec + plan）

> 本文件与设计总纲冲突时，以设计总纲为准；本文件只细化 S8 的实现契约。

---

## 1. 背景与目标

S8 覆盖检查更新弹窗：`src/modules/UpdateModal.vue`（标题 / 关闭 aria / 七态按钮 / 中段 / llama.cpp 提示 / 错误回退）与 `src/App.vue` 的更新状态机（`updateItems` 行名、`runCheck`/`runDownload` 的 `errorText`）。

**目标：** 23 处硬编码中文接入 `t()`，中英即时切换；行名复用 `app.brand`；中文逐字零回归；英文按 2026-10-03 grill-me 十问定稿。

### 1.1 现状盘点（探索结论）

| # | 位置 | 现状（zh） | 目标 key |
|---|---|---|---|
| 1 | `UpdateModal.vue:600` 标题 | 检查更新 | `update.title` |
| 2 | `UpdateModal.vue:601` close `aria-label` | 关闭弹窗 | `update.close` |
| 3 | `UpdateModal.vue:382-390` `BUTTONS` 七态 | 检查更新 / 检查中... / 下载更新 / 下载中 NN% / 重启应用 / 重试 / 停止并更新 | `update.btn.*` |
| 4 | `UpdateModal.vue:466-476` `LLAMA_BUTTONS` 七态 | 同上 | `update.btn.*`（同 key 复用） |
| 5 | `UpdateModal.vue:514` 切换版本覆盖 | 切换版本 | `update.btn.switch` |
| 6 | `UpdateModal.vue:431` LMS 行中段 | 已是最新版本 {v} | `update.middle.latest` |
| 7 | `UpdateModal.vue:559-561` llama 行中段 | 已是最新版本 [bNNNNN] | `update.middle.latest` |
| 8 | `UpdateModal.vue:563` | 新版本: {v} | `update.middle.newVersion` |
| 9 | `UpdateModal.vue:568` | 本地版本未检测到 | `update.middle.localMissing` |
| 10 | `UpdateModal.vue:579` | llama-server 正在运行，点击「停止并更新」停止服务并完成安装 | `update.hint.stopRunning` |
| 11 | `UpdateModal.vue:581` | 更新包已下载完成，点击「停止并更新」完成安装 | `update.hint.stopReady` |
| 12 | `UpdateModal.vue:585` | 请先在主界面选择 llama.cpp 安装目录 | `update.hint.unconfigured` |
| 13 | `UpdateModal.vue:587` | 检查更新失败 | `update.err.check` |
| 14 | `UpdateModal.vue:224` | 未知错误 | `update.err.unknown` |
| 15 | `UpdateModal.vue:275` | 下载失败 | `update.err.download` |
| 16 | `UpdateModal.vue:313` | 文件仍被占用 | `update.err.busy` |
| 17 | `UpdateModal.vue:318` | 安装失败 | `update.err.install` |
| 18 | `App.vue:53` `updateItems` 行名 | LMS 启动器 | `app.brand`（复用，无新 key） |
| 19 | `App.vue:219` | 检查更新时发生未知错误，请稍后重试。 | `update.err.app.checkUnknown` |
| 20 | `App.vue:235` | 无法连接更新服务器或解析版本信息，请稍后重试。 | `update.err.app.checkNetwork` |
| 21 | `App.vue:239` | 开发模式不检查更新 | `update.err.app.dev` |
| 22 | `App.vue:252` | 更新下载时发生未知错误，请稍后重试。 | `update.err.app.downloadUnknown` |
| 23 | `App.vue:268` | 未知错误（reason 兜底） | `update.err.unknown` |

关键事实：

- **不译项**：`llama.cpp`（`UpdateModal.vue:639`）、版本号、release body 解析出的版本 label（如 `Windows x64 (CPU)`）、`{pct}%` 数字格式。
- **既有断言规模**：`UpdateModal.test.ts` 1878 行 / 186 处中文断言；`App.test.ts` 41 条（更新相关 10+ 处）。zh 词典值逐字照抄现状 → 零改动继续通过。
- **中段可用宽实测**：卡片 440px − 内容区 padding 32px − 名称列 99.03px − 按钮列 99.03px − gap 16px ≈ **194px**；`.update-row__middle` 为 `nowrap + ellipsis`（`UpdateModal.vue:767-776`，`--fs-label` 12px）。zh 现状错误句 19 个 CJK 字 ≈ 228px，**当前就已被截断** → 英文改短句（grill Q5）。
- **按钮宽度契约**：`.update-row .btn { min-width: 99.03px }`（`UpdateModal.vue:794-797`）= 下载态「下载中 100%」实测总宽；英文八态最长 `Stop & Update` 与 `Switch version`（均 13 字符），与参照同级。
- **测试基线（2026-10-03 实测）**：`npm test` = **34 文件 / 560 用例**全绿。
- **跨进程耦合**：`App.vue:261` 用 `r.reason.includes('尚无更新任务')` 匹配主进程中文 reason（`src-main/main.ts:505`）→ 见 §5。

---

## 2. 范围与非目标

### 2.1 范围内

`UpdateModal.vue` 17 处 + `App.vue` 6 处（表 1–23），全部接入 `t()`；行名复用 `app.brand`。

### 2.2 非目标（本轮零改动）

1. **App.vue 的 appendSys 中文日志行**（L107 / L120-122 / L142 / L164 / L180 / L200 / L202 / L224 / L230 / L246 / L256 / L267 / L294）→ S10；S8 严格只改行名与 errorText（grill Q1）。
2. **`src-main/*`**：主进程日志、`download_update` 的 `reason`（含 L505）、更新校验 reason → S10。
3. **`'尚无更新任务'` 匹配逻辑**：本轮不动，登记为 S10 强制连带项（§5）。
4. **窗口三键 aria**（`App.vue:331-333` 静态中文）：S1 已定「走静态中文」，不在 S8。
5. **七态状态机 / 事件契约 / DOM 结构 / 类名 / `Dropdown` 组件**：零改动；版本下拉 label 来自 release body，不译。
6. **CSS**：零新增、零修改；**零 `html[lang="en"]` 覆盖**（grill Q5/Q6）。
7. 不引入新依赖；不改既有 zh 断言（新增测试除外）。

---

## 3. key 契约（新增 25 个）

scope `update` 已在设计总纲 §3.2 白名单内；本分片新增 `btn` / `middle` / `hint` / `err` 四个二级命名空间，与 S10 的 `log.*` 无重叠。

| key | zh | en |
|---|---|---|
| `update.title` | 检查更新 | Check for updates |
| `update.close` | 关闭弹窗 | Close dialog |
| `update.btn.check` | 检查更新 | Check |
| `update.btn.checking` | 检查中... | Checking... |
| `update.btn.download` | 下载更新 | Download |
| `update.btn.downloading` | 下载中 {pct}% | {pct}% |
| `update.btn.restart` | 重启应用 | Restart |
| `update.btn.retry` | 重试 | Retry |
| `update.btn.stopUpdate` | 停止并更新 | Stop & Update |
| `update.btn.switch` | 切换版本 | Switch version |
| `update.middle.latest` | 已是最新版本 | Up to date |
| `update.middle.newVersion` | 新版本: {version} | New version: {version} |
| `update.middle.localMissing` | 本地版本未检测到 | Local version not detected |
| `update.hint.unconfigured` | 请先在主界面选择 llama.cpp 安装目录 | Select a llama.cpp directory on the main screen first |
| `update.hint.stopRunning` | llama-server 正在运行，点击「停止并更新」停止服务并完成安装 | llama-server is running. Click "Stop & Update" to stop it and finish installing |
| `update.hint.stopReady` | 更新包已下载完成，点击「停止并更新」完成安装 | Update package downloaded. Click "Stop & Update" to finish installing |
| `update.err.unknown` | 未知错误 | Unknown error |
| `update.err.download` | 下载失败 | Download failed |
| `update.err.install` | 安装失败 | Install failed |
| `update.err.busy` | 文件仍被占用 | File still in use |
| `update.err.check` | 检查更新失败 | Update check failed |
| `update.err.app.checkUnknown` | 检查更新时发生未知错误，请稍后重试。 | Update check failed. Try again. |
| `update.err.app.checkNetwork` | 无法连接更新服务器或解析版本信息，请稍后重试。 | Update server unreachable. |
| `update.err.app.dev` | 开发模式不检查更新 | Update checks disabled in dev mode. |
| `update.err.app.downloadUnknown` | 更新下载时发生未知错误，请稍后重试。 | Update download failed. Try again. |

说明：

- **zh 全部逐字照抄现状**（含 `检查中...` 半角三点、`新版本: ` 半角冒号+空格、`更新下载时…` 句末全角句号）——中文零回归、既有 186 处断言零改动。
- **en 按钮遵循总纲 §3.6 最短动词**：`Check` / `Checking...` / `Download` / `{pct}%` / `Restart` / `Retry` / `Stop & Update`；第 8 态覆盖文案 `Switch version`（总纲未列，grill Q4 定稿）。
- **`update.middle.latest` 不带插值**：调用处按 `t('update.middle.latest') + ' ' + version` 拼接（zh 现状即空格连接），版本未知时只输出 `已是最新版本` / `Up to date`。
- **行名复用 `app.brand`**（grill Q2）：`updateItems` 的 `name` 即产品品牌名，与顶栏同值同义，不新增 `update.row.launcher`。
- **`update.err.unknown` 双处复用**：`UpdateModal.vue:224`（检查兜底）与 `App.vue:268`（下载 reason 兜底）。
- **4 段 key 先例**：`update.err.app.*` 与 `settings.proxy.err.partial` 同型（总纲 §3.2）。
- **en 短句策略**（grill Q5）：App 侧 4 条错误句改为 ≤ 约 40 字符的短句，关键信息前置，适配 194px 中段；与 zh 现状同口径（zh 也已截断），零 CSS。

---

## 4. 组件改造设计

### 4.1 导入

`UpdateModal.vue` 顶部新增：

```ts
import { t } from '../i18n';
```

`App.vue:13` 已有 `import { t } from './i18n';`，无需改动。

### 4.2 七态按钮（`UpdateModal.vue:381-390` / `466-476`）

`BUTTONS` / `LLAMA_BUTTONS` 的 `label` 改为调用 `t()`（`t()` 读渲染端 `lang` ref，模板渲染时求值 → 切换语言即时重译）：

```ts
const BUTTONS: Record<Phase, { label: (pct: number) => string; kind: string; disabled: boolean }> = {
  idle:         { label: () => t('update.btn.check'),      kind: 'check',    disabled: false },
  checking:     { label: () => t('update.btn.checking'),   kind: 'check',    disabled: true },
  available:    { label: () => t('update.btn.download'),   kind: 'download', disabled: false },
  downloading:  { label: (p) => t('update.btn.downloading', { pct: Math.floor(p) }), kind: 'download', disabled: true },
  ready:        { label: () => t('update.btn.restart'),    kind: 'restart',  disabled: false },
  error:        { label: () => t('update.btn.retry'),      kind: 'retry',    disabled: false },
  'up-to-date': { label: () => t('update.btn.check'),      kind: 'check',    disabled: false },
  'stop-update': { label: () => t('update.btn.stopUpdate'), kind: 'stop-update', disabled: false },
};
```

`LLAMA_BUTTONS` 同型（`up-to-date` / `ready` → `update.btn.check`，`stop-update` → `update.btn.stopUpdate`）；`llamaBtnLabel()` 的覆盖分支：

```ts
  if (llamaSwitchVariantApplies()) {
    return t('update.btn.switch');
  }
```

### 4.3 中段（`middleText` / `llamaMiddle`）

```ts
    case 'latest':
      return `${t('update.middle.latest')} ${item.version ?? ''}`;
```

```ts
    case 'up-to-date':
      return { kind: 'latest', text: llamaLocalVersion.value
        ? t('update.middle.latest') + ' ' + llamaLocalVersion.value
        : t('update.middle.latest') };
    case 'update-available':
      return { kind: 'version', text: t('update.middle.newVersion', { version: llamaRemoteVersion.value || '' }) };
    case 'unknown':
      return { kind: 'latest', text: llamaLocalVersion.value || t('update.middle.localMissing') };
```

> zh 值 `新版本: {version}` 与现状 `'新版本: ' + v` 逐字一致；`已是最新版本 {v}` 与现状空格拼接一致。

### 4.4 提示行（`llamaBelow`）

```ts
  if (llamaPhase.value === 'stop-update') {
    return { kind: 'hint', text: llamaStopUpdateRunning.value
      ? t('update.hint.stopRunning')
      : t('update.hint.stopReady') };
  }
  switch (llamaUpdateStatus.value) {
    case 'unconfigured':
      return { kind: 'hint', text: t('update.hint.unconfigured') };
    case 'error':
      return { kind: 'error', text: llamaError.value || t('update.err.check') };
```

### 4.5 错误回退（4 处）

| 行 | 现状 | 改为 |
|---|---|---|
| L224 | `llamaError.value = result.error ?? '未知错误';` | `?? t('update.err.unknown')` |
| L275 | `llamaError.value = result.error ?? '下载失败';` | `?? t('update.err.download')` |
| L313 | `llamaError.value = result.error ?? '文件仍被占用';` | `?? t('update.err.busy')` |
| L318 | `llamaError.value = result.error ?? '安装失败';` | `?? t('update.err.install')` |

> `result.error` 来自主进程（含中文），按总纲 §3.5 不回改、不重译；只在**兜底**分支接词典。

### 4.6 标题与关闭 aria（L600-601）

```html
          <span class="update-title">{{ t('update.title') }}</span>
          <button type="button" class="update-close" :aria-label="t('update.close')" @click="onClose()">
```

### 4.7 `App.vue`

```ts
const updateItems = computed(() => [
  { name: t('app.brand'), localVersion: version.value, ...updateState.value },
]);
```

errorText 五处：

| 行 | 现状 | 改为 |
|---|---|---|
| L219 | `errorText: '检查更新时发生未知错误，请稍后重试。'` | `errorText: t('update.err.app.checkUnknown')` |
| L235 | `errorText: '无法连接更新服务器或解析版本信息，请稍后重试。'` | `errorText: t('update.err.app.checkNetwork')` |
| L239 | `errorText: '开发模式不检查更新'` | `errorText: t('update.err.app.dev')` |
| L252 | `errorText: '更新下载时发生未知错误，请稍后重试。'` | `errorText: t('update.err.app.downloadUnknown')` |
| L268 | `errorText: r.reason ?? '未知错误'` | `errorText: r.reason ?? t('update.err.unknown')` |

> `runCheck`/`runDownload` 内的 `appendSys(...)` 中文行**保持原样**（S10）。

### 4.8 响应式

`t()` 读 `src/i18n.ts:10` 的 `lang` ref；`updateItems` 是 computed、模板与两张按钮表的 `label()` 均在渲染期求值 → 切换语言即时重译，无需重挂载。本分片不引入「存 key 快照」机制，也不新增 computed。

---

## 5. 跨切片连带（S10 强制回记）

**事实：** `App.vue:261`

```ts
  if (r.reason && r.reason.includes('尚无更新任务')) {
```

匹配的是**主进程中文文案** `src-main/main.ts:505` `'尚无更新任务（请先检查更新）'`。命中则回落 `idle` 并自动 `runCheck()`（下载任务失步的自愈路径）。

**风险：** S10 一旦把该主进程文案改为英文/词典 key，`includes` 静默失效，自愈路径死掉且**无测试会红**（`App.test.ts:762` 的 mock reason 也是中文，改主进程不改测试同样测不出）。

**处置（grill Q7）：** S8 不改这行；在 S10 分片卡的「S2 回记」清单中追加本项，要求 S10 落地时二选一并补一条 App 级回归：

1. 渲染端改匹配**英文/中性串**（与 S10 最终文案同步写死）；或
2. 主进程 `download_update` 失败返回结构化 `reasonCode: 'no-pending-update'`，渲染端按 code 分流（跨进程契约变更，届时按总纲 §5 判据处理）。

---

## 6. 英文文案规则与布局

- 术语与规则遵循总纲 §2 / §3.6：半角标点、按钮最短动词、专名（`llama.cpp` / `LMS Launcher` / `llama-server`）保留。
- **零 CSS 改动、零 `html[lang="en"]` 覆盖**：中段 194px 现状（zh 亦截断）维持；英文改短句把关键词前置（§3）。
- 按钮宽度：八态英文标签最长 `Stop & Update` / `Switch version`（13 字符），与 99.03px 基准（`下载中 100%`）同级；实测留待人工目视验收（jsdom 无布局，无法单测断言像素）。
- 人工目视验收（留待用户）：en 下卡片不溢出、名称列/按钮列仍对称、中段与按钮不错位；错误红字语义可读。

---

## 7. 测试设计

### 7.1 既有断言零改动

- `UpdateModal.test.ts` 186 处中文断言、`App.test.ts` 更新相关断言：zh 词典值逐字照抄 → 全部继续通过。
- 词典 zh/en key 集合一致性由 S0 的 `dict.test.ts` 自动覆盖 25 个新 key。

### 7.2 新增（grill Q8）

**`src/modules/UpdateModal.test.ts`**（文件末尾新增 `describe('UpdateModal i18n（S8）')`；顶部加 `import { applyLangLocal } from '../i18n';`，en 块 `beforeEach(applyLangLocal('en'))` + `afterEach(applyLangLocal('zh'))`，与 `LogTabView.test.ts:8/213-214` 同型）：

1. **zh 全串回归**（1 条）：`items` 七态 → 七个按钮标签（`检查更新` / `检查中...` / `下载更新` / `下载中 42%` / `重启应用` / `重试` / `已是最新版本 0.1.0`）+ 标题 `检查更新` + close `aria-label="关闭弹窗"`。
2. **en 七态按钮 + 中段**：`Check` / `Checking...` / `Download` / `42%` / `Restart` / `Retry` / `Up to date 0.1.0`。
3. **en 标题 + close aria**：`Check for updates` / `Close dialog`。
4. **en 未配置提示**：`Select a llama.cpp directory on the main screen first`。
5. **en 新版本 / 本地版本未检测到**：`New version: b10955` / `Local version not detected`。
6. **en up-to-date 中段**：`Up to date b10997`。
7. **en stop-update 两条提示**：`llama-server is running. Click "Stop & Update" to stop it and finish installing` / `Update package downloaded. Click "Stop & Update" to finish installing`。
8. **en 切换版本 + 错误回退**：`Switch version`；`Download failed` / `Install failed` / `File still in use` / `Update check failed`。

**`src/App.test.ts`**（在 S1 的 `describe('i18n / App 外壳（Slice 1）')` 内追加，复用既有 `applyEn()` 与 `mountWithUpdate()`）：

1. **en 行名 + 检查失败 errorText**：打开弹窗后 `.update-row__name` = `LMS Launcher`；`check_update` reject → 中段 `Update check failed. Try again.`。
2. **en 无法连接 / 开发模式 errorText**：`check_update` → `{ available: false, status: 'error' }` = `Update server unreachable.`；`{ status: 'dev' }` = `Update checks disabled in dev mode.`。

预期：`UpdateModal.test.ts` 1878 行 → 约 2100 行；总用例 34 文件 / **570**（560 + 8 + 2）。

### 7.3 收尾验证

- `npm test` 全绿（基线 34 文件 / 560 用例 → 预期 34 文件 / 570 用例）。
- Windows 环境噪声：vitest 偶发 `EBUSY`（S6/S7 已记录）；先 `New-Item .temp/vitest` 并把 `TEMP`/`TMP` 指过去再跑。
- `npm run build` 通过。
- 人工英文目视验收（留待用户）。

---

## 8. 验收点

1. 标题、关闭 aria、两行七态按钮、中段、提示行、错误回退共 23 处随语言即时切换。
2. en 契约值：§3 表 en 列逐条命中（含 `Stop & Update`、`Switch version`）。
3. zh：与现状逐字一致（零文案变更）。
4. 行名：顶栏与弹窗行名同源 `app.brand`，zh `LMS 启动器` / en `LMS Launcher`。
5. 不译项不变：`llama.cpp`、版本号、release label、`{pct}%` 数字格式、DOM 结构与类名。
6. 既有 zh 断言零改动全绿；词典 zh/en key 集合相等（S0 单测自动覆盖 25 新 key）。
7. 零 CSS 改动；业务文件改动仅 `UpdateModal.vue`、`App.vue` 与词典；`src-main/*`、`src/style.css` 零改动。
8. S10 回记已写入分片卡（§5）。

---

## 9. 风险与已定决策

| # | 风险 | 处置 |
|---|---|---|
| R1 | zh 词典值手抄走样 → 186 处既有断言批量翻红 | §3 表 zh 列逐字照抄；任务 1 只加 key 不改既有值；全量 `npm test` 卡口 |
| R2 | 漏改 `LLAMA_BUTTONS`（与 `BUTTONS` 是两张表） | §4.2 两表逐行列改；en 冒烟第 2/4/6/7 条覆盖 llama 行各态 |
| R3 | `downloading` 插值 `{pct}` 与现有 `Math.floor(p)` 不一致 → 文案漂移 | §4.2 保留 `Math.floor(p)` 传入 `{ pct }`；en 冒烟断言 `42%` |
| R4 | `已是最新版本 {v}` 拼接漏空格 | §4.3 按现状空格拼接；zh 回归断言 `已是最新版本 0.1.0` |
| R5 | S10 改主进程 reason → `includes('尚无更新任务')` 静默失效 | §5 登记为 S10 强制连带项 + 要求补回归 |
| R6 | 英文长句在中段 194px 被截断 | grill Q5 定稿短句；不改 CSS；人工目视 |
| R7 | 把 App.vue 的 appendSys 日志行误并入 S8 | §2.2 明确非目标；任务 3 只动 6 处 |
| R8 | `npm test` 偶发 EBUSY 被误判为回归 | §7.3 记为环境噪声；TEMP 指向 `.temp/vitest` |

**已定决策台账（2026-10-03 grill-me 十问）：**

1. 范围边界：App.vue 严格只做 `updateItems` 行名 + `runCheck`/`runDownload` 的 errorText；appendSys 日志行留 S10。
2. 行名 key：复用 `app.brand`，不新增 `update.row.launcher`。
3. 中段 up-to-date en：`Up to date`（空格拼接版本号，裸态即 `Up to date`）。
4. 第 8 态覆盖文案 en：`Switch version`。
5. 错误句策略：英文短句 + 零 CSS（中段 194px 已 nowrap+ellipsis，zh 现状亦截断）。
6. 其余 en 草案照单定稿：标题 `Check for updates`、关闭 aria `Close dialog`、`New version: {v}`、`Local version not detected`、未配置提示、两条 stop-update 提示（引号用半角双引号）、`Update check failed` 与四条短句错误。
7. 跨进程耦合：S8 不动 `includes('尚无更新任务')`，登记为 S10 强制连带项。
8. 测试：1 条 zh 全串回归 + 8 条 en 冒烟（`UpdateModal.test.ts`）+ 2 条 en 冒烟（`App.test.ts`）。
9. 交付：`specs/2026-10-03-i18n-update-modal-design.md` + `plans/2026-10-03-i18n-update-modal.md`；看板 S8 行改 ✅ 已展开 / ◐ + 变更记录；规划步单独 commit，实现另起。
10. key 分组：`update.title` / `update.close` · `update.btn.*`（8）· `update.middle.*`（3）· `update.hint.*`（3）· `update.err.*`（5）· `update.err.app.*`（4），共 25 个。
