// src-main/ql-terminal-icons.ts
// 任务 1（docs/superpowers/plans/2026-10-16-quick-launch-terminal-icons.md §任务 1）：
//   「快捷启动」弹窗 [终端] 下拉每一项的真实图标 —— 提取层 + 磁盘缓存。
// 规格：docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md
//   §6.1 提取层（PowerShell + System.Drawing / -EncodedCommand / 降级口径 / data URL）
//   §6.2 磁盘缓存（<dataDir>/cache/terminal-icons/、sha1(规范化小写路径)、不失效不清理）
//   §8-Q1/Q2/Q6/Q7、K2/K3/K4（已定口径）· §9-R1/R5/R8（已知边界）
// 边界：不 import electron；不 import quick-launch-terminals 的实现（只 import 类型，G1：探测层一字不动）；
//   不起同步进程（G4：powershell.exe 冷启动实测双峰 131–1727ms，同步会把主线程卡住）；
//   不写日志、不往标准输出打印（G5）；任何失败 = 该项无图标。
import { execFile, type ExecFileOptionsWithStringEncoding } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, win32 as pathWin32 } from 'node:path';
// 只 import 类型：本任务不改 quick-launch-terminals.ts（check B1 / F1 / G1）
import type { TerminalInfo } from './quick-launch-terminals';

/** 一次批量提取：exe 绝对路径 → base64 PNG（该项取不到 = null）；整批失败（超时 / 非 0 / 解析不出）= null。 */
export type ExtractIcons = (exePaths: string[]) => Promise<Record<string, string | null> | null>;

// 规格 §6.1 / 索引 K2：可执行文件 = %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe，
// 与 quick-launch-terminals.ts:26-34 同一固定路径口径（System.Drawing 在 Windows PowerShell 里必然可用；
// pwsh 7 的 System.Drawing 依赖 .NET 桌面运行时，不赌）。
function systemRoot(): string {
  return process.env.SystemRoot || process.env.windir || 'C:\\WINDOWS';
}

// 规格 §6.1 / 索引 K4（K8）：超时 8000ms 是「powershell.exe 冷启动（实测双峰，冷 1.3–1.8s）+ 慢机器」的余量，
// 不是提取的预算（提取本身实测只加 ~90ms，规格 §3-P4）。
const EXTRACT_TIMEOUT_MS = 8000;
const MAX_BUFFER_BYTES = 1 << 20;

// 规格 §6.1 的脚本常量（逐字）：here-string 灌 JSON 路径表 → ConvertFrom-Json →
// 逐项 ExtractAssociatedIcon + ToBitmap().Save(Png) + ToBase64String → catch 置 null → ConvertTo-Json -Compress。
// here-string 的结束标记 '@ 必须行首，所以按行 join；JSON.stringify 输出单行，不会提前撞上它（规格 §3-P3 实测该形状可用）。
function extractScript(exePaths: string[]): string {
  return [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Drawing',
    "$paths = @'",
    JSON.stringify(exePaths),
    "'@ | ConvertFrom-Json",
    '$out=[ordered]@{}',
    'foreach($p in $paths){$b=$null',
    ' try{$ic=[System.Drawing.Icon]::ExtractAssociatedIcon($p);if($null -ne $ic){$ms=New-Object System.IO.MemoryStream',
    ' $ic.ToBitmap().Save($ms,[System.Drawing.Imaging.ImageFormat]::Png);$b=[System.Convert]::ToBase64String($ms.ToArray());$ms.Dispose()}}catch{$b=$null}',
    ' $out[$p]=$b}',
    'ConvertTo-Json -Compress -InputObject $out',
  ].join('\n');
}

// @types/node 的 ExecFileOptions 不声明 stdio（execFile 把它原样转给 spawn，运行时有效：
// 探针 .temp/ql-term-icon-probe/encoded-batch.cjs:31 与 latency2.cjs:11 都带这个 stdio 实测通过），
// 所以按 check C2 的取值补一个本地类型，不改调用形状。
type ExecFileOptionsWithStdio = ExecFileOptionsWithStringEncoding & {
  stdio: ['ignore', 'pipe', 'pipe'];
};

// 规格 §6.1 / check C2 的调用参数（逐字）。execFile 是异步的：不阻塞主线程（G4 / 索引 K2）。
// 计划步骤 3 写的「promisify」在这里等价地写成 Promise 包装：check F2 把新文件的 import 限定在
// node:child_process / node:crypto / node:fs / node:path / ./quick-launch-terminals，不引入 node:util。
const EXEC_OPTIONS: ExecFileOptionsWithStdio = {
  windowsHide: true,
  timeout: EXTRACT_TIMEOUT_MS,
  maxBuffer: MAX_BUFFER_BYTES,
  encoding: 'utf-8',
  stdio: ['ignore', 'pipe', 'pipe'],
};

function execFileText(
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStdio,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/** 真接缝：Windows PowerShell + System.Drawing（上面的脚本）。任何异常都不抛出，按 null 交回。 */
export const powershellExtract: ExtractIcons = async (exePaths: string[]) => {
  if (exePaths.length === 0) return {}; // 没有要提取的项 → 不起进程（调用方本任务里不会这样调）
  try {
    const powershell = join(systemRoot(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const encoded = Buffer.from(extractScript(exePaths), 'utf16le').toString('base64'); // -EncodedCommand：不踩引号/转义（§3-P3）
    const stdout = await execFileText(powershell, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ], EXEC_OPTIONS);
    const parsed: unknown = JSON.parse(stdout.replace(/^\uFEFF/, '')); // PowerShell 可能带 BOM
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const table = parsed as Record<string, unknown>;
    const out: Record<string, string | null> = {};
    for (const p of exePaths) {
      const value = table[p];
      out[p] = typeof value === 'string' && value.length > 0 ? value : null; // 单项取不到 = null（规格 §6.1 / Q5）
    }
    return out;
  } catch {
    // 规格 §6.1 降级 / §9-R1（约束语言模式禁 Add-Type）/ §9-R8：ENOENT、超时、非 0 退出码、JSON 解析失败
    // 一律「整批无图标」= null。不写日志、不弹提示、不影响 ql_terminals 的返回列表。
    return null;
  }
};

/**
 * 纯函数：缓存文件名（不含目录、不碰 fs）。
 * 规格 §6.2 / 索引 K6：规范化 + 小写 —— Windows 路径不区分大小写，同一 exe 换个写法要命中同一份。
 * 键里**不含**文件大小 / 修改时间：缓存不失效、不清理（Q7 用户明确选定，代价登记为 §9-R3）。
 */
export function cacheFileName(exePath: string): string {
  return createHash('sha1').update(pathWin32.resolve(exePath).toLowerCase()).digest('hex') + '.png';
}

// 规格 §6.2：命中 = 文件存在且能读出非空字节；读失败（不存在 / 不可读 / 空文件）= 未命中。
function readCachedIcon(file: string): string | null {
  try {
    const bytes = readFileSync(file);
    return bytes.length > 0 ? bytes.toString('base64') : null;
  } catch {
    return null;
  }
}

// 规格 §6.2：写失败（只读目录 / §9-R4）不影响本次返回的 data URL。不清理旧文件（Q7）。
function writeCachedIcon(file: string, base64: string): void {
  try {
    writeFileSync(file, Buffer.from(base64, 'base64'));
  } catch {
    /* 缓存只是加速，写不进去就下次再取 */
  }
}

/**
 * 给已探测的终端补 icon 字段。顺序、条数、id、path 一字不动；取不到的项不带 icon。不抛异常。
 * 规格 §6.1 / §6.2 / RF2：图标是装饰 —— 列表形状不变；RF3：缓存只针对图标，探测本身仍每次实测（调用方负责）。
 */
export async function withTerminalIcons(
  cacheDir: string,
  infos: TerminalInfo[],
  extract: ExtractIcons = powershellExtract,
): Promise<TerminalInfo[]> {
  // 规格 §6.2：建目录失败不阻断（同 main.ts:105-109 的 updateZipDir 口径）→ 后续读写失败按「该项无图标」降级
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch {
    /* 目录不可写：本次不缓存，图标照常 */
  }

  const icons = new Map<string, string>(); // exePath → base64 PNG
  const misses: string[] = [];
  for (const info of infos) {
    if (icons.has(info.path) || misses.includes(info.path)) continue; // 同一次调用里同一路径只处理一次
    const cached = readCachedIcon(join(cacheDir, cacheFileName(info.path)));
    if (cached !== null) icons.set(info.path, cached);
    else misses.push(info.path);
  }

  if (misses.length > 0) {
    // 规格 §6.2：同一次调用里多项未命中 = 一次进程调用
    let extracted: Record<string, string | null> | null = null;
    try {
      extracted = await extract(misses);
    } catch {
      extracted = null; // 规格 §6.1：接缝抛错也不外溢（真接缝自己不抛，假接缝/未来实现都可能抛）
    }
    if (extracted !== null) {
      for (const p of misses) {
        const base64 = extracted[p];
        if (typeof base64 !== 'string' || base64.length === 0) continue; // 该项取不到 = 不带 icon（Q5）
        icons.set(p, base64);
        writeCachedIcon(join(cacheDir, cacheFileName(p)), base64);
      }
    }
  }

  // 浅拷贝每一项（check C5：不改入参对象）；只有拿到图标的项才加 icon 键（规格 §6.1 的 data URL 前缀逐字）
  return infos.map((info) => {
    const base64 = icons.get(info.path);
    return base64 === undefined ? { ...info } : { ...info, icon: 'data:image/png;base64,' + base64 };
  });
}
