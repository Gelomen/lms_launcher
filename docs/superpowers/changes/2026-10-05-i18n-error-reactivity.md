# 更新弹窗错误红字 i18n 响应性修复：存 key、渲染时翻译

**日期：** 2026-10-05
**分支：** `master`
**性质：** 缺陷修复（跨进程错误通道契约变更：可译错误改传词典 key；无新依赖、无新词条）
**用户报告：** 中文语言下 [检查更新] 弹窗 llama.cpp 行显示「目标文件仍被占用（llama.cpp 进程可能未完全退出），请关闭外部启动的 llama.cpp 进程后重试」；切换为英文后该红字**未**变英文。

---

## 1. 根因（systematic-debugging 第一阶段）

**翻译发生在「赋值时刻」，而不是「渲染时刻」**：可译字符串被存进 ref/state，切语言只重渲染模板，不会重新翻译已存的字符串。

报告那条的完整链路：

1. 主进程 `installPendingLlama()` 用**主进程当前语言**翻译好后返回（`error: t('err.llama.targetBusy')`，`src-main/main.ts`）；
2. 经 `download_llama_update`（下载完成后自动安装遇 EBUSY）回到渲染端；
3. UpdateModal 把它**当成品字符串**存进 `llamaError`（`src/modules/UpdateModal.vue`）；
4. 渲染点直接当文本用：`llamaBelow()` → `text: llamaError.value || t('update.err.check')`——这里的 `t()` 是渲染时求值（会随语言变），但 `llamaError.value` 不会。

**排除的错误假设：** 主进程语言是跟着切换的（`set_language` → `applyLang`），且主/渲染共用同一份词典 —— 所以**新发生**的错误是正确语言的；坏的只是「已经显示出来的那句」。

**同一类问题的第二处：** LMS 启动器行的 `updateState.errorText` 同样存成品串（渲染端赋值时 `t('update.err.app.*')` + 主进程 `reason`），切语言同样不重译（未被报告，一并修）。

---

## 2. 复现路径（本次用测试固化）

`download_llama_update` 返回 `{ success:false, errorKey:'err.llama.targetBusy' }` → 红字显示 → 切英文 → 红字应变英文。

> 反直觉点（实测确认）：`install_llama_update` 的 **busy 分支不显示红字**（它进入 stop-update 态，名称行下方显示的是「停止并更新」提示），所以用户看到的那条**必然来自下载路径**，不是「停止并更新」点击后的路径。

---

## 3. 改法

**渲染端三通道（`src/i18n.ts` 新增 `ErrFields` / `hasKey` / `errTextOf` / `errFromIpc`）：**

| 字段 | 含义 | 渲染行为 |
|---|---|---|
| `errorKey` + `errorParams` | 可译错误（词典 key + 插值参数，含主进程经 IPC 传来的） | **渲染时** `t(key, params)` → 切语言即时重译 |
| `errorRaw` | 不可译原文（IO/系统消息、IPC 异常 message） | 原样透传，不随语言变 |
| 都没有 | — | 回退 `fallbackKey`（可译通用文案） |
| `errorKey` 不在词典里 | 防御：漏登记/改名 | 回退通用文案，**不把调试串显示给用户** |

**主进程（改传 key，不再传译文）：**

| 位置 | 变更 |
|---|---|
| `src-main/i18n/err-keys.ts`（新增） | IPC 错误 key 单一真源 + `IPC_ERROR_KEYS` 守护清单 |
| `installPendingLlama()` | `err.llama.busy`({names}) / `err.llama.targetBusy` 改 `errorKey`；原文（如 EBUSY 消息）仍走 `error` |
| `download_llama_update` | 透传 `errorKey`；自动安装失败时把 `installPendingLlama` 的 key 一并透出 |
| `download_update` | 完整性校验失败改传 `errorKey`（`err.update.incomplete` + `{actual,expected}` / `err.update.digestMismatch`）；`no-update-task` 的 reason 改 `errorKey` |
| `update-verify.ts` | `IntegrityResult.reason`（译文）→ `reasonKey` + `reasonParams`（不在主进程定死译文） |
| `llama-update-download.ts` | 404 重试耗尽改抛专用 `Dl404Error` → 携带 `errorKey`（原文保留作日志/兜底） |
| `run_update` | **失败由 throw 改结构化返回** `{ ok:false, errorKey }`（`err.update.filesMissing` / `err.update.taskStart` + `{err}`）；渲染端不再走 catch 而是按返回值走 `errFromIpc` → 红字随语言即时重译。意外异常仍走 `errorRaw` 透传 |
| `src/ipc.ts` / `src/llama-update-client.ts` | 结果类型补 `errorKey` / `errorParams`（含新增 `RunUpdateResult`） |

**状态字段迁移：** UpdateModal `llamaError`（原 `ref('')`）与 App `updateState.errorText` 均迁移为三通道；`emit('llama-complete', …)` 仍在事件时解析成字符串（日志是历史文本，**不**随语言变，属期望行为）。

---

## 4. 决策（grill-me 3 问）

| # | 问题 | 决定 |
|---|---|---|
| Q1 | 修复范围 | **弹窗两行统一**（llama 行 + LMS 行）——同一根因、同一交付 |
| Q2 | 跨进程形态 | **直传 key + 未知 key 兜底 + 守护用例**（1′），不引入 code→key 映射表 |
| Q3 | 不可译原文 | 保持 `errorRaw` 原文透传（IO/异常消息不翻译） |

---

## 5. 验证（实测）

| 检查 | 命令 | 结果 |
|---|---|---|
| 新增回归用例（先红后绿） | `npx vitest run src/modules/UpdateModal.test.ts src/App.test.ts` | 4 条新用例改前红、改后绿 |
| `llama` 行 key 重译 | 组件级：中文 → 切英文 → 英文 | PASS |
| LMS 行「key 重译 / 原文透传 / 未知 key 兜底」 | 组件级 3 条 | PASS |
| 端到端（App 真实赋值路径） | 失败（中文）→ 切英文 → 红字变英文 | PASS |
| IPC key 守护 | `dict.test.ts` 新增用例：`IPC_ERROR_KEYS` 在 zh/en 都存在 | PASS |
| `run_update` 结构化失败（先红后绿） | `App.test.ts`：`{ ok:false, errorKey:'err.update.filesMissing' }` → 中文 → 切英文 → 英文 | PASS |
| 全量测试 | `npm test` | **35 文件 / 591 用例全绿**（改前 584） |
| 构建 | `npm run build`（vite + tsc -p tsconfig.main.json） | exit 0 |

> 环境提示：本机偶发 `EBUSY`（Vite 临时缓存文件被占用）导致并行跑全量时丢 1–6 个 happy-dom 文件的 environment，`npx vitest run --no-file-parallelism` 稳定全绿；与本改动无关（用例零失败），重跑即可恢复。

---

## 6. 后续补修（本轮内完成）

**`run_update` 异常通道**（原列为已知边界 ①，grill-me 追加一问后用户裁定「只修 ①」）：该 handler 原先 `throw new Error(t('err.update.filesMissing'/'err.update.taskStart'))`，
译文串经 IPC 异常回到渲染端后落 `errorRaw` → 「不可译原文」透传 → **切语言不重译**（与本次报告的 bug 同类，只是通道不同）。
现改为**结构化返回** `{ ok:false, errorKey }`，渲染端 `onExitConfirmed` 走 `errFromIpc`/`errTextOf`：

- 红字随语言即时重译（`err.update.filesMissing` / `err.update.taskStart`）；
- 成功路径仍由主进程 `app.exit(0)` 终止进程（渲染端收不到 `{ ok:true }`）；
- **意外异常**（真正不可译的技术消息）保留 `catch → errorRaw` 原文透传；
- 日志行 `log.app.update.startFailed` 仍按事件发生时的语言落定（历史日志不随语言变，属期望行为）。

## 7. 剩余已知边界（未改）

**install busy 分支吞掉红字**（既有行为、**非多语言问题**）：占用类安装失败（`busy:true`）进入 stop-update 态后，
`llamaBelow()` 第一优先返回「停止并更新」提示（`update.hint.stopRunning`/`stopReady`，渲染时 `t()` → 切语言正常重译），
`llamaError` 虽已写入却**不渲染**——中英用户**同样看不到占用原因**（原因只落在日志行）。

唯一与多语言相邻之处：被吞掉的文案正是本轮 key 化的 `err.llama.busy` / `err.llama.targetBusy`，
若将来要在红字里显示，直接走 `errTextOf` 即天然支持切语言（基建已就绪）。是否显示属独立 UX 决策，本轮未动。
