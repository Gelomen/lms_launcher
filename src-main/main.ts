import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { appConfigLoad, appConfigSave, paramsLoad, configsLoad, saveConfigEntry, deleteConfigEntry, suggestConfigId, existingConfigIds } from './config';
import type { AppConfig, ParamsFile, ConfigsMap } from './config';
import { prepareLaunch, summarize, commandLine } from './build';
import { parseGgufHeader, estimateUsedBytes } from './vram';
import { ProcessState } from './process';

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
function emitLog(line: string, stream: StreamName): void {
  const win = mainWin();
  if (win) win.webContents.send("log-line", { line, stream });
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
    { label: '启动 lms_launcher', click: () => {
      restoreWindow();
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

// ---------- 窗口 ----------
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';
function createWindow(): void {
  const win = new BrowserWindow({
    title: 'lms_launcher',
    frame: false, // 去系统标题栏；窗口仍可边缘拖动/缩放（DWM 边框保留）
    icon: appIconPath(),
    width: 980, height: 720, minWidth: 760, minHeight: 540,
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
  const [, , p] = yamlPaths();
  saveConfigEntry(p, id, desc ?? undefined, values);
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
  emitLog("[lms_launcher] 启动命令 · " + commandLine(args), "sys");
  const { stdout, stderr } = ps.takePipes();
  stdout.on('data', (chunk: Buffer) => {
    chunk.toString().split("\n").filter((l) => l.length > 0).forEach((l) => emitLog(l, "out"));
  });
  stderr.on('data', (chunk: Buffer) => {
    chunk.toString().split("\n").filter((l) => l.length > 0).forEach((l) => emitLog(l, "err"));
  });
  ps.onExit((code, error) => {
    // PROC 启动失败（error 非空）：日志区可见；process-exit 事件仍发 { code }
    if (error) emitLog(error, "sys");
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
  if (key === 'm' || key === 'mmproj') {
    options.filters = [{ name: 'Model files', extensions: ['gguf'] }];
  } else if (key === 'chat_template_file') {
    options.filters = [{ name: 'Jinja template files', extensions: ['jinja'] }];
  }
  const res = await dialog.showOpenDialog(win, options);
  return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('stop_server', async (): Promise<void> => {
  await ps.stopGraceful(3);
  emitLog('[lms_launcher] 停止指令已发送', 'sys');
});
ipcMain.handle('exit_app', async (): Promise<void> => {
  await ps.stopGraceful(3);
  app.exit(0);
});
// vram_estimate：显存占用预测（规格 2026-08-29-vram-estimate-design §3/§4）。
// 入参键名 = 渲染端表单键（m/mmproj/ngl/c/ctk/ctv/b/ub/spec_draft_n_max）。
// 只读 -m 文件的 stat 与前 64KB GGUF 头；文件不存在 / 非 GGUF / 解析失败 → { ok:false, reason }，不抛错。
ipcMain.handle('vram_estimate', async (_e, args: {
  m: string; mmproj?: string; ngl?: string; c?: string; ctk?: string; ctv?: string;
  b?: string; ub?: string; spec_draft_n_max?: string;
}): Promise<{ ok: true; usedGb: number } | { ok: false; reason: string }> => {
  try {
    const modelBytes = statSync(args.m).size;
    // GGUF KV 元数据在文件头部：用 fd 限定读前 512KB（不整文件入内存——模型可达 16GB）；
    // 覆盖 arch 元数据 + 前 64KB 的 token 表之前（n_layer/embedding 等字段通常在前 100KB 内）；
    // 超出窗口的 KV 跳过时 parseGgufHeader 按「缺少层数/维度」报告
    const CHUNK = 512 * 1024;
    const fd = openSync(args.m, 'r');
    let headerBuf: Buffer;
    try {
      headerBuf = Buffer.alloc(Math.min(CHUNK, modelBytes));
      readSync(fd, headerBuf, 0, headerBuf.length, 0);
    } finally { closeSync(fd); }
    const { n_layer, n_embd } = parseGgufHeader(headerBuf);
    const mmprojBytes = args.mmproj?.trim() ? statSync(args.mmproj).size : 0;
    const res = estimateUsedBytes({
      nLayer: n_layer,
      nEmbD: n_embd,
      modelBytes,
      mmprojBytes,
      ngl: args.ngl ?? '',
      nCtx: args.c ?? '',
      ctk: args.ctk ?? '',
      ctv: args.ctv ?? '',
      b: args.b ?? '',
      ub: args.ub ?? '',
      specDraftNMax: args.spec_draft_n_max ?? '',
    });
    return { ok: true, usedGb: res.total / 1024 ** 3 };
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
// ---------- app lifecycle ----------
app.whenReady().then(() => {
  // 隐藏默认菜单栏（File / Edit / View / Window / Help 整行）
  Menu.setApplicationMenu(null);
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
