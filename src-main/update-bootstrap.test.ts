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

// 实跑守卫：安装目录名是本次要修的真实输入（规格 F12 的既存缺陷、F11/F13 的编码前提），
// 所以两条分支都在「含中文」与「含中文且含空格」的目录下各跑一次 —— 规格行为行逐字要求
// 「安装目录含中文/空格 → .vbs 与回退 .cmd 均正确传参」，只测纯中文目录等于漏掉空格那一半。
function makeFakeScript(dir: string): { ps1: string; marker: string } {
  const ps1 = join(dir, 'fake-update.ps1');
  writeFileSync(ps1,
    "param([string]$ZipPath, [string]$InstallDir)\r\n" +
    "Set-Content -LiteralPath (Join-Path $InstallDir 'marker.txt') -Value ($ZipPath + '|' + $InstallDir) -Encoding UTF8\r\n",
    'utf8');
  return { ps1, marker: join(dir, 'marker.txt') };
}

/** 在 dir 里搭好假更新脚本并生成对应启动器：dir 本身就是被测输入，每条用例独占一个子目录以免 marker 串档。 */
function bootstrapIn(dir: string, hasWscript: boolean): { plan: ReturnType<typeof writeUpdateBootstrap>; marker: string; zipPath: string } {
  mkdirSync(dir, { recursive: true });
  const { ps1, marker } = makeFakeScript(dir);
  const zipPath = join(dir, 'pkg.zip');
  const plan = writeUpdateBootstrap(
    { ...input, installDir: dir, ps1Path: ps1, zipPath, updateLogPath: join(dir, 'lms_launcher_update.log') },
    hasWscript,
  );
  return { plan, marker, zipPath };
}

/** fake-update.ps1 用 Set-Content -Encoding UTF8 写 marker（PowerShell 5.1 会加 BOM 与行尾）：比对前先剥掉，
 *  然后要求逐字相等 —— 多一个引号残留、多一个参数都算失败（toContain 对这些是瞎的）。 */
const markerValue = (marker: string): string =>
  readFileSync(marker, 'utf8').replace(/^\uFEFF/, '').replace(/[\r\n]+$/, '');

const DIR_FIXTURES = [
  ['纯中文目录', '中文目录'],
  ['中文加空格目录', '中文 目录 空格'],
] as const;

// runIf 而不是 if (!WIN) return：非 Windows 上这两组必须在报告里显形为 skipped，
// 不能以 passed 的姿态断言零件事（cscript/cmd.exe 都不存在时，什么都没被验证）。
describe.runIf(WIN)('生成的启动器在 Windows 上实跑（cscript / cmd.exe）', () => {
  for (const [label, suffix] of DIR_FIXTURES) {
    it(`.vbs 经 cscript 无语法错误，并把 zip/installDir 原样送达（${label}）`, () => {
      const dir = join(base, suffix);
      const { plan, marker, zipPath } = bootstrapIn(dir, true);
      // cscript 对 VBScript 编译错误是「打到 stderr + 非零退出」，不弹模态框 → execFileSync throw
      execFileSync('cscript.exe', ['//nologo', plan.filePath], { encoding: 'utf8' });
      expect(existsSync(marker)).toBe(true);
      expect(markerValue(marker)).toBe(zipPath + '|' + dir);
    });
  }

  for (const [label, suffix] of DIR_FIXTURES) {
    it(`UTF-8 无 BOM 的 .cmd 经 cmd.exe 把参数原样送达（${label}）`, () => {
      const dir = join(base, suffix);
      const { plan, marker, zipPath } = bootstrapIn(dir, false);
      execFileSync('cmd.exe', ['/c', plan.filePath], { encoding: 'utf8' });
      expect(existsSync(marker)).toBe(true);
      expect(markerValue(marker)).toBe(zipPath + '|' + dir);
    });
  }

  // 正向用例只说「生成物能跑」，没说它凭什么能跑。这条钉住机制本身：把 chcp 65001 改一个数字，
  // cmd.exe 就按 936 解 UTF-8 正文，中文路径解错 → PowerShell 报 -File 的 .ps1 不存在 →
  // 非零退出、marker 不写（2026-10-08 复现：chcp 936、去掉该行、rem 掉该行三种形态都失败，
  // .temp/hide-console/probe-task3-results.md A2/A3）。它顺带要求 fixture 目录真的含非 ASCII
  // 字符——目录名退化成 ASCII 时 chcp 936 也能跑通，这条会失败而不是空过。
  // 断言只依赖同步 execFileSync 的退出码与 marker 是否存在，不依赖任何时序。
  it('把生成 .cmd 里的 chcp 65001 改写为 chcp 936 后参数不再送达（chcp 65001 是必要条件）', () => {
    const dir = join(base, '中文 目录 空格-chcp-936');
    const { plan, marker } = bootstrapIn(dir, false);
    const generated = readFileSync(plan.filePath, 'utf8');
    // 前置：生成物里确实是 chcp 65001，否则下面的改写是空操作，这条就成了空断言
    expect(generated).toContain('chcp 65001');
    const broken = generated.replace('chcp 65001', 'chcp 936');
    expect(broken).not.toBe(generated);
    const brokenPath = join(dir, 'chcp-936.cmd');
    writeFileSync(brokenPath, broken, 'utf8');
    let exitedNonZero = false;
    try {
      execFileSync('cmd.exe', ['/c', brokenPath], { encoding: 'utf8' });
    } catch {
      exitedNonZero = true;
    }
    expect(exitedNonZero).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });
});
