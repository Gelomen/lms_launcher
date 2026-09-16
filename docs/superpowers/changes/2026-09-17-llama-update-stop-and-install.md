# 变更：llama.cpp 更新两阶段化（下载不停服，下载完成后「停止并更新」）

日期：2026-09-17
状态：已实施（npm test 436 全绿；npm run build 通过）

## 背景与用户诉求

用户在 llama-server 运行中（安装目录 `D:\AI\llama-cpp`）点「下载更新」，日志：

```
[lms_launcher] llama.cpp · 开始下载更新：https://github.com/ggml-org/llama.cpp/releases/download/b10997/...
EBUSY: resource busy or locked, open 'D:\AI\llama-cpp\ggml-base.dll'
[lms_launcher] llama.cpp · 下载/安装失败：EBUSY: ...
```

根因：旧实现 `downloadAndInstallLlama` 下载 zip 后**立即** `AdmZip.extractAllTo` 覆盖
llama_dir；Windows 上运行中的 `llama-server.exe` 锁住其加载的 `ggml-base.dll`，覆盖写必然 EBUSY。

用户定稿的设计（2026-09-17，ask_user_question 确认）：

> 只是下载，不影响 llama-server 运行吧？只等到下载完成，发现 llama-server 在运行，
> 再提示用户。原本的 spec 和 plan 文档应该有写明：下载完成后，判断 llama-server 有没有在运行，
> 如果有运行，llama.cpp 那一项的更新按钮文本显示「停止并更新」，否则直接更新。

（查证：原 plan `2026-09-14-llama-cpp-windows-update.md` 并未写明该行为——本变更按用户口头定稿实施。）

## 方案

### 主进程 `src-main/llama-update-download.ts`（下载/解压拆两阶段）

- `downloadLlamaZip({ downloadUrl, cudaDllsUrl, proxy, onProgress })`：**只下载** zip 到临时目录，
  不触碰目标目录（运行中的服务不受影响）；失败时清理临时文件。
- `extractLlamaZips(zips, targetDir)`：将已下载的 zip 解压覆盖（EBUSY 时携带错误消息返回，不抛）。
- `findLockedFiles(dir, filenames)`：文件占用探测——以 `openSync(p, 'a+')` 尝试打开
  `llama-server.exe` / `ggml-base.dll`：可打开 = 空闲；EBUSY/EPERM/EACCES = 被锁。
  覆盖**外部启动**（非 launcher 托管）的 llama.cpp 进程——进程状态机看不到的场景。
- `downloadAndInstallLlama` 保留为两阶段组合（下载 + 解压 + finally 清理），供直接「下完即装」的调用。

### 主进程 `src-main/main.ts`（三 IPC 契约）

- `download_llama_update`：只下载。下载完成后判定运行：
  - **运行中**（`ps.isRunning() || ps.state === 'stopping'` 或文件被锁）→ zip 暂存于模块级
    `pendingLlamaUpdate`（内存态，重启即失），返回 `{ success: true, installed: false }`；
  - **未运行** → 立即安装（等价旧行为，用户无感知），返回 `{ success: true, installed: true }`。
- `get_pending_llama_download`：返回 `{ pending, serverRunning, lockedFiles }`，供 UI 在
  弹窗打开时「adopt」暂存包（上次下载完成但用户关窗，重开不必重新下载）。
- `install_llama_update`：「停止并更新」的执行体（内部函数 `installPendingLlama` 亦供下载
  自动安装路径复用）：
  1. `ps.stopGraceful(3)` 停 launcher 托管的 llama-server（SIGTERM → 3s → `taskkill /T /F`）；
  2. 再探测文件占用——外部进程仍在 → 友好错误「文件仍被占用（ggml-base.dll），请关闭外部启动的
     llama.cpp 进程后重试」（不再裸露 EBUSY 堆栈）；
  3. 解压覆盖 → `verifyLlamaInstall`（期望 tag 由下载 URL 推导）→ 成功后清空 pending。

### 渲染端

- `src/llama-update-client.ts`：`LlamaDownloadResult` 增加 `installed?: boolean`；
  新增 `getPendingLlamaDownload()` / `installLlamaUpdate()`。
- `src/modules/UpdateModal.vue`：
  - llama 行新增 `stop-update` 相：按钮「停止并更新」，名称行下方灰字提示
    （运行中：「llama-server 正在运行，点击「停止并更新」停止服务并完成安装」；
    adopt 路径服务已停：「更新包已下载完成，点击「停止并更新」完成安装」）；
  - 下载返回 `installed: false` → 切 `stop-update`；点击 → `installLlamaUpdateInternal()`
    （复用 downloading 视觉通道：按钮禁用 + 进度条空载）→ 成功后保存配置 +
    `llama-complete(true)` + 重查（通常落 up-to-date）；失败 → error 相「重试」+ 名称行下方红字原因
    （安装/下载失败路径同步把 `llamaUpdateStatus` 置 'error'，红字提示才显示）；
  - 打开弹窗：检查落定后 `adoptPendingLlamaDownload()`——有暂存包直接切「停止并更新」（跳过重新下载）。
  - 按钮恒定宽度无需调整：`min-width 99.03px` 基准「下载中 100%」仍为最宽（「停止并更新」= 5 个 CJK
    无数字，实测推算约 77px），既有「七态按钮同尺寸」回归用例保持有效。
- `src-main/preload.ts`：`invoke` 为通用透传，新 IPC 无需白名单变更。

### 边界与取舍

- **pending 只存内存**：主进程重启后暂存包路径指向的临时 zip 已失效，`pendingLlamaUpdate` 不持久化——
  重启后用户重新点「下载更新」即可（下载阶段不再受影响，可安全重下）。
- **下载阶段绝不触碰 llama_dir**：满足用户「只是下载，不影响运行」的硬约束；即使解压最终失败，
  正在运行的服务与现有文件完好。
- **占用探测的局限**：`openSync` 探测的是「该文件能否被打开」，Windows 共享读句柄场景下个别
  进程可能不触发 EBUSY；因此保留 `extractLlamaZips` 的真实错误通道兜底（失败时 error 相 + 红字），
  双保险而非单点依赖探测。

## 测试

- `src-main/llama-update-download.test.ts`（25 例，+13）：
  - `findLockedFiles`：空闲 / EBUSY / EPERM / 文件不存在跳过 / EIO 不视为锁定；
  - `downloadLlamaZip`：成功返回路径且**不实例化 AdmZip**（下载阶段绝不解压）/ 主 zip 失败清理 /
    dlls 失败双清理；
  - `extractLlamaZips`：成功 / 双 zip / EBUSY 携带消息。
- `src/modules/UpdateModal.test.ts`（32 例，+5）：
  - 下载返回 `installed: false` → 按钮「停止并更新」可点 + 灰字提示（mock 的 pending 状态
    随下载完成置位，模拟主进程时序，防 adopt 抢占）；
  - 点击「停止并更新」→ 调 `install_llama_update`，安装中按钮禁用；成功后保存配置 +
    `llama-complete(true)` + 重查落「已是最新版本」；
  - 安装失败（外部进程占用友好错误）→「重试」+ 名称行下方红字「文件仍被占用」；
  - adopt：打开弹窗时已有暂存包且服务已停 → 直接「停止并更新」，**不发起下载**；
  - 无暂存包 → 不误入 stop-update（adopt 默认安全）。
- npm test 436 全绿（30 文件）；npm run build（vite + tsc main）通过。

## 验收

- [x] npm test 通过（436）
- [x] npm run build 通过
- [ ] 用户真机复测：llama-server 运行中点「下载更新」→ 下载不中断服务、下载完成后按钮显示
  「停止并更新」→ 点击后服务停止 + 安装完成 + 重查「已是最新版本」
- [ ] 用户真机复测：llama-server 未运行时点「下载更新」→ 下载完成自动安装（无二次点击）

## 不做的事

- 不自动停服：用户定稿是「下载完成后提示」，下载/安装前均不主动 stopGraceful（仅「停止并更新」
  点击时才停）。
- 不持久化 pending 包（重启即失，重新下载代价可接受，且临时目录本身会被系统清理）。
- 不改 LMS 启动器行的七态语义（stop-update 相仅 llama 行进入，BUTTONS 映射保留完整）。
- 不实现 Windows 文件句柄枚举（`handle.exe` 等外部依赖不可靠）；openSync 探测 + 真实错误兜底已覆盖。
