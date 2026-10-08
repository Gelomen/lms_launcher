// src-main/ps1-encoding.test.ts
// 真机回归（2026-10-08）：用户点「重启以更新」后什么都没发生，计划任务只剩 Last Result=1。
// 根因不在本次的 .vbs：scripts/lms-launcher-update.ps1 的 UTF-8 BOM 在 78be5ae（2026-10-06）
// 被丢掉，而 Windows PowerShell 5.1 读**无 BOM** 的脚本时按系统 ANSI 代码页（中文系统 = GBK 936）
// 解码。UTF-8 的中文字节在 GBK 里常留下「半个字」，那个悬空的首字节会把紧随其后的 LF 当成自己的
// 尾字节吞掉——实测该文件 338 行被读成 304 行（吞 34 个换行），param() 被并进上面的注释 →
// 5 个解析错误 → powershell 打印错误到 stderr 并 exit 1，**一行更新日志都不写** → 完全静默。
// 两条守卫：① 仓库里每个 .ps1 必须以 EF BB BF 开头；② 用 PowerShell 5.1 自己的解析器断言 0 错误。
// ② 必须用 powershell.exe（5.1）而不是 pwsh 7：后者按 UTF-8 读无 BOM 文件，对同一份坏文件永远报
// 0 错误——用它验证就是错的仪器。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WIN = process.platform === 'win32';
const repoRoot = join(__dirname, '..');

function ps1Under(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) found.push(...ps1Under(p));
    else if (entry.toLowerCase().endsWith('.ps1')) found.push(p);
  }
  return found;
}

const targets = ['scripts', 'src-main'].flatMap(ps1Under).sort();
const rel = (p: string): string => relative(repoRoot, p).split('\\').join('/');
const helper = join(repoRoot, 'scripts', 'ps1-parse-check.ps1');

describe('.ps1 必须是 UTF-8 BOM（PowerShell 5.1 按 ANSI 读无 BOM 脚本，规格 F18）', () => {
  it('确实扫到了脚本（空集合会让下面两条假绿）', () => {
    expect(targets.length).toBeGreaterThanOrEqual(4);
  });

  it('每个 .ps1 的前 3 字节是 EF BB BF', () => {
    const bad = targets.filter((p) => {
      const b = readFileSync(p);
      return !(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf);
    }).map(rel);
    expect(bad).toEqual([]);
  });

  it.runIf(WIN)('PowerShell 5.1 的解析器对每个 .ps1 报 0 错误', () => {
    const bad = targets.map((p) => {
      const out = execFileSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, p],
        { encoding: 'utf8' }).trim();
      return { file: rel(p), report: out.split('\n').slice(0, 3).join(' | ') };
    }).filter((x) => !/^errors=0$/.test(x.report.split(' | ')[0]));
    expect(bad).toEqual([]);
  });
});
