import { describe, it, expect } from 'vitest';
import {
  parseTasklistIsRunning,
  filterZipEntries,
  validateRelease,
  runUpdate,
  type CopyOps,
} from './updater-core';

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

  function makeOps(): CopyOps & { copies: string[]; spawned: string[]; rmCalls: string[] } {
    const calls = { copies: [] as string[], spawned: [] as string[], rmCalls: [] as string[] };
    return {
      ...calls,
      copy: (_s, d) => calls.copies.push(d),
      rm: (p) => calls.rmCalls.push(p),
      mkDir: () => {},
      exists: () => true,
      spawnDetached: (exe) => calls.spawned.push(exe),
      log: () => {},
    };
  }

  it('runUpdate_success_flow_replaces_and_launches', async () => {
    const ops = makeOps();
    const out = await runUpdate({
      zipPath: 'D:\\app\\lms-launcher-update.zip',
      installDir: 'D:\\app',
      listEntries: async () => ['lms_launcher.exe', 'update.exe'],
      extractEntry: async () => {},
      ops,
      pollDelayMs: 1,
      maxPolls: 5,
      checkRunning: () => false, // 进程已退出
    });
    expect(out.ok).toBe(true);
    expect(out.code).toBe(0);
    expect(out.filesChanged).toBe(true);
    expect(out.launchedNewVersion).toBe(true);
    expect(ops.copies).toEqual(['D:\\app\\lms_launcher.exe', 'D:\\app\\update.exe']);
    expect(ops.spawned).toEqual(['D:\\app\\lms_launcher.exe']);
  });

  it('runUpdate_timeout_process_still_running_changes_nothing', async () => {
    const ops = makeOps();
    const out = await runUpdate({
      zipPath: 'D:\\app\\lms-launcher-update.zip',
      installDir: 'D:\\app',
      listEntries: async () => ['lms_launcher.exe'],
      extractEntry: async () => {},
      ops,
      pollDelayMs: 1,
      maxPolls: 3,
      checkRunning: () => true, // 一直「在运行」
    });
    expect(out.ok).toBe(false);
    expect(out.filesChanged).toBe(false);
    expect(out.error).toContain('未退出');
    expect(ops.copies).toEqual([]);
    expect(ops.spawned).toEqual([]);
  });

  it('runUpdate_missing_main_exe_aborts', async () => {
    const ops = makeOps();
    const out = await runUpdate({
      zipPath: 'D:\\app\\lms-launcher-update.zip',
      installDir: 'D:\\app',
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

  it('runUpdate_update_exe_locked_skips_with_warn_still_ok', async () => {
    const ops = makeOps();
    const logs: string[] = [];
    const lockedOps: CopyOps = {
      ...ops,
      log: (m) => logs.push(m),
      copy: (s, d) => {
        if (d.endsWith('update.exe')) throw new Error('EBUSY: resource busy');
        ops.copy(s, d);
      },
    };
    const out = await runUpdate({
      zipPath: 'D:\\app\\lms-launcher-update.zip',
      installDir: 'D:\\app',
      listEntries: async () => ['lms_launcher.exe', 'update.exe'],
      extractEntry: async () => {},
      ops: lockedOps,
      pollDelayMs: 1,
      checkRunning: () => false,
    });
    expect(out.ok).toBe(true); // 主 exe 已替换成功
    expect(ops.copies).toEqual(['D:\\app\\lms_launcher.exe']);
    expect(logs.some((l) => l.includes('update.exe 自身被锁定'))).toBe(true);
  });
});
