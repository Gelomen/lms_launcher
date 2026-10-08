// src-main/update-bootstrap.test.ts
// 更新启动器生成（2026-10-08 隐藏控制台）。引号与编码是本次全部风险所在：VBScript 少写一个引号
// = WSH 弹模态错误框 = 正是要消除的可见窗口，所以既有内容断言，也有用 cscript/cmd 实跑生成文件
// 的集成守卫（规格 F10/F11/F12/F13）。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  // 这条钉住的是「落盘形态 = UTF-16LE 且带 BOM」这个被测试保护的事实本身。
  // 机制解释按实测写（规格 F11）：WSH 只接受 UTF-16LE —— 无 BOM 的 UTF-16LE 也能解码，
  // UTF-8（有/无 BOM）与 UTF-16BE+BOM 全部失败。所以去掉 BOM 实跑不会坏，坏的是这条断言。
  it('.vbs 落盘必须是 UTF-16LE 且带 BOM（规格 F11：WSH 只接受 UTF-16LE，BOM 是被测试钉住的形态）', () => {
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
// 根目录 runtimeBase 自身也含空格与中文（真实安装目录常带空格，如 C:\Program Files\…）：父路径同样
// 要过「VBScript 字符串字面量」与「cmd.exe 按代码页解码正文」这两道关，只把非 ASCII 放在最后一级
// 目录等于没测父路径那一半。上面静态段的 input 保持 ASCII 是有意为之：F16 那条断言的是生成物的
// 模板文本不含汉字，往路径里塞汉字会让它变成永远为真的废话。
const runtimeBase = mkdtempSync(join(tmpdir(), 'lms-boot-中文 空格 '));

function makeFakeScript(dir: string): { ps1: string; marker: string } {
  const ps1 = join(dir, 'fake-update.ps1');
  writeFileSync(ps1,
    "param([string]$ZipPath, [string]$InstallDir)\r\n" +
    "Set-Content -LiteralPath (Join-Path $InstallDir 'marker.txt') -Value ($ZipPath + '|' + $InstallDir) -Encoding UTF8\r\n",
    'utf8');
  return { ps1, marker: join(dir, 'marker.txt') };
}

/** 在 dir 里搭好假更新脚本并生成对应启动器：dir 本身就是被测输入，每条用例独占一个子目录。
 *  生成前先删掉残留 marker 并断言已不存在：.vbs 与 .cmd 两条分支共用同一目录后缀，vitest 按声明
 *  顺序串行跑，不删的话后跑的 .cmd 读到的是 .vbs 写的 marker —— 「参数原样送达」在 .cmd 侧就是
 *  假通过——不删的话，把 cmdContent 的 zip/installDir 互换顺序，.cmd 用例照样过（实测见报告 M-1a）。 */
function bootstrapIn(dir: string, hasWscript: boolean): { plan: ReturnType<typeof writeUpdateBootstrap>; marker: string; zipPath: string } {
  mkdirSync(dir, { recursive: true });
  const { ps1, marker } = makeFakeScript(dir);
  rmSync(marker, { force: true });
  expect(existsSync(marker), 'marker 没清干净：' + marker).toBe(false);
  const zipPath = join(dir, 'pkg.zip');
  const plan = writeUpdateBootstrap(
    { ...input, installDir: dir, ps1Path: ps1, zipPath, updateLogPath: join(dir, 'lms_launcher_update.log') },
    hasWscript,
  );
  return { plan, marker, zipPath };
}

/** 同步实跑并取回退出码与 stderr。显式 stdio 是必需的：Node 的 execFileSync 在默认 stdio 下会把
 *  子进程的 stderr 直接写进本进程的 process.stderr（= 泄漏到测试输出），显式 pipe 才只进返回值。
 *  stderr 按 latin1 解码：逐字节保真，要匹配的 -File / .ps1 都是 ASCII，任何系统代码页下都不会
 *  被多字节编码的尾字节吃掉。 */
function runCaptured(exe: string, args: string[]): { status: number; stderr: string } {
  try {
    execFileSync(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stderr: '' };
  } catch (e) {
    const err = e as { status?: number | null; stderr?: unknown };
    const buf = Buffer.isBuffer(err.stderr) ? err.stderr : Buffer.from(String(err.stderr ?? ''));
    return { status: err.status ?? -1, stderr: buf.toString('latin1') };
  }
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
      const dir = join(runtimeBase, suffix);
      const { plan, marker, zipPath } = bootstrapIn(dir, true);
      // cscript 对 VBScript 编译错误是「打到 stderr + 非零退出」，不弹模态框 → 退出码非 0
      const run = runCaptured('cscript.exe', ['//nologo', plan.filePath]);
      expect(run.status, 'cscript stderr: ' + run.stderr).toBe(0);
      expect(existsSync(marker)).toBe(true);
      expect(markerValue(marker)).toBe(zipPath + '|' + dir);
    });
  }

  for (const [label, suffix] of DIR_FIXTURES) {
    it(`UTF-8 无 BOM 的 .cmd 经 cmd.exe 把参数原样送达（${label}）`, () => {
      const dir = join(runtimeBase, suffix);
      const { plan, marker, zipPath } = bootstrapIn(dir, false);
      const run = runCaptured('cmd.exe', ['/c', plan.filePath]);
      expect(run.status, 'cmd.exe stderr: ' + run.stderr).toBe(0);
      expect(existsSync(marker)).toBe(true);
      expect(markerValue(marker)).toBe(zipPath + '|' + dir);
    });
  }

  // 正向用例只说「生成物能跑」，没说它凭什么能跑。这条钉住机制本身：把 chcp 65001 改一个数字，
  // cmd.exe 就按 936 解 UTF-8 正文，中文路径解错 → PowerShell 报 -File 的 .ps1 不存在 →
  // 非零退出、marker 不写（2026-10-08 复现：chcp 936 与完全去掉 chcp 行两种形态都失败，
  // .temp/hide-console/probe-task3-results.md A2/A3）。它顺带要求 fixture 目录真的含非 ASCII
  // 字符——目录名退化成 ASCII 时 chcp 936 也能跑通，这条会失败而不是空过。
  // 对照不可省：只断言「非零退出 + 无 marker」的话，任何原因的非零退出都算通过（目录、引号、
  // 权限、PowerShell 不在 PATH……），归因不到代码页。所以先在同一目录跑一份只换了文件名的未改写
  // 副本，要求它 exit 0 且 marker 逐字送达；再跑改写副本，要求非零退出、无 marker，且 stderr 里
  // 确实是 PowerShell 关于 -File 的报错 —— 失败模式被点名，而不是「反正非零」。
  // 断言只依赖同步 execFileSync 的退出码、marker 是否存在与 stderr 文本，不依赖任何时序。
  it('把生成 .cmd 里的 chcp 65001 改写为 chcp 936 后参数不再送达（同目录未改写副本作对照）', () => {
    const dir = join(runtimeBase, '中文 目录 空格-chcp-936');
    const { plan, marker, zipPath } = bootstrapIn(dir, false);
    const generated = readFileSync(plan.filePath, 'utf8');
    // 前置：生成物里确实是 chcp 65001，否则下面的改写是空操作，这条就成了空断言
    expect(generated).toContain('chcp 65001');
    const broken = generated.replace('chcp 65001', 'chcp 936');
    expect(broken).not.toBe(generated);

    // 对照：同目录、同 fixture、同一次生成，只有文件名不同 → 必须 exit 0 且参数逐字送达
    const controlPath = join(dir, 'control-unchanged.cmd');
    writeFileSync(controlPath, generated, 'utf8');
    const control = runCaptured('cmd.exe', ['/c', controlPath]);
    expect(control.status, '对照副本 cmd.exe stderr: ' + control.stderr).toBe(0);
    expect(existsSync(marker), '对照副本必须写出 marker：' + marker).toBe(true);
    expect(markerValue(marker)).toBe(zipPath + '|' + dir);

    // 清掉对照副本写的 marker，才能把「改写副本没写 marker」当作它的失败证据
    rmSync(marker, { force: true });
    expect(existsSync(marker), 'marker 没清干净：' + marker).toBe(false);

    const brokenPath = join(dir, 'chcp-936.cmd');
    writeFileSync(brokenPath, broken, 'utf8');
    const run = runCaptured('cmd.exe', ['/c', brokenPath]);
    expect(run.status).not.toBe(0);
    expect(existsSync(marker)).toBe(false);
    // 失败模式点名到 PowerShell：中文路径按 936 解错 → -File 的 .ps1 不存在
    expect(run.stderr).toMatch(/-File/);
    expect(run.stderr).toMatch(/\.ps1/);
  });
});
