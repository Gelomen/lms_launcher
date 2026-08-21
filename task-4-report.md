# 任务 4：进程管理 process.rs — 报告

## 状态

**DONE_WITH_CONCERNS**（concern：执行期间文件被外部进程并发改写，最终实现由该收敛过程产生——已独立验证全绿并提交）。代码提交：`7aa18f5`。

## 提交

```
7aa18f5 feat: 进程管理——launch/take_pipes/stop_graceful/drain_exit
```

## TDD 证据链

- **FAIL 真实发生**：tests-only 版本 `cargo test --offline` EXIT 1，E0425/E0308/E0599/E0596 等编译错误（ProcessState / ProcState / drain_exit 未定义）；后续收敛阶段又捕获 3 组实现期编译错误（详见偏差），均已修复。
- **全绿**：`cargo test --offline` EXIT 0，**19 tests all ok**（config 9 + build 6 + process 4），`test result: ok. 19 passed; 0 failed`，耗时 0.52s（powershell 用例未出现挂死）。
- process 4 个测试名与 brief 完全一致：launch_stop_lifecycle / double_launch_rejected / stop_without_process_is_noop / drain_exit_reports_quick_child。

## 实现要点（与 brief 步骤 3 的对应）

- `ProcState { Ready, Running { config_id }, Stopping }`、`ProcessState { state, child, exit_code }`：与 brief 一致。
- `launch`：CREATE_NO_WINDOW 隐藏窗口 + 双管道；Running/Stopping 拒绝二次启动（STATE: 前缀）——一致。
- `take_pipes`：ChildStdout/Stderr take() 一次性交给读取线程——一致。
- `stop_graceful`：kill → timeout_secs 轮询 try_wait → 仍存活则 `taskkill /T /F -PID` 杀整树——一致（偏差 A 强化了退出码捕获）。
- `drain_exit`：非阻塞 try_wait，退出码一次性取走（exit_code.take），状态回 Ready——一致。
- `read_stream_line`：阻塞读一行，EOF → None——**签名与实现均偏离 brief**（偏差 C，见下）。

## 偏差清单

1. **偏差 A（保留，强化）**：stop_graceful 轮询循环内 `self.exit_code = Some(st.code().unwrap_or(-1))` —— brief 原版直接 kill 后不捕获退出码，launch_stop_lifecycle 断言 `Some(0)` 会失败；当前实现显式捕获 kill 后的退出码（TerminateProcess → 0），断言通过。
2. **偏差 B（测试侧，brief 原版不可靠）**：`drain_exit_reports_quick_child` 中 powershell 冷启动需 200–500ms，brief 原版立即 `drain_exit()` 会拿到 None；当前测试轮询（100 × 50ms）等待退出，实现不变。
3. **偏差 C（read_stream_line 签名与实现重写）**：brief 原版 `stream: &ChildStdout` + `stream.locked()` 在 std 1.98 不存在（ChildStdout 无 locked 方法）；`BufReader::new(&*stream)` 也不满足 Read（`&ChildStdout` 未实现 Read，仅 `&mut` 实现）。最终实现：**`stream: &mut ChildStdout`** + 手写 8192B buffer 循环 `read`，自拼行（处理跨 read 的行缓冲、EOF 时返回残留行），避免每次调用重建 BufReader 丢 buffer。该签名对任务 5 的读取线程友好（每行一次 &mut 借用，无生命周期延长）。
4. **执行环境异常**：本任务执行期间 process.rs 出现外部并发修改（每次 read 后内容递增：45→172→175→179→176 行），最终版稳定（mtime 固定，重复 read 一致）。我未与该过程竞速，改为等待其收敛并独立验证：cargo test --offline 全绿 + 提交。若审查者需追溯该过程的中间态，git reflog / stash 无痕迹（过程未提交），最终态以 `7aa18f5` 为准。

## 对任务 5 的接口备忘

- `read_stream_line` 需要 `&mut ChildStdout`（非 `&`）——命令接线时读取线程持有 owned pipe，每行调用 `read_stream_line(&mut pipe)` 即可。
- `take_pipes` 必须在 launch 之后、Running 状态下调用一次；`drain_exit` 在 stop/子进程自然退出后取码。

## 验证摘要

| 步骤 | 结果 |
|---|---|
| 步骤 2 FAIL | EXIT 1，E0425 等编译错误（已贴入上文） |
| 步骤 4 PASS | EXIT 0，19/19 ok（含 process 4/4） |
| git | 7aa18f5 落地，工作树仅余账本待回填 |