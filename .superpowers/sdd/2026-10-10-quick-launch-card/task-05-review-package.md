# 审查包 · 任务 5（依赖 + quick-launch.ts）

BASE = d42a8b0（HEAD 未变：按 K5 实现者不提交；两个源码文件是**未跟踪**新文件，git diff 不显示，故附全文）
已核实：`git diff --stat HEAD -- src-main/process.ts src-main/process.test.ts` 为空（G4 成立）；`node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/` 下 conpty.node 291328B / conpty_console_list.node 134656B / conpty/conpty.dll 110152B / conpty/OpenConsole.exe 1062472B 均在。
既有口径参考：`src-main/process.ts:87` 的 taskkill 也是 `execFileSync("taskkill", ["/T","/F","-PID",…])` 不带 windowsHide（本文件的 :138 与之同口径）。

## git status --porcelain（方括号定界）

```
 M docs/superpowers/checks/2026-10-10-quick-launch-card/task-05-pty-manager.md
 M package-lock.json
 M package.json
?? src-main/quick-launch.test.ts
?? src-main/quick-launch.ts
```

## git diff HEAD --stat（已跟踪文件）

```
package-lock.json | 134 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 package.json      |   5 ++
 2 files changed, 139 insertions(+)
```

## package.json diff

```diff
diff --git a/package.json b/package.json
index 019021c..1be314d 100644
--- a/package.json
+++ b/package.json
@@ -17,6 +17,7 @@
     "@fortawesome/free-regular-svg-icons": "^7.3.1",
     "@fortawesome/free-solid-svg-icons": "^7.3.1",
     "@fortawesome/vue-fontawesome": "^3.3.3",
+    "@lydell/node-pty": "^1.2.0-beta.15",
     "adm-zip": "^0.6.1",
     "undici": "^6.28.0",
     "vue": "^3.5.13",
@@ -26,6 +27,10 @@
     "@types/node": "^26.5.1",
     "@vitejs/plugin-vue": "^5.2.3",
     "@vue/test-utils": "^2.4.11",
+    "@xterm/addon-fit": "0.10.0",
+    "@xterm/addon-search": "0.15.0",
+    "@xterm/addon-web-links": "0.11.0",
+    "@xterm/xterm": "5.5.0",
     "concurrently": "^9.1.0",
     "cross-env": "^10.0.0",
     "electron": "^28.3.0",
```

## 新增未跟踪文件全文：src-main/quick-launch.ts（373 行）

```ts
  1: // src-main/quick-launch.ts
  2: // 任务 5：ConPTY 终端进程管理 —— PtyProcess / spawnShell / shellExe / QuickLaunchManager
  3: // 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §7.1 / §7.3 / §7.5 / §12.4
  4: // 计划：docs/superpowers/plans/2026-10-10-quick-launch-card.md §任务 5（C1–C5 接口逐字，任务 6/7/13 据此调用）
  5: // 边界：不 import src-main/process.ts，也不改它（check B4 / G4）。exe 类型走 deps.spawnExe 接缝，
  6: //       生产侧由任务 6 接 ProcessState 适配器（规格 §7.3 的 windowsHide/stdio 由那一侧决定）。
  7: import { execFileSync } from 'node:child_process';
  8: import * as pty from '@lydell/node-pty';
  9: import { t } from './i18n';
 10: import type { QuickLaunchEntry, TerminalId } from './quick-launch-config';
 11: 
 12: // 已定口径 K8（同 src-main/quick-launch-config.ts:22-40）：err.ql.* 词典键在任务 8 才落地，
 13: // 这里用常量映射传 key（key-coverage.test.ts:39-41 的 KEY_CALL 只认字面量 → 跳过），
 14: // 任务 8 落地词典后再改回字面量 t()。key 名与任务 8 表 D8/D9/D10/D6/D7/D3 逐字一致；
 15: // 占位符：terminalGone→{terminal}、ptySpawn→{exe}{err}、notFound→{id}、typeInvalid→{type}、
 16: // alreadyRunning / exeRequired 无占位符（与任务 3 已落地的同名键占位符一致）。
 17: // 错误前缀只有 VALIDATION: / STATE: / PROC:（索引 G7）。
 18: const QL_ERR = {
 19:   notFound: 'err.ql.notFound',
 20:   terminalGone: 'err.ql.terminalGone',
 21:   alreadyRunning: 'err.ql.alreadyRunning',
 22:   ptySpawn: 'err.ql.ptySpawn',
 23:   exeRequired: 'err.ql.exeRequired',
 24:   typeInvalid: 'err.ql.typeInvalid',
 25: } as const;
 26: 
 27: // 规格 §7.3：TERM 名固定 xterm-256color；start() 不带尺寸（任务 6 的 ql_resize 会立刻校正），
 28: // 故用 80x24 兜底，保证首帧之前 PTY 尺寸不会是 0。
 29: const PTY_NAME = 'xterm-256color';
 30: const DEFAULT_COLS = 80;
 31: const DEFAULT_ROWS = 24;
 32: // 规格 §7.3：等第一批输出（shell 已就绪）再写自动命令；5s 无输出则兜底写入。审查重点 R1。
 33: const AUTO_CMD_TIMEOUT_MS = 5000;
 34: // 规格 §7.5：[停止] 沿用 llama-server 口径 —— 终止 → 3s → taskkill /T /F（杀进程树）
 35: const STOP_TIMEOUT_SECS = 3;
 36: const POLL_MS = 100; // 与 src-main/process.ts:82 同口径
 37: // 强杀之后再等一小段时间让 exit 事件落地：否则 stop() 返回时 states() 里还留着 stopping:true，
 38: // 渲染端按钮不回落（规格 §7.5「行按钮回落 [启动]」）。
 39: const FORCE_EXIT_WAIT_MS = 1000;
 40: // 规格 §7.5：终端页签 id = 'ql:<configId>'。渲染端同名常量在 src/modules/log-tabs.ts（任务 10 C1）。
 41: const QL_TAB_PREFIX = 'ql:';
 42: 
 43: /** 终端本体与参数（规格 §7.3：没有 v1 的 -Command 包装） */
 44: const SHELL_EXE: Record<TerminalId, { exe: string; args: string[] }> = {
 45:   pwsh: { exe: 'pwsh.exe', args: ['-NoLogo'] },
 46:   powershell: { exe: 'powershell.exe', args: ['-NoLogo'] },
 47:   cmd: { exe: 'cmd.exe', args: [] },
 48:   wsl: { exe: 'wsl.exe', args: [] },
 49: };
 50: 
 51: function sleep(ms: number): Promise<void> {
 52:   return new Promise((resolve) => setTimeout(resolve, ms));
 53: }
 54: 
 55: function messageOf(err: unknown): string {
 56:   return err instanceof Error ? err.message : String(err);
 57: }
 58: 
 59: /**
 60:  * node-pty 句柄在本文件里用到的最小一面（PtyProcess 的构造参数）。
 61:  * 之所以自定义而不是直接用 pty.IPty：测试可注入假句柄验证 stopGraceful 的时序（check E11）。
 62:  * 注意 kill() 无参——Windows 下传 signal 会抛（node-pty.d.ts:184-188）。
 63:  */
 64: interface PtyHandle {
 65:   readonly pid: number;
 66:   write(data: string): void;
 67:   resize(cols: number, rows: number): void;
 68:   kill(): void;
 69:   onData(cb: (d: string) => void): void;
 70:   onExit(cb: (e: { exitCode: number }) => void): void;
 71: }
 72: 
 73: /**
 74:  * PTY 进程包装（C1）。onData/onExit 直接转发给底层句柄，支持多个订阅者。
 75:  * pid 用 getter 而不是构造时快照：ConPTY 的 innerPid 要等 agent 连上才有值
 76:  * （node-pty windowsTerminal.js:62/:69 是异步赋值的），实测 spawn() 返回瞬间读到 0、1s 后才是真 pid。
 77:  */
 78: export class PtyProcess {
 79:   private readonly handle: PtyHandle;
 80:   private running = true;
 81:   private stopping = false;
 82:   private exitCode: number | null = null;
 83:   private exitCbs: Array<(code: number) => void> = [];
 84: 
 85:   constructor(handle: PtyHandle) {
 86:     this.handle = handle;
 87:     handle.onExit((e) => {
 88:       this.running = false;
 89:       this.exitCode = e.exitCode;
 90:       const cbs = this.exitCbs.slice();
 91:       this.exitCbs = [];
 92:       for (const cb of cbs) cb(e.exitCode);
 93:     });
 94:   }
 95: 
 96:   get pid(): number {
 97:     return this.handle.pid;
 98:   }
 99: 
100:   write(data: string): void {
101:     this.handle.write(data);
102:   }
103: 
104:   resize(cols: number, rows: number): void {
105:     this.handle.resize(cols, rows);
106:   }
107: 
108:   onData(cb: (d: string) => void): void {
109:     this.handle.onData(cb);
110:   }
111: 
112:   onExit(cb: (code: number) => void): void {
113:     // 已退出则立即补发：注册晚于退出时不补发就会永远等不到（页签按钮卡在 [停止]）
114:     if (!this.running) {
115:       cb(this.exitCode ?? -1);
116:       return;
117:     }
118:     this.exitCbs.push(cb);
119:   }
120: 
121:   isRunning(): boolean {
122:     return this.running;
123:   }
124: 
125:   /** 终止 → 等 timeoutSecs → taskkill /T /F 杀进程树（规格 §7.5，与 process.ts:71-92 同口径） */
126:   async stopGraceful(timeoutSecs: number): Promise<void> {
127:     if (!this.running || this.stopping) return; // 已退出 / 已在停止流程中：幂等
128:     this.stopping = true;
129:     try {
130:       this.handle.kill();
131:     } catch {
132:       // 进程已不在：等 exit 事件落地即可
133:     }
134:     const deadline = Date.now() + Math.max(0, timeoutSecs) * 1000;
135:     while (this.running && Date.now() < deadline) await sleep(POLL_MS);
136:     if (this.running && process.platform === 'win32' && this.pid) {
137:       try {
138:         execFileSync('taskkill', ['/T', '/F', '-PID', String(this.pid)]);
139:       } catch {
140:         // 已退出
141:       }
142:       const grace = Date.now() + FORCE_EXIT_WAIT_MS;
143:       while (this.running && Date.now() < grace) await sleep(POLL_MS);
144:     }
145:     this.stopping = false;
146:   }
147: }
148: 
149: /** 终端 id → 可执行文件与参数（C3）。返回副本，调用方改数组不会污染映射表。 */
150: export function shellExe(shell: TerminalId): { exe: string; args: string[] } {
151:   const found = SHELL_EXE[shell];
152:   if (!found) throw new Error('VALIDATION: ' + t(QL_ERR.terminalGone, { terminal: String(shell ?? '') }));
153:   return { exe: found.exe, args: [...found.args] };
154: }
155: 
156: /** 起一个终端 PTY（C2）。规格 §7.3：选项只有 name/cols/rows/cwd/env，不传 encoding。 */
157: export function spawnShell(shell: TerminalId, cols: number, rows: number, cwd: string): PtyProcess {
158:   const { exe, args } = shellExe(shell);
159:   const handle = pty.spawn(exe, args, {
160:     name: PTY_NAME,
161:     cols,
162:     rows,
163:     cwd,
164:     env: process.env,
165:   });
166:   return new PtyProcess(handle);
167: }
168: 
169: /** 主进程 → 渲染端的回调（C4）。onSysLine 是 exe 类型「无页签」时的日志反馈（任务 6 接 emitLog）。 */
170: export interface QlDeps {
171:   onData(tabId: string, data: string): void;
172:   onExit(configId: string, code: number): void;
173:   onSysLine(configId: string, line: string): void;
174:   homedir(): string;
175:   spawnExe(exe: string): { onExit(cb: (code: number) => void): void; stopGraceful(s: number): Promise<void>; isRunning(): boolean };
176: }
177: 
178: /** QuickLaunchManager 内部用到的 shell 进程面：PtyProcess 与测试里的假实现都满足 */
179: interface ShellProcess {
180:   write(data: string): void;
181:   resize(cols: number, rows: number): void;
182:   onData(cb: (d: string) => void): void;
183:   onExit(cb: (code: number) => void): void;
184:   isRunning(): boolean;
185:   stopGraceful(timeoutSecs: number): Promise<void>;
186: }
187: 
188: interface ExeProcess {
189:   onExit(cb: (code: number) => void): void;
190:   stopGraceful(s: number): Promise<void>;
191:   isRunning(): boolean;
192: }
193: 
194: interface AutoCommand {
195:   cmd: string;
196:   timer: ReturnType<typeof setTimeout> | null;
197:   released: boolean;
198: }
199: 
200: /** 一配置一实例（F4）：运行中/停止中的配置再点启动 → STATE: */
201: interface Instance {
202:   kind: 'shell' | 'exe';
203:   proc: ShellProcess | ExeProcess;
204:   tabId: string | null;
205:   stopping: boolean;
206:   exited: boolean;
207:   exitCode: number | null;
208:   auto: AutoCommand | null;
209: }
210: 
211: /**
212:  * 快捷启动的进程管理（C5）：状态机 + PTY 生命周期。
213:  * 启动前校验（§7.5）→ 起进程 → 订阅输出/退出 → 自动命令等首批输出（§7.3）。
214:  */
215: export class QuickLaunchManager {
216:   private readonly instances = new Map<string, Instance>();
217:   private readonly isTerminalAvailable: (id: TerminalId) => boolean;
218: 
219:   constructor(private readonly deps: QlDeps, terminalAvailable: (id: TerminalId) => boolean) {
220:     this.isTerminalAvailable = terminalAvailable;
221:   }
222: 
223:   /**
224:    * 测试接缝（check E4/E5 要「假 PtyProcess 断言写入顺序」）：C5 的构造签名逐字不动，
225:    * 测试子类覆写本方法注入假进程。生产路径就是 spawnShell。
226:    */
227:   protected createShellProcess(shell: TerminalId, cols: number, rows: number, cwd: string): ShellProcess {
228:     return spawnShell(shell, cols, rows, cwd);
229:   }
230: 
231:   /** 启动（规格 §7.5）：shell → { tabId: 'ql:<configId>' }；exe → { tabId: null }。失败不残留状态。 */
232:   async start(configId: string, entry: QuickLaunchEntry): Promise<{ tabId: string | null }> {
233:     if (this.instances.has(configId)) throw new Error('STATE: ' + t(QL_ERR.alreadyRunning));
234:     const e = (entry ?? {}) as Partial<QuickLaunchEntry>;
235: 
236:     if (e.type === 'shell') {
237:       const shell = e.shell;
238:       if (!shell || !this.isTerminalAvailable(shell)) {
239:         throw new Error('VALIDATION: ' + t(QL_ERR.terminalGone, { terminal: String(shell ?? '') }));
240:       }
241:       const tabId = QL_TAB_PREFIX + configId;
242:       let proc: ShellProcess;
243:       try {
244:         // 规格 §7.3：cwd 一律用户主目录（deps.homedir，测试可注入）
245:         proc = this.createShellProcess(shell, DEFAULT_COLS, DEFAULT_ROWS, this.deps.homedir());
246:       } catch (err) {
247:         // §12.4：spawn 失败不残留状态——还没进 Map，直接上抛
248:         throw new Error('PROC: ' + t(QL_ERR.ptySpawn, { exe: shellExe(shell).exe, err: messageOf(err) }));
249:       }
250:       const inst: Instance = {
251:         kind: 'shell', proc, tabId, stopping: false, exited: false, exitCode: null, auto: null,
252:       };
253:       proc.onData((data) => {
254:         // 顺序要紧：先把输出转给渲染端，再写自动命令（审查重点 R1 / check E4）
255:         this.deps.onData(tabId, data);
256:         this.releaseAutoCommand(inst);
257:       });
258:       proc.onExit((code) => {
259:         inst.exited = true;
260:         inst.exitCode = code;
261:         this.finalize(configId, inst);
262:       });
263:       this.instances.set(configId, inst);
264:       if (inst.exited) {
265:         this.finalize(configId, inst); // 极端竞态：spawn 后同步就退出
266:         return { tabId };
267:       }
268:       this.scheduleAutoCommand(inst, typeof e.cmd === 'string' ? e.cmd : '');
269:       return { tabId };
270:     }
271: 
272:     if (e.type === 'exe') {
273:       const exe = typeof e.exe === 'string' ? e.exe.trim() : '';
274:       if (!exe) throw new Error('VALIDATION: ' + t(QL_ERR.exeRequired));
275:       // 规格 §7.3：可执行程序不用 PTY。不 catch：ProcessState.launch 的 STATE:/PROC: 原样上抛。
276:       const proc = this.deps.spawnExe(exe);
277:       const inst: Instance = {
278:         kind: 'exe', proc, tabId: null, stopping: false, exited: false, exitCode: null, auto: null,
279:       };
280:       proc.onExit((code) => {
281:         inst.exited = true;
282:         inst.exitCode = code;
283:         this.finalize(configId, inst);
284:         // 无页签 → 反馈走日志（任务 6 把 onSysLine 接到既有 emitLog(line,'sys')）。
285:         // 复用词典既有键，不新建 err.ql.* / log.ql.*（索引 K9 的「复用既有键」口径）。
286:         this.deps.onSysLine(configId, t('log.app.exit', { code }));
287:       });
288:       this.instances.set(configId, inst);
289:       this.deps.onSysLine(configId, t('log.launcher.start.cmd', { cmd: exe }));
290:       return { tabId: null };
291:     }
292: 
293:     throw new Error('VALIDATION: ' + t(QL_ERR.typeInvalid, { type: String(e.type ?? '') }));
294:   }
295: 
296:   /** 键盘输入（§8 ql_write） */
297:   write(configId: string, data: string): void {
298:     const inst = this.instances.get(configId);
299:     if (!inst || inst.kind !== 'shell') throw new Error('STATE: ' + t('err.proc.noChild'));
300:     (inst.proc as ShellProcess).write(data);
301:   }
302: 
303:   /** 尺寸（§8 ql_resize） */
304:   resize(configId: string, cols: number, rows: number): void {
305:     const inst = this.instances.get(configId);
306:     if (!inst || inst.kind !== 'shell') throw new Error('STATE: ' + t('err.proc.noChild'));
307:     (inst.proc as ShellProcess).resize(cols, rows);
308:   }
309: 
310:   /** [停止]（§7.5）：直接杀终端进程树，不关页签；幂等 */
311:   async stop(configId: string): Promise<void> {
312:     const inst = this.instances.get(configId);
313:     if (!inst) return;
314:     inst.stopping = true;
315:     try {
316:       await inst.proc.stopGraceful(STOP_TIMEOUT_SECS);
317:     } catch {
318:       // 停止失败也要收尾，否则状态卡在 stopping
319:     }
320:     // 强杀路径下 exit 事件可能还没落地：按未知退出码收尾，保证 states() 清空、按钮回落
321:     if (this.instances.get(configId) === inst && !inst.exited) {
322:       inst.exitCode = -1;
323:       this.finalize(configId, inst);
324:     }
325:   }
326: 
327:   /** 应用退出（§7.5，接线在任务 7）：逐个停，单个失败不影响其余 */
328:   async stopAll(timeoutSecs: number): Promise<void> {
329:     for (const configId of Array.from(this.instances.keys())) {
330:       try {
331:         await this.stop(configId);
332:       } catch {
333:         // 继续停下一个
334:       }
335:     }
336:     this.instances.clear();
337:   }
338: 
339:   /** 状态快照（§8 ql_states，任务 13 的复原依据） */
340:   states(): Record<string, { running: boolean; stopping: boolean }> {
341:     const out: Record<string, { running: boolean; stopping: boolean }> = {};
342:     for (const [configId, inst] of this.instances) {
343:       out[configId] = { running: !inst.stopping, stopping: inst.stopping };
344:     }
345:     return out;
346:   }
347: 
348:   /** 退出收尾：从 Map 摘掉并上报 ql-exit（§7.5「页签保留、按钮回落」） */
349:   private finalize(configId: string, inst: Instance): void {
350:     if (this.instances.get(configId) !== inst) return; // 已被替换或已摘除
351:     this.instances.delete(configId);
352:     if (inst.auto?.timer) clearTimeout(inst.auto.timer);
353:     this.deps.onExit(configId, inst.exitCode ?? -1);
354:   }
355: 
356:   /** 登记自动命令与 5s 兜底计时器（§7.3） */
357:   private scheduleAutoCommand(inst: Instance, cmd: string): void {
358:     const trimmed = cmd.trim();
359:     if (!trimmed) return;
360:     inst.auto = { cmd: trimmed, timer: setTimeout(() => this.releaseAutoCommand(inst), AUTO_CMD_TIMEOUT_MS), released: false };
361:   }
362: 
363:   /** 只写一次：首批输出到达（shell 就绪）或 5s 超时（兜底） */
364:   private releaseAutoCommand(inst: Instance): void {
365:     const auto = inst.auto;
366:     if (!auto || auto.released) return;
367:     auto.released = true;
368:     if (auto.timer) clearTimeout(auto.timer);
369:     auto.timer = null;
370:     if (inst.exited || inst.kind !== 'shell') return;
371:     (inst.proc as ShellProcess).write(auto.cmd + '\r');
372:   }
373: }
```

## 新增未跟踪文件全文：src-main/quick-launch.test.ts（377 行）

```ts
  1: // src-main/quick-launch.test.ts
  2: // 任务 5：PtyProcess + QuickLaunchManager 的行为断言（check 表 E1–E11，钉住审查重点 R1 = E4/E5）
  3: // 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §7.3 / §7.5 / §12.4
  4: // 真机用例只有 E3（真 cmd.exe）；其余全部注入假进程，用来断言「等首批输出再写命令」的**顺序**。
  5: import { afterEach, describe, expect, it, vi } from 'vitest';
  6: import { homedir } from 'node:os';
  7: import { PtyProcess, QuickLaunchManager, shellExe, type QlDeps } from './quick-launch';
  8: import type { QuickLaunchEntry } from './quick-launch-config';
  9: 
 10: // E11：观察 stopGraceful 是否按「终止 → 超时 → taskkill /T /F」的顺序调用外部命令。
 11: // quick-launch.ts 里 node:child_process 只用于 taskkill；node-pty 自身不 require 它
 12: // （实测 node_modules/@lydell/node-pty*/ 下无 child_process 引用），所以整文件 mock 不影响 E3。
 13: const taskkillCalls = vi.hoisted(() => [] as Array<{ cmd: string; args: string[] }>);
 14: vi.mock('node:child_process', () => ({
 15:   execFileSync: (cmd: string, args: string[]) => {
 16:     taskkillCalls.push({ cmd, args });
 17:     return '';
 18:   },
 19: }));
 20: 
 21: // ---------- 假进程 ----------
 22: 
 23: /** 假 shell 进程：满足 QuickLaunchManager 内部用到的最小面（write/resize/onData/onExit/isRunning/stopGraceful） */
 24: class FakeShell {
 25:   /** timeline：与 makeDeps 共享的事件时间线，用来断言 deps.onData 与 pty.write 的先后（E4/E5） */
 26:   constructor(private readonly timeline: string[] | null = null) {}
 27:   writes: string[] = [];
 28:   resizeArgs: Array<[number, number]> = [];
 29:   stopArgs: number[] = [];
 30:   running = true;
 31:   exited = false;
 32:   private dataCbs: Array<(d: string) => void> = [];
 33:   private exitCbs: Array<(code: number) => void> = [];
 34:   write(d: string): void {
 35:     if (this.timeline) this.timeline.push("pty.write");
 36:     this.writes.push(d);
 37:   }
 38:   resize(cols: number, rows: number): void { this.resizeArgs.push([cols, rows]); }
 39:   onData(cb: (d: string) => void): void { this.dataCbs.push(cb); }
 40:   onExit(cb: (code: number) => void): void { this.exitCbs.push(cb); }
 41:   isRunning(): boolean { return this.running; }
 42:   async stopGraceful(timeoutSecs: number): Promise<void> {
 43:     this.stopArgs.push(timeoutSecs);
 44:     // 真进程不会同步就死：让出一个微任务，使「停止中」状态在 stop() 返回前可观察（E6）
 45:     await Promise.resolve();
 46:     this.running = false;
 47:     this.exitCbs.forEach((cb) => cb(0)); // 真进程被杀后一定会有 exit 事件，假实现照做
 48:   }
 49:   /** 测试侧触发 shell 输出 */
 50:   emit(d: string): void { this.dataCbs.forEach((cb) => cb(d)); }
 51:   /** 测试侧模拟进程自己退出（用户在终端里敲 exit） */
 52:   exit(code: number): void {
 53:     this.running = false;
 54:     this.exited = true;
 55:     this.exitCbs.forEach((cb) => cb(code));
 56:   }
 57: }
 58: 
 59: /** 假可执行程序进程（deps.spawnExe 的返回值形状，规格 §7.3：不用 PTY） */
 60: class FakeExe {
 61:   constructor(readonly exe: string) {}
 62:   stopArgs: number[] = [];
 63:   running = true;
 64:   private exitCbs: Array<(code: number) => void> = [];
 65:   onExit(cb: (code: number) => void): void { this.exitCbs.push(cb); }
 66:   isRunning(): boolean { return this.running; }
 67:   async stopGraceful(timeoutSecs: number): Promise<void> {
 68:     this.stopArgs.push(timeoutSecs);
 69:     await Promise.resolve();
 70:     this.running = false;
 71:     this.exitCbs.forEach((cb) => cb(0));
 72:   }
 73:   exit(code: number): void {
 74:     this.running = false;
 75:     this.exitCbs.forEach((cb) => cb(code));
 76:   }
 77: }
 78: 
 79: /** 可注入假 shell 的测试子类：C5 的构造签名逐字不动，接缝放在 protected 方法上 */
 80: class TestManager extends QuickLaunchManager {
 81:   shells: FakeShell[] = [];
 82:   shellFails = false;
 83:   /** 注入假进程时共享的事件时间线（E4/E5 的顺序判据） */
 84:   timeline: string[] | null = null;
 85:   protected override createShellProcess(): FakeShell {
 86:     if (this.shellFails) throw new Error('spawn boom');
 87:     const f = new FakeShell(this.timeline);
 88:     this.shells.push(f);
 89:     return f;
 90:   }
 91: }
 92: 
 93: function makeDeps() {
 94:   const data: Array<{ tabId: string; data: string }> = [];
 95:   const exits: Array<{ configId: string; code: number }> = [];
 96:   const sysLines: Array<{ configId: string; line: string }> = [];
 97:   const exeHandles: FakeExe[] = [];
 98:   const exeRequests: string[] = [];
 99:   // 事件时间线：E4 用它断言「deps.onData 先于 pty.write」（审查重点 R1）
100:   const timeline: string[] = [];
101:   const deps: QlDeps = {
102:     onData: (tabId, d) => { timeline.push('deps.onData'); data.push({ tabId, data: d }); },
103:     onExit: (configId, code) => { exits.push({ configId, code }); },
104:     onSysLine: (configId, line) => { sysLines.push({ configId, line }); },
105:     homedir: () => homedir(),
106:     spawnExe: (exe) => {
107:       timeline.push('spawnExe');
108:       exeRequests.push(exe);
109:       const h = new FakeExe(exe);
110:       exeHandles.push(h);
111:       return h;
112:     },
113:   };
114:   return { deps, data, exits, sysLines, exeHandles, exeRequests, timeline };
115: }
116: 
117: const SHELL_ENTRY: QuickLaunchEntry = { name: 'n', type: 'shell', shell: 'cmd', cmd: 'echo HI' };
118: const EXE_ENTRY: QuickLaunchEntry = { name: 'n', type: 'exe', exe: 'notepad.exe' };
119: 
120: function allData(data: Array<{ tabId: string; data: string }>): string {
121:   return data.map((d) => d.data).join('');
122: }
123: 
124: async function waitFor(cond: () => boolean, ms: number, what: string): Promise<void> {
125:   const deadline = Date.now() + ms;
126:   while (Date.now() < deadline) {
127:     if (cond()) return;
128:     await new Promise((r) => setTimeout(r, 100));
129:   }
130:   throw new Error('TIMEOUT waiting for ' + what);
131: }
132: 
133: afterEach(() => {
134:   vi.useRealTimers();
135:   taskkillCalls.length = 0;
136: });
137: 
138: describe('shellExe（规格 §7.3：没有 v1 的 -Command 包装）', () => {
139:   // E1
140:   it('cmd 无参、pwsh 带 -NoLogo', () => {
141:     expect(shellExe('cmd')).toEqual({ exe: 'cmd.exe', args: [] });
142:     expect(shellExe('pwsh')).toEqual({ exe: 'pwsh.exe', args: ['-NoLogo'] });
143:   });
144:   // E2
145:   it('powershell 带 -NoLogo、wsl 无参', () => {
146:     expect(shellExe('powershell')).toEqual({ exe: 'powershell.exe', args: ['-NoLogo'] });
147:     expect(shellExe('wsl')).toEqual({ exe: 'wsl.exe', args: [] });
148:   });
149: });
150: 
151: describe('真机集成（规格 §12.4：真跑 cmd.exe）', () => {
152:   // E3
153:   it('启动 cmd 配置后 onData 至少一次，拼接后含 HI', async () => {
154:     const ctx = makeDeps();
155:     const m = new QuickLaunchManager(ctx.deps, () => true);
156:     const res = await m.start('c1', SHELL_ENTRY);
157:     expect(res).toEqual({ tabId: 'ql:c1' });
158:     expect(m.states()).toEqual({ c1: { running: true, stopping: false } });
159:     await waitFor(() => allData(ctx.data).includes('HI'), 20000, 'cmd.exe 回显 HI');
160:     expect(ctx.data.length).toBeGreaterThan(0);
161:     expect(ctx.data.every((d) => d.tabId === 'ql:c1')).toBe(true);
162:     await m.stop('c1');
163:     expect(m.states()).toEqual({});
164:   }, 40000);
165: });
166: 
167: describe('自动执行命令（审查重点 R1 / 规格 §7.3）', () => {
168:   // E4
169:   it('deps.onData 第一次被调用之后才发生 pty.write', async () => {
170:     const ctx = makeDeps();
171:     const m = new TestManager(ctx.deps, () => true);
172:     m.timeline = ctx.timeline;
173:     await m.start('c1', SHELL_ENTRY);
174:     const shell = m.shells[0];
175:     // 首批输出之前：一个字都不写
176:     expect(shell.writes).toEqual([]);
177:     expect(ctx.timeline).toEqual([]);
178:     shell.emit('C:\\> ');
179:     // 顺序严格：先转发给 deps.onData，再写自动命令（审查重点 R1 的判据）
180:     expect(ctx.timeline).toEqual(['deps.onData', 'pty.write']);
181:     expect(shell.writes).toEqual(['echo HI\r']);
182:     // 后续输出照常转发，但自动命令只写一次
183:     shell.emit('more');
184:     expect(ctx.timeline).toEqual(['deps.onData', 'pty.write', 'deps.onData']);
185:     expect(shell.writes).toEqual(['echo HI\r']);
186:   });
187: 
188:   // E5
189:   it('5s 内无输出则超时兜底写入', async () => {
190:     vi.useFakeTimers();
191:     const ctx = makeDeps();
192:     const m = new TestManager(ctx.deps, () => true);
193:     m.timeline = ctx.timeline;
194:     await m.start('c1', SHELL_ENTRY);
195:     const shell = m.shells[0];
196:     await vi.advanceTimersByTimeAsync(4999);
197:     expect(shell.writes).toEqual([]);
198:     expect(ctx.timeline).toEqual([]); // 5s 内没有任何输出，也没有写入
199:     await vi.advanceTimersByTimeAsync(2);
200:     expect(shell.writes).toEqual(['echo HI\r']);
201:     expect(ctx.timeline).toEqual(['pty.write']); // 兜底写入不依赖任何输出
202:     // 兜底写入之后，首批输出照常转发，且不会再写一次
203:     shell.emit('late prompt');
204:     expect(ctx.data.length).toBe(1);
205:     expect(shell.writes).toEqual(['echo HI\r']);
206:   });
207: 
208:   it('cmd 为空则不写任何自动命令', async () => {
209:     const ctx = makeDeps();
210:     const m = new TestManager(ctx.deps, () => true);
211:     await m.start('c1', { name: 'n', type: 'shell', shell: 'cmd' });
212:     const shell = m.shells[0];
213:     shell.emit('prompt');
214:     await vi.waitFor(() => ctx.data.length > 0);
215:     expect(shell.writes).toEqual([]);
216:   });
217: });
218: 
219: describe('状态机（规格 §7.3 / §7.5 / §12.4）', () => {
220:   // E6
221:   it('重复启动同一配置抛 STATE:', async () => {
222:     const ctx = makeDeps();
223:     const m = new TestManager(ctx.deps, () => true);
224:     await m.start('c1', SHELL_ENTRY);
225:     await expect(m.start('c1', SHELL_ENTRY)).rejects.toThrow(/^STATE:/);
226:     expect(m.shells.length).toBe(1); // 第二次没有产生第二个实例
227:     // 停止中同样拒绝
228:     const stopping = m.stop('c1');
229:     await expect(m.start('c1', SHELL_ENTRY)).rejects.toThrow(/^STATE:/);
230:     await stopping;
231:   });
232: 
233:   // E7
234:   it('终端不可用抛 VALIDATION: 且 states() 不残留', async () => {
235:     const ctx = makeDeps();
236:     const m = new TestManager(ctx.deps, (id) => id !== 'cmd');
237:     await expect(m.start('c1', SHELL_ENTRY)).rejects.toThrow(/^VALIDATION:/);
238:     expect(m.states()).toEqual({});
239:     expect(m.shells.length).toBe(0);
240:   });
241: 
242:   it('exe 为空抛 VALIDATION:', async () => {
243:     const ctx = makeDeps();
244:     const m = new TestManager(ctx.deps, () => true);
245:     await expect(m.start('c1', { name: 'n', type: 'exe', exe: '  ' })).rejects.toThrow(/^VALIDATION:/);
246:     await expect(m.start('c2', { name: 'n' } as QuickLaunchEntry)).rejects.toThrow(/^VALIDATION:/);
247:     expect(m.states()).toEqual({});
248:   });
249: 
250:   it('shell spawn 失败不残留状态（§12.4）', async () => {
251:     const ctx = makeDeps();
252:     const m = new TestManager(ctx.deps, () => true);
253:     m.shellFails = true;
254:     await expect(m.start('c1', SHELL_ENTRY)).rejects.toThrow(/^PROC:/);
255:     expect(m.states()).toEqual({});
256:   });
257: 
258:   // E8
259:   it('stop() 后发出 onExit 且 states() 变空', async () => {
260:     const ctx = makeDeps();
261:     const m = new TestManager(ctx.deps, () => true);
262:     await m.start('c1', SHELL_ENTRY);
263:     await m.stop('c1');
264:     expect(ctx.exits).toEqual([{ configId: 'c1', code: 0 }]);
265:     expect(m.states()).toEqual({});
266:     // 幂等：再 stop 不报错、不重复发 onExit
267:     await m.stop('c1');
268:     expect(ctx.exits.length).toBe(1);
269:   });
270: 
271:   it('进程自己退出 → 发 onExit、状态清空、可再次启动（§7.5 回落 [启动]）', async () => {
272:     const ctx = makeDeps();
273:     const m = new TestManager(ctx.deps, () => true);
274:     await m.start('c1', SHELL_ENTRY);
275:     m.shells[0].exit(1);
276:     expect(ctx.exits).toEqual([{ configId: 'c1', code: 1 }]);
277:     expect(m.states()).toEqual({});
278:     await m.start('c1', SHELL_ENTRY);
279:     expect(m.shells.length).toBe(2);
280:   });
281: 
282:   // E9
283:   it('stopAll 停掉全部并清空 states', async () => {
284:     const ctx = makeDeps();
285:     const m = new TestManager(ctx.deps, () => true);
286:     await m.start('c1', SHELL_ENTRY);
287:     await m.start('c2', { name: 'n', type: 'exe', exe: 'a.exe' });
288:     expect(Object.keys(m.states()).sort()).toEqual(['c1', 'c2']);
289:     await m.stopAll(3);
290:     expect(m.states()).toEqual({});
291:     expect(m.shells[0].stopArgs).toEqual([3]);
292:     expect(ctx.exeHandles[0].stopArgs).toEqual([3]);
293:   });
294: 
295:   // E10
296:   it('shell 返回 tabId ql:<id>；exe 返回 null 且经 onSysLine 反馈', async () => {
297:     const ctx = makeDeps();
298:     const m = new TestManager(ctx.deps, () => true);
299:     const shellRes = await m.start('c1', SHELL_ENTRY);
300:     expect(shellRes).toEqual({ tabId: 'ql:c1' });
301:     const exeRes = await m.start('c2', EXE_ENTRY);
302:     expect(exeRes).toEqual({ tabId: null });
303:     expect(ctx.exeRequests).toEqual(['notepad.exe']);
304:     expect(m.states()['c2']).toEqual({ running: true, stopping: false });
305:     // exe 无页签：不产生任何 onData
306:     expect(ctx.data).toEqual([]);
307:     ctx.exeHandles[0].exit(0);
308:     expect(ctx.exits).toEqual([{ configId: 'c2', code: 0 }]);
309:     expect(ctx.sysLines.length).toBeGreaterThan(0);
310:     expect(ctx.sysLines.every((l) => l.configId === 'c2')).toBe(true);
311:     expect(m.states()).toEqual({ c1: { running: true, stopping: false } });
312:   });
313: 
314:   it('write / resize 转发到进程；未运行的配置抛 STATE:', async () => {
315:     const ctx = makeDeps();
316:     const m = new TestManager(ctx.deps, () => true);
317:     await m.start('c1', SHELL_ENTRY);
318:     m.write('c1', 'dir\r');
319:     m.resize('c1', 120, 30);
320:     expect(m.shells[0].writes).toEqual(['dir\r']);
321:     expect(m.shells[0].resizeArgs).toEqual([[120, 30]]);
322:     expect(() => m.write('nope', 'x')).toThrow(/^STATE:/);
323:     expect(() => m.resize('nope', 1, 1)).toThrow(/^STATE:/);
324:   });
325: });
326: 
327: describe('PtyProcess.stopGraceful（规格 §7.5：终止 → 超时 → taskkill /T /F）', () => {
328:   // E11
329:   it('先 kill，超时后才 taskkill /T /F -PID', async () => {
330:     vi.useFakeTimers();
331:     const calls: string[] = [];
332:     const dataCbs: Array<(d: string) => void> = [];
333:     const exitCbs: Array<(e: { exitCode: number }) => void> = [];
334:     const handle = {
335:       pid: 4321,
336:       write: (d: string) => { calls.push('write:' + d); },
337:       resize: (c: number, r: number) => { calls.push('resize:' + c + 'x' + r); },
338:       kill: () => { calls.push('kill'); },
339:       onData: (cb: (d: string) => void) => { dataCbs.push(cb); return { dispose() {} }; },
340:       onExit: (cb: (e: { exitCode: number }) => void) => { exitCbs.push(cb); return { dispose() {} }; },
341:     };
342:     const p = new PtyProcess(handle);
343:     expect(p.pid).toBe(4321);
344:     expect(p.isRunning()).toBe(true);
345:     const stopped = p.stopGraceful(3);
346:     await vi.advanceTimersByTimeAsync(1000);
347:     expect(calls).toEqual(['kill']); // 第一步只有终止
348:     expect(taskkillCalls).toEqual([]); // 未到超时，不得强杀
349:     await vi.advanceTimersByTimeAsync(2500); // 越过 3s → 强杀
350:     await vi.advanceTimersByTimeAsync(2000); // 强杀后再等 exit 事件落地的窗口
351:     await stopped;
352:     expect(calls).toEqual(['kill']);
353:     expect(taskkillCalls).toEqual([{ cmd: 'taskkill', args: ['/T', '/F', '-PID', '4321'] }]);
354:     // 强杀后 exit 事件落地 → isRunning 变 false，onExit 回调收到退出码
355:     exitCbs.forEach((cb) => cb({ exitCode: 1 }));
356:     expect(p.isRunning()).toBe(false);
357:   });
358: 
359:   it('已退出的进程 stopGraceful 不再 taskkill', async () => {
360:     vi.useFakeTimers();
361:     const calls: string[] = [];
362:     const exitCbs: Array<(e: { exitCode: number }) => void> = [];
363:     const handle = {
364:       pid: 99,
365:       write: () => {}, resize: () => {},
366:       kill: () => { calls.push('kill'); },
367:       onData: () => ({ dispose() {} }),
368:       onExit: (cb: (e: { exitCode: number }) => void) => { exitCbs.push(cb); return { dispose() {} }; },
369:     };
370:     const p = new PtyProcess(handle);
371:     exitCbs.forEach((cb) => cb({ exitCode: 0 }));
372:     expect(p.isRunning()).toBe(false);
373:     await p.stopGraceful(3);
374:     expect(calls).toEqual([]);
375:     expect(taskkillCalls).toEqual([]);
376:   });
377: });
```
