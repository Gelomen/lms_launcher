// 自动更新（规格 2026-09-01-auto-update / 2026-09-05 全量覆盖）：update.exe 替换流程核心。
// 设计原则：依赖全部可注入（tasklist/解压/文件操作）→ 可单测；
// 任何失败路径都不允许破坏安装目录可运行性（旧版本完好）。
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';

export const MAIN_EXE_NAME = 'lms_launcher.exe';
export const UPDATE_EXE_NAME = 'update.exe';
export const STAGED_UPDATE_NAME = 'update.exe.new';

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
  copy: (src: string, dest: string) => void;      // 目标被锁时抛错
  rm: (p: string) => void;
  mkDir: (p: string) => void;
  exists: (p: string) => boolean;
  spawnDetached: (exe: string) => void;
  log: (msg: string) => void;
  /** 列出目录内全部文件（相对路径，/ 分隔；含子目录）。新增用于全量覆盖 */
  listDir: (p: string) => string[];
  /** 调度自更新 move（可选，注入保持可测）。新增用于 update.exe 两阶段自更新 */
  scheduleSelfReplace?: (stagedPath: string) => void;
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
  extractEntry: (zip: string, entry: string | null, destDir: string) => Promise<void>;
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

    // 3. 清理残留的 staging update.exe.new（上次 move 未完成）
    const staleStaged = join(installDir, STAGED_UPDATE_NAME);
    try { if (ops.exists(staleStaged)) ops.rm(staleStaged); } catch { /* 残留不阻断 */ }

    // 4. 解包全部文件到临时目录（保持 zip 目录结构）
    const f = filterZipEntries(await listEntries(zipPath));
    const v = validateRelease(f);
    if (!v.ok) return fail(v.reason ?? '更新包校验失败');
    ops.mkDir(tmpDir);
    await extractEntry(zipPath, null, tmpDir);
    const extracted = ops.listDir(tmpDir);
    if (!extracted.length) return fail('解包失败：临时目录为空，放弃更新（旧版本未改动）');
    // 解包后确认主 exe 存在
    const mainInTmp = extracted.find((e) => e.replace(/\\/g, '/').split('/').pop() === MAIN_EXE_NAME);
    if (!mainInTmp) return fail('更新包缺少 ' + MAIN_EXE_NAME + '，放弃更新');

    // 5. 全量覆盖安装目录（按 zip 内相对路径，逐文件覆盖；目标父目录不存在则创建）
    for (const rel of extracted) {
      const srcP = join(tmpDir, ...rel.split('/'));
      const destP = join(installDir, ...rel.split('/'));
      const parent = dirname(destP);
      if (parent && parent !== tmpDir) {
        try { if (!ops.exists(parent)) ops.mkDir(parent); } catch { /* 已存在不阻断 */ }
      }
      const base = rel.replace(/\\/g, '/').split('/').pop() || '';
      if (base === UPDATE_EXE_NAME) {
        // update.exe 自身运行中映像被锁 → 先试直接覆盖；失败则 staging + 延时 move
        try {
          ops.copy(srcP, destP);
        } catch {
          try {
            ops.copy(srcP, staleStaged);
            ops.scheduleSelfReplace?.(staleStaged);
          } catch {
            ops.log('[WARN] update.exe 自身被锁定，跳过替换（沿用旧版）');
          }
        }
      } else {
        ops.copy(srcP, destP);
      }
      outcome.filesChanged = true;
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
