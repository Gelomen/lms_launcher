任务 5 简报（从 plan 逐字抽取，勿改）

### 任务 5：宿主入口 `src-main/ql-pty-host.ts`

**改什么**：被 `node.exe` 直接执行的宿主（§6.6）。它 import `net`、`@lydell/node-pty`、`./quick-launch` 的 `shellExe`、`./ql-host-protocol.js`。**不 import `electron`**。

`@
// argv: [node, script, pipeName, token]
export function runHost(deps: { connect(name: unknown): HostSocket; spawn: typeof pty.spawn }): void;
`@
（`runHost` 只做装配，`main` 判断 `require.main === module` 才调用 —— 这样单测能注入假 socket 与假 pty。）

- [ ] **步骤 1：先写失败测试**（`ql-pty-host.test.ts`，假 socket = 一个 EventEmitter + 收集写出的帧）：
  - `hello_with_a_wrong_token_exits_2_and_sends_err`
  - `spawn_options_match_the_non_elevated_path`（断言 `name/cols/rows/cwd` 与 `quick-launch.ts:155-161` 逐字一致，且**没有** `encoding`）
  - `ready_then_data_then_exit_frame_order`（RF6）
  - `write_and_resize_frames_reach_the_pty_handle`
  - `stop_frame_runs_stopGraceful_with_the_given_timeout`（RF6）
  - `socket_close_runs_the_stop_path`（§6.6-8）
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-pty-host.test.ts`。
- [ ] **步骤 3：实现**（§6.6 的 1–9 步逐条）。
- [ ] **步骤 4：跑绿 + G5 + G6**（`no-hardcoded` 会扫这个新文件 —— 汉字只能出现在注释里，字面量里不能有）。
- [ ] **步骤 5：本机冒烟（不测 ConPTY）**：`node -e` 起硬链接 `node.exe` 跑编译后的 `dist-main/ql-pty-host.js`，喂一个假的 `HELLO` 到假管道 —— 若本环境因 `EPERM conpty-*-in` 失败，**这是预期的**（§2-5），把输出贴进 check 表 J 段，不算失败。
- [ ] **步骤 6：Commit（主代理）**：`feat: 提权 PTY 宿主入口（管道 ↔ node-pty 转发）`

---
