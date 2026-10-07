// src-main/update-bootstrap.test.ts
// 更新启动器生成（2026-10-08 隐藏控制台）。引号与编码是本次全部风险所在：VBScript 少写一个引号
// = WSH 弹模态错误框 = 正是要消除的可见窗口，所以既有内容断言，也有用 cscript/cmd 实跑生成文件
// 的集成守卫（规格 F10/F11/F12/F13）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_CMD_NAME, BOOTSTRAP_VBS_NAME,
  BootstrapInput, cmdContent, vbsContent, writeUpdateBootstrap,
} from './update-bootstrap';

const WIN = process.platform === 'win32';
const base = mkdtempSync(join(tmpdir(), 'lms-boot-'));
const input: BootstrapInput = {
  installDir: base,
  wscriptPath: 'C:\\Windows\\System32\\wscript.exe',
  ps1Path: join(base, 'lms-launcher-update.ps1'),
  zipPath: join(base, 'downloads', 'lms-launcher-update.zip'),
  updateLogPath: join(base, 'lms_launcher_update.log'),
};
const esc = (s: string): string => s.replace(/"/g, '\\"');

describe('writeUpdateBootstrap：wscript 存在 → .vbs 隐藏启动', () => {
  it('返回 vbs 计划，/TR 为「引号包裹的 wscript + 引号包裹的 vbs」且内部引号已转义', () => {
    const plan = writeUpdateBootstrap(input, true);
    expect(plan.kind).toBe('vbs');
    expect(plan.degraded).toBe(false);
    expect(plan.filePath).toBe(join(base, BOOTSTRAP_VBS_NAME));
    expect(plan.trValue).toBe(esc('"' + input.wscriptPath + '" "' + plan.filePath + '"'));
    // /TR 有 261 字符上限（规格 F2）：留足余量，路径变长也不会被 schtasks 拒绝
    expect(plan.trValue.length).toBeLessThan(261);
  });

  it('.vbs 用 Chr(34) 拼引号，不含 VBScript 三连引号陷阱，三个绝对参数都在内', () => {
    const c = vbsContent(input);
    expect(c).toContain('q = Chr(34)');
    expect(c).toContain('sh.Run(cmd, 0, True)');
    expect(c).not.toContain('"""');
    expect(c).toContain(input.ps1Path);
    expect(c).toContain(input.zipPath);
    expect(c).toContain(input.installDir);
  });

  it('生成的启动器不含汉字（i18n 零硬编码守护，规格 F16）', () => {
    expect(vbsContent(input)).not.toMatch(/\p{Script=Han}/u);
    expect(cmdContent(input)).not.toMatch(/\p{Script=Han}/u);
  });

  it('.vbs 落盘为 UTF-16LE + BOM（WSH 只按 BOM 识别 UTF-16，规格 F11）', () => {
    const plan = writeUpdateBootstrap(input, true);
    const buf = readFileSync(plan.filePath);
    expect(buf.subarray(0, 2).toString('hex')).toBe('fffe');
    expect(buf.subarray(2).toString('utf16le')).toContain('q = Chr(34)');
  });
});

describe('writeUpdateBootstrap：wscript 缺失 → .cmd 回退（可见窗口，但更新完成）', () => {
  it('返回 cmd 计划并标记 degraded，/TR 只引用 .cmd', () => {
    const plan = writeUpdateBootstrap(input, false);
    expect(plan.kind).toBe('cmd');
    expect(plan.degraded).toBe(true);
    expect(plan.filePath).toBe(join(base, BOOTSTRAP_CMD_NAME));
    expect(plan.trValue).toBe(esc('"' + plan.filePath + '"'));
  });

  it('.cmd 落盘无 BOM，且 chcp 65001 出现在任何路径之前（规格 F12/F13/H7）', () => {
    const plan = writeUpdateBootstrap(input, false);
    const c = readFileSync(plan.filePath, 'utf8');
    expect(c.startsWith('\uFEFF')).toBe(false);
    expect(c).toContain('chcp 65001');
    expect(c.indexOf('chcp 65001')).toBeLessThan(c.indexOf(input.ps1Path));
  });
});

// 中文子目录：安装目录含非 ASCII 字符是本次一并修掉的既存缺陷（规格 F12），也是编码断言的真实场景
function makeFakeScript(dir: string): { ps1: string; marker: string } {
  const ps1 = join(dir, 'fake-update.ps1');
  writeFileSync(ps1,
    "param([string]$ZipPath, [string]$InstallDir)\r\n" +
    "Set-Content -LiteralPath (Join-Path $InstallDir 'marker.txt') -Value ($ZipPath + '|' + $InstallDir) -Encoding UTF8\r\n",
    'utf8');
  return { ps1, marker: join(dir, 'marker.txt') };
}

describe('生成的启动器在 Windows 上实跑（cscript / cmd.exe）', () => {
  it('.vbs 经 cscript 无语法错误，并把 zip/installDir 原样传给脚本（中文目录）', () => {
    if (!WIN) return;
    const dir = join(base, '中文目录');
    mkdirSync(dir, { recursive: true });
    const { ps1, marker } = makeFakeScript(dir);
    const plan = writeUpdateBootstrap(
      { ...input, installDir: dir, ps1Path: ps1, zipPath: join(dir, 'pkg.zip'), updateLogPath: join(dir, 'lms_launcher_update.log') },
      true,
    );
    execFileSync('cscript.exe', ['//nologo', plan.filePath], { encoding: 'utf8' });
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, 'utf8')).toContain(join(dir, 'pkg.zip') + '|' + dir);
  });

  it('.cmd 回退经 cmd.exe 同样把参数原样送达（chcp 65001 生效）', () => {
    if (!WIN) return;
    const dir = join(base, '中文目录-cmd');
    mkdirSync(dir, { recursive: true });
    const { ps1, marker } = makeFakeScript(dir);
    const plan = writeUpdateBootstrap(
      { ...input, installDir: dir, ps1Path: ps1, zipPath: join(dir, 'pkg.zip'), updateLogPath: join(dir, 'lms_launcher_update.log') },
      false,
    );
    execFileSync('cmd.exe', ['/c', plan.filePath], { encoding: 'utf8' });
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, 'utf8')).toContain(join(dir, 'pkg.zip') + '|' + dir);
  });
});
