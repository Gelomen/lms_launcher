// update.exe —— 无头 Electron 更新器（规格 2026-09-01-auto-update §D）。
// 用法：update.exe <zipPath> <installDir>
// 流程：轮询 lms_launcher.exe 退出(1s×60) → 解包两 exe → 替换 → detached 启动新版。
// 日志：追加写 installDir\lms_launcher_update.log，主应用下次启动回显并删除。
import { app } from 'electron';
import { join } from 'node:path';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import StreamZip from 'node-stream-zip';
import { runUpdate } from '../src-main/updater-core';
import { getProgramArgs } from './argv-utils';

let logFile = '';
function log(msg: string): void {
  const line = new Date().toISOString() + ' ' + msg;
  try {
    if (logFile) appendFileSync(logFile, line + '\n');
  } catch { /* 日志写失败不阻断更新流程 */ }
}

app.whenReady().then(async () => {
  // 打包 exe 的 argv 比 dev 少一个 electron 前缀，统一经 getProgramArgs 取参（否则恒缺参数）
  const [zipPath, installDir] = getProgramArgs(process.argv);
  // 日志路径先行：即使参数不全，已知 installDir 时错误也能落盘（避免静默失败无从排查）
  if (installDir) logFile = join(installDir, 'lms_launcher_update.log');
  if (!zipPath || !installDir) {
    log('[ERROR] 缺少参数（用法：update.exe <zipPath> <installDir>），argv=' + JSON.stringify(process.argv));
    process.exit(1);
  }
  log('[INFO] update.exe 启动 v' + app.getVersion() + ' · zip=' + zipPath + ' · dir=' + installDir);

  const outcome = await runUpdate({
    zipPath,
    installDir,
    listEntries: async (zip) => {
      // 运行时类挂载在 StreamZip.async（.StreamZipAsync 仅为 d.ts 命名空间类型名，不存在于运行时）
      const z = new StreamZip.async({ file: zip });
      const entries = await z.entries();
      const names = Object.entries(entries)
        .filter(([, e]) => !e.isDirectory)
        .map(([name]) => name);
      await z.close();
      return names;
    },
    extractEntry: async (zip, entry, destDir) => { await new StreamZip.async({ file: zip }).extract(entry, destDir); },
    ops: {
      copy: (s, d) => copyFileSync(s, d),
      rm: (p) => rmSync(p, { force: true, recursive: true }),
      mkDir: (p) => mkdirSync(p, { recursive: true }),
      exists: (p) => existsSync(p),
      spawnDetached: (exe) => {
        // 新版启动：detached 解耦（update.exe 随后即退出，不会带走新进程）
        const c = spawn(exe, [], { cwd: join(exe, '..'), detached: true, stdio: 'ignore' });
        c.unref();
      },
      log,
    },
  });
  if (!outcome.ok) log('[ERROR] 更新失败：' + (outcome.error ?? '未知'));
  process.exit(outcome.code);
});
