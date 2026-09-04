import { describe, it, expect } from 'vitest';
import {
  parseTasklistIsRunning,
  filterZipEntries,
  validateRelease,
  runUpdate,
  type CopyOps,
} from './updater-core';

const Z = 'D:\\app\\lms-launcher-update.zip';
const D = 'D:\\app';
const fastPoll = { pollDelayMs: 1, maxPolls: 5, checkRunning: () => false };

describe('updater-core.ts', () => {
  it('parseTasklist_is_running', () => {
    expect(parseTasklistIsRunning('INFO: No tasks are running that match the specified criteria.', 'update.exe')).toBe(false);
    expect(parseTasklistIsRunning('"lms_launcher.exe","1234","Console","1","1,024 K"', 'lms_launcher.exe')).toBe(true);
    expect(parseTasklistIsRunning('"update.exe","4321","Console","1","512 K"', 'update.exe')).toBe(true);
    expect(parseTasklistIsRunning('"something-else.exe","1","Console","1","1 K"', 'update.exe')).toBe(false);
    expect(parseTasklistIsRunning('', 'update.exe')).toBe(false);
    expect(parseTasklistIsRunning('IMAGE Name      PID', 'update.exe')).toBe(false);
  });

  it('filterZipEntries_and_validate', () => {
    const f = filterZipEntries(['lms_launcher.exe', 'resources/app.asar', 'update.exe']);
    expect(f.mainExe).toBe('lms_launcher.exe');
    expect(f.updateExe).toBe('update.exe');
    expect(validateRelease(f).ok).toBe(true);

    const nested = filterZipEntries(['dir/lms_launcher.exe']);
    expect(nested.mainExe).toBe('dir/lms_launcher.exe');

    const noMain = filterZipEntries(['resources/app.asar']);
    expect(noMain.mainExe).toBeNull();
    const v = validateRelease(noMain);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('lms_launcher.exe');
  });

  interface TestOps extends CopyOps {
    copies: string[];
    staged: string[];
    spawned: string[];
    rmCalls: string[];
    scheduled: string[];
    mkDirs: string[];
    logs: string[];
    copyFail: ((dest: string) => boolean) | null;
    listResult: string[];
  }

  function makeOps(listResult: string[], copyFail?: (dest: string) => boolean): TestOps {
    const ops: TestOps = {
      copies: [], staged: [], spawned: [], rmCalls: [], scheduled: [], mkDirs: [], logs: [],
      copyFail: copyFail ?? null, listResult,
      copy: (s, d) => {
        if (ops.copyFail?.(d)) throw new Error('EBUSY: resource busy');
        if (d.endsWith('update.exe.new')) { ops.staged.push(d); return; }
        ops.copies.push(d);
      },
      rm: (p) => ops.rmCalls.push(p),
      mkDir: (p) => ops.mkDirs.push(p),
      exists: () => true,
      spawnDetached: (exe) => ops.spawned.push(exe),
      log: (m) => ops.logs.push(m),
      listDir: () => ops.listResult,
      scheduleSelfReplace: (p) => ops.scheduled.push(p),
    };
    return ops;
  }

  it('runUpdate_success_full_overwrite_keeps_zip_structure', async () => {
    const ops = makeOps(['lms_launcher.exe', 'update.exe', 'resources/app.asar', 'ffmpeg.dll']);
    // 安装目录不存在 → 触发子目录 mkDir；zip/tmp 视为存在
    ops.exists = (p) => p === Z || p.includes('__update_tmp');
    const extracted: (string | null)[] = [];
    const out = await runUpdate({
      zipPath: Z,
      installDir: D,
      listEntries: async () => ['lms_launcher.exe', 'update.exe', 'resources/app.asar', 'ffmpeg.dll'],
      extractEntry: async (_z, entry) => { extracted.push(entry); },
      ops,
      ...fastPoll,
    });
    expect(out.ok).toBe(true);
    expect(out.code).toBe(0);
    expect(out.filesChanged).toBe(true);
    expect(out.launchedNewVersion).toBe(true);
    // 全量提取：extract 传 null（node-stream-zip 保持 zip 目录结构）
    expect(extracted).toEqual([null]);
    // 所有文件按 zip 内相对路径覆盖安装目录
    expect(ops.copies).toEqual([
      'D:\\app\\lms_launcher.exe',
      'D:\\app\\update.exe',
      'D:\\app\\resources\\app.asar',
      'D:\\app\\ffmpeg.dll',
    ]);
    // 子目录 resources/ 被创建
    expect(ops.mkDirs).toContain('D:\\app\\resources');
    expect(ops.spawned).toEqual(['D:\\app\\lms_launcher.exe']);
  });

  it('runUpdate_update_exe_locked_stages_new_and_schedules_move', async () => {
    const ops = makeOps(['lms_launcher.exe', 'update.exe'], (d) => d.endsWith('update.exe'));
    const out = await runUpdate({
      zipPath: Z,
      installDir: D,
      listEntries: async () => ['lms_launcher.exe', 'update.exe'],
      extractEntry: async () => {},
      ops,
      ...fastPoll,
    });
    expect(out.ok).toBe(true);
    // 主 exe 已替换；update.exe 直接拷贝失败 → 走 update.exe.new 两阶段
    expect(ops.copies).toEqual(['D:\\app\\lms_launcher.exe']);
    expect(ops.staged).toEqual(['D:\\app\\update.exe.new']);
    expect(ops.scheduled).toEqual(['D:\\app\\update.exe.new']);
    expect(ops.spawned).toEqual(['D:\\app\\lms_launcher.exe']);
  });

  it('runUpdate_update_exe_staging_also_fails_skips_ok', async () => {
    const ops = makeOps(['lms_launcher.exe', 'update.exe'], (d) => d.includes('update.exe'));
    const out = await runUpdate({
      zipPath: Z,
      installDir: D,
      listEntries: async () => ['lms_launcher.exe', 'update.exe'],
      extractEntry: async () => {},
      ops,
      ...fastPoll,
    });
    expect(out.ok).toBe(true);
    expect(ops.staged).toEqual([]);
    expect(ops.scheduled).toEqual([]);
    expect(ops.copies).toEqual(['D:\\app\\lms_launcher.exe']);
  });

  it('runUpdate_removes_stale_staged_update_exe', async () => {
    const ops = makeOps(['lms_launcher.exe']);
    ops.exists = (p) => p === Z || p.includes('__update_tmp') || p.endsWith('update.exe.new');
    await runUpdate({
      zipPath: Z,
      installDir: D,
      listEntries: async () => ['lms_launcher.exe'],
      extractEntry: async () => {},
      ops,
      ...fastPoll,
    });
    expect(ops.rmCalls).toContain('D:\\app\\update.exe.new');
  });

  it('runUpdate_empty_extraction_aborts_no_changes', async () => {
    const ops = makeOps([]);
    const out = await runUpdate({
      zipPath: Z,
      installDir: D,
      listEntries: async () => ['lms_launcher.exe', 'update.exe'],
      extractEntry: async () => {},
      ops,
      ...fastPoll,
    });
    expect(out.ok).toBe(false);
    expect(out.filesChanged).toBe(false);
    expect(ops.copies).toEqual([]);
    expect(ops.spawned).toEqual([]);
  });

  it('runUpdate_timeout_process_still_running_changes_nothing', async () => {
    const ops = makeOps([]);
    const out = await runUpdate({
      zipPath: Z,
      installDir: D,
      listEntries: async () => ['lms_launcher.exe'],
      extractEntry: async () => {},
      ops,
      pollDelayMs: 1,
      maxPolls: 3,
      checkRunning: () => true,
    });
    expect(out.ok).toBe(false);
    expect(out.filesChanged).toBe(false);
    expect(out.error).toContain('未退出');
    expect(ops.copies).toEqual([]);
    expect(ops.spawned).toEqual([]);
  });

  it('runUpdate_missing_main_exe_aborts', async () => {
    const ops = makeOps([]);
    const out = await runUpdate({
      zipPath: Z,
      installDir: D,
      listEntries: async () => ['resources/app.asar'],
      extractEntry: async () => {},
      ops,
      pollDelayMs: 1,
      checkRunning: () => false,
    });
    expect(out.ok).toBe(false);
    expect(out.filesChanged).toBe(false);
    expect(out.error).toContain('lms_launcher.exe');
  });
});
