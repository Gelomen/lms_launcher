# 任务 2 实现报告 · `ipc-ql.test.ts` 的端到端门（Shell 不被调用）

- 派单：AGENTS.md 工作流第 4 步（子代理驱动），本任务 = 一个子代理；派单输入 = 规格 §6.2 / §7.1 + plan §任务 2 + 本任务 check 表 + 索引 G/K 组
- check 表：`docs/superpowers/checks/2026-10-15-quick-launch-exe-path-precheck/task-02-ipc-ql-end-to-end-gate.md`（A→J 逐行执行；**J 段已填真实命令与输出，C3 的行号按表内「实现时填」填上；A-I 的 ☐ 一律未落**，按本轮规则落勾归主代理）
- 状态：**改动全部在工作区，未 `git add`、未 commit（索引 G8）**
- 一句话结论：新用例 `exe_path_not_found_never_reaches_the_shell` 已落地并绿；变异取证（索引 K8）证明它**有牙**——去掉 `launchShellExe` 的预检门后该用例必红；恢复门后 `git diff src-main/shell-execute.ts` 为空。定向 `Tests 28 passed (28)`、tsc 无输出、i18n `18 passed (18)`、全量 `Test Files 52 passed (52)` / `Tests 907 passed (907)`（906 + 1，索引 K9）。改动范围 = 恰 `src-main/ipc-ql.test.ts` 一份、纯增量 44 行。4 处文档数字/行号与实际不一致，见「偏离 1–4」（都不改设计）。

## 1. 做了什么（按 D1→D4）

| 步 | 内容 |
|---|---|
| A1–A4 | 起点核对：HEAD = `17a4e6c fix(main): 快捷启动 exe 启动前预检目标…`（任务 1），分支 `feat/quick-launch`，`git status --porcelain` 无已跟踪改动（只有未跟踪的派单简报 `task-02-brief.md`）。基线 `npm test` = `52 passed (52)` / `906 passed (906)`，exit 0，其中 `✓ src-main/ipc-ql.test.ts (27 tests)` ← 印证索引 K13 的 27 条口径。锚点行号属实：`:105` 的 `import { winShell } from './shell-execute';`、`:330-350` 裸名用例、`:352-377`（`:353` 现值已是 `exe: 'notepad.exe'`、`:357-358` 替换 `winShell.shellExecute`、`:371` 断言 `uacCancelled`）、`:381-416` 提权形状门（`:397` 两条都断言 `notepad.exe`）。任务 1 的门在位：`shell-execute.ts:269-274`（`isLaunchableExe` 在 `api.shellExecute` 之前抛 `PROC: ` + `t('err.proc.exeNotFound', { exe })`），未自行补任何东西 |
| B1 | 只改 `src-main/ipc-ql.test.ts`：在既有「exe 启动失败」用例（`:352-377`）之后、提权形状门之前**新增一条**用例（`:379-421`，`it(` 在 `:384`）。`:330-350` / `:352-377` / 提权门 / `:717` 的 `mspaint.exe` 并发用例一字未改（`git diff --numstat` = `44 0`，纯增量）；未改任何 `src-main/*.ts` 生产文件（F1） |
| C2 | 用例名逐字 `exe_path_not_found_never_reaches_the_shell`。夹具 `MISSING = 'Z:\\no-such-dir\\no-such.exe'`；`ql_save` 条目 id `qlshape05`（`config.ts:174-178` 的 `validateConfigId` 口径）；观察点 = `winShell.shellExecute` 属性替换（F2：照 `:357-358` / `:386-392` 的既有夹具形状，`finally` 还原），换成**计数** spy（`shellCalls += 1`，返回 `{ ok:false, handle:null, win32Error:1223 }`，不委托真实现）。断言：`ql_start` `rejects.toThrow(/^PROC: /)` → sys 行含 `t('err.proc.exeNotFound', { exe: MISSING })` → 不含 `uacCancelled` / `spawnFail` 文案 → `shellCalls` **为 0** → `invoke('ql_states')` 为 `{}`。断言全部走 `t(...)`，无写死中文；前缀只有 `PROC: `（F4） |
| D1 | 定向跑：`Tests 28 passed (28)`（27 + 1，K13）。**直接绿** → 按 K8 不能只凭这条说「有牙」，故做 D2 |
| D2 | 变异取证：把 `shell-execute.ts:272-274` 的预检门整块注释掉 → 同一条命令 → `Tests 1 failed \\| 27 passed (28)`，红点 `ipc-ql.test.ts:409:30`，`Received` 是 `err.proc.uacCancelled` 文案（详见 J-3 与「偏离 4」）。随后**恢复门**：`git diff -- src-main/shell-execute.ts` 空输出（与 HEAD 逐字节一致），复跑 `shell-execute.test.ts` = `15 passed (15)`（表 D2 写 14，见偏离 2） |
| D3 | 定向 `28 passed (28)`（表写 30，见偏离 1）；`npx tsc --noEmit -p tsconfig.main.json` 无输出、`exit=0`；`npx vitest run src-main/i18n` = `Test Files 4 passed (4)` / `Tests 18 passed (18)`（key-coverage / dict / no-hardcoded 三门绿，G6） |
| D4 | `npm test` = `Test Files 52 passed (52)` / `Tests 907 passed (907)`，exit 0（906 + 1，K9） |
| G2 | 相邻回归 `npx vitest run src-main/shell-execute.test.ts src-main/quick-launch.test.ts` = `Test Files 2 passed (2)` / `Tests 49 passed (49)`（= 15 + 34），两文件均不在 `git diff --name-only` 里 |

**未动的东西（F1–F4 / G4 / G9）**：`src-main/shell-execute.ts`（变异取证期间临时改、取证后已还原，现与 HEAD 一致）、`src-main/ql-elevated.ts`（含 `:110-115` 的 1223 拷贝）、`src-main/main.ts`（适配器 `:1057-1079` 一字未改）、`src-main/quick-launch.ts`、`src-main/i18n/dict.ts`、`src-main/shell-execute.test.ts`、`package.json`。`git diff --name-only` = 恰 `src-main/ipc-ql.test.ts` 一份。

## 2. 新用例逐字（`src-main/ipc-ql.test.ts:379-421`，`it(` 在 `:384`）

```ts
  // 2026-10-15-quick-launch-exe-path-precheck 任务 2（规格 §6.2 / §7.1-7 / 表 C2、E1、E4 / RF1）：
  // 预检的全部价值是「**不调 Shell**」——调了会弹 Shell 自己的系统错误框并把主线程卡死（实测 6.1–38.9s，§3-P1/P4）。
  // 单元层的 precheck_blocks_before_the_shell_is_called 守的是假接缝（api 由测试构造）；这条守**经 IPC 通道那条**：
  // 条目 exe = 不存在的绝对路径 → ql_start 同步 reject（PROC: 前缀）+ sys 行是 err.proc.exeNotFound +
  // 替换过的 winShell.shellExecute 一次都没被调用（不弹系统框、不阻塞的端到端牙）+ ql_states 不残留（前置规格 §7.5）。
  it('exe_path_not_found_never_reaches_the_shell', async () => {
    const MISSING = 'Z:\\no-such-dir\\no-such.exe'; // 规格 §7.1-1 的同型夹具：含盘符、目录不存在
    await invoke('ql_save', 'qlshape05', { name: '形状门 路径不存在', type: 'exe', exe: MISSING });

    let shellCalls = 0;
    const original = winShell.shellExecute;
    // 计数 spy，夹具形状照 :357-358 / :386-392（表 F2：不新建夹具）：只数次数、不委托真实现——
    // 真 ShellExecuteEx 打一个不存在的 exe 会弹系统错误框并把 vitest worker 卡住（E19 / 索引 R8、K17）。
    winShell.shellExecute = (file: string, nShow: number, opts?: { verb?: string | null; parameters?: string | null }) => {
      shellCalls += 1;
      return { ok: false, handle: null, win32Error: 1223 };
    };
    try {
      await expect(invoke('ql_start', 'qlshape05')).rejects.toThrow(/^PROC: /);
      // 日志行行首 [lms_launcher]（sys 通道口径，索引 K23）、PROC: 紧随其后（索引 G1：不新增前缀）
      await waitFor(
        () => cap.sends.some((s) => s.channel === 'log-line' && /^\[lms_launcher\] PROC:/.test(String((s.payload as { line?: string }).line ?? ''))),
        5000, '[lms_launcher] PROC: 日志行',
      );
      const logLines = sendsOf('log-line') as Array<{ line: string; stream: string }>;
      const procLines = logLines.filter((l) => l.stream === 'sys' && /^\[lms_launcher\] PROC:/.test(l.line));
      // 取**最后**一条：本文件前面的用例也发过 PROC: 行（:368 那条 uacCancelled），find() 会拿到旧行
      const procLine = procLines[procLines.length - 1];
      expect(procLine, 'sys 通道里必须有 PROC: 行 —— 原因行只由 main.ts:1071 这条日志负责').toBeTruthy();
      // 文案必须是预检那条（带用户那一行的 exe；断言走 t()，不写死中文）
      expect(procLine!.line).toContain(t('err.proc.exeNotFound', { exe: MISSING }));
      // 不是 Shell 失败兜底的那两条（去掉门就换成它们 —— D2 的变异红）
      expect(procLine!.line).not.toContain(t('err.proc.uacCancelled', { exe: MISSING }));
      expect(procLine!.line).not.toContain(t('err.proc.spawnFail', { exe: MISSING, err: 'win32=1223' }));
      // RF1 的牙：Shell 一次都没被调用 = 不弹系统框、不阻塞主线程
      expect(shellCalls, '预检失败时不得调 Shell（规格 §6.2 / 表 E1 / RF1）').toBe(0);
      // 表 E4：失败不残留状态（quick-launch.ts:293-297 在 set 之前抛出）
      expect(invoke('ql_states'), '失败不残留状态').toEqual({});
    } finally {
      winShell.shellExecute = original;
      await invoke('ql_stop', 'qlshape05');
    }
  }, 30000);
```

一处刻意的写法差异（不是偏离，是实现说明）：日志行取 `procLines[procLines.length - 1]` 而不是照 `:368` 的 `.find()`。原因：本文件前面的用例（`:352-377`、提权门）也发过 `[lms_launcher] PROC:` sys 行，`find()` 会拿到旧行 → 新用例假绿。取最后一条 + 再断「不含 `uacCancelled` / `spawnFail`」把「这条日志确由本次失败产生」钉住，也正是 D2 变异红的落点。

## 3. 断言 ↔ 表 E 段的对应

| 表项 | 由哪一行守 | 结果 |
|---|---|---|
| E1（端到端：同步 reject + `exeNotFound` 文案 + 真接缝一次都没被调用 + 不残留） | `:397` / `:409` / `:414` / `:416` | 绿；去掉门必红（J-3） |
| E2（真 UAC 取消 1223 仍 `uacCancelled`，`{exe}` 是用户那一行的目标） | 既有 `:352-377`（`:353` + `:371` 归任务 1，本任务未碰） | 绿（28 条里含它） |
| E3（裸名不被误杀） | 既有 `:330-350`（现仍 `:330-350`）与提权门（现 `:425-460`），一字未改 | 绿 |
| E4（失败不残留状态） | `:416` 的 `ql_states` 为 `{}` | 绿 |

## 4. 命令与真实输出（与 check 表 J 段同内容）

| # | 命令 | 真实输出摘要 |
|---|---|---|
| J-1 | `git log --oneline -3`；`git status --porcelain`；`npm test`（基线，00:21:44） | HEAD `17a4e6c fix(main): 快捷启动 exe 启动前预检目标…`（任务 1），分支 `feat/quick-launch`；porcelain 只有 `?? .superpowers/sdd/…/task-02-brief.md`（派单简报），无已跟踪改动。基线 `Test Files 52 passed (52)` / `Tests 906 passed (906)`，`Duration 15.24s`，exit 0；其中 `✓ src-main/ipc-ql.test.ts (27 tests)` ← 印证索引 K13 的 27 条口径 |
| J-2 | D1 写新用例后定向：`npx vitest run src-main/ipc-ql.test.ts`（00:23:51） | `✓ src-main/ipc-ql.test.ts (28 tests)` / `Test Files 1 passed (1)` / `Tests 28 passed (28)`，exit 0（27 + 1，K13）。**直接绿** → 按 K8 不能只凭这条说「有牙」，故有 J-3 |
| J-3 | D2 变异取证（索引 K8）：把 `shell-execute.ts:272-274` 的预检门整块注释掉，再跑同一条命令（00:24:14） | `❯ src-main/ipc-ql.test.ts (28 tests \| 1 failed)` / `Tests 1 failed \| 27 passed (28)`，exit 1；`FAIL src-main/ipc-ql.test.ts > C5-C9 + C12 … > exe_path_not_found_never_reaches_the_shell`；`AssertionError: expected '[lms_launcher] PROC: Z:\no-such-dir\n…' to contain 'Z:\no-such-dir\no-such.exe 不存在、不是 .ex…'`；`Expected: "Z:\no-such-dir\no-such.exe 不存在、不是 .exe 文件或不可访问"` / `Received: "[lms_launcher] PROC: Z:\no-such-dir\no-such.exe 已取消管理员权限请求"`；位置 `src-main/ipc-ql.test.ts:409:30`；其余 27 条不受影响 |
| J-4 | D2 恢复门 + 边界核对：`git diff -- src-main/shell-execute.ts`；`git diff --name-only`；`git diff --numstat`；`npx vitest run src-main/shell-execute.test.ts` | 前者**空输出**（与 HEAD 逐字节一致）；`git diff --name-only` = 只有 `src-main/ipc-ql.test.ts`；`git diff --numstat` = `44 0`（44 增 0 删）；`shell-execute.test.ts` 复跑 `Tests 15 passed (15)`（表 D2 写 14，见偏离 2） |
| J-5 | D3 / G1 / G2 / G3：`npx vitest run src-main/ipc-ql.test.ts`（恢复门后复跑）；`npx vitest run src-main/shell-execute.test.ts src-main/quick-launch.test.ts`；`npx tsc --noEmit -p tsconfig.main.json`；`npx vitest run src-main/i18n` | 定向 `✓ src-main/ipc-ql.test.ts (28 tests)` / `Tests 28 passed (28)`，exit 0（表 D3/G1 写 30，见偏离 1）；相邻回归 `Test Files 2 passed (2)` / `Tests 49 passed (49)`（= shell-execute 15 + quick-launch 34，两文件均不在 `git diff --name-only` 里）；tsc **无输出**、`tsc exit=0`；i18n `Test Files 4 passed (4)` / `Tests 18 passed (18)`（key-coverage / dict / no-hardcoded 三门绿） |
| J-6 | D4 / G4 全量：`npm test` | `✓ src-main/ipc-ql.test.ts (28 tests)` / `Test Files 52 passed (52)` / `Tests 907 passed (907)`（906 + 1，索引 K9），`Duration 9.29s`，exit 0 |

## 5. 偏离清单（不改设计，只报告）

### 偏离 1：表 D3 / G1 的预期条数写 `Tests 30 passed (30)`（29 + 1），实测 28（27 + 1）

- 证据：基线该文件 vitest 自报 `(27 tests)`（J-1），新增后自报 `(28 tests)`（J-2 / J-6 / J-7）。
- 依据：索引 K13 已把条数口径定为「vitest 报的条数」，并明确「本表原写 29 是错的（字面计数与循环都数错）」、`ipc-ql.test.ts` = **27**、任务 2 之后 = **28**；但 task-02 表 D3/G1 的 30 与索引 V 组「任务 2 末尾」行的「该文件 30 passed」都未随之同步。
- 处理：按 K13 口径（28）为准；我没有改表里的数字（落勾与文档同步归主代理）。全量 907 与 K9 一致，不受影响。

### 偏离 2：表 D2 写「复跑确认 `shell-execute.test.ts` 仍 14 绿」，实测 15

- 证据：J-4 `Tests 15 passed (15)`；J-5 两文件合计 49 = 15 + 34（`quick-launch.test.ts` 34 条，与索引 K13 记的 61 = 27 + 34 口径一致）。
- 依据：索引 K13 写明任务 1 把该文件 10 → 15；表 D2 的 14 是任务 1 落地前的旧数。

### 偏离 3：表 A3 / B1 引用的锚点行号在新用例插入后整体后移（内容一字未改）

- 实测：`git diff --numstat` = `44 0`（纯增量），故 `:330-350` 与 `:352-377` 行号不变；原 `:381-416`（提权形状门）现移到 `:425-460`；`:717` 的 `mspaint.exe` 现移到 `:761`。
- 处理：已在表 C3 登记真实行号（该行标「实现时填」）。B1 的「一字不改」按内容核对成立（0 删除），不按行号核对。

### 偏离 4：D2 的变异红表现为「文案换成 `uacCancelled`」，没有真的弹系统框 / 卡 worker

- 表 D2 的预期措辞是「走到真 Shell（`shellExecute` 计数 ≥1、弹系统框、worker 被卡）**或**文案不是 `exeNotFound`」——实测命中后一支。
- 原因：计数 spy 按表 F2「不新建夹具形状」照 `:357-358` 的既有做法**不委托真实现**（返回 1223）。若委托真实现，去掉门后真 `ShellExecuteExW` 打不存在的 exe 会弹系统错误框并把 vitest worker 卡住（E19 / 索引 R8、K17；实测旧路径 6.1–38.9s），取证反而不可控。
- 红仍然证明「Shell 被调用」：`Received` 的 `err.proc.uacCancelled` 文案只在 `api.shellExecute` 返回 `{ ok:false, win32Error:1223 }` 之后才可能产生（`shell-execute.ts:281-284`），即 spy 必被调用（≥1），故 `:414` 的 `toBe(0)` 同必红（vitest 停在第一条断言 `:409`，所以 J-3 只显式显示这一条）。
- 「真弹系统框 / 真阻塞」这条牙归任务 3 的真机清单（规格 §7.2），本任务不造真 Shell 调用。

## 6. 给主代理的验收提示

- 工作区现状（实测 `git status --porcelain`）：

  ```
   M docs/superpowers/checks/2026-10-15-quick-launch-exe-path-precheck/task-02-ipc-ql-end-to-end-gate.md
   M src-main/ipc-ql.test.ts
  ?? .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/task-02-brief.md
  ?? .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/task-02-report.md
  ```

  `git diff --numstat` = `44 0`（`src-main/ipc-ql.test.ts`，纯增量）与 `7 5`（本任务 check 表：只填 C3 的行号与 J 段六行，A-I 的勾一个没落）。`git diff -- src-main/shell-execute.ts` **空输出**（变异已还原，与 HEAD 逐字节一致）。

- 普查实测（`node .superpowers/sdd/2026-10-15-quick-launch-exe-path-precheck/tick-census.mjs`，exit 0）：`task-02-ipc-ql-end-to-end-gate.md ☑=0 裸☐=27 I段 -[ ]=7 H2=未提交` —— 属预期（本轮规则：落勾归主代理）。表列数已普查：所有表格行的列数与表头一致（0 处破损）。
- H1 暂存范围应为恰 `src-main/ipc-ql.test.ts`；H2 commit message 逐字：`test(main): 快捷启动 exe 路径预检的端到端门（Shell 不被调用）`。
- 表 A-I 的 `☐` 我一个都没落（本轮规则）；落勾与 H1/H2 的暂存提交归主代理（验收之后、commit 之前）。
- 若要同步偏离 1 / 偏离 2 的数字（30 → 28、14 → 15），按 AGENTS.md「后续更新该文档的流程」第 2 条应在 `00-index.md` 的 K 组登记一行；我只报告，未改 spec / plan / 索引。
