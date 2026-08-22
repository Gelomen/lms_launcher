# 任务 4 报告：process.ts（进程管理 TS 移植）

**提交：** ca9b07f feat: 进程管理 TS 移植——launch/takePipes/stopGraceful/drainExit（4 测试）
**分支：** lms-launch-v1，父提交 da51a3a。

## 实现内容

按简报逐字实现 `src-main/process.ts`：

- **ProcessState 状态机**（ready → running → stopping → ready），Rust ProcState 的 TS 版。
- **launch(exe, args, configId)**：`spawn` 子进程，stdio = ignore/pipe/pipe（隐藏窗口、双管道）；非 ready 状态 → `STATE: 已有进程在运行`（防二次启动）；`child.on("error")` → PROC 分类错误。
- **takePipes()**：running 时返回 stdout/stderr 流句柄，供任务 5 IPC 日志端订阅。
- **stopGraceful(timeoutSecs)**：SIGTERM → 轮询 close（100ms tick）→ 超时 taskkill /T /F（杀进程树）；无子进程时为 noop（直接 ready 返回）。
- **onExit(cb)**：退出回调（任务 5 发 process-exit 事件用）。
- **drainExit()**：纯 getter——close 事件已落地则返回 exitCode（code ?? -1），未退出 → null。

测试按简报逐字写入 `src-main/process.test.ts`，真实 spawn powershell.exe（sleep 60s / Write-Output hi）。

## TDD 证据

**RED**：先只提交测试文件跑聚焦测试 → FAIL：
```
FAIL src-main/process.test.ts [ src-main/process.test.ts ]
Error: Failed to load url ./process (resolved id: ./process). Does the file exist?
Test Files: 1 failed | Tests: no tests
```

**GREEN**：实现 process.ts 后重跑：
```
✓ src-main/process.test.ts (4 tests) 3223ms
Test Files: 1 passed | Tests: 4 passed
```

## 完整套件结果（提交前）

```
✓ src-main/build.test.ts   (6 tests)  4ms
✓ src-main/config.test.ts  (9 tests)  19ms
✓ src-main/process.test.ts (4 tests)  3221ms
Test Files: 3 passed | Tests: 19 passed
Duration: 3.55s
```

与预期一致（config 9 + build 6 + process 4 = 19）。Windows powershell spawn 实测总计 <4s，远低于 30–60s 上限。

## 修改文件

- `src-main/process.ts`（新建，88 行）
- `src-main/process.test.ts`（新建，32 行，逐字来自简报）

未触碰 config.ts / build.ts / test-utils.ts / main.ts / preload.ts / src/ / package.json。

## 自审发现

1. **测试验证真实子进程行为**：4 个测试全部真实 spawn powershell.exe（含 SIGTERM 强杀、子进程秒退的 close 事件落地、exitCode getter），无 mock。✓
2. **错误分类**：STATE（二次 launch / takePipes 无进程）与 PROC（spawn error 事件，ENOENT 等）均按简报实现。✓
3. **潜在改进点（未改，按简报逐字要求）**：stopGraceful 在 taskkill 强杀后把 child 置 null 但不清空 exitCode——Rust drain_exit 轮询语义下 TS 靠 close 事件补位；若 close 永远不来（被 taskkill 杀死的进程理论上会触发），drainExit 保持上一次值。实测 Windows 上 TerminateProcess/强杀均正常发 close 事件，4 测试通过，行为正确。
4. **YAGNI**：无多余字段/API；runningConfigId、onExitCb、takePipes 均为任务 5 预留的接线点，语义明确、未加额外抽象。✓

## 疑虑

无阻塞项。唯一环境依赖 = 本机 Windows PowerShell（已验证存在且 spawn 正常）。

## 审查修复（fix commit）

**问题**：src-main/process.ts:28 —— child.on("error") 回调内直接 throw new Error('PROC: ...')。Node.js 中事件回调里的 throw = 未捕获异常（uncaughtException），会导致 Electron **主进程崩溃**。触发场景：llama-server.exe 路径不存在 → spawn ENOENT → error 事件 → throw → 整个应用崩。Rust 侧靠 Result 传播错误，TS 移植在这里丢了安全边界。

**修复内容**（仅 src-main/process.ts）：
1. error 回调内**不再 throw**；改为 console.error 一行记录 + 状态复位到 ready + this.child = null + runningConfigId = null。
2. PROC 分类错误通过既有 onExit 回调链路上报：扩展回调签名为 (code: number, error?: string) —— 向后兼容，正常退出路径行为不变（error 为 undefined），仅启动失败路径传入 "PROC: <exe> 启动失败: <msg>"。
3. 同步更新 onExit() 方法签名与字段类型声明（私有字段 + 注释）。

**验证证据**：
- 聚焦测试 npx vitest run src-main/process.test.ts：process 4/4 PASS（修复前 4/4 → 修复后 4/4，既有断言语义未变）
- 全套件 npm test：config 9 + build 6 + process 4 = **19/19 PASS**
- ENOENT 探针（node --experimental-strip-types，spawn 不存在路径 nonexistent-exe-xyz.exe）：
  ```
  RESULT state=ready runningConfigId=null onExit={"code":-1,"err":"PROC: nonexistent-exe-xyz.exe 启动失败: spawn nonexistent-exe-xyz.exe ENOENT"}
  PROC: nonexistent-exe-xyz.exe 启动失败: spawn nonexistent-exe-xyz.exe ENOENT   (console.error)
  ```
  无崩溃（进程存活并正常退出）、状态安全复位、PROC 错误经 onExit 正确上报。探针为临时命令，未产生残留文件。
## 第二轮修复（stopGraceful）

### 问题

第一轮遗留：stopGraceful 轮询判据 `if (this.state === 'ready') return;` ——TS strict 下触发 **TS2367**（上一行已置 state='stopping'，narrowing 认为此后 state 必为 stopping，close 回调内的复位不被纳入），编译即失败；即便放宽编译，运行期判断永假 → early-return 永不生效，每次 stop 都空转到 deadline 走 taskkill /T /F。另缺双 stop 幂等守卫（#5）与强杀分支注释（#6）。

### 改动摘要（仅 src-main/process.ts）

- 新增私有 `exited` 布尔：close / error 回调置 true，launch 开头重置（任何让进程退出的路径都能让轮询提前 return）。
- 轮询判据改为 `if (this.exited) return;`（同时消灭 TS2367 + 运行期永假）。
- stopGraceful 头部加 `if (this.state === 'stopping') return;` 双 stop 幂等守卫。
- taskkill 强杀分支上方补注释：强杀后 close 事件仍落地并写 exitCode（drainExit 语义依据）。

diff 见提交（src-main/process.ts，+10/-1 行；核心四处：exited 字段、launch 重置、双回调置位、轮询判据与守卫）。

### 验证（四条命令与输出）

**1. tsc strict（本轮核心验收）：**
$ npx tsc -p tsconfig.main.json --noEmit
→ 零 error，退出码 0（修复前：src-main/process.ts(64): TS2367 —— Comparison appears to be unintentional because the types 'stopping' and 'ready' have no overlap）。

**2. process 聚焦测试：**
$ npx vitest run src-main/process.test.ts
→ ✓ src-main/process.test.ts (4 tests) 3222ms；Test Files: 1 passed | Tests: 4 passed。

**3. 全套件：**
$ npx vitest run
→ ✓ build 6 + config 9 + process 4；Test Files: 3 passed | Tests: **19 passed**。

**4. 行为探针（临时文件，验证后删除、未提交）：**
spawn powershell Start-Sleep 60 → stopGraceful(3)，计时；另加并发双 stop 用例。
$ npx vitest run src-main/probe.tmp.test.ts
→ **PROBE: stopGraceful returned after 102ms (deadline 3000ms)** ——early-return 生效（102ms << 3000ms，未等满 deadline、未走 taskkill）；双 stop no-op 用例同过。探针 2/2 PASS，文件已删除、未提交。

工作树最终状态：src-main/process.ts + 本报告节，4 个测试断言逐字未动。
