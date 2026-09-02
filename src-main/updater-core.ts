// 自动更新（规格 2026-09-01-auto-update）：update.exe 替换流程核心。
// 设计原则：依赖全部可注入（tasklist/解压）→ 可单测；
// 任何失败路径都不允许改动安装目录已有文件（旧版本完好）。
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const MAIN_EXE_NAME = 'lms_launcher.exe';
export const UPDATE_EXE_NAME = 'update.exe';

// ---------- tasklist 进程检测 ----------

// 纯解析：tasklist csv 输出中是否出现目标 exe 进程行
export function parseTasklistIsRunning(raw: string, exeName: string): boolean {
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^INFO/i.test(t)) continue;
    if (t.toUpperCase().startsWith('IMAGE NAME')) continue;
    if (t.includes(exeName)) return true;
  }
  return false;
}

// 查询进程是否存在；检测本身失败（spawn 错/超时）→ 保守返回 true（不动文件）
export function isProcessRunning(exeName: string, run = spawnSync): boolean {
  try {
    const r = run('tasklist', ['/fi', 'IMAGENAME eq ' + exeName, '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    if (r.error) return true;
    return parseTasklistIsRunning((r.stdout || '') + (r.stderr || ''), exeName);
  } catch {
    return true;
  }
}

// ---------- zip 条目过滤 / 校验 ----------

export interface ZipEntryFilter {
  mainExe: string | null;   // zip 内 lms_launcher.exe 的条目路径（相对，/ 分隔）
  updateExe: string | null; // zip 内 update.exe 的条目路径
}

// 从 zip 条目列表里挑出两个目标 exe（发布 zip 根目录即文件，但容忍子目录）
export function filterZipEntries(entries: string[]): ZipEntryFilter {
  let mainExe: string | null = null;
  let updateExe: string | null = null;
  for (const e of entries) {
    const norm = e.replace(/\\/g, '/');
    const base = norm.split('/').pop() || '';
    if (!mainExe && base === MAIN_EXE_NAME) mainExe = norm;
    if (!updateExe && base === UPDATE_EXE_NAME) updateExe = norm;
  }
  return { mainExe, updateExe };
}

export function validateRelease(f: ZipEntryFilter): { ok: boolean; reason: string | null } {
  if (!f.mainExe) return { ok: false, reason: '更新包缺少 ' + MAIN_EXE_NAME + '，放弃更新' };
  return { ok: true, reason: null };
}

// ---------- 替换流程（依赖注入） ----------

export interface CopyOps {
  copy: (src: string, dest: string) => void; // 目标被锁时抛错
  rm: (p: string) => void;
  mkDir: (p: string) => void;
  exists: (p: string) => boolean;
  spawnDetached: (exe: string) => void;
  log: (msg: string) => void;
}

export interface UpdateOutcome {
  ok: boolean;
  code: number;              // 进程退出码（0 = 成功）
  filesChanged: boolean;     // 是否改过安装目录文件
  launchedNewVersion: boolean;
  error: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runUpdate(opts: {
  zipPath: string;
  installDir: string;
  listEntries: (zip: string) => Promise<string[]>;
  extractEntry: (zip: string, entry: string, destDir: string) => Promise<void>;
  ops: CopyOps;
  pollDelayMs?: number;    // 默认 1000
  maxPolls?: number;       // 默认 60
  checkRunning?: (exe: string) => boolean; // 默认 isProcessRunning
}): Promise<UpdateOutcome> {
  const { zipPath, installDir, listEntries, extractEntry, ops } = opts;
  const pollDelay = opts.pollDelayMs ?? 1000;
  const maxPolls = opts.maxPolls ?? 60;
  const check = opts.checkRunning ?? isProcessRunning;
  const tmpDir = join(installDir, '__update_tmp');
  const outcome: UpdateOutcome = {
    ok: false, code: 1, filesChanged: false, launchedNewVersion: false, error: null,
  };

  const cleanupTmp = (): void => {
    try { if (ops.exists(tmpDir)) ops.rm(tmpDir); } catch { /* 残留临时目录不阻断退出 */ }
  };
  const fail = (msg: string): UpdateOutcome => {
    ops.log('[ERROR] ' + msg);
    outcome.error = msg;
    cleanupTmp();
    return outcome;
  };

  try {
    // 1. 前置校验：zip 必须存在
    if (!ops.exists(zipPath)) return fail('更新包不存在：' + zipPath);

    // 2. 轮询等待 lms_launcher.exe 退出（1s × 60；每 10 次记一条日志）
    ops.log('[INFO] 等待 ' + MAIN_EXE_NAME + ' 退出...');
    let exited = false;
    for (let i = 0; i < maxPolls; i++) {
      if (!check(MAIN_EXE_NAME)) { exited = true; break; }
      if (i % 10 === 9) {
        ops.log('[INFO] 等待 ' + MAIN_EXE_NAME + ' 退出（已 ' + ((i + 1) * pollDelay) / 1000 + ' 秒）');
      }
      await sleep(pollDelay);
    }
    if (!exited) {
      return fail(maxPolls * (pollDelay / 1000) + ' 秒内进程未退出，放弃更新（旧版本未改动）');
    }
    ops.log('[INFO] 检测到进程已退出，开始替换');

    // 3. 解包到临时目录，仅取两个 exe（node-stream-zip 保持相对路径结构）
    const f = filterZipEntries(await listEntries(zipPath));
    const v = validateRelease(f);
    if (!v.ok) return fail(v.reason ?? '更新包校验失败');
    ops.mkDir(tmpDir);
    const newMain = join(tmpDir, f.mainExe!);
    await extractEntry(zipPath, f.mainExe!, tmpDir);
    const newUpdate = f.updateExe ? join(tmpDir, f.updateExe) : null;
    if (f.updateExe) await extractEntry(zipPath, f.updateExe, tmpDir);

    // 4. 替换 lms_launcher.exe（主 exe 失败 → 抛错进 catch，update.exe 未动）
    ops.copy(newMain, join(installDir, MAIN_EXE_NAME));
    outcome.filesChanged = true;

    // 5. update.exe 自身运行中被锁 → 跳过并 WARN（幂等：旧版下轮继续服务）
    if (f.updateExe && newUpdate) {
      try {
        ops.copy(newUpdate, join(installDir, UPDATE_EXE_NAME));
      } catch {
        ops.log('[WARN] update.exe 自身被锁定，跳过替换（沿用旧版）');
      }
    }

    // 6. detached 启动新版 → 清理临时目录 → 成功退出
    ops.log('[INFO] 替换完成，正在启动新版');
    ops.spawnDetached(join(installDir, MAIN_EXE_NAME));
    outcome.launchedNewVersion = true;
    cleanupTmp();
    outcome.ok = true;
    outcome.code = 0;
  } catch (e) {
    outcome.error = e instanceof Error ? e.message : String(e);
    ops.log('[ERROR] 更新异常：' + outcome.error);
    cleanupTmp();
  }
  return outcome;
}
