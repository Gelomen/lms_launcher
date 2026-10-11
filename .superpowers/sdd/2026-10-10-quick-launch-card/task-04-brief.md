# 任务 4 简报 · 终端探测 `quick-launch-terminals.ts`

## 这个任务在项目里的位置

「快捷启动卡片」计划 14 个任务中的第 4 个：探测本机可用的终端（pwsh / Windows PowerShell / cmd / WSL），只返回可用项。任务 6 的 `ql_terminals` IPC 与任务 12 的弹窗下拉直接消费它；任务 5 的 `spawnShell` 用它的 path。

## 你的完成判据（照它逐行执行并勾选）

`docs/superpowers/checks/2026-10-10-quick-launch-card/task-04-terminal-detection.md`
（A→I 逐行执行；A2 要求**手跑** `wsl.exe -l -q` 复核本机基线；命令与真实输出填进该表「J. 执行记录」。H 段与 I 段最后一条留空不勾——按 K5，提交由主代理在验收后执行）

## 计划 §任务 4（逐字）

```
### 任务 4：终端探测 quick-launch-terminals.ts

**文件：** 创建 src-main/quick-launch-terminals.ts；测试 src-main/quick-launch-terminals.test.ts

**接口：** TerminalInfo = { id: TerminalId; path: string }；parseWslDistroOutput(buf: Buffer): string[]；detectTerminals(): TerminalInfo[]

- [ ] 步骤 1：编写失败的测试

it('解析 wsl -l -q 的 UTF-16LE 输出', () => {
  expect(parseWslDistroOutput(Buffer.from('Ubuntu\nDebian\n', 'utf16le'))).toEqual(['Ubuntu', 'Debian']);
});
it('空输出（未安装发行版）解析为空数组', () => {
  expect(parseWslDistroOutput(Buffer.alloc(0))).toEqual([]);
  expect(parseWslDistroOutput(Buffer.from('\r\n\r\n', 'utf16le'))).toEqual([]);
});
it('本机探测结果里 cmd 可用且 path 存在', () => {
  const cmd = detectTerminals().find((t) => t.id === 'cmd');
  expect(cmd).toBeDefined();
  expect(existsSync(cmd!.path)).toBe(true);
});

- [ ] 步骤 2：运行测试验证失败 —— FAIL（模块不存在）
- [ ] 步骤 3：实现 按规格 §6.1 四行探测表；spawnSync + windowsHide: true + 单项 3s 超时；任何异常 → 该项不可用；**不缓存**
- [ ] 步骤 4：运行测试验证通过 —— 全 PASS；本机列表应为 powershell / cmd / pwsh（**不含 wsl**）
- [ ] 步骤 5：Commit —— 由主代理在验收后执行，你不要 git add、不要 commit
```

## 规格（有约束力的权威，逐字）

§6.1 探测表：

| 终端 | 判定 |
|---|---|
| `powershell` | `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` 存在 |
| `cmd` | `%ComSpec%` 或 `%SystemRoot%\System32\cmd.exe` 存在 |
| `pwsh` | `where.exe pwsh` 退出码 0 且首行为存在的文件 |
| `wsl` | `wsl.exe` 存在 **且** `wsl -l -q` 退出码 0 且解析出的发行版名非空 |

- **只返回可用项**；每次 `ql_terminals`（= 每次打开弹窗）实时探测，不跨调用缓存 → 用户之后装好 WSL 发行版，下次打开弹窗自动出现。
- `spawnSync` + `windowsHide: true` + 单项 3s 超时；任何异常 = 该项不可用。
- `wsl -l -q` 输出是 **UTF-16LE**，需剥 NUL 后按行解析（纯函数 `parseWslDistroOutput(buf: Buffer): string[]`）。
- **本机实测**：pwsh 7.6.6 / Windows PowerShell 5.1 / cmd 可用；`wsl.exe` 存在但无发行版 → 不出现。
- 主进程只下发 `{ id, path }`，**标签文案由渲染端 `t()` 决定**。

§6.2 WSL 粒度：只列**默认发行版**一项（选中即 `wsl.exe`）。要多发行版 → 用户自建一条 PowerShell 快捷启动，命令写 `wsl -d <发行版名>`。
§6.3 本机证据：`pwsh 7.6.6` ✅ / `Windows PowerShell 5.1.26100.9549` ✅ / `cmd` ✅ / `wsl -l -q` 退出码 1（未安装发行版）⛔
§12 单元 3：`parseWslDistroOutput`：UTF-16LE → 发行版名；空输出 → `[]`。

## 前序任务已交付的接口（已提交，HEAD = be3475c）

- 任务 3：`src-main/quick-launch-config.ts:12` 已导出 `export type TerminalId = 'pwsh' | 'powershell' | 'cmd' | 'wsl';`
  → **从 `./quick-launch-config` import 这个类型，不要在本文件里重复定义**（check 表 C1 要的是 `TerminalInfo` 的形状，不是再定义一个 `TerminalId`）。

## 边界与硬约束（越界即不勾）

- 只碰两个文件：新建 `src-main/quick-launch-terminals.ts`、新建 `src-main/quick-launch-terminals.test.ts`（G3 会核）
- 只做探测与解析，**不 spawn PTY**、不 import node-pty（那是任务 5）
- 每个 `spawnSync` 带 `windowsHide: true` + 3s 超时；任何异常（超时 / ENOENT / 非 0）→ 该项不可用，**不得抛出**
- **不跨调用缓存**：每次 `detectTerminals()` 都实测
- 只返回 `{ id, path }`，不返回标签文案（文案在渲染端 `t()`，见 K4）
- WSL 只列默认发行版一项，不做多发行版枚举（规格 §6.2 / §2 非目标）
- 严格 TDD：先落三个用例 → 跑 D2 看红（模块不存在）→ 实现 → 跑 D4 看绿，并把本机实际探测结果（应为 powershell / cmd / pwsh，不含 wsl）记进 J 段
- 回归门 G2 要真跑：`npx tsc -p tsconfig.main.json --noEmit` 无错
- **不要 git add、不要 commit、不要派子代理**

## 报告

完整报告写到 `.superpowers/sdd/2026-10-10-quick-launch-card/task-04-report.md`：D2/D4/G1/G2/G3 与 A2 的实际输出摘要、E1–E7 的证据（E4/E5/E6/E7 若靠代码结构而非用例，写清是哪一行）、自审、疑虑。
回传只给：状态一行 + 测试小结一行 + 疑虑（若有）。
