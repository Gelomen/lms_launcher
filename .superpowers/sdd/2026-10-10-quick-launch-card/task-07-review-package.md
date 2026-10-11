# 审查包 · 任务 7（`exit_app` 停止全部终端）

BASE = 97e15ed（HEAD；按 K5 实现者不提交，改动在工作区）。本任务只改两个文件，diff 全文如下。

主代理已独立核过（供参考，不是结论）：定向 6 文件 `124 passed`、`tsc` exit 0、i18n 硬门 `22 passed`；`git diff --stat HEAD -- src-main/quick-launch.ts` 为空（该文件字节级未变，SHA 前缀 `3AD853E6378CB9B5` 与任务 5 提交时一致）；范围只含 `main.ts` 与 `quick-launch.test.ts`。
主代理自己跑的两次变异探针：
```
P1) 去掉 quick-launch.ts:334 的 if (!inst) return → 2 failed：「stop() 后发出 onExit 且 states() 变空」+ 新幂等用例
P3) 把 stopAll 的 for-await 改成 Promise.all → 恰 1 failed：「stopAll 逐个 await：前一个未返回前不得开始停下一个」
两次还原后 quick-launch.ts 字节级一致
```

## git status --porcelain（方括号定界）

```
 M src-main/main.ts
 M src-main/quick-launch.test.ts
```

## git diff HEAD（src-main/main.ts + src-main/quick-launch.test.ts）

```diff
diff --git a/src-main/main.ts b/src-main/main.ts
index 4671bfa..aeed019 100644
--- a/src-main/main.ts
+++ b/src-main/main.ts
@@ -376,6 +376,9 @@ ipcMain.handle('open_external', async (_e, url: string): Promise<void> => {
 ipcMain.handle('exit_app', async (): Promise<void> => {
   stopGpuStats();
   await ps.stopGraceful(3);
+  // 规格 §7.5 / 索引 K17：app.exit 不触发 will-quit（:53-54），conpty/cmd 是独立进程、父进程退出不会带走它们
+  // → 必须在 app.exit 之前停掉全部快捷启动终端，否则就是孤儿 PTY（审查重点 R3）。超时与 llama-server 同口径 3s。
+  await ql.stopAll(3);
   app.exit(0);
 });
 // vram_estimate：显存占用预测（规格 2026-08-29-vram-estimate-design §3/§4）。
@@ -640,6 +643,8 @@ ipcMain.handle('run_update', async (): Promise<{ ok: true } | ({ ok: false } & I
     return { ok: false, errorKey: ERR_UPDATE_TASK_START, errorParams: { err: errText } };
   }
   await ps.stopGraceful(3);
+  // 同上（索引 K17）：run_update 也是显式 app.exit(0)，漏掉就是孤儿 PTY（R3）。放在 ps.stopGraceful 之后与 exit_app 同构。
+  await ql.stopAll(3);
   await new Promise((resolve) => setTimeout(resolve, 3000)); // 等任务拉起脚本落地（/Run 后 ps1 需数秒才写到首行日志），避免 app.exit 抢先
   app.exit(0);
   return { ok: true }; // app.exit 立即终止进程，此行为类型收敛（渲染端不会收到）
diff --git a/src-main/quick-launch.test.ts b/src-main/quick-launch.test.ts
index b938c53..fb83743 100644
--- a/src-main/quick-launch.test.ts
+++ b/src-main/quick-launch.test.ts
@@ -29,6 +29,12 @@ class FakeShell {
   stopArgs: number[] = [];
   running = true;
   exited = false;
+  /** 任务 7 E4：置位后本实例的 stopGraceful 抛错，用来验证「单点失败不中断其余实例」 */
+  stopThrows = false;
+  /** 任务 7 F4：置位后 stopGraceful 挂起，直到测试 releaseStop() —— 用来钉「逐个 await」而不是 Promise.all */
+  stopHeld = false;
+  stopHeldStarted = false;
+  private releaseStop: (() => void) | null = null;
   private dataCbs: Array<(d: string) => void> = [];
   private exitCbs: Array<(code: number) => void> = [];
   write(d: string): void {
@@ -41,6 +47,11 @@ class FakeShell {
   isRunning(): boolean { return this.running; }
   async stopGraceful(timeoutSecs: number): Promise<void> {
     this.stopArgs.push(timeoutSecs);
+    if (this.stopThrows) throw new Error('stop boom');
+    if (this.stopHeld) {
+      this.stopHeldStarted = true;
+      await new Promise<void>((resolve) => { this.releaseStop = resolve; });
+    }
     // 真进程不会同步就死：让出一个微任务，使「停止中」状态在 stop() 返回前可观察（E6）
     await Promise.resolve();
     this.running = false;
@@ -48,6 +59,8 @@ class FakeShell {
   }
   /** 测试侧触发 shell 输出 */
   emit(d: string): void { this.dataCbs.forEach((cb) => cb(d)); }
+  /** 测试侧放行被挂起的 stopGraceful（任务 7 F4） */
+  releaseStopNow(): void { const r = this.releaseStop; this.releaseStop = null; r?.(); }
   /** 测试侧模拟进程自己退出（用户在终端里敲 exit） */
   exit(code: number): void {
     this.running = false;
@@ -296,6 +309,61 @@ describe('状态机（规格 §7.3 / §7.5 / §12.4）', () => {
     expect(ctx.exeHandles[0].stopArgs).toEqual([7]);
   });
 
+  // ── 任务 7（check 表 E1 / E4 / F4）：exit_app 与 run_update 退出前调 stopAll(3) 的前提 ──
+  // E1（C1 / 计划 步骤 1）：退出路径上没有任何「有没有终端在跑」的前置判断，
+  // 所以「空表 / 未运行的 configId」必须是正常路径：不抛错、不排计时器、立即返回。
+  it('stopAll 对空表与未运行的配置都不抛错（幂等）', async () => {
+    vi.useFakeTimers();
+    const ctx = makeDeps();
+    const m = new TestManager(ctx.deps, () => true);
+    // 空表：立即返回，且没有留下任何计时器（否则退出前要多等一段）
+    await m.stopAll(3);
+    expect(vi.getTimerCount()).toBe(0);
+    // 未运行/不存在的 configId：同样不抛错（ql_stop 的幂等口径，§8）
+    await m.stop('nope');
+    expect(vi.getTimerCount()).toBe(0);
+    // 停完再停一次：第二次就是空表；不重复发 onExit
+    await m.start('c1', SHELL_ENTRY);
+    await m.stopAll(3);
+    await m.stopAll(3);
+    expect(m.states()).toEqual({});
+    expect(vi.getTimerCount()).toBe(0); // 自动命令的 5s 兜底计时器必须被清掉
+    expect(ctx.exits.length).toBe(1);
+  });
+
+  // E4（R3）：一个实例停不掉不得中断其余实例 —— 退出路径串行停 N 个终端，
+  // 单个 stopGraceful 抛错必须被吞掉、继续停下一个，并且失败的那个也要收尾（不卡在 stopping）。
+  it('stopAll：单个实例 stopGraceful 抛错不影响其余实例', async () => {
+    const ctx = makeDeps();
+    const m = new TestManager(ctx.deps, () => true);
+    await m.start('c1', SHELL_ENTRY);
+    await m.start('c2', SHELL_ENTRY);
+    m.shells[0].stopThrows = true; // 第一个终端停不掉
+    await m.stopAll(3);
+    // 第二个仍被停，且收到透传的超时（K11(1)）
+    expect(m.shells[1].stopArgs).toEqual([3]);
+    // 失败的那个也要收尾：states() 清空、两个都上报退出
+    expect(m.states()).toEqual({});
+    expect(ctx.exits.map((e) => e.configId).sort()).toEqual(['c1', 'c2']);
+  });
+
+  // F4（计划 步骤 3 逐字「逐个 await」）：不得改成 Promise.all —— 前一个没返回前不得开始停下一个。
+  it('stopAll 逐个 await：前一个未返回前不得开始停下一个', async () => {
+    const ctx = makeDeps();
+    const m = new TestManager(ctx.deps, () => true);
+    await m.start('c1', SHELL_ENTRY);
+    await m.start('c2', SHELL_ENTRY);
+    m.shells[0].stopHeld = true; // 第一个终端卡在 stopGraceful 里
+    const stopping = m.stopAll(3);
+    await vi.waitFor(() => expect(m.shells[0].stopHeldStarted).toBe(true));
+    // 第一个还没返回 → 第二个一次都没被调用
+    expect(m.shells[1].stopArgs).toEqual([]);
+    m.shells[0].releaseStopNow();
+    await stopping;
+    expect(m.shells[1].stopArgs).toEqual([3]);
+    expect(m.states()).toEqual({});
+  });
+
   // E10
   it('shell 返回 tabId ql:<id>；exe 返回 null 且经 onSysLine 反馈', async () => {
     const ctx = makeDeps();
```
