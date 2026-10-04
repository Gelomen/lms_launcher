# LMS 启动器 i18n S10:主进程日志与错误消息 设计与实现规格

**日期:** 2026-10-04
**分支:** feat/i18n
**状态:** 已定稿(2026-10-04 grill-me 13 问),实现未开始
**上游权威:** [2026-09-22-i18n-design.md](./2026-09-22-i18n-design.md)(设计总纲)+ [2026-09-22-i18n-slices.md](./2026-09-22-i18n-slices.md)(分片卡 S10)
**升级依据:** 设计总纲 §5 判据 1(跨进程契约变更)+ 判据 4(>3 文件且含判断)——本分片需独立 spec + plan

> 与设计总纲冲突时以设计总纲为准;与分片卡冲突时以本文件为准(分片卡同步回记)。

---

## 1. 目标

消灭主进程与 App 外壳的全部硬编码中文日志/错误文案,使其随语言切换,且中文逐字零回归。

**覆盖范围(9 个源文件 + 1 个渲染端文件):**

| # | 文件 | 内容 |
|---|---|---|
| 1 | `src-main/main.ts` | 约 48 个 `emitLog` 站点(含插值)、`download_update` reason、原生文件对话框过滤名 |
| 2 | `src-main/config.ts` | `YAML:` / `VALIDATION:` / `MISSING:` 后缀、代理校验 |
| 3 | `src-main/build.ts` | `VALIDATION:` / `MISSING:` 后缀 |
| 4 | `src-main/vram.ts` | 3 条 `GGUF:` 错误 |
| 5 | `src-main/update-verify.ts` | 2 条完整性 reason |
| 6 | `src-main/llama-update-download.ts` | 404 文案、`installVerifyMessage` 3 分支 |
| 7 | `src-main/llama-check.ts` | 4 态启动检测行 |
| 8 | `src-main/gpu-stats.ts` | 7 条 GPU 诊断行(经 `main.ts:979` 进日志面板) |
| 9 | `src-main/process.ts` | `PROC:` / `STATE:` 中文后缀(经 `process-exit` 在日志区可见) |
| 10 | `src/App.vue` | 12 条 `appendSys` 日志行 + 窗口三键 aria-label |

**关键实测事实(规划期确认):**

- `gpu-stats.ts` 的 `log` 回调在 `main.ts:979` 被包装为 `emitLog('[lms_launcher] GPU · ' + line, 'sys')` → 用户可见。
- `process.ts` 的启动失败消息经 `onExitCb(-1, err)` → `main.ts:310-314` → `process-exit` 事件 → `App.vue:120` 日志行 → 用户可见。
- `App.vue:101-103` 的 `appendSys` 自动补 `[lms_launcher] ` 前缀(行首已有则不加)。
- 词典当前 **0 个 `err.*` key**;S10 是 `err` scope 的首次使用(scope 已在设计总纲 §3.2 白名单内)。

---

## 2. 非目标 / 不译边界(在 §1.2 基础上补充)

1. **固定前缀留在代码拼接,不进词典**:`[lms_launcher] `、`MISSING: `、`VALIDATION: `、`YAML: `、`PROC: `、`STATE: `、`GGUF: `、`[INFO] `、`[ERROR] `、`[node] `。
2. **技术数据不译**:路径、URL、版本号/tag、config id、参数 flag、HTTP 状态码、文件名清单、`MB` / `GB` / `%` / `code=` 数值格式。
3. **专名不译**:`llama.cpp`、`llama-server`、`llama-server.exe`、`GGUF`、`CUDA`、`DLL`、`GPU`、`SHA-256`、`EPERM`、`EBUSY`、`schtasks`、`params_default`、`llama_launch_configs.yaml`、`llama_params.yaml`、`lms-launcher-update.ps1` / `.zip`。
4. **llama-server 原生 stdout/stderr 原样透传**(`process.ts` 的管道内容)。
5. **不引入新依赖,不改 `translate()` 契约**(不加复数/嵌套等能力)。
6. **不改渲染端既有视觉与交互**:App.vue 仅改字符串来源与 `code` 判定,零 CSS。
7. **已产生的日志行不回改**(`§3.5`),主进程日志在产生时刻取当时语言。

---

## 3. 架构与跨切片不变量

### 3.1 主进程 t() 的取用

- `src-main/i18n/index.ts` 已导出 `t(key, params?)`(S0 落地),S10 各文件按相对路径 import:
  - `src-main/*.ts` → `import { t } from './i18n'`
  - `src-main/main.ts` → `import { t } from './i18n'`
- 语言权威与时序不变(`§3.3`):`whenReady` 首行 `initI18n()`;`set_language` 更新主进程语言。**切换语言后新产生的日志用新语言,历史行不动**。
- 纯模块(`config.ts` / `build.ts` / `vram.ts` / `update-verify.ts` / `llama-check.ts` / `gpu-stats.ts` / `process.ts`)import `./i18n`,不引入 electron 依赖(i18n/index.ts 为纯模块,零 electron)。

### 3.2 key 契约(本分片新增 112 条 + 复用 3 条)

**结构:** 沿用 §3.2 的 3–4 段点分命名,按子系统二级分组。

| 分组 | 含义 |
|---|---|
| `log.launcher.*` | main.ts 的启动器更新流(检查/下载/安装/计划任务/设置) |
| `log.llama.*` | main.ts + llama-update-download.ts 的 llama.cpp 更新流 |
| `log.dircheck.*` | llama-check.ts 的 4 态启动检测行 |
| `log.dirvalid.*` | App.vue 的目录校验行 |
| `log.gpu.*` | gpu-stats.ts 诊断行 |
| `log.proc.*` | process.ts 生命周期行(预留,本分片仅 err.proc.*) |
| `log.app.*` | App.vue 的其余 appendSys 行 |
| `err.config.*` / `err.build.*` / `err.vram.*` / `err.update.*` / `err.llama.*` / `err.launch.*` / `err.proc.*` | 错误消息后缀(前缀在代码拼) |
| `common.*` / `app.*` / `settings.*` | 复用与少量新增(见 §3.4) |

**取值规则:**

1. **整句 key**:值含主题词与标点(如 `LMS 启动器 · …`、`llama.cpp · …`),代码只拼不译前缀。
2. **同语义复用一条 key**:同一文案既记日志又返回错误时只建一条,另一处引用(Q4)。
3. **err.* 值只存后缀**,前缀在调用点拼接(Q3):`throw new Error('MISSING: ' + t('err.config.missing'))`。
4. **可复用片段独立成 key 并用占位符注入**(Q11):`log.proxySuffix`、`log.launcher.dl.digestOk`。
5. **en 复数改写规避**(Q8):`Options: {n}` / `GPUs detected: {n}` / `attempt {n}` / `retry {n}/3`。
6. **zh 值必须与现源码逐字一致**——这是「现有中文断言不动」的前提。

### 3.3 zh 逐字零回归的机制

- 词典 zh 树的值 = 现源码字符串字面量**逐字**(含全角标点、空格、`…`、`——`)。
- `src/test-setup.ts` 已把双端语言固定为 zh(S0),故主进程 `t()` 在测试中恒取 zh。
- 因此 `config.test.ts`(52 条)/ `vram.test.ts`(68 条)/ `llama-update-download.test.ts`(80 条)/ `build.test.ts` / `update-verify.test.ts` / `llama-check.test.ts` 的既有中文断言**一行不改**。

### 3.4 复用既有 key(不新增)

| 位置 | 复用 key | 说明 |
|---|---|---|
| `config.ts:244` 端口范围校验 | `settings.proxy.err.port` | zh 值逐字相同(`端口须为 1–65535 的数字`) |
| `build.ts:40` 配置不存在 | `err.config.notFound` | zh 值逐字相同(`配置 "{id}" 不存在`),与 config.ts:166 同语义 |
| `main.ts:632` `cleaned.join('、')` | `common.listSep` | zh `、` / en `, ` |

### 3.5 跨进程契约变更(Q2,命中设计总纲 §5 判据 1)

**现状:** `main.ts:505` `return { ok: false, reason: '尚无更新任务（请先检查更新）' }`;`App.vue:261` 用 `r.reason.includes('尚无更新任务')` 判定「下载失步自愈」。

**改为结构化 reasonCode:**

```ts
// src-main/main.ts
type DownloadUpdateResult =
  | { ok: true }
  | { ok: false; reason: string; code?: 'no-update-task' };
// 505 行:
if (!pendingUpdate) {
  return { ok: false, code: 'no-update-task', reason: t('err.update.noTask') };
}
```

```ts
// src/App.vue:261
if (r.code === 'no-update-task') {   // 原 r.reason.includes('尚无更新任务')
```

- `src/ipc.ts` 若已声明 `download_update` 返回类型,同步加 `code?` 字段。
- `reason` 仍以当前语言返回并保留(展示兜底),但不再用于判定。
- 语言切换不再影响判定:code 与语言解耦。
- 必须补一条 App 级回归:`{ ok: false, code: 'no-update-task', reason: '任意文案' }` → 回落 idle + 自动重查(原 `App.test.ts:751-769` 用例改造,含 en 变体)。

### 3.6 原生文件对话框过滤名(Q7)

`main.ts:333/335` 的 `name` 改为词典:

- `app.dialog.filterModel`:zh `模型文件` / en `Model files`
- `app.dialog.filterJinja`:zh `Jinja 模板文件` / en `Jinja template files`

**这是本分片唯一的中文界面文案变更**(原为英文),按附录 B D2 落实,登记为获批例外。

### 3.7 窗口三键 aria-label(Q13)

`App.vue:331-333` 的 4 条静态中文 aria 改 `t()`:`app.winbar.minimize` / `restore` / `maximize` / `close`。

- 取代 S1 的「aria-label 走静态中文」决策,在分片卡 S1 与 S10 双向回记。
- 2026-09-23 的 CDP 根因修复(tooltip `::after` 越界)不受影响:只换 aria 文本,不加 tooltip。

---

## 4. key 契约全表(112 条新增 + 3 条复用)

### 4.1 `log.launcher.*` / `err.launch.*` / `err.update.*`(27 条)

| key | zh | en |
|---|---|---|
| `log.proxySuffix` | `（代理 {url}）` | ` (via {url})` |
| `log.launcher.settings.proxySaved` | `设置 · 已保存代理 {url}` | `Settings · Proxy saved: {url}` |
| `log.launcher.settings.proxyCleared` | `设置 · 已清空代理` | `Settings · Proxy cleared` |
| `log.launcher.start.cmd` | `启动命令 · {cmd}` | `Launch command · {cmd}` |
| `log.launcher.stop.sent` | `停止指令已发送` | `Stop command sent` |
| `log.launcher.cfg.backfillFail` | `params_default 回填失败：{msg}` | `params_default backfill failed: {msg}` |
| `log.launcher.check.http` | `LMS 启动器 · 检查更新失败：HTTP {status}{proxy}` | `LMS Launcher · Update check failed: HTTP {status}{proxy}` |
| `log.launcher.check.parse` | `LMS 启动器 · 检查更新失败：无法解析 release 信息{proxy}` | `LMS Launcher · Update check failed: cannot parse release info{proxy}` |
| `log.launcher.check.err` | `LMS 启动器 · 检查更新失败：{msg}{proxy}` | `LMS Launcher · Update check failed: {msg}{proxy}` |
| `log.launcher.dl.start` | `LMS 启动器 · 更新 · 开始下载：{url}` | `LMS Launcher · Update · Download started: {url}` |
| `log.launcher.dl.retry` | `LMS 启动器 · 更新 · 写入被系统拒绝（EPERM，多为杀毒实时扫描锁文件），稍后重试（第 {n} 次尝试）` | `LMS Launcher · Update · Write denied by the system (EPERM, often antivirus scanning a locked file), retrying (attempt {n})` |
| `log.launcher.dl.reason` | `LMS 启动器 · 更新 · {reason}` | `LMS Launcher · Update · {reason}` |
| `log.launcher.dl.done` | `LMS 启动器 · 更新 · 下载完成 {size}MB{digest}` | `LMS Launcher · Update · Download complete {size}MB{digest}` |
| `log.launcher.dl.digestOk` | `（SHA-256 校验通过）` | ` (SHA-256 verified)` |
| `log.launcher.dl.fail` | `LMS 启动器 · 更新 · 下载失败：{msg}{proxy}` | `LMS Launcher · Update · Download failed: {msg}{proxy}` |
| `log.launcher.upd.scriptStarted` | `LMS 启动器 · 更新 · 已启动更新脚本，应用即将退出` | `LMS Launcher · Update · Update script started, the app will exit` |
| `log.launcher.upd.wroteBootstrap` | `已写入更新启动器 · cmd={cmd} · ps1={ps1} · zip={zip}` | `Update bootstrapper written · cmd={cmd} · ps1={ps1} · zip={zip}` |
| `log.launcher.upd.taskCreated` | `已创建并触发计划任务 {name} · ST={st} · TR={tr}` | `Scheduled task created and triggered {name} · ST={st} · TR={tr}` |
| `log.launcher.upd.taskFail` | `LMS 启动器 · 更新失败：计划任务创建/触发失败（{err}）` | `LMS Launcher · Update failed: scheduled task creation/trigger failed ({err})` |
| `log.launcher.upd.schtasksFail` | `schtasks 失败：{err}` | `schtasks failed: {err}` |
| `log.launcher.upd.taskCleaned` | `LMS 启动器 · 更新 · 已清理残留计划任务 {list}` | `LMS Launcher · Update · Stale scheduled task cleaned: {list}` |
| `err.launch.noDir` | `未配置 llama.cpp 目录` | `llama.cpp directory not set` |
| `err.launch.specDraft` | `--spec-type 为 draft-dflash/dspark 时须填写 --spec-draft-model（-md）文件` | `--spec-draft-model (-md) file is required when --spec-type is draft-dflash/dspark` |
| `err.update.noTask` | `尚无更新任务（请先检查更新）` | `No update task. Check for updates first.` |
| `err.update.verifyFallback` | `校验失败` | `Verification failed` |
| `err.update.filesMissing` | `更新文件缺失（lms-launcher-update.ps1 / lms-launcher-update.zip）` | `Update files missing (lms-launcher-update.ps1 / lms-launcher-update.zip)` |
| `err.update.taskStart` | `更新任务启动失败：{err}` | `Failed to start the update task: {err}` |

### 4.2 `log.llama.*`(26 条)

| key | zh | en |
|---|---|---|
| `log.llama.ver.local` | `llama.cpp · 本地版本：{version}` | `llama.cpp · local version: {version}` |
| `log.llama.ver.localFail` | `llama.cpp · 获取本地版本失败：{err}` | `llama.cpp · failed to get local version: {err}` |
| `log.llama.ver.remoteFail` | `llama.cpp · 获取远程版本失败{proxy}` | `llama.cpp · failed to get remote version{proxy}` |
| `log.llama.ver.check` | `llama.cpp · 版本检查：{status}（本地 {local} vs 远程 {remote}）` | `llama.cpp · version check: {status} (local {local} vs remote {remote})` |
| `log.llama.ver.listFail` | `llama.cpp · 获取版本列表失败{proxy}` | `llama.cpp · failed to get version list{proxy}` |
| `log.llama.ver.list` | `llama.cpp · 已获取远程版本列表（{n} 个选项）` | `llama.cpp · remote version list fetched (options: {n})` |
| `log.llama.dl.start` | `llama.cpp · 开始下载更新：{url}` | `llama.cpp · download started: {url}` |
| `log.llama.dl.cuda` | `llama.cpp · CUDA DLLs 下载地址：{url}` | `llama.cpp · CUDA DLLs download URL: {url}` |
| `log.llama.dl.404` | `llama.cpp · 下载 404——该版本资产可能还在上传（nightly 发布后资产陆续就位），等待 {n}/3 次重试...` | `llama.cpp · download 404 - assets for this version may still be uploading (nightly assets arrive over a few minutes), waiting, retry {n}/3...` |
| `log.llama.dl.fail` | `llama.cpp · 更新失败，稍后再试` | `llama.cpp · update failed, try again later` |
| `log.llama.dl.done` | `llama.cpp · 下载完成` | `llama.cpp · download complete` |
| `log.llama.install.busyRunning` | `llama-server 正在运行` | `llama-server is running` |
| `log.llama.install.busyFiles` | `文件被占用（{names}）` | `files in use ({names})` |
| `log.llama.install.busyHint` | `{reason}，停止服务后点「停止并更新」完成安装` | `{reason}. Click "Stop & Update" to stop the service and finish installing` |
| `log.llama.install.stopFirst` | `llama.cpp · 停止 llama-server 后更新...` | `llama.cpp · stopping llama-server before updating...` |
| `log.llama.install.stopped` | `llama.cpp · llama-server 已停止` | `llama.cpp · llama-server stopped` |
| `log.llama.install.stillBusy` | `llama.cpp · 文件仍被占用：{names}（请关闭外部启动的 llama-server 后重试）` | `llama.cpp · files still in use: {names} (close the externally started llama-server and retry)` |
| `log.llama.install.start` | `llama.cpp · 开始安装更新...` | `llama.cpp · installing update...` |
| `log.llama.install.fail` | `llama.cpp · 安装失败：{err}` | `llama.cpp · install failed: {err}` |
| `log.llama.install.doneVersion` | `安装完成：{version}` | `Installed: {version}` |
| `log.llama.install.doneUnknown` | `安装完成：版本号未知` | `Installed: version unknown` |
| `log.llama.install.doneUnverified` | `安装完成（未能确认本地版本号：{err}）` | `Installed (could not confirm local version: {err})` |
| `log.llama.dll.cleaned` | `llama.cpp · 清理旧 CUDA DLL：{list}` | `llama.cpp · stale CUDA DLLs removed: {list}` |
| `log.llama.dll.skipped` | `llama.cpp · 以下 CUDA DLL 被占用未删除：{list}（可稍后手动删除）` | `llama.cpp · CUDA DLLs in use, not removed: {list} (can be deleted manually later)` |
| `log.llama.cfg.saved` | `llama.cpp · 更新配置已保存` | `llama.cpp · update config saved` |
| `log.llama.cfg.saveFail` | `llama.cpp · 保存更新配置失败：{msg}` | `llama.cpp · failed to save update config: {msg}` |

### 4.3 `err.config.*` / `err.build.*`(12 条新增 + 2 条复用)

| key | zh | en |
|---|---|---|
| `err.config.yamlLoadFail` | `{name} 失败: {msg}` | `{name} failed: {msg}` |
| `err.config.yamlEmpty` | `{name} 失败: 空文件` | `{name} failed: empty file` |
| `err.config.paramKey` | `参数 key "{k}" 不是小写字母开头的字母数字串` | `Param key "{k}" must be an alphanumeric string starting with a lowercase letter` |
| `err.config.missing` | `llama_launch_configs.yaml 不存在（新建第一个模板后自动生成）` | `llama_launch_configs.yaml not found (created automatically after you add your first template)` |
| `err.config.idGen` | `id 生成失败（无法产生唯一值）` | `Failed to generate id (no unique value available)` |
| `err.config.idFormat` | `id 须为小写字母开头的字母数字串（不含空格/大写），最长 32 位` | `id must be an alphanumeric string starting with a lowercase letter (no spaces or uppercase), max 32 chars` |
| `err.config.notFound` | `配置 "{id}" 不存在` | `Template "{id}" not found` |
| `err.config.proxyPortEmpty` | `端口不能为空（或留空禁用代理）` | `Port cannot be empty (leave both fields empty to disable proxy)` |
| `err.build.required` | `必填参数 "{name}" 未填写` | `Required param "{name}" is missing` |
| `err.build.unknownParam` | `参数 "{k}" 不在 llama_params.yaml 的映射表里` | `Param "{k}" is not in the llama_params.yaml mapping` |
| `err.build.idFormat` | `id 须为小写字母开头的字母数字串` | `id must be an alphanumeric string starting with a lowercase letter` |
| `err.build.exeMissing` | `llama-server.exe 不存在（目录：{dir}）` | `llama-server.exe not found (directory: {dir})` |

**复用:** `config.ts:244` → `settings.proxy.err.port`;`build.ts:40` → `err.config.notFound`。

### 4.4 `err.vram.*` / `err.update.*` / `err.llama.*`(8 条)

| key | zh | en |
|---|---|---|
| `err.vram.tooSmall` | `文件过小` | `File too small` |
| `err.vram.badMagic` | `非 GGUF 文件（magic 不符）` | `Not a GGUF file (bad magic)` |
| `err.vram.noMeta` | `缺少层数/维度元数据（{n} 个 KV 内未找到 n_layer/block_count 与 n_embd/embedding_length）` | `Missing layer/embedding metadata (n_layer/block_count and n_embd/embedding_length not found in {n} KV entries)` |
| `err.update.incomplete` | `下载不完整：收到 {actual} 字节 / 预期 {expected} 字节，请重试` | `Incomplete download: received {actual} bytes / expected {expected} bytes, retry` |
| `err.update.digestMismatch` | `校验失败：文件与发布版本不一致（SHA-256 不匹配），请重试` | `Verification failed: file does not match the release (SHA-256 mismatch), retry` |
| `err.llama.dl404` | `下载失败：HTTP 404——该版本的下载资产可能还在上传（nightly 发布后资产需几分钟陆续就位，稍后重试即可）；若持续 404 请检查代理设置` | `Download failed: HTTP 404 - assets for this version may still be uploading (nightly assets arrive over a few minutes, retry later); if 404 persists, check proxy settings` |
| `err.llama.busy` | `文件仍被占用（{names}），请关闭外部启动的 llama.cpp 进程后重试` | `Files still in use ({names}). Close the externally started llama.cpp process and retry.` |
| `err.llama.targetBusy` | `目标文件仍被占用（llama.cpp 进程可能未完全退出），请关闭外部启动的 llama.cpp 进程后重试` | `Target files still in use (the llama.cpp process may not have exited). Close the externally started llama.cpp process and retry.` |

### 4.5 `log.dircheck.*` / `log.dirvalid.*` / `log.gpu.*` / `err.proc.*`(17 条)

| key | zh | en |
|---|---|---|
| `log.dircheck.unset` | `启动检测 · 未配置 llama.cpp 安装目录` | `Startup check · llama.cpp directory not set` |
| `log.dircheck.missing` | `启动检测 · llama.cpp 安装目录不存在：{dir}` | `Startup check · llama.cpp directory does not exist: {dir}` |
| `log.dircheck.exe` | `启动检测 · 目录中未找到 llama-server.exe：{dir}` | `Startup check · llama-server.exe not found in directory: {dir}` |
| `log.dircheck.ok` | `启动检测 · llama-server.exe 已找到：{dir}` | `Startup check · llama-server.exe available: {dir}` |
| `log.dirvalid.ok` | `目录校验 · llama-server.exe 已找到：{dir}` | `Directory check · llama-server.exe available: {dir}` |
| `log.dirvalid.missing` | `目录校验 · 未找到 llama-server.exe：{dir}` | `Directory check · llama-server.exe not found: {dir}` |
| `log.gpu.staticSpawnFail` | `GPU 静态查询启动失败：{err}` | `GPU static query failed to start: {err}` |
| `log.gpu.staticFail` | `GPU 静态查询失败：{err}` | `GPU static query failed: {err}` |
| `log.gpu.staticOk` | `GPU 静态查询成功：{n} 张卡 → {names}` | `GPU static query ok: GPUs detected: {n} → {names}` |
| `log.gpu.staticParseFail` | `GPU 静态查询结果解析失败（卡名/上限回退占位值），原始输出：{out}` | `GPU static query result parse failed (falling back to placeholder names/limits), raw output: {out}` |
| `log.gpu.staticExit` | `GPU 静态查询异常退出 code={code}（卡名/上限回退占位值）` | `GPU static query exited unexpectedly code={code} (falling back to placeholder names/limits)` |
| `log.gpu.sampleSpawnFail` | `GPU 采样进程启动失败：{err}` | `GPU sampling process failed to start: {err}` |
| `log.gpu.sampleErr` | `GPU 采样进程错误：{err}` | `GPU sampling process error: {err}` |
| `err.proc.alreadyRunning` | `已有进程在运行` | `A process is already running` |
| `err.proc.spawnFail` | `{exe} 启动失败: {err}` | `{exe} failed to start: {err}` |
| `err.proc.noChild` | `无子进程` | `No child process` |
| `err.proc.noPipe` | `stdout/stderr 管道未打开` | `stdout/stderr pipe not open` |

### 4.6 `log.app.*` / `app.winbar.*` / `app.dialog.*` / `common.*`(22 条新增 + 3 条复用)

| key | zh | en |
|---|---|---|
| `log.app.start.missing` | `启动失败（配置缺失）· {msg}` | `Launch failed (missing config) · {msg}` |
| `log.app.start.invalid` | `启动失败（校验未过）· {msg}` | `Launch failed (validation error) · {msg}` |
| `log.app.start.fail` | `启动失败 · {msg}` | `Launch failed · {msg}` |
| `log.app.stop.fail` | `停止失败 · {msg}` | `Stop failed · {msg}` |
| `log.app.exit` | `进程退出 code={code}` | `Process exited code={code}` |
| `log.app.update.available` | `LMS 启动器 · 发现新版本 v{version}` | `LMS Launcher · New version v{version} available` |
| `log.app.update.latest` | `LMS 启动器 · 当前已是最新版本` | `LMS Launcher · Already up to date` |
| `log.app.update.dlStart` | `LMS 启动器 · 开始下载新版本…` | `LMS Launcher · Downloading new version...` |
| `log.app.update.dlDone` | `LMS 启动器 · 下载完成` | `LMS Launcher · Download complete` |
| `log.app.update.dlFail` | `LMS 启动器 · 更新下载失败 · {reason}` | `LMS Launcher · Update download failed · {reason}` |
| `log.app.update.runFail` | `LMS 启动器 · 启动更新失败 · {err}` | `LMS Launcher · Failed to start update · {err}` |
| `log.app.llama.done` | `llama.cpp 更新完成` | `llama.cpp update complete` |
| `log.app.llama.fail` | `llama.cpp 更新失败 · {err}，稍后再试` | `llama.cpp update failed · {err}, try again later` |
| `app.winbar.minimize` | `最小化` | `Minimize` |
| `app.winbar.restore` | `还原` | `Restore` |
| `app.winbar.maximize` | `最大化` | `Maximize` |
| `app.winbar.close` | `关闭` | `Close` |
| `app.dialog.filterModel` | `模型文件` | `Model files` |
| `app.dialog.filterJinja` | `Jinja 模板文件` | `Jinja template files` |
| `common.unknown` | `未知` | `unknown` |
| `common.unknownError` | `未知错误` | `unknown error` |
| `common.unknownReason` | `未知原因` | `unknown reason` |
| `common.listSep` | (复用,`、`) | (复用,`, `) |
| `settings.proxy.err.port` | (复用) | (复用) |
| `err.config.notFound` | (复用,见 §4.3) | (复用) |

> 表内 `…` 与 `...` 逐字区分:zh 的下载态用全角省略号 `…`(与现源码一致),`llama.cpp · 开始安装更新...` / `下载 404...` 用半角三点(与现源码一致)。

---

## 5. 测试策略

### 5.1 既有中文断言不动

依赖 §3.3 的 zh 逐字一致。`npm test` 的 34 文件 / 570 用例基线不得减少,基线必须保持全绿。

### 5.2 零硬编码中文守护用例(Q9)

新建 `src-main/i18n/no-hardcoded.test.ts`:

- 扫描 `src-main/*.ts`(不含 `*.test.ts`)与 `src/App.vue`;
- **排除** `src-main/i18n/dict.ts`(文案真源);
- 简易 tokenizer:逐字符跟踪 `'…'` / `"…"` / 反引号 / `//` / `/* */` / `<!-- -->`,只检查**字符串字面量内**的 Han 字符;
- 维护 `PENDING` 待清理文件清单:测试断言「不在 `PENDING` 且不在 `EXCLUDE` 的文件,字符串字面量中零 Han 字符」;
- `PENDING` 随任务批次逐项移除(T1 全量 → T7 为空),**归零即验收证据**;
- 最终态(`PENDING = []`)为强守护:任何新增硬编码中文立即失败。

### 5.3 各模块 en 冒烟(每个可测模块 1–3 条)

| 文件 | 新增用例 |
|---|---|
| `src-main/config.test.ts` | en 下 `MISSING:` / `VALIDATION:` 前缀保留 + 后缀英文;端口校验走 `settings.proxy.err.port` |
| `src-main/build.test.ts` | en 下 `VALIDATION: Required param "…" is missing` |
| `src-main/vram.test.ts` | en 下 3 条 GGUF 错误(前缀 `GGUF: ` 保留) |
| `src-main/update-verify.test.ts` | en 下 2 条 reason |
| `src-main/llama-update-download.test.ts` | en 下 404 文案 + 3 分支 `installVerifyMessage` |
| `src-main/llama-check.test.ts` | en 下 4 态 |
| `src-main/gpu-stats.test.ts` | en 下诊断行(1–2 条) |
| `src-main/process.test.ts` | en 下 `PROC: … failed to start` 与 `STATE: ` 后缀 |
| `src/modules/DirModule.test.ts` 或 `src/App.test.ts` | en 下目录校验行、启动/停止失败行 |
| `src/App.test.ts` | en 下 update 日志行 + `code: 'no-update-task'` 自愈回归(zh/en 各 1)+ 三键 aria en |
| `src-main/i18n/dict.test.ts` | 已有 key 集合一致 + 无空值;新增一条:`err.*` / `log.*` 分区非空校验(可选) |

主进程 `main.ts` 的 en 输出不做单测(§Q10),由词典守护 + 本 spec §4.1/§4.2 逐条列值审校保证。

### 5.4 人工验收

1. en 模式实机跑一遍更新流(检查 → 下载 → 安装/停止并更新),确认日志区无中文;
2. zh 模式逐字对照 `git stash` 前后日志输出(零回归);
3. en 模式确认三键 aria、原生对话框过滤名、GPU 卡片诊断行。

---

## 6. 验收标准

1. **零硬编码中文:** 守护用例 `PENDING` 归零且通过。
2. **zh 逐字零回归:** `npm test` 全绿(≥34 文件 / 570 用例),既有中文断言一行未改。
3. **词典一致:** zh/en key 集合相等、无空值(S0 已有用例)。
4. **前缀仍有效:** `isMissing` / `isValidation` 的 `MISSING: ` / `VALIDATION: ` 前缀匹配路径不受影响(zh/en 两侧都保留前缀)。
5. **跨进程契约:** `code: 'no-update-task'` 自愈路径在 zh/en 下均通过,且 `reason` 文案切换不影响判定。
6. **en 冒烟:** §5.3 表格的用例全部落地通过。
7. **构建:** `npm run build`(或项目既有 build 命令)通过。

---

## 7. 风险与开放问题

| # | 风险 | 处置 |
|---|---|---|
| R1 | zh 值抄写偏差 → 既有中文断言批量红 | 词典 zh 值从源码逐字复制;每批次先跑全量测试;守护用例不覆盖词典,靠断言本身兜底 |
| R2 | `err.*` 值误含前缀 → en 出现 `MISSING: MISSING:` | §3.2-3 强制前缀拼在代码;en 冒烟显式断言完整串 |
| R3 | 主进程纯模块 import `./i18n` 引入 electron 依赖 | `i18n/index.ts` 已是零 electron 纯模块(S0),无需改动;若失败则回退到「传入 t 函数」注入 |
| R4 | `gpu-stats.test.ts` / `process.test.ts` 现有断言受影响 | zh 逐字一致 → 应零影响;若测试直接 import `t` 依赖语言状态,`test-setup.ts` 已固定 zh |
| R5 | 守护用例 tokenizer 误报(正则字面量含 Han 等) | 先以 `PENDING` 全量跑通、再逐项收紧;误报以显式 `EXCLUDE` 登记,不放宽整体规则 |
| R6 | App.vue 同时被 `code` 判定与 appendSys 改动触及 | 本分片单独串行,不与其他分片并行(S1/S8 已完成,无冲突) |
| R7 | `process.ts` 的双 t() 调用(console.error 与 onExitCb)在同一函数内 | 抽取局部常量 `const msg = 'PROC: ' + t('err.proc.spawnFail', …)` 复用,避免两次求值不一致 |

---

## 8. 决策台账(2026-10-04 grill-me 13 问)

| # | 问题 | 决策 |
|---|---|---|
| Q1 | S10 范围 | **全量**:卡列 7 文件 + App.vue 全部 appendSys + gpu-stats.ts + process.ts |
| Q2 | S8 跨进程中文耦合 | **主进程返回结构化 `code: 'no-update-task'`**,渲染端按 code 判定;spec §3.5 按判据 1 登记 |
| Q3 | `err.*` 值边界 | **只存后缀**,前缀在代码拼接 |
| Q4 | key 分组与复用 | **子系统二级分组** + 同语义复用一条 key |
| Q5 | 日志 key 粒度 | **整句 key**,代码只拼 `[lms_launcher] ` 前缀 |
| Q6 | en 日志风格 | **句首大写 + 半角标点 + 术语表** |
| Q7 | 对话框过滤名 | zh 改 **模型文件 / Jinja 模板文件**;en 保持现值 |
| Q8 | en 复数 | **改写规避**(`Options: {n}` / `attempt {n}`) |
| Q9 | 硬编码守护 | **加 vitest 守护用例**,PENDING 清单逐批归零 |
| Q10 | main.ts en 覆盖 | **不重构**;词典守护 + spec 逐条列值 + 人工实机验收 |
| Q11 | 可复用片段 | **独立片段 key**(如 `log.proxySuffix`)+ 占位符注入 |
| Q12 | 实施切分 | **按子系统 7 批**(T1 守护+词典 → T7 文档) |
| Q13 | 窗口三键 aria | **纳入 S10**,4 条 aria 走 t();S1 的静态中文决策被取代并回记 |

---

## 9. 变更记录

- 2026-10-04:创建。grill-me 13 问定稿;范围由分片卡的 7 文件扩为 9 文件 + App.vue(全量);新增跨进程 `code` 契约、零硬编码守护用例、三键 aria 与对话框过滤名两项中文文案变更登记。
- 2026-10-04:文件丢失后原文重写(内容与首版一致)。
