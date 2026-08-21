# 任务 1：工程骨架 — 报告

## 状态

**BLOCKED**（见下方「阻塞原因」）。骨架文件与前端依赖已就绪并提交；Rust 侧编译验证未完成，`npx tauri dev` 未运行。

## 做了什么

- 阅读任务简报 `.superpowers/sdd/task-1-brief.md`。
- 按简报逐字创建前端工程：`package.json`、`vite.config.js`、`index.html`、`src/main.ts`、`src/App.vue`、`src/style.css`。
- 按简报逐字创建 Tauri 后端骨架：`src-tauri/Cargo.toml`、`src-tauri/build.rs`、`src-tauri/src/lib.rs`、`src-tauri/src/config.rs`（占位）、`src-tauri/src/process.rs`（占位）、`src-tauri/src/main.rs`、`src-tauri/tauri.conf.json`。
- 追加项目根 `.gitignore`（`dist/`、`node_modules/`、`src-tauri/target/`，并额外补了本会话环境产物：`.cargo-home/`、`.npm-cache/`、`.superpowers/`、`.npm/`、`package-lock.json`）。
- 在 `src-tauri/.cargo/config.toml` 增加了 rsproxy sparse 镜像（本会话中 crates.io 默认索引 TLS 不可用，镜像可被访问）。

## 每步验证输出摘要

### 步骤 1：安装 Rust 工具链

按简报事实说明，cargo/rustc 已就位：

- `cargo 1.98.0 (797e8a9bc 2026-08-05)`
- `rustc 1.98.0 (88d9e12ae 2026-08-18)`

（按简报步骤 1 的预期，`cargo --version` 正常。）

### 步骤 2：前端工程 + `npm install`

- 首次 `npm install` 失败：默认 npm cache `%LOCALAPPDATA%\npm-cache` 在本会话 sandbox 下不可写（EPERM: mkdir `C:\Users\Gelomen\AppData\Local\npm-cache\_cacache\tmp`）。
- 用 `npm install --cache .npm-cache`（项目内 cache）成功：
  
  > added 39 packages, and audited 40 packages in 1m
  > found 0 vulnerabilities

- 重试 `danger-full-access` 让 npm 写默认 cache 被本会话拒绝（审批提示禁用），因此保持项目内 cache 方式。最终 `npm install`（无 --cache）会再触发一次 AppData EPERM；后续构建命令建议固定 `--cache .npm-cache` 或把 `npm_config_cache` 指向工作区路径。

### 步骤 3：Tauri 后端骨架 + cargo 依赖拉取

- `cargo check` / `cargo fetch` 无法完成：
  
  > error: failed to get `serde` as a dependency of package `lms_launch v0.1.0 (.../src-tauri)`
  > failed to load source for dependency `serde`
  > unable to update registry `crates-io`
  > failed to create directory `C:\Users\Gelomen\.cargo\registry\index\rsproxy.cn-eb777ce3c90553f9`
  > 拒绝访问。 (os error 5)

- 默认 `CARGO_HOME=%USERPROFILE%\.cargo` 在本会话 sandbox 下只能包含 `bin`，无法写入 `registry/`、`git/` 等缓存目录。
- 尝试 `CARGO_HOME=D:\AI\Workspace\lms_launch\.worktrees\lms-launch-v1\.cargo-home`（工作区内）也失败，网络错误依旧：
  
  > failed to fetch `https://rsproxy.cn/crates`
  > [35] SSL connect error (schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e) - 安全包中没有可用的凭证)

- `Test-NetConnection` 测得 rsproxy.cn:443 / crates.io:443 可达，怀疑是 TLS/沙箱层面的限制，或需要可用的 `CARGO_HOME` 与代理/网络配置才能恢复。
- 未能验证 Rust 代码编译。

### 步骤 4：验证骨架可跑（`npx tauri dev`）

**未运行**：`npx tauri dev` 依赖 `cargo` 能完成 Rust 侧首次编译，当前 cargo 无法拉取依赖，所以未启动 dev 窗口验证。

## 提交列表

```
4e4dbb2 feat: Tauri 2 + Vue 3 工程骨架
```

包含文件（`git show --stat 4e4dbb2`）：

- `index.html`、`package.json`、`src/App.vue`、`src/main.ts`、`src/style.css`
- `src-tauri/Cargo.toml`、`src-tauri/build.rs`、`src-tauri/src/{config.rs,lib.rs,main.rs,process.rs}`
- `src-tauri/tauri.conf.json`
- `src-tauri/.cargo/config.toml`（rsproxy sparse 镜像）
- `.gitignore`（追加 dist/node_modules/target 及本会话环境产物）

## TDD 证据

本任务为工程骨架，未涉及可独立断言的单元测试；前端依赖与骨架代码就绪。Rust 侧 `cargo check` 因下述阻塞未完成。

## 阻塞原因 / 疑虑

1. **CARGO_HOME 不可写**：默认 `%USERPROFILE%\.cargo` 无法创建 `registry/`、`git/` 子目录，`cargo fetch/check` 报「拒绝访问 (os error 5)」。本会话沙箱禁止升级到 `danger-full-access`，无法写该目录；改用工作区内 `CARGO_HOME` 也未解决问题。
2. **crates.io TLS 不可用**：默认 registry `https://static.crates.io/...` 在本会话中反复报 schannel `SEC_E_NO_CREDENTIALS (0x8009030e)`。镜像 rsproxy.cn 网络可达，但 cargo 下载仍报相同 schannel 错误，疑似 TLS/代理/沙箱层问题，需要人工诊断或可用的 `CARGO_HOME`/代理配置。
3. **npx tauri dev 未运行**：因 1/2 导致 Rust 侧编译验证无法完成，dev 窗口验证顺延。WebView 是否弹出需人工确认（本任务步骤 4 降级项）。

## 后续建议

- 人工在可用 `CARGO_HOME`（或给 cargo 一个可写 home）与可用 TLS/网络下执行 `cargo check` / `npx tauri dev`，确认 Rust 骨架可编译、前端 Vite 1420 起服。
- 若 TLS/沙箱问题持续，可考虑：
  - 在用户机外环境（如手动终端）中执行 `cargo fetch` 后把 `~/.cargo` 缓存同步到工作区，再在受限环境中 `cargo check --offline`；或
  - 给受限会话一个可写 `CARGO_HOME` + 可用的 `https_proxy`/TLS 配置。

---

报告生成于任务 1 执行中；因 cargo 依赖拉取受阻，状态上报为 BLOCKED。前端与 Tauri 代码文件已按简报逐字创建并提交。

## BLOCKED 解除（父会话追加）

**根因（已验证）：**

1. **沙箱阻断 cargo 原生 TLS**：cargo/schannel 在 DSH 文件沙箱内取证书凭据被拒（SEC_E_NO_CREDENTIALS）。无沙箱对比测试证实：同一 `cargo fetch` 出沙箱立刻正常。npm 能装是因为 Node TLS 栈不受影响。
2. **rsproxy.cn 镜像是死路**：返回 404。已删除 `src-tauri/.cargo/config.toml`，恢复走原生 crates.io。

**解决方式：** 带网络的 cargo 步骤用 `danger-full-access` 一次性升级运行（用户预授权「有问题再说」），不再把 CARGO_HOME 指进工作区——默认 `%USERPROFILE%\.cargo` 在沙箱外可读写，依赖已缓存。

**验证结果：**

- `cargo fetch`：成功，Tauri 2 全套 crate 进缓存（serde 1.0.229、tauri 2.11.5 等）。
- `cargo check`：`src-tauri` 编译通过（374 个编译单元，Finished dev profile in 45.18s）。期间修了两处 Tauri 2.11 API 偏差：`tauri_plugin_dialog::init()`（无 `DialogPlugin` 类型）、`.run(tauri::generate_context!())` + `run()` 返回 `Result`。
- `npx tauri dev`：Rust 编译完成，`Running target\debug\lms_launch.exe`，进程存活；Vite 1420 起服（TCP 连通）。期间修一处：Vite watcher 监控到 cargo 锁定的 build-script exe 会 EBUSY 崩溃，`vite.config.js` 加 `server.watch.exclude: ['src-tauri/**']`。WebView 窗口的可见内容（「lms_launch 骨架」）待任务 10 人工验收时最终确认。

**状态更新：DONE**（提交 `4e4dbb2` + 本次修复）。
