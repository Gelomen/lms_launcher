# 任务 2 派单输入（逐字摘录，主代理生成）

来源：docs/superpowers/specs/2026-10-15-quick-launch-exe-path-precheck.md §6.2 / §7.1；docs/superpowers/plans/2026-10-15-quick-launch-exe-path-precheck.md §任务 2。
本任务的 check 表（逐行执行）：docs/superpowers/checks/2026-10-15-quick-launch-exe-path-precheck/task-02-ipc-ql-end-to-end-gate.md

## 任务 1 已落地的事实（不要重做、不要改）

- `isLaunchableExe` / 预检门已在 `src-main/shell-execute.ts`（门 = :269-274，抛错在 `api.shellExecute` 之前）。
- `ipc-ql.test.ts` 的「exe 启动失败」用例夹具已改为真 `notepad.exe`（两处同一字面量：:353 + :371）—— 索引 K10 已把它从本任务移到任务 1，**本任务不得再碰它**。
- 重解析点（WindowsApps app execution alias）已按 §6.1 判定① 第二支放行（索引 K11）；`ipc-ql.test.ts:717` 的 `mspaint.exe` 并发用例因此是绿的，**不要动它**。
- 基线（任务 1 提交后实测）：`npm test` → `Test Files 52 passed (52)` / `Tests 906 passed (906)`，exit 0。
- 条数口径（索引 K13）：按 **vitest 报的条数**，不是 `it(` 字面计数。`ipc-ql.test.ts` = **27**；本任务之后 = 28，全量 = **907**。

## 规格 §6.2（预检门，已实现，本任务只守它的端到端牙）

### 6.2 落点（§8-Q8）

`launchShellExe`（`src-main/shell-execute.ts:197`）在调用 `api.shellExecute` **之前**：

```
if (!isLaunchableExe(exe)) {
  throw new Error('PROC: ' + t('err.proc.exeNotFound', { exe }));
}
```

- 一处盖住 exe 类型的全部启动路径（`main.ts:1065` 是 `launchShellExe` 的唯一生产调用方）；提权宿主那条走 `winShell.shellExecute`（`src-main/ql-elevated.ts:141`），不经此处，不受影响。
- 抛错在 `api.shellExecute` 之前 → 「假接缝里 Shell 未被调用」就是「不弹系统框、不阻塞」的牙（§7.1-4）。
- 前缀仍是 `PROC: `（前置规格索引 G7 五种前缀口径）；适配器 `src-main/main.ts:1066-1072` 的 `emitLog('[lms_launcher] ' + e.message, 'sys')` 一字不改。

## 规格 §7.1（验收，本任务负责第 7、8 条）

### 7.1 自动化（先红后绿）

`src-main/shell-execute.test.ts`：

1. `isLaunchableExe`：不存在的绝对路径（`Z:\no-such-dir\no-such.exe` 与临时目录下的 `no-such-zzz.exe`）→ `false`。
2. `isLaunchableExe`：存在的目录（P6 同型）→ `false`；存在的非 `.exe` 文件（本仓 `package.json`）→ `false`。
3. `isLaunchableExe`：`process.execPath`（必然存在的 `.exe`）→ `true`；把它的目录临时前置进 `process.env.PATH` 后用**裸名**（basename）→ `true`（P10 的「裸名不得误杀」）。
3b. `isLaunchableExe`：`PATH` 里的 **app execution alias**（`mspaint.exe`，P13/P14）→ `true`。夹具只能用机器上真实存在的别名（P15：`symlinkSync` 造不出，`EPERM`）；该别名不在 `PATH` 时 `it.skipIf` 跳过并在注释里指向 §7.2-9。
4. `launchShellExe` 预检门：不存在的绝对路径 + 假接缝 → 抛错以 `PROC: `开头且含 `t('err.proc.exeNotFound', { exe })`，且 `api.shellExecute` / `pidOf` / `isAlive` **均未被调用**。
5. 既有用例的 `EXE`（`src-main/shell-execute.test.ts:12` 的 `E:\QiYou\QiYou.exe`，机器相关）改为 `process.execPath`；用例 1-8 与两条 verb 用例的断言不变。

`src-main/ipc-ql.test.ts`：

6. 既有「exe 启动失败」用例（`:352-377`）：条目 exe 从 `no-such-exe-zzz.exe` 改为 `notepad.exe`（真存在，预检放行）。**同一字面量共两处**：`:353` 的条目值 + `:371` 的 `t('err.proc.uacCancelled', { exe })` 占位值——只改前者会让该用例红在 `:371`（实测 `expected '[lms_launcher] PROC: notepad.exe 已取消…' to contain 'no-such-exe-zzz.exe 已取消…'`）。两处同改，断言形状与所钉行为不变，假接缝仍返回 1223 → 断言仍是 `err.proc.uacCancelled`（证明 1223 分支未被削弱）。**这条改动归任务 1**：它是预检生效的直接后果（不存在的 exe 已到不了假接缝），不是新能力的门；索引 K10。
7. 新用例：条目 exe = `Z:\no-such-dir\no-such.exe` → `ql_start` reject 以 `PROC: `开头；sys 日志含 `t('err.proc.exeNotFound', { exe })`；替换过的 `winShell.shellExecute` **一次都没被调用**（不弹系统框、不阻塞的端到端牙）；`ql_states` 不残留。
8. 既有裸名用例（`:330-350`、`:381-416`）不改断言，作为「裸名仍可用」的回归门。

回归门：`npm test` 全量绿（基线 P8 = 52 files / 901 tests，新增后只增不减）；`npx tsc --noEmit` exit 0；`key-coverage` / `no-hardcoded` 两道 i18n 硬门绿。

## 计划 §任务 2（逐字）

### 任务 2：`ipc-ql.test.ts` 的端到端门

**改什么**：§7.1-7 / 8。**只改测试**（新增一条用例），生产代码已由任务 1 完成；§7.1-6 那条一行改写已随任务 1 落地（K10）。

- [ ] **步骤 0：起点核对**：`ipc-ql.test.ts:352-377`（既有「exe 启动失败」用例，`:353` 的 `no-such-exe-zzz.exe`、`:358` 替换 `winShell.shellExecute` 的既有做法）、`:330-350` 与 `:381-416`（裸名用例）、`main.ts:1057-1079`（适配器，**不改**）。
- [ ] **步骤 1：先改测试**：
  - 新用例 `exe_path_not_found_never_reaches_the_shell`：条目 exe = `'Z:\\no-such-dir\\no-such.exe'`；把 `winShell.shellExecute` 换成**计数** spy；断言 `ql_start` reject 以 `PROC: `开头、sys 日志含 `t('err.proc.exeNotFound', { exe })`、**spy 调用次数为 0**、`ql_states` 为 `{}`（不残留）
- [ ] **步骤 2：跑红取证**：任务 1 已合并，新用例直接绿 → 用变异取证的红色：临时把 `launchShellExe` 的预检门注释掉，跑 `npx vitest run src-main/ipc-ql.test.ts` → 新用例必红（会走到真 Shell、弹系统框、`shellExecute` 计数 ≥1）。把两次输出贴 J 段，然后**恢复门**。
- [ ] **步骤 3：跑绿 + G5 + G6 + 全量**：`Test Files 52 passed (52)`、`Tests 907 passed (907)`（906 + 1）。
- [ ] **步骤 4：Commit（主代理）**：`test(main): 快捷启动 exe 路径预检的端到端门（Shell 不被调用）`

---
