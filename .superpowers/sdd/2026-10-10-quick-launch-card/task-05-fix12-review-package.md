# 修复轮 1+2 审查包 · 任务 5

FIX_BASE = d42a8b0（上一轮完整审查所看到的 HEAD；两个源码文件是**未跟踪**文件，git diff 不显示，故用上一轮审查包里的旧全文与当前文件做 --no-index 对比）。
期间的主代理文档提交：`321707b docs: 登记 K11…`（不含源码）。
当前实现文件：383 行 / SHA-256 `3AD853E6378CB9B5ADA7D0A7AC2CE50F03C0619B73B9767EF3ABCF045ECF6D74`（主代理与实现者两次独立哈希一致）。
当前测试文件：382 行 / SHA-256 `0B461D3B040B9C663A588444841A94AD385E74D10B31F4CD1EBFE2BD06FB62F2`。

## git status --porcelain（方括号定界）

```
 M docs/superpowers/checks/2026-10-10-quick-launch-card/task-05-pty-manager.md
 M package-lock.json
 M package.json
?? src-main/quick-launch.test.ts
?? src-main/quick-launch.ts
```

## 已跟踪文件的 stat（package.json / package-lock.json 属首轮改动，本轮未再动）

```
.../task-05-pty-manager.md                         |  17 +++
 package-lock.json                                  | 134 +++++++++++++++++++++
 package.json                                       |   5 +
 3 files changed, 156 insertions(+)
```

## 修复 diff 1：src-main/quick-launch.ts（左 = 上一轮审查看到的 373 行，右 = 当前 383 行）

```diff
diff --git a/.superpowers/sdd/2026-10-10-quick-launch-card/task-05-prev-impl.ts.txt b/src-main/quick-launch.ts
index 08cd8f1..1325f2e 100644
--- a/.superpowers/sdd/2026-10-10-quick-launch-card/task-05-prev-impl.ts.txt
+++ b/src-main/quick-launch.ts
@@ -307,13 +307,34 @@ export class QuickLaunchManager {
     (inst.proc as ShellProcess).resize(cols, rows);
   }
 
-  /** [停止]（§7.5）：直接杀终端进程树，不关页签；幂等 */
+  /** [停止]（§7.5）：直接杀终端进程树，不关页签；幂等。超时走 §7.5 的 3s 口径（STOP_TIMEOUT_SECS） */
   async stop(configId: string): Promise<void> {
+    await this.stopInternal(configId);
+  }
+
+  /**
+   * 应用退出（§7.5，接线在任务 7）：逐个停，单个失败不影响其余。
+   * 口径 C5(a) / 索引 K11(1)（任务 5 审查 Important #1）：timeoutSecs 必须**透传**给每个停止动作，
+   * 不得被 stop() 里的 STOP_TIMEOUT_SECS 覆盖 —— 任务 7 按 exit_app 的超时调用 stopAll(n)。
+   */
+  async stopAll(timeoutSecs: number): Promise<void> {
+    for (const configId of Array.from(this.instances.keys())) {
+      try {
+        await this.stopInternal(configId, timeoutSecs);
+      } catch {
+        // 继续停下一个
+      }
+    }
+    this.instances.clear();
+  }
+
+  /** 停止的公共实现：stop() 用默认超时（3s），stopAll() 透传调用方给的秒数 */
+  private async stopInternal(configId: string, timeoutSecs: number = STOP_TIMEOUT_SECS): Promise<void> {
     const inst = this.instances.get(configId);
     if (!inst) return;
     inst.stopping = true;
     try {
-      await inst.proc.stopGraceful(STOP_TIMEOUT_SECS);
+      await inst.proc.stopGraceful(timeoutSecs);
     } catch {
       // 停止失败也要收尾，否则状态卡在 stopping
     }
@@ -324,18 +345,6 @@ export class QuickLaunchManager {
     }
   }
 
-  /** 应用退出（§7.5，接线在任务 7）：逐个停，单个失败不影响其余 */
-  async stopAll(timeoutSecs: number): Promise<void> {
-    for (const configId of Array.from(this.instances.keys())) {
-      try {
-        await this.stop(configId);
-      } catch {
-        // 继续停下一个
-      }
-    }
-    this.instances.clear();
-  }
-
   /** 状态快照（§8 ql_states，任务 13 的复原依据） */
   states(): Record<string, { running: boolean; stopping: boolean }> {
     const out: Record<string, { running: boolean; stopping: boolean }> = {};
```

## 修复 diff 2：src-main/quick-launch.test.ts（左 = 上一轮审查看到的 377 行，右 = 当前 382 行）

```diff
diff --git a/.superpowers/sdd/2026-10-10-quick-launch-card/task-05-prev-test.ts.txt b/src-main/quick-launch.test.ts
index 99560b1..b938c53 100644
--- a/.superpowers/sdd/2026-10-10-quick-launch-card/task-05-prev-test.ts.txt
+++ b/src-main/quick-launch.test.ts
@@ -263,6 +263,9 @@ describe('状态机（规格 §7.3 / §7.5 / §12.4）', () => {
     await m.stop('c1');
     expect(ctx.exits).toEqual([{ configId: 'c1', code: 0 }]);
     expect(m.states()).toEqual({});
+    // 修复轮 2（报告 §10.5-1 的缺口）：stop() 不带参数 → 必须走 §7.5 的 3s 口径（STOP_TIMEOUT_SECS）。
+    // E9 已改用 7 钉「透传」，本条钉「默认值」；把 :35 的常量改成 9 时本条必须红。
+    expect(m.shells[0].stopArgs).toEqual([3]);
     // 幂等：再 stop 不报错、不重复发 onExit
     await m.stop('c1');
     expect(ctx.exits.length).toBe(1);
@@ -279,17 +282,18 @@ describe('状态机（规格 §7.3 / §7.5 / §12.4）', () => {
     expect(m.shells.length).toBe(2);
   });
 
-  // E9
-  it('stopAll 停掉全部并清空 states', async () => {
+  // E9（口径 C5(a) / 索引 K11(1)：stopAll 的 timeoutSecs 必须**透传**，不得被 stop() 的 STOP_TIMEOUT_SECS 覆盖）
+  // 传 7 而不是 3：3 == STOP_TIMEOUT_SECS，断 [3] 在结构上无法区分「透传」与「硬编码」。
+  it('stopAll 停掉全部并清空 states，并透传 timeoutSecs', async () => {
     const ctx = makeDeps();
     const m = new TestManager(ctx.deps, () => true);
     await m.start('c1', SHELL_ENTRY);
     await m.start('c2', { name: 'n', type: 'exe', exe: 'a.exe' });
     expect(Object.keys(m.states()).sort()).toEqual(['c1', 'c2']);
-    await m.stopAll(3);
+    await m.stopAll(7);
     expect(m.states()).toEqual({});
-    expect(m.shells[0].stopArgs).toEqual([3]);
-    expect(ctx.exeHandles[0].stopArgs).toEqual([3]);
+    expect(m.shells[0].stopArgs).toEqual([7]);
+    expect(ctx.exeHandles[0].stopArgs).toEqual([7]);
   });
 
   // E10
```

## 主代理独立跑的两次变异探针（不是实现者的自述）

```
A) 把 :323 的 await this.stopInternal(configId, timeoutSecs) 改回 await this.stopInternal(configId)（丢参数）
   → AssertionError: expected [ 3 ] to deeply equal [ 7 ]（E9 红），还原后 22 passed，实现哈希不变
B) 把 :35 的 const STOP_TIMEOUT_SECS = 3 改成 = 9
   → AssertionError: expected [ 9 ] to deeply equal [ 3 ]（E8 红），还原后 22 passed / i18n 22 passed / tsc exit 0，实现哈希不变
```
