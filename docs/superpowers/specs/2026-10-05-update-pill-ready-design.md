# LMS 启动器：下载完成后顶栏按钮保持显示「重启以更新」 设计与实现规格

**日期：** 2026-10-05
**分支：** `master`（版本 `0.3.2`；本规格创建于 `b7ca398`）
**性质：** 单点 UI 修复级规格（有界改动：1 处模板分支 + 2 个 i18n 词条 + 2 条新测试；无跨进程契约、无新状态机、无新依赖）
**实现计划：** `../plans/2026-10-05-update-pill-ready.md`
**状态：** 定稿（grill-me 8 问，2026-10-05），待实现。原「既有守护用例红灯」一项已由 2026-10-05 分叉会话以「真归零」方案解决（见 §8），本规格实现范围内不再包含该文件。

---

## 1. 目标

自动更新下载完成后，窗口左上角（winbar 品牌区）的 pill 按钮**保持显示、不再消失**，文本显示「重启以更新」；点击后与 available/downloading 两态一致，**只打开「检查更新」弹窗**（不直接重启、不直接安装）。

---

## 2. 现象与根因

### 2.1 现象

- 应用启动静默检查发现新版本 → 左上角出现紫色 pill「有新版本!」。
- 点击 pill → 打开「检查更新」弹窗 → 点「下载更新」→ pill 文本自动变为「下载中 NN%」。
- 下载完成（100%）后，**pill 直接消失**，用户失去「有已下载更新待重启」的可见入口；只能重新打开弹窗才能看到「重启应用」按钮。

### 2.2 根因

winbar 的 pill 是**模板 v-if 链**，只有两个分支；下载完成会把相位切到 `ready`，而 `ready` 没有任何分支，整条链为假 → 按钮不渲染：

- 模板（`src/App.vue:314-326`）：
  - `v-if="updateState.phase === 'available'"` → 「有新版本!」
  - `v-else-if="updateState.phase === 'downloading'"` → 「下载中 {pct}%」
  - **无 `ready` 分支**
- 相位切换点（`src/App.vue:255-258`）：`runDownload()` 中 `r.ok === true` → `updateState.phase = 'ready'`。

### 2.3 既有链路（无需改动，仅作依据）

| 环节 | 位置 | 事实 |
|---|---|---|
| pill 点击 | `src/App.vue:320 / 326` | 恒为 `updateOpen = true`（**只开弹窗**，零自动检查） |
| 弹窗 ready 态按钮 | `src/modules/UpdateModal.vue:387` | `ready → { label: t('update.btn.restart') /* 重启应用 */, kind: 'restart' }` |
| restart 动作 | `src/App.vue:280-283` | `exitAction='run_update'` → 复用 ConfirmDialog → `invoke('run_update')` |
| pill 样式 | `src/style.css:494-510` | `.update-pill` 实心紫 + `no-drag` + 可点；`.update-pill--busy` 浅紫（仅下载中） |
| pill tooltip | `src/style.css:430-441` | 项目公共 `.tip-down`（`data-tooltip` + hover 显示），不用原生 `title` |

### 2.4 关键不变量：`ready` 是**会话内终态**

实现前已核实：本次会话内**没有任何路径**会把 `ready` 覆盖回 `available`，因此不需要为 pill 增加「锁定」逻辑：

1. pill / 托盘入口只设 `updateOpen = true`，不触发 `runCheck()`；
2. 弹窗里 `ready` 态的动作按钮就是 `restart`（`UpdateModal.vue:382-391`），用户无法从 UI 触发 `check`；
3. llama.cpp 行有独立状态机（`UpdateModal.vue` 内部的 `llamaPhase`），不写 App 的 `updateState`。

---

## 3. 非目标

| # | 边界 | 说明 |
|---|---|---|
| N1 | **不做跨重启持久化** | 用户关掉应用再打开后回到 `idle`（需重新检查/下载）。更新包虽仍在磁盘 `downloads/lms-launcher-update.zip`，但主进程 `pendingUpdate` 只在内存（`src-main/main.ts:55`），且目前无「启动时检测已下载更新包」的 IPC；跨重启检测会因更新后残留旧 zip 而误报。用户已明确本轮不做。 |
| N2 | **不改弹窗按钮文案** | `update.btn.restart` 保持「重启应用」/ `"Restart"`；pill 用**新增的独立 key**。 |
| N3 | **不新增 CSS** | pill 在 `ready` 态复用 `.update-pill`（实心紫）；不引入绿色/成功态新样式。 |
| N4 | **不改状态机、不改主进程** | `UpdatePhase`、`runCheck/runDownload/onUpdateAction/onExitConfirmed`、`src-main/**` 全部零改动（i18n 词典除外）。 |
| N5 | **`run_update` 失败时 pill 不降级** | 失败后相位仍是 `ready`（仅多出 `errorText`），pill 继续显示「重启以更新」；原因在弹窗红字 + 日志里看。 |
| N6 | **S10 收尾不在本规格范围（已完成）** | `src-main/main.ts` 剩余 2 处硬编码中文 + 守护用例 `PENDING` 归零，已由 2026-10-05 分叉会话单独完成（见 §8）；本规格的实现会话对 `main.ts` 与 `no-hardcoded.test.ts` **零改动**。 |

---

## 4. 涉及文件

| 文件 | 动作 | 责任 |
|---|---|---|
| `src/App.vue` | 修改 `:314-326`（pill v-if 链尾部新增第三个分支） | 按钮在 `ready` 态渲染 |
| `src-main/i18n/dict.ts` | 修改 `zh:28-31` / `en:304-307` 相邻处各新增 2 个 key | 词条真源 |
| `src/App.test.ts` | 新增 2 条用例（update describe 内，`updateBtns()` 助手之后） | 回归守护 |
| `src-main/i18n/dict.test.ts` | 在既有 S1 zh/en 两条用例内各追加 2 条断言 | 文案逐字锁定 |

**零改动：** `src/modules/UpdateModal.vue`、`src/main.ts`、`src/ipc.ts`、`src-main/main.ts`（及其他 `src-main/**`）、`src-main/i18n/no-hardcoded.test.ts`、`src/style.css`、`package.json`、`scripts/**`。

> 分叉会话（2026-10-05）已在 `dict.test.ts` 内额外新增 1 条用例（锁定 `main.ts` 调用点依赖的两条 llama 词条），并在 `main.ts` / `no-hardcoded.test.ts` 完成 S10 收尾——这三处**不属于本规格**，见 §8。

---

## 5. 契约一：模板新增 `ready` 分支

在 `src/App.vue` 现有 downloading 按钮**之后**追加：

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

契约要点：

1. 用 `v-else-if` 接在 downloading 分支后 —— 保持单元素单分支渲染（三态互斥）；
2. class 为 `update-pill tip-down`（**不含** `update-pill--busy`）→ 实心紫、可点、向下 tooltip；
3. `@click="updateOpen = true"` —— 与 available/downloading 两态**完全同款**入口，不直接调用 `run_update`；
4. 不设 `title`（项目公共 tooltip 语义：`title` 必须为 `undefined`）；
5. 不设置 `disabled`（ready 态是用户可执行的待办动作）。

---

## 6. 契约二：i18n 词条（定稿）

`src-main/i18n/dict.ts` —— zh 词典在 `'app.update.tip.downloading'` 之后、en 词典同位置各新增两行：

| key | zh | en |
|---|---|---|
| `app.update.pill.ready` | `重启以更新` | `Restart to update` |
| `app.update.tip.ready` | `新版本 v{version} 已下载，点击查看并重启更新` | `Version {version} downloaded, click to view and restart` |

- `{version}` 取自 `updateState.version`（`check_update` 返回的 latest tag，如 `9.9.9`）→ 渲染为「新版本 v9.9.9 已下载，点击查看并重启更新」。
- 与 available 态 tooltip 同模式（`app.update.tip.available` =「发现新版本 v{version}，点击查看并安装」），仅语义从「查看并安装」变为「查看并重启更新」。
- `dict.test.ts` 的「zh 与 en 的 key 集合完全一致」用例自动覆盖新 key 的双语对称性。

---

## 7. 契约三：测试

### 7.1 `src/App.test.ts`（update describe 内新增 2 条）

**用例 A（中文，核心回归）**：下载完成 → pill 不消失，文本「重启以更新」、样式回落实心紫、tooltip 带版本号；点击只开弹窗、不出现退出确认框；弹窗内按钮仍是「重启应用」。

驱动方式沿用该 describe 的 `makeUpdateMount()` 脚手架（`ctrl.checkScript` + 可控 `ctrl.download`）与全局 `updateProgressHandlers` / `trayUpdateHandlers`。

**用例 B（英文）**：同一 ready 流程下 pill 为 `Restart to update`、tooltip 为 `Version 9.9.9 downloaded, click to view and restart`；用 `applyLangLocal('en')`（延迟 `import('./i18n')`，S0 已知坑）切换，断言后 `applyLangLocal('zh')` 复位。

### 7.2 `src-main/i18n/dict.test.ts`（既有 S1 用例内追加断言）

- zh 用例（`S1：app.* 的 zh 值与既有界面文案逐字一致`）追加：
  - `expect(dict.zh['app.update.pill.ready']).toBe('重启以更新')`
  - `expect(dict.zh['app.update.tip.ready']).toBe('新版本 v{version} 已下载，点击查看并重启更新')`
- en 用例（`S1：app.* 的 en 值为最短文案`）追加：
  - `expect(dict.en['app.update.pill.ready']).toBe('Restart to update')`
  - `expect(dict.en['app.update.tip.ready']).toBe('Version {version} downloaded, click to view and restart')`

### 7.3 不新增测试的情形

- 不测「ready 被覆盖」：已核实无覆盖路径（§2.4）。
- 不测跨重启：非目标 N1。
- 不需要改动任何既有用例：全仓检索 `.update-pill` 的断言仅覆盖 available/downloading 两态（`src/App.test.ts:566/598/889/901`），无「ready 态 pill 消失」断言。

---

## 8. 契约四（已由分叉会话完成）：main.ts 剩余 2 处中文 + 守护用例归零

**背景（本规格定稿时实测，非 pill 需求引入）：** HEAD（`b7ca398`）上 `npm test` 为 **583 通过 / 1 失败（共 584）**，失败点是 `src-main/i18n/no-hardcoded.test.ts`「待清理清单之外的文件,字符串字面量不含汉字」，报 `src-main/main.ts` 含汉字「文」。

**双层成因：**

1. **真实缺口（S10 遗漏）**：`src-main/main.ts` 仍有 2 处硬编码中文，而词典里对应的**双语 key 早已按 S10 契约备好却从未被调用**（死 key）：
   - `main.ts:884` 的占用错误文案 → 应为 `t('err.llama.busy', { names })`（key：`dict.ts:234` zh / `dict.ts:509` en）；
   - `main.ts:903` 的旧 CUDA DLL 清理日志 → 应为 `t('log.llama.dll.cleaned', { list })`（key：`dict.ts:212` zh / `dict.ts:487` en）。
2. **守护用例回归**：提交 `6a1d692`（S11）重写该用例时丢掉了 `!PENDING.has(f)` 跳过（并删掉文件末尾换行）——仍列在 `PENDING` 的 `main.ts` 从「已知未清理」变成硬断言红灯。另核实：S10 完成提交 `c6d5232` 里 `PENDING` **仍含** `main.ts`，即 S10 分片文档「PENDING 归零」的声明与代码不符。

**处置（2026-10-05 分叉会话，用户裁定「现在就修」）：**

| 项 | 决定 |
|---|---|
| 两处调用点 | 接入**已有** key（`err.llama.busy` / `log.llama.dll.cleaned`）——零新增词条、零死 key |
| 列表分隔符 | 保持 `join(', ')` → 中文日志与改造前逐字一致（zh 零回归）；不改用 `common.listSep` |
| `PENDING` 机制 | **删除**（集合 + 第二条用例 + 相关注释），第一个断言改为对全部目标**无条件硬断言** |
| 新增测试 | `dict.test.ts` 增 1 条用例，锁定这两条 key 的 zh/en 值 |

**验证证据（分叉会话实测）：** `no-hardcoded.test.ts` **2 passed**；`dict.test.ts` **9 passed**；`npm test` = **35 文件 / 584 用例全绿**（原 583 通过 + 1 失败；净 0：−1 条 PENDING 用例 + 1 条词典锁定用例）；`npx tsc -p tsconfig.main.json` exit 0；`npm run build` 通过。

**对本规格实现会话的约束：** `src-main/main.ts` 与 `src-main/i18n/no-hardcoded.test.ts` 已收尾，**勿再改动**；本规格实现只碰 §4 表内 4 个文件。

---

## 9. 验收标准

| # | 检查 | 命令／方式 | 期望 |
|---|---|---|---|
| A1 | 新增回归用例先红后绿 | `npx vitest run src/App.test.ts` | 加模板分支前：2 条新用例 FAIL（pill 不存在）；加分支后 PASS |
| A2 | 词条逐字锁定 | `npx vitest run src-main/i18n/dict.test.ts` | 9 用例全绿（含新增 4 条断言） |
| A3 | 守护用例全绿（回归确认） | `npx vitest run src-main/i18n/no-hardcoded.test.ts` | 2 用例全绿（`PENDING` 机制已由分叉会话删除，见 §8） |
| A4 | 全量零回归 | `npm test` | **35 文件 / 586 用例全绿**（分叉会话后基线为 584 全绿；本次新增 2 条 App 用例） |
| A5 | 构建通过 | `npm run build`（`vite build` + `tsc -p tsconfig.main.json`） | 零错误、零 TS 报错 |
| A6 | 人工真机 | 打包版 + 真实新版本发布 | 下载完成后 pill 保持显示「重启以更新」；点击打开弹窗且按钮为「重启应用」；点「重启应用」→ 共用退出确认 → 更新流程与现状一致 |

> A6 说明：dev 模式 `app.isPackaged === false` → `check_update` 直接返回 `status:'dev'`（`src-main/main.ts:465`），**无法**在开发模式下走通该流程；真机验收需要「用 `build.bat` 打包 + 远端存在更高版本」的发布环境，属可选验收。本规格以 A1–A5 为强制验收。

---

## 10. 风险

| # | 风险 | 影响 | 处置 |
|---|---|---|---|
| R1 | `ready` 相位在会话内被其他路径覆盖 → pill 文本回退 | 用户困惑 | 已核实无覆盖路径（§2.4）；用例 A 断言 ready 后 pill 文本（若未来新增覆盖路径，该用例会红） |
| R2 | 用户误以为「重启以更新」会直接重启应用 | 预期不符 | 与 available/downloading 两态交互完全一致（点击只开弹窗），弹窗内再点「重启应用」才走确认 → 无破坏性动作 |
| R3 | 英文 pill 文案过长挤压 winbar 品牌区 | 布局 | `Restart to update` 与既有 `New version!` 同量级；`.update-pill` 已有 `white-space: nowrap`，winbar 控件在右侧独立块，不换行 |
| R4 | 新增 key 漏加 en → 词典对称用例红 | 构建 | `dict.test.ts`「zh 与 en 的 key 集合完全一致」直接拦截 |
| R5 | 守护用例被误读为「仍留白名单后门」 | 误读 diff | `PENDING` 机制已由分叉会话删除（§8），第一个断言对全部目标无条件硬断言 |
| R6 | 跨重启场景下用户重新打开应用看不到「重启以更新」 | 需重新下载/检查 | 明确列为非目标 N1（用户已裁定）；本规格不引入「启动检测已下载包」的 IPC，避免残留 zip 误报 |

---

## 11. 决策台账（2026-10-05 grill-me 8 问）

| # | 问题 | 决定 |
|---|---|---|
| Q1 | 按钮保持范围 | **仅本次会话**（最小改动）；不做跨重启检测/版本校验 |
| Q2 | ready 态视觉 | **复用实心紫 `.update-pill`**（不新增 CSS、不用 `--busy` 浅紫） |
| Q3 | 文案与 tooltip | pill「重启以更新」/ `Restart to update`；tooltip 与 available 同模式且**带版本号** |
| Q4 | 与弹窗按钮文案是否统一 | **不统一**：新增 2 个独立 key，`update.btn.restart`（「重启应用」）不动 |
| Q5 | `run_update` 失败时 pill | **保持「重启以更新」**（不引入红色/失败态第三分支） |
| Q6 | 交付方式 | **先写 spec + plan**，后续另起会话实现 |
| Q7 | 设计是否定稿 | 定稿，写文档 |
| Q8 | 既有守护用例红灯（`6a1d692` 回归） | 初稿裁定「最小修复（恢复 `!PENDING.has` 跳过）」；**2026-10-05 分叉会话已取代为「真归零」**：接入已有 key + 删除 `PENDING` 机制（见 §8） |

---

## 12. 变更记录

- 2026-10-05：创建。grill-me 8 问定稿（保持范围=本次会话 / 实心紫 / 带版本号 tooltip / 独立 key / 失败不降级 / 先写文档 / 定稿 / 守护用例最小修复）；实测基线 584 用例 1 红并定位到 `6a1d692`。
- 2026-10-05（分叉会话）：Q8 的「最小修复」被取代为「真归零」——`main.ts` 2 处接入已有 key、删除 `PENDING` 机制、补 1 条词典值锁定用例；`npm test` 584 全绿。§3 N6 / §4 / §8 / §9 / §10 / §11 同步修订。
