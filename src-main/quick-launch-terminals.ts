// src-main/quick-launch-terminals.ts
// 任务 4：终端探测（pwsh / Windows PowerShell / cmd / WSL），只返回本机可用项。
// 规格：docs/superpowers/specs/2026-10-10-quick-launch-card-design.md
//   §6.1 探测表（四行判定 + 只返回可用项 + 不跨调用缓存 + spawnSync/windowsHide/3s + 异常=不可用）
//   §6.2 WSL 粒度（只列默认发行版一项，path = wsl.exe；多发行版走「PowerShell + wsl -d <名>」，不枚举）
//   §6.3 本机基线（pwsh ✅ / powershell ✅ / cmd ✅ / wsl -l -q 退出码 1 ⛔）
//   §12.3 parseWslDistroOutput（UTF-16LE → 发行版名；空输出 → []）
// 消费方：任务 6 的 ql_terminals IPC、任务 12 的下拉、任务 5 的 spawnShell（用 path）。
// 主进程下发 { id, path }，**可选**带 icon（PNG 的 data URL，由 ql-terminal-icons.ts 补，见 2026-10-16 规格 §6.1）；
// 标签文案仍由渲染端 t() 决定（索引 K7；原口径「只下发 { id, path }」= 旧索引 K4 / check F4）。
// 不 import node-pty、不 spawn PTY——终端生命周期在任务 5 的 QuickLaunchManager。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
// TerminalId 由任务 3 提供（src-main/quick-launch-config.ts:12），此处只 import 类型，不重复定义。
import type { TerminalId } from './quick-launch-config';

export interface TerminalInfo {
  id: TerminalId;
  path: string;
  /** 该项 exe 的真实图标，PNG 的 data URL（§6.1）。取不到 = 不带这个字段。 */
  icon?: string;
}

// 规格 §6.1：单项 3s 超时；任何异常（超时 / ENOENT / 非 0）= 该项不可用（check F1 / F2）
const SPAWN_TIMEOUT_MS = 3000;
const STDIO = ['ignore', 'pipe', 'pipe'] as const;

function systemRoot(): string {
  return process.env.SystemRoot || process.env.windir || 'C:\\WINDOWS';
}

// 规格 §6.1 powershell 行：固定路径存在性判定
function detectPowerShell(): TerminalInfo | null {
  const p = join(systemRoot(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return existsSync(p) ? { id: 'powershell', path: p } : null;
}

// 规格 §6.1 cmd 行：%ComSpec% 优先，回退 %SystemRoot%\System32\cmd.exe
function detectCmd(): TerminalInfo | null {
  const comSpec = process.env.ComSpec;
  if (comSpec && existsSync(comSpec)) return { id: 'cmd', path: comSpec };
  const p = join(systemRoot(), 'System32', 'cmd.exe');
  return existsSync(p) ? { id: 'cmd', path: p } : null;
}

// where.exe <name> → 退出码 0 且首行是真实存在的文件，否则 null（规格 §6.1 pwsh 行）
function whereFirstExisting(name: string): string | null {
  const r = spawnSync('where.exe', [name], {
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
    encoding: 'utf-8',
    stdio: [...STDIO],
  });
  if (r.error || r.status !== 0) return null;
  const lines = (r.stdout ?? '').split(/\r?\n/);
  for (const line of lines) {
    const candidate = line.trim();
    if (!candidate) continue; // 跳过空行，取第一条非空行 = where.exe 的最高优先级命中
    return existsSync(candidate) ? candidate : null;
  }
  return null;
}

function detectPwsh(): TerminalInfo | null {
  const p = whereFirstExisting('pwsh');
  return p ? { id: 'pwsh', path: p } : null;
}

// wsl.exe 的位置：where.exe 命中，或回退 %SystemRoot%\System32\wsl.exe（与 cmd 行同口径的固定路径回退）
function wslExePath(): string | null {
  const found = whereFirstExisting('wsl.exe');
  if (found) return found;
  const fallback = join(systemRoot(), 'System32', 'wsl.exe');
  return existsSync(fallback) ? fallback : null;
}

// 规格 §6.1 wsl 行：wsl.exe 存在 且 wsl -l -q 退出码 0 且解析出的发行版名非空。
// 本机基线（规格 §6.3）：wsl.exe 存在但无发行版 → 退出码 1 → 不出现。
// 规格 §6.2：只列默认发行版这一项，path 就是 wsl.exe；不枚举多发行版。
function detectWsl(): TerminalInfo | null {
  const exe = wslExePath();
  if (!exe) return null;
  const r = spawnSync(exe, ['-l', '-q'], {
    windowsHide: true,
    timeout: SPAWN_TIMEOUT_MS,
    encoding: 'buffer',
    stdio: [...STDIO],
  });
  if (r.error || r.status !== 0) return null;
  const distros = parseWslDistroOutput(r.stdout ?? Buffer.alloc(0));
  if (distros.length === 0) return null;
  return { id: 'wsl', path: exe };
}

// 规格 §12.3：wsl -l -q 的输出是 UTF-16LE，剥 NUL / BOM 后按行解析；空输出 → []。纯函数，不 spawn。
export function parseWslDistroOutput(buf: Buffer): string[] {
  if (!buf || buf.length === 0) return [];
  const text = buf.toString('utf16le').replace(/^\uFEFF/, '');
  const names: string[] = [];
  for (const raw of text.split('\n')) {
    const name = raw.replace(/\u0000/g, '').replace(/\r/g, '').trim();
    if (name) names.push(name);
  }
  return names;
}

// 每次调用都实测：本文件没有任何模块级状态，不跨调用缓存（规格 §6.1 / check F3）。
// 顺序照规格 §6.1 探测表：powershell / cmd / pwsh / wsl；不可用项不进数组（check E4）。
export function detectTerminals(): TerminalInfo[] {
  const probes: (() => TerminalInfo | null)[] = [detectPowerShell, detectCmd, detectPwsh, detectWsl];
  const found: TerminalInfo[] = [];
  for (const probe of probes) {
    try {
      const info = probe();
      if (info) found.push(info);
    } catch {
      // 任何异常 = 该项不可用，不得抛出（规格 §6.1 / check F2）
    }
  }
  return found;
}
