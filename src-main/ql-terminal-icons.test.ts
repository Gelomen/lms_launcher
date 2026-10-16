// src-main/ql-terminal-icons.test.ts
// 任务 1：图标提取层的 6 条用例 —— 用例名与断言逐字照
//   docs/superpowers/checks/2026-10-16-quick-launch-terminal-icons/task-01-ql-terminal-icons-cache-and-powershell-seam.md 的 E1–E6
//   （= 规格 docs/superpowers/specs/2026-10-16-quick-launch-terminal-icons.md §7.1-1..6）
// 接缝注入：真接缝是**导出的普通函数**（照 src-main/shell-execute.ts:14-15 的既有做法），
//   单测通过 withTerminalIcons 的第四参传假接缝 —— 不 mock node:child_process 整模块。
// 缓存目录夹具（check B2）：mkdtempSync(join(tmpdir(), 'ql-icons-')) + afterEach 删除；不往仓库根写任何文件。
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheFileName, powershellExtract, withTerminalIcons } from './ql-terminal-icons';
import type { ExtractIcons } from './ql-terminal-icons';
import type { TerminalInfo } from './quick-launch-terminals';

// 夹具 exe 路径：不需要真实存在 —— 缓存路径只看缓存文件；exe 不存在由接缝返回 null（规格 §3-P3 已实测该形状）。
// 取必然不存在的盘上的路径，避免与本机真实终端路径相撞。
const CMD_FIXTURE = 'C:\\ql-t1-fixture\\cmd.exe';
const PWSH_FIXTURE = 'C:\\ql-t1-fixture\\powershell.exe';
const WSL_FIXTURE = 'C:\\ql-t1-fixture\\wsl.exe';

// 一段以 PNG magic 开头的字节：缓存命中用例只看「文件字节 → base64」这条管道，不要求它是可解码的图片
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic（规格 §3-P3）
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR，形状像真 PNG
  0x01, 0x02, 0x03, 0x04,
]);

function info(id: TerminalInfo['id'], path: string): TerminalInfo {
  return { id, path };
}

// ─────────────────────────────────────────────────────────────────────────────
// 缓存目录夹具：每个用例一个临时目录，afterEach 删除
// ─────────────────────────────────────────────────────────────────────────────
let cacheDir = '';
function freshCacheDir(): string {
  cacheDir = mkdtempSync(join(tmpdir(), 'ql-icons-'));
  return cacheDir;
}

afterEach(() => {
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  cacheDir = '';
});

// 假接缝：记录每次调用的实参，按表返回（规格 §6.1 的返回形状：单项取不到 = null）
function fakeSeam(table: Record<string, string | null>): { seam: ExtractIcons; calls: string[][] } {
  const calls: string[][] = [];
  const seam: ExtractIcons = async (exePaths: string[]) => {
    calls.push([...exePaths]);
    const out: Record<string, string | null> = {};
    for (const p of exePaths) out[p] = table[p] ?? null;
    return out;
  };
  return { seam, calls };
}

describe('ql-terminal-icons.ts（任务 1：缓存 + PowerShell 提取接缝）', () => {

  // E1（规格 §7.1-1 / §6.2）：缓存文件名 = sha1(规范化小写路径) + '.png'，纯函数
  it('cache_file_name_is_stable_and_case_insensitive', () => {
    const a = cacheFileName(CMD_FIXTURE);
    // 同一路径两次调用同值
    expect(cacheFileName(CMD_FIXTURE)).toBe(a);
    // Windows 路径不区分大小写：换个写法必须命中同一份缓存
    expect(cacheFileName(CMD_FIXTURE.toLowerCase())).toBe(a);
    expect(cacheFileName('c:\\ql-t1-fixture\\CMD.exe')).toBe(a);
    // 不同路径不同值
    expect(cacheFileName(PWSH_FIXTURE)).not.toBe(a);
    // 形状：40 位十六进制 + .png，不含目录
    expect(a).toMatch(/^[0-9a-f]{40}\.png$/);
  });

  // E2（规格 §7.1-2 / RF3）：命中缓存 = 不起进程
  it('cache_hit_skips_the_extraction_process', async () => {
    const dir = freshCacheDir();
    writeFileSync(join(dir, cacheFileName(CMD_FIXTURE)), PNG_BYTES);

    const { seam, calls } = fakeSeam({});
    const out = await withTerminalIcons(dir, [info('cmd', CMD_FIXTURE)], seam);

    expect(calls).toHaveLength(0); // 命中 → 一次进程都不起
    expect(out).toHaveLength(1);
    expect(out[0].icon).toBe('data:image/png;base64,' + PNG_BYTES.toString('base64'));
  });

  // E3（规格 §7.1-3 / §6.2）：同一次调用里的多个未命中 = 一次批量提取，且结果落盘
  it('misses_are_extracted_in_a_single_call_and_written_to_cache', async () => {
    const dir = freshCacheDir();
    const b64Cmd = PNG_BYTES.toString('base64');
    const b64PowerShell = Buffer.concat([PNG_BYTES, PNG_BYTES]).toString('base64');
    const { seam, calls } = fakeSeam({ [CMD_FIXTURE]: b64Cmd, [PWSH_FIXTURE]: b64PowerShell });

    const out = await withTerminalIcons(
      dir,
      [info('cmd', CMD_FIXTURE), info('powershell', PWSH_FIXTURE)],
      seam,
    );

    // 两项未命中 → 恰好一次调用，实参就是这两条路径（规格 §6.2「一次进程调用」）
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([CMD_FIXTURE, PWSH_FIXTURE]);

    // 返回带 icon（前缀逐字，规格 §6.1 / check C6）
    expect(out[0].icon).toBe('data:image/png;base64,' + b64Cmd);
    expect(out[1].icon).toBe('data:image/png;base64,' + b64PowerShell);

    // 缓存已落盘 → 第二次调用同一函数：假接缝 0 次
    expect(existsSync(join(dir, cacheFileName(CMD_FIXTURE)))).toBe(true);
    expect(existsSync(join(dir, cacheFileName(PWSH_FIXTURE)))).toBe(true);
    expect(readFileSync(join(dir, cacheFileName(CMD_FIXTURE)))).toEqual(PNG_BYTES);

    const second = fakeSeam({});
    const again = await withTerminalIcons(
      dir,
      [info('cmd', CMD_FIXTURE), info('powershell', PWSH_FIXTURE)],
      second.seam,
    );
    expect(second.calls).toHaveLength(0);
    expect(again[0].icon).toBe('data:image/png;base64,' + b64Cmd);
    expect(again[1].icon).toBe('data:image/png;base64,' + b64PowerShell);
  });

  // E4（规格 §7.1-4 / §6.1 降级 / RF1 / 索引 K5）：任何接缝失败 = 该项无图标，且不抛出
  it('seam_failure_yields_no_icon_and_throws_nothing', async () => {
    const dir = freshCacheDir();
    const infos = [info('cmd', CMD_FIXTURE), info('powershell', PWSH_FIXTURE)];

    // 失败 ①：整批失败 = 返回 null（ExtractIcons 的形状，规格 §6.1）
    const nullSeam: ExtractIcons = async () => null;
    const outNull = await withTerminalIcons(dir, infos, nullSeam);
    expect(outNull).toHaveLength(2);
    for (const item of outNull) expect('icon' in item).toBe(false);
    expect(outNull.map((t) => t.id)).toEqual(['cmd', 'powershell']);
    expect(outNull.map((t) => t.path)).toEqual([CMD_FIXTURE, PWSH_FIXTURE]);

    // 失败 ②：接缝抛错（ENOENT / 超时 / 非 0 退出码 / JSON 解析失败都归这一类）
    const throwSeam: ExtractIcons = async () => {
      throw new Error('fake seam exploded: ENOENT / ETIMEDOUT / non-zero exit');
    };
    const outThrow = await withTerminalIcons(dir, infos, throwSeam);
    expect(outThrow).toHaveLength(2);
    for (const item of outThrow) expect('icon' in item).toBe(false);

    // 失败 ③：整批成功但该项为 null（exe 不存在 / 该 exe 取不到图标）
    const oneNull = fakeSeam({ [CMD_FIXTURE]: null, [PWSH_FIXTURE]: null });
    const outOne = await withTerminalIcons(dir, infos, oneNull.seam);
    expect(oneNull.calls).toHaveLength(1);
    expect(outOne).toHaveLength(2);
    for (const item of outOne) expect('icon' in item).toBe(false);
    expect(outOne.map((t) => t.id)).toEqual(['cmd', 'powershell']);
    expect(outOne.map((t) => t.path)).toEqual([CMD_FIXTURE, PWSH_FIXTURE]);

    // 三种失败都不落任何缓存文件（无图标可写），也不留半个文件
    for (const d of [dir]) expect(readdirSync(d)).toEqual([]);
  });

  // E5（规格 §7.1-5 / RF2）：图标是装饰 —— 顺序 / 条数 / id / path 一字不动
  it('order_ids_and_paths_are_untouched', async () => {
    const dir = freshCacheDir();
    const b64 = PNG_BYTES.toString('base64');
    const { seam } = fakeSeam({
      [CMD_FIXTURE]: b64,
      [PWSH_FIXTURE]: b64,
      [WSL_FIXTURE]: null, // 含一项无图标
    });

    const input: TerminalInfo[] = [
      info('pwsh', PWSH_FIXTURE),
      info('wsl', WSL_FIXTURE),
      info('cmd', CMD_FIXTURE),
      info('powershell', PWSH_FIXTURE),
    ];
    const snapshot = input.map((t) => ({ ...t }));

    const out = await withTerminalIcons(dir, input, seam);

    expect(out).toHaveLength(input.length); // 不增删
    expect(out.map((t) => t.id)).toEqual(snapshot.map((t) => t.id)); // 不重排
    expect(out.map((t) => t.path)).toEqual(snapshot.map((t) => t.path));
    // 除 id / path / icon 外没有别的键；无图标的那一项不带 icon
    expect(Object.keys(out[1]).sort()).toEqual(['id', 'path']);
    expect(typeof out[0].icon).toBe('string');
    expect(typeof out[2].icon).toBe('string');
    // 入参对象未被改写（浅拷贝，check C5）
    expect(input).toEqual(snapshot);
    for (const t of input) expect('icon' in t).toBe(false);
  });

  // E6（规格 §7.1-6 / §3-P1 P3）：真机冒烟 —— 不 mock，真接缝对真实 exe 出 PNG。
  // 夹具不在（极罕见的精简系统没有 %SystemRoot%\\System32\\cmd.exe）时跳过本用例，
  // 硬门归真机清单 规格 §7.2-1（与 src-main/shell-execute.test.ts:205-222 的「夹具不在则跳过 + 注释指向真机门」同一做法；规格 §9-R8）。
  const SYSTEM_ROOT = process.env.SystemRoot || process.env.windir || 'C:\\WINDOWS';
  const CMD_REAL = join(SYSTEM_ROOT, 'System32', 'cmd.exe');

  it.skipIf(!existsSync(CMD_REAL))('real_powershell_seam_extracts_a_png_for_a_known_exe', async () => {
    const map = await powershellExtract([CMD_REAL]);
    expect(map).not.toBeNull();
    const b64 = (map as Record<string, string | null>)[CMD_REAL];
    expect(typeof b64).toBe('string');
    expect((b64 as string).length).toBeGreaterThan(0);
    const bytes = Buffer.from(b64 as string, 'base64');
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG magic（规格 §3-P3）
  });
});
