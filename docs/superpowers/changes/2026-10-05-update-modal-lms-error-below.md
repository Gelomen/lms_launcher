# 检查更新弹窗：LMS 启动器行的错误提示移到本行下方整行

**日期：** 2026-10-05
**分支：** `master`
**性质：** UI 布局调整（无新增词条、无跨进程契约变更）
**用户反馈：** LMS 启动器行的错误提示原本显示在「版本号的位置」（中段）；希望与 llama.cpp 行一样显示在本行**下一行**，而版本号保持在原位置。

---

## 1. 现状与根因

LMS 启动器行是单行三段 flex：`名称 | 中段 | 按钮`，而**中段被错误文案占用**——`middleKind()` 在
`phase === 'ready'`（带错误）与 `phase === 'error'` 时返回 `'error'`，模板据此把中段染红显示 `errTextOf(item)`。
结果：一旦出错，版本号就被错误文案顶掉（正是用户看到的现象）。

llama.cpp 行则不同：`.llama-section` 为 `flex-wrap: wrap` 布局，提示走末位整行 `.llama-below`（width:100%）。

---

## 2. 改法

| 层 | 变更 |
|---|---|
| 模板 | LMS 行在 `.update-row__action` 之后新增整行节点 `<div v-if="rowHasError(item)" class="update-row__below update-row__error">{{ rowErrText(item) }}</div>`；中段 class 绑定去掉 `update-row__error` 分支 |
| 逻辑 | `middleKind()` 恒为「版本号」语义：`ready/available/downloading → version`；`error → version（有新版号）否则 local（当前本地版本号）否则 ''`；`middleText()` 删除 `'error'` 分支 |
| 逻辑 | 新增 `rowHasError(item)`（`phase === 'error'` 或带 `errorKey`/`errorRaw`）与 `rowErrText(item)`（`errTextOf(item, 'update.err.check')`——无具体原因时回落通用文案） |
| CSS | `.update-row` 加 `flex-wrap: wrap`；`.update-row__below` 与 `.llama-below` 共用整行布局规则（width:100% / 12px / 可换行 / 不截断）；`.update-row__error` 复用为错误行颜色（danger） |

**结果布局：**

```
┌────────────────────────────────────────────────┐
│ LMS 启动器        9.9.9              [重启应用] │   ← 中段=版本号（位置不变）
│ 更新文件缺失（lms-launcher-update.ps1 / ….zip）  │   ← 整行红字（新位置，可换行）
│ llama.cpp         已是最新版本 b10997  [检查更新] │
└────────────────────────────────────────────────┘
```

---

## 3. 决策（grill-me 1 问）

**Q：错误态中段显示什么？**（数据事实：检查失败/网络错误/dev 时 `version` 为空；下载失败时 `version` = 已发现的新版本号）

**决定：有新版号显示新版号，否则回落显示当前本地版本号（都不为空）** —— 下载失败时版本号不被错误挤走（贴合用户「版本号位置不变」的要求）；检查失败时中段回落显示当前版本，不出现空白。

---

## 4. 验证

| 检查 | 命令／方式 | 结果 |
|---|---|---|
| 布局回归（先红后绿） | `npx vitest run src/modules/UpdateModal.test.ts` | 3 条新/改用例改前红、改后绿（错误在本行下方整行 + 中段回落本地版本号 / 有新版本号时中段保留新版号 / ready+错误时中段仍是新版号） |
| 既有选择器零破坏 | 同上 + `src/App.test.ts` | 原断言 `.update-row__error` 仍命中（错误行复用该 class），S8 语言用例与本次新增的切语言用例全绿 |
| 全量测试 | `npm test` | **35 文件 / 593 用例全绿**（改前 591） |
| 构建 | `npm run build` | exit 0 |

**人工目视**：建议打包/开发运行一次，确认「LMS 启动器行出错时下方红字整行显示、版本号仍在原位、长文案换行不截断」。
