import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron';
import { existsSync, statSync, openSync, readSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { appConfigLoad, appConfigSave, paramsLoad, configsLoad, saveConfigEntry, deleteConfigEntry, suggestConfigId, existingConfigIds, configsBackfillDefaults } from './config';
import type { AppConfig, ParamsFile, ConfigsMap } from './config';
import { prepareLaunch, summarize, commandLine } from './build';
import { parseGgufHeader, estimateUsedBytes } from './vram';
import { ProcessState } from './process';
import { checkLlamaInstall, installCheckMessage } from './llama-check';
import { spawn } from 'node:child_process';
import { compareVersions, parseLatestRelease, RELEASE_API_URL, type LatestReleaseInfo } from './update-check';

// ---------- 单实例锁：禁止多开 ----------
// requestSingleInstanceLock() 基于系统级命名句柄：第二个进程拿不到锁时返回 false，立即退出；
// 已在运行实例收到 'second-instance' 事件 → 把主窗口从托盘唤回前台。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    restoreWindow();
  });
}

// ---------- AppState ----------
const ps = new ProcessState();

// 自动更新：check_update 成功后暂存 latest 信息，download_update 据此下载（内存态，重启即失）
let pendingUpdate: LatestReleaseInfo | null = null;

// 数据目录：打包后 = exe 所在目录（portable 解压目录，可写）；dev-time = 项目 cwd
function dataDir(): string {
  if (app.isPackaged) return process.execPath ? join(process.execPath, "..") : process.cwd();
  return process.cwd();
}
function yamlPaths(): [string, string, string] {
  const d = dataDir();
  return [join(d, 'lms_launcher.yaml'), join(d, 'llama_params.yaml'), join(d, 'llama_launch_configs.yaml')];
}

// ---------- 日志事件 ----------
function mainWin(): BrowserWindow | null {
  const ws = BrowserWindow.getAllWindows();
  return ws.length > 0 ? ws[0] : null;
}
// 唤回主窗口：restore() 先解除最小化，再 show + focus；窗口不存在（仅 window-all-closed 边缘态）→ 重建
function restoreWindow(): void {
  const win = mainWin();
  if (win) { win.restore(); win.show(); win.focus(); }
  else { createWindow(); }
}
type StreamName = 'sys' | 'out' | 'err';
function emitLog(line: string, stream: StreamName, echoTabs?: string[]): void {
  const win = mainWin();
  if (win) win.webContents.send("log-line", { line, stream, ...(echoTabs ? { echoTabs } : {}) });
}

// ---------- 应用图标 ----------
// I-1：打包态 icon 经 electron-builder extraResources 拷到 asar 外 resources/icon.ico；
// 开发态在 src-main/icon.ico（__dirname = dist-main → ../src-main）。窗口标题栏与托盘共用。
function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(__dirname, '..', 'src-main', 'icon.ico');
}

// ---------- 托盘（§4.6） ----------
let tray: Tray | null = null;
function createTray(): void {
  const icon = nativeImage.createFromPath(appIconPath());
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  const menu = Menu.buildFromTemplate([
    { label: '打开 LMS 启动器', click: () => {
      restoreWindow();
    } },
    { label: '检查更新', click: () => {
      const win = mainWin();
      if (win) {
        // 先唤回窗口（关闭=隐藏到托盘），渲染端收到 tray-update-request 后走顶栏同款检查流程
        win.show(); win.focus();
        win.webContents.send('tray-update-request', {});
      }
    } },
    { label: '退出', click: () => {
      const win = mainWin();
      if (win) {
        // 先唤回窗口：关闭=隐藏到托盘（main.ts §4.6），确认对话框开在渲染进程窗口内——
        // 窗口还藏着时 send 过去用户看不到任何弹窗。show+focus 后 ConfirmDialog 才可见。
        win.show(); win.focus();
        win.webContents.send('tray-exit-request', {});
      }
    } },
  ]);
  tray.setContextMenu(menu);
  // 双击托盘图标 = 唤回窗口（方案 A：单击无反应，右键维持菜单）
  tray.on('double-click', () => {
    restoreWindow();
  });
}

// ---------- 启动检测（规格 2026-08-31-startup-llama-check-design） ----------
// whenReady 内 createWindow 后调用：读已保存的 llama_dir → 判定 → emitLog sys 行进 LMS Launcher 日志区。
// 关键时序：webContents.send 是即发即弃——渲染端未就绪（页面未加载完、App onMounted 尚未订阅
// log-line）时发出的消息不会被缓存，而是直接丢弃；dev 模式 loadURL（HTTP）冷加载尤甚，
// 这正是启动检测行偶发缺失的根因。故页面仍在加载时，把 emitLog 延到 did-finish-load
// （此时渲染端 Vue 已 mount、preload 的 ipcRenderer.on 已注册），不再丢行；已加载完则立即发。
function detectLlamaInstall(): void {
  const [p] = yamlPaths();
  const dir = appConfigLoad(p).llama_dir;
  const line = installCheckMessage(dir, checkLlamaInstall(dir));
  const win = mainWin();
  if (!win || !win.webContents.isLoading()) { emitLog(line, 'sys'); return; }
  win.webContents.once('did-finish-load', () => emitLog(line, 'sys'));
}

// ---------- 窗口 ----------
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';
function createWindow(): void {
  const win = new BrowserWindow({
    title: 'lms_launcher',
    frame: false, // 去系统标题栏；窗口仍可边缘拖动/缩放（DWM 边框保留）
    icon: appIconPath(),
    width: 1400, height: 950, minWidth: 760, minHeight: 540,
    webPreferences: {
      preload: require.resolve('./preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(DEV_URL);
  else win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  // §4.6：关闭 = 隐藏到托盘，不退出；真正退出走 tray-exit-request → exit_app（任务 5）
  win.on('close', (e) => { e.preventDefault(); win.hide(); });
  win.on('maximize', () => { win.webContents.send('win-max-changed', { maximized: true }); });
  win.on('unmaximize', () => { win.webContents.send('win-max-changed', { maximized: false }); });
}

// ---------- IPC 命令（11 个） ----------
ipcMain.handle('get_app_config', (): AppConfig => {
  const [p] = yamlPaths();
  return appConfigLoad(p);
});
ipcMain.handle('save_llama_dir', (_e, dir: string): void => {
  const [p] = yamlPaths();
  appConfigSave(p, { llama_dir: dir.trim() });
});
ipcMain.handle('validate_dir', (_e, dir: string): boolean => {
  return existsSync(join(dir, 'llama-server.exe'));
});
ipcMain.handle('get_params', (): ParamsFile => {
  const [, p] = yamlPaths();
  return paramsLoad(p);
});
ipcMain.handle('get_configs', (): ConfigsMap => {
  const [, , p] = yamlPaths();
  return configsLoad(p); // MISSING: / YAML: 由 config 层抛出，原样传给渲染端
});
// suggest_config_id：新建模板保存前请求唯一 id（yaml 安全，与现有条目不重名）
ipcMain.handle('suggest_config_id', (): string => {
  const [, , p] = yamlPaths();
  // 首个模板保存前 yaml 不存在——existingConfigIds 缺失 → []，不抛 MISSING
  return suggestConfigId(existingConfigIds(p));
});
ipcMain.handle('save_config', (_e, id: string, desc: string | null, values: Record<string, string>): void => {
  const [, pfP, p] = yamlPaths();
  // params_default（2026-09）：保存时缺失的默认值（port/fit）自动补入用户模板（用户已设值不覆盖）
  saveConfigEntry(p, id, desc ?? undefined, values, paramsLoad(pfP));
});
ipcMain.handle('delete_config', (_e, id: string): void => {
  const [, , p] = yamlPaths();
  deleteConfigEntry(p, id);
});
ipcMain.handle('get_state', () => {
  return { running: ps.isRunning(), stopping: ps.state === "stopping", configId: ps.runningConfigId };
});
// start_server：启动前完整校验（MISSING/VALIDATION 由 build 层抛出），成功后订阅日志流 + 注册退出回调；
// onExit 每次 launch 覆盖（旧进程回调随 close 失效），close 后 state 自动回落 ready
ipcMain.handle('start_server', async (_e, configId: string): Promise<string> => {
  const [appCfgP, pfP, cfgP] = yamlPaths();
  const appCfg = appConfigLoad(appCfgP);
  if (appCfg.llama_dir.trim().length === 0) throw new Error('VALIDATION: 未配置 llama.cpp 目录');
  const pf = paramsLoad(pfP);
  const configs = configsLoad(cfgP); // MISSING: / YAML: 透传
  const args = prepareLaunch(appCfg.llama_dir.trim(), pf, configs, configId); // MISSING: / VALIDATION: 透传
  const summary = summarize(configs[configId], pf);
  await ps.launch(args[0], args.slice(1), configId);
  // launcher 日志：完整启动命令行（exe 全路径 + 参数向量）——start_server 的返回值仍是 summary
  emitLog("[lms_launcher] 启动命令 · " + commandLine(args), "sys", ['llama-server']);
  const { stdout, stderr } = ps.takePipes();
  stdout.on('data', (chunk: Buffer) => {
    chunk.toString().split("\n").filter((l) => l.length > 0).forEach((l) => emitLog(l, "out"));
  });
  stderr.on('data', (chunk: Buffer) => {
    chunk.toString().split("\n").filter((l) => l.length > 0).forEach((l) => emitLog(l, "err"));
  });
  ps.onExit((code, error) => {
    // PROC 启动失败（error 非空）：日志区可见；process-exit 事件仍发 { code }
    if (error) emitLog(error, "sys", ['llama-server']);
    const win = mainWin();
    if (win) win.webContents.send("process-exit", { code });
  });
  return summary;
});
// 目录选择器（模块 1）：canceled / 无窗口 → null
ipcMain.handle('open_dir_dialog', async (): Promise<string | null> => {
  const { dialog } = await import('electron');
  const win = mainWin();
  if (!win) return null;
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});
// params_file 行的文件选择器（规格 #7B）：m/mmproj → gguf 过滤；chat_template_file → jinja 过滤。canceled / 无窗口 → null
ipcMain.handle('open_file_dialog', async (_e, key: string): Promise<string | null> => {
  const { dialog } = await import('electron');
  const win = mainWin();
  if (!win) return null;
  const options: Electron.OpenDialogOptions = {};
  if (key === 'm' || key === 'mmproj' || key === 'md') {
    options.filters = [{ name: 'Model files', extensions: ['gguf'] }];
  } else if (key === 'chat_template_file') {
    options.filters = [{ name: 'Jinja template files', extensions: ['jinja'] }];
  }
  const res = await dialog.showOpenDialog(win, options);
  return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('stop_server', async (): Promise<void> => {
  await ps.stopGraceful(3);
  emitLog('[lms_launcher] 停止指令已发送', 'sys', ['llama-server']);
});
// open_external（规格 2026-08-31-log-link-ctrl-click-design §3.3）：渲染端日志链接 Ctrl+点击 → 默认浏览器。
// 协议白名单：仅 http/https 放行（防御 file:// 等，尽管 linkify 只会产出 http/https）；
// shell.openExternal 失败（默认浏览器不存在等极端情况）静默忽略——无 UI 后果，不写日志避免噪音。
ipcMain.handle('open_external', async (_e, url: string): Promise<void> => {
  if (typeof url !== 'string' || !(url.startsWith('http://') || url.startsWith('https://'))) return;
  try {
    await shell.openExternal(url);
  } catch {
    // 静默（规格 §4）
  }
});
ipcMain.handle('exit_app', async (): Promise<void> => {
  await ps.stopGraceful(3);
  app.exit(0);
});
// vram_estimate：显存占用预测（规格 2026-08-29-vram-estimate-design §3/§4）。
// 入参键名 = 渲染端表单键（m/mmproj/ngl/c/ctk/ctv/b/ub/spec_type/spec_draft_n_max/md/ngld）。
// 只读 -m 文件的 stat 与前 64KB GGUF 头；文件不存在 / 非 GGUF / 解析失败 → { ok:false, reason }，不抛错。
// GGUF 头读取（只读前 512KB，不整文件入内存——模型可达 16GB）：
// 覆盖 arch 元数据（n_layer/embedding 等字段通常在前 100KB 内）；文件不存在 / 非 GGUF → 抛错由调用方转 ok:false
function readGgufBytesAndHeader(path: string): { bytes: number; header: ReturnType<typeof parseGgufHeader> } {
  const CHUNK = 512 * 1024;
  const bytes = statSync(path).size;
  const fd = openSync(path, 'r');
  try {
    const headerBuf = Buffer.alloc(Math.min(CHUNK, bytes));
    readSync(fd, headerBuf, 0, headerBuf.length, 0);
    return { bytes, header: parseGgufHeader(headerBuf) };
  } finally { closeSync(fd); }
}
ipcMain.handle('vram_estimate', async (_e, args: {
  m: string; mmproj?: string; ngl?: string; c?: string; ctk?: string; ctv?: string;
  b?: string; ub?: string; spec_type?: string; spec_draft_n_max?: string; md?: string; ngld?: string;
}): Promise<{ ok: true; usedGb: number; parts: { model: number; mmproj: number; kv: number; batch: number; draft: number; draftModel: number; fixed: number } } | { ok: false; reason: string }> => {
  try {
    const { bytes: modelBytes, header } = readGgufBytesAndHeader(args.m);
    const { n_layer, n_embd, full_attention_interval, head_count_kv, head_count, head_dim } = header;
    const mmprojBytes = args.mmproj?.trim() ? statSync(args.mmproj).size : 0;
    // draft 模型（-md）：仅 draft-dflash / draft-dspark 需要（mtp 用内建 MTP 头，无外挂模型）；
    // 读 -md 的字节数 + GGUF 头（draft 层数/KV 维），文件不存在 / 非 GGUF / 缺层数维度 → ok:false
    const specType = (args.spec_type ?? '').trim();
    const isExtDraft = specType === 'draft-dflash' || specType === 'draft-dspark';
    let mdInfo: { bytes: number; header: ReturnType<typeof parseGgufHeader> } | null = null;
    if (isExtDraft) {
      const mdPath = (args.md ?? '').trim();
      if (mdPath.length === 0) throw new Error('VALIDATION: --spec-type 为 draft-dflash/dspark 时须填写 --spec-draft-model（-md）文件');
      mdInfo = readGgufBytesAndHeader(mdPath);
    }
    const res = estimateUsedBytes({
      nLayer: n_layer,
      nEmbD: n_embd,
      nFullAttentionInterval: full_attention_interval,
      nHeadCountKV: head_count_kv,
      nHeadCount: head_count,
      nHeadDim: head_dim,
      modelBytes,
      mmprojBytes,
      ngl: args.ngl ?? '',
      nCtx: args.c ?? '',
      ctk: args.ctk ?? '',
      ctv: args.ctv ?? '',
      b: args.b ?? '',
      ub: args.ub ?? '',
      specType: args.spec_type ?? '',
      specDraftNMax: args.spec_draft_n_max ?? '',
      mdBytes: mdInfo?.bytes ?? 0,
      mdNLayer: mdInfo?.header.n_layer,
      mdNEmbD: mdInfo?.header.n_embd,
      mdNFullAttentionInterval: mdInfo?.header.full_attention_interval,
      mdNHeadCountKV: mdInfo?.header.head_count_kv,
      mdNHeadCount: mdInfo?.header.head_count,
      mdNHeadDim: mdInfo?.header.head_dim,
      ngld: args.ngld ?? '',
    });
    return {
      ok: true,
      usedGb: res.total / 1024 ** 3,
      parts: { // 分项 GiB（= EstimateResult 各字段 ÷ 2³⁰）：渲染端明细弹窗逐行列出（0 项由渲染端隐藏）
        model: res.modelBytes / 1024 ** 3,
        mmproj: res.mmprojBytes / 1024 ** 3,
        kv: res.kvBytes / 1024 ** 3,
        batch: res.batchBytes / 1024 ** 3,
        draft: res.draftBytes / 1024 ** 3,
        draftModel: res.draftModelBytes / 1024 ** 3,
        fixed: res.fixedBytes / 1024 ** 3,
      },
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
});
// save_vram_total：持久化显卡显存总量（lms_launcher.yaml 的 vram_total_gb 字段）；gb ≤ 0 → 视为未配置（不写入）
ipcMain.handle('save_vram_total', (_e, gb: number): void => {
  const [p] = yamlPaths();
  const cfg = appConfigLoad(p);
  appConfigSave(p, { ...cfg, vram_total_gb: gb > 0 ? gb : undefined });
});
// frameless winbar 窗口控制（渲染端自绘三键 → 主进程执行）
ipcMain.handle('win_minimize', () => { mainWin()?.minimize(); });
ipcMain.handle('win_maximize', () => {
  const w = mainWin(); if (!w) return;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
});
ipcMain.handle('win_close', () => { mainWin()?.hide(); }); // 隐藏到托盘，不退出（真退出仍走 exit_app）
// get_version：顶栏显示用（package.json 的 version；electron-builder 打包命名同源）
ipcMain.handle('get_version', (): string => app.getVersion());
// ---------- 自动更新（规格 2026-09-01-auto-update） ----------
// check_update：GitHub latest → semver 比较 → 有新版才 available（开发模式/失败一律 false）
ipcMain.handle('check_update', async (): Promise<{ available: boolean; version?: string }> => {
  if (!app.isPackaged) return { available: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(RELEASE_API_URL, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'lms_launcher' },
    });
    if (!res.ok) {
      emitLog('[更新] 检查失败：HTTP ' + res.status, 'sys');
      return { available: false };
    }
    const info = parseLatestRelease(await res.json());
    if (!info) {
      emitLog('[更新] 检查失败：无法解析 release 信息', 'sys');
      return { available: false };
    }
    if (compareVersions(app.getVersion(), info.tag) < 1) return { available: false };
    pendingUpdate = info;
    return { available: true, version: info.tag };
  } catch (e) {
    emitLog('[更新] 检查失败：' + (e instanceof Error ? e.message : String(e)), 'sys');
    return { available: false };
  } finally {
    clearTimeout(timer);
  }
});
// download_update：流式下载 pendingUpdate.zipUrl → exe 目录 lms-launcher-update.zip
// 进度经 update-download-progress 事件推渲染端；失败删半成品并报错（可重试）
ipcMain.handle('download_update', async (): Promise<
  { ok: true; zipPath: string; size: number } | { ok: false; reason: string }
> => {
  if (!pendingUpdate) return { ok: false, reason: '尚无更新任务（请先检查更新）' };
  const zipPath = join(dataDir(), 'lms-launcher-update.zip');
  emitLog('[更新] 开始下载：' + pendingUpdate.zipUrl, 'sys');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 600000); // 10 分钟超时
  try {
    const res = await fetch(pendingUpdate.zipUrl, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const total = parseInt(res.headers.get('content-length') ?? '0', 10) || null;
    const { createWriteStream } = await import('node:fs');
    const out = createWriteStream(zipPath);
    let received = 0;
    let lastPct = -1;
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(Buffer.from(value))) await new Promise<void>((r) => out.once('drain', () => r()));
      received += value.length;
      const pct = total ? Math.floor((received * 100) / total) : 0;
      if (pct !== lastPct) {
        lastPct = pct;
        mainWin()?.webContents.send('update-download-progress', { pct });
      }
    }
    out.end();
    await new Promise<void>((r) => out.on('finish', () => r()));
    const size = statSync(zipPath).size;
    emitLog('[更新] 下载完成 ' + (size / 1024 / 1024).toFixed(1) + 'MB', 'sys');
    return { ok: true, zipPath, size };
  } catch (e) {
    try { if (existsSync(zipPath)) unlinkSync(zipPath); } catch { /* 残留半成品不阻断报错 */ }
    const msg = e instanceof Error ? e.message : String(e);
    emitLog('[更新] 下载失败：' + msg, 'sys');
    return { ok: false, reason: msg };
  } finally {
    clearTimeout(timer);
  }
});
// run_update：detached 启动 update.exe [zipPath, installDir] → 复用 exit_app 真退出
// Windows 父子进程天然不联动（无 Job Object）：exe 退出后 update.exe 继续等、替换、拉起新版
ipcMain.handle('run_update', async (): Promise<void> => {
  const installDir = dataDir();
  const zipPath = join(installDir, 'lms-launcher-update.zip');
  const upd = join(installDir, 'update.exe');
  if (!existsSync(upd) || !existsSync(zipPath)) {
    throw new Error('更新文件缺失（update.exe / lms-launcher-update.zip）');
  }
  emitLog('[更新] 已启动更新器，应用即将退出', 'sys');
  const child = spawn(upd, [zipPath, installDir], {
    cwd: installDir,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  await ps.stopGraceful(3);
  app.exit(0);
});
// update.exe 日志回显（规格 §E）：启动时读 lms_launcher_update.log → 逐行 [更新器] 前缀
// 进 LMS Launcher 日志区 → 删除（一次性）。与 detectLlamaInstall 同机制处理渲染端未就绪——
// 页面加载完前 send 的消息即发即弃，故延迟到 did-finish-load
function replayUpdateLog(): void {
  const logPath = join(dataDir(), 'lms_launcher_update.log');
  if (!existsSync(logPath)) return;
  let content: string;
  try {
    content = readFileSync(logPath, 'utf8');
  } catch {
    return;
  }
  try { unlinkSync(logPath); } catch { /* 删除失败不影响回显 */ }
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const sendAll = (): void => {
    for (const l of lines) emitLog('[更新器] ' + l, 'sys');
  };
  const win = mainWin();
  if (!win || !win.webContents.isLoading()) { sendAll(); return; }
  win.webContents.once('did-finish-load', sendAll);
}
// ---------- app lifecycle ----------
app.whenReady().then(() => {
  // 隐藏默认菜单栏（File / Edit / View / Window / Help 整行）
  Menu.setApplicationMenu(null);
  // params_default 存量兼容（2026-09）：现有模板配置缺失的默认值自动为用户新增（仅改动才落盘；失败只记日志不挡启动）
  try {
    const [, pfP, cfgP] = yamlPaths();
    configsBackfillDefaults(cfgP, paramsLoad(pfP));
  } catch (e) {
    emitLog('[lms_launcher] params_default 回填失败：' + (e instanceof Error ? e.message : String(e)), 'sys');
  }
  createWindow();
  detectLlamaInstall();
  replayUpdateLog();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
