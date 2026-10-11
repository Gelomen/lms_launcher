# 审查包 · 任务 4（quick-launch-terminals.ts）

BASE = 5db815f（HEAD 未变：按 K5 实现者不提交；两个源码文件是**未跟踪**新文件，git diff 不显示，故附全文）

## git status --porcelain（方括号定界，前导空格 = 未暂存）

```
 M docs/superpowers/checks/2026-10-10-quick-launch-card/task-04-terminal-detection.md
?? src-main/quick-launch-terminals.test.ts
?? src-main/quick-launch-terminals.ts
```

## git diff HEAD --stat（已跟踪文件）

```
.../task-04-terminal-detection.md                  | 77 ++++++++++++----------
 1 file changed, 44 insertions(+), 33 deletions(-)
```

## 新增未跟踪文件全文：src-main/quick-launch-terminals.ts（119 行）

```ts
  1: // src-main/quick-launch-terminals.ts
  2: // 任务 4：终端探测（pwsh / Windows PowerShell / cmd / WSL），只返回本机可用项。
  3: // 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md
  4: //   §6.1 探测表（四行判定 + 只返回可用项 + 不跨调用缓存 + spawnSync/windowsHide/3s + 异常=不可用）
  5: //   §6.2 WSL 粒度（只列默认发行版一项，path = wsl.exe；多发行版走「PowerShell + wsl -d <名>」，不枚举）
  6: //   §6.3 本机基线（pwsh ✅ / powershell ✅ / cmd ✅ / wsl -l -q 退出码 1 ⛔）
  7: //   §12.3 parseWslDistroOutput（UTF-16LE → 发行版名；空输出 → []）
  8: // 消费方：任务 6 的 ql_terminals IPC、任务 12 的下拉、任务 5 的 spawnShell（用 path）。
  9: // 只下发 { id, path }：标签文案由渲染端 t() 决定（索引 K4 / check F4）。
 10: // 不 import node-pty、不 spawn PTY——终端生命周期在任务 5 的 QuickLaunchManager。
 11: import { existsSync } from 'node:fs';
 12: import { join } from 'node:path';
 13: import { spawnSync } from 'node:child_process';
 14: // TerminalId 由任务 3 提供（src-main/quick-launch-config.ts:12），此处只 import 类型，不重复定义。
 15: import type { TerminalId } from './quick-launch-config';
 16: 
 17: export interface TerminalInfo {
 18:   id: TerminalId;
 19:   path: string;
 20: }
 21: 
 22: // 规格 §6.1：单项 3s 超时；任何异常（超时 / ENOENT / 非 0）= 该项不可用（check F1 / F2）
 23: const SPAWN_TIMEOUT_MS = 3000;
 24: const STDIO = ['ignore', 'pipe', 'pipe'] as const;
 25: 
 26: function systemRoot(): string {
 27:   return process.env.SystemRoot || process.env.windir || 'C:\\WINDOWS';
 28: }
 29: 
 30: // 规格 §6.1 powershell 行：固定路径存在性判定
 31: function detectPowerShell(): TerminalInfo | null {
 32:   const p = join(systemRoot(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
 33:   return existsSync(p) ? { id: 'powershell', path: p } : null;
 34: }
 35: 
 36: // 规格 §6.1 cmd 行：%ComSpec% 优先，回退 %SystemRoot%\System32\cmd.exe
 37: function detectCmd(): TerminalInfo | null {
 38:   const comSpec = process.env.ComSpec;
 39:   if (comSpec && existsSync(comSpec)) return { id: 'cmd', path: comSpec };
 40:   const p = join(systemRoot(), 'System32', 'cmd.exe');
 41:   return existsSync(p) ? { id: 'cmd', path: p } : null;
 42: }
 43: 
 44: // where.exe <name> → 退出码 0 且首行是真实存在的文件，否则 null（规格 §6.1 pwsh 行）
 45: function whereFirstExisting(name: string): string | null {
 46:   const r = spawnSync('where.exe', [name], {
 47:     windowsHide: true,
 48:     timeout: SPAWN_TIMEOUT_MS,
 49:     encoding: 'utf-8',
 50:     stdio: [...STDIO],
 51:   });
 52:   if (r.error || r.status !== 0) return null;
 53:   const lines = (r.stdout ?? '').split(/\r?\n/);
 54:   for (const line of lines) {
 55:     const candidate = line.trim();
 56:     if (!candidate) continue; // 跳过空行，取第一条非空行 = where.exe 的最高优先级命中
 57:     return existsSync(candidate) ? candidate : null;
 58:   }
 59:   return null;
 60: }
 61: 
 62: function detectPwsh(): TerminalInfo | null {
 63:   const p = whereFirstExisting('pwsh');
 64:   return p ? { id: 'pwsh', path: p } : null;
 65: }
 66: 
 67: // wsl.exe 的位置：where.exe 命中，或回退 %SystemRoot%\System32\wsl.exe（与 cmd 行同口径的固定路径回退）
 68: function wslExePath(): string | null {
 69:   const found = whereFirstExisting('wsl.exe');
 70:   if (found) return found;
 71:   const fallback = join(systemRoot(), 'System32', 'wsl.exe');
 72:   return existsSync(fallback) ? fallback : null;
 73: }
 74: 
 75: // 规格 §6.1 wsl 行：wsl.exe 存在 且 wsl -l -q 退出码 0 且解析出的发行版名非空。
 76: // 本机基线（规格 §6.3）：wsl.exe 存在但无发行版 → 退出码 1 → 不出现。
 77: // 规格 §6.2：只列默认发行版这一项，path 就是 wsl.exe；不枚举多发行版。
 78: function detectWsl(): TerminalInfo | null {
 79:   const exe = wslExePath();
 80:   if (!exe) return null;
 81:   const r = spawnSync(exe, ['-l', '-q'], {
 82:     windowsHide: true,
 83:     timeout: SPAWN_TIMEOUT_MS,
 84:     encoding: 'buffer',
 85:     stdio: [...STDIO],
 86:   });
 87:   if (r.error || r.status !== 0) return null;
 88:   const distros = parseWslDistroOutput(r.stdout ?? Buffer.alloc(0));
 89:   if (distros.length === 0) return null;
 90:   return { id: 'wsl', path: exe };
 91: }
 92: 
 93: // 规格 §12.3：wsl -l -q 的输出是 UTF-16LE，剥 NUL / BOM 后按行解析；空输出 → []。纯函数，不 spawn。
 94: export function parseWslDistroOutput(buf: Buffer): string[] {
 95:   if (!buf || buf.length === 0) return [];
 96:   const text = buf.toString('utf16le').replace(/^\uFEFF/, '');
 97:   const names: string[] = [];
 98:   for (const raw of text.split('\n')) {
 99:     const name = raw.replace(/\u0000/g, '').replace(/\r/g, '').trim();
100:     if (name) names.push(name);
101:   }
102:   return names;
103: }
104: 
105: // 每次调用都实测：本文件没有任何模块级状态，不跨调用缓存（规格 §6.1 / check F3）。
106: // 顺序照规格 §6.1 探测表：powershell / cmd / pwsh / wsl；不可用项不进数组（check E4）。
107: export function detectTerminals(): TerminalInfo[] {
108:   const probes: (() => TerminalInfo | null)[] = [detectPowerShell, detectCmd, detectPwsh, detectWsl];
109:   const found: TerminalInfo[] = [];
110:   for (const probe of probes) {
111:     try {
112:       const info = probe();
113:       if (info) found.push(info);
114:     } catch {
115:       // 任何异常 = 该项不可用，不得抛出（规格 §6.1 / check F2）
116:     }
117:   }
118:   return found;
119: }
```

## 新增未跟踪文件全文：src-main/quick-launch-terminals.test.ts（30 行）

```ts
  1: // src-main/quick-launch-terminals.test.ts
  2: // 任务 4：终端探测（pwsh / powershell / cmd / wsl），只返回可用项。
  3: // 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md §6.1 / §6.2 / §6.3 / §12.3
  4: // 三个用例逐字取自计划 §任务 4 步骤 1；对应 check 表 E1 / E2 / E3。
  5: // E4–E7（只返回可用项 / wsl 三条件 / pwsh where.exe / 固定路径回退）靠实现结构钉住，
  6: // 证据行号见 .superpowers/sdd/2026-10-10-quick-launch-card/task-04-report.md。
  7: import { describe, it, expect } from 'vitest';
  8: import { existsSync } from 'node:fs';
  9: import { parseWslDistroOutput, detectTerminals } from './quick-launch-terminals';
 10: 
 11: describe('quick-launch-terminals.ts', () => {
 12: 
 13:   // E1（规格 §12.3）：wsl -l -q 的 UTF-16LE 输出 → 发行版名数组
 14:   it('解析 wsl -l -q 的 UTF-16LE 输出', () => {
 15:     expect(parseWslDistroOutput(Buffer.from('Ubuntu\nDebian\n', 'utf16le'))).toEqual(['Ubuntu', 'Debian']);
 16:   });
 17: 
 18:   // E2（规格 §12.3）：空 Buffer / 只有换行 → []
 19:   it('空输出（未安装发行版）解析为空数组', () => {
 20:     expect(parseWslDistroOutput(Buffer.alloc(0))).toEqual([]);
 21:     expect(parseWslDistroOutput(Buffer.from('\r\n\r\n', 'utf16le'))).toEqual([]);
 22:   });
 23: 
 24:   // E3（计划 步骤 1）：真机探测——本机必有 cmd，且 path 是真实存在的文件
 25:   it('本机探测结果里 cmd 可用且 path 存在', () => {
 26:     const cmd = detectTerminals().find((t) => t.id === 'cmd');
 27:     expect(cmd).toBeDefined();
 28:     expect(existsSync(cmd!.path)).toBe(true);
 29:   });
 30: });
```
