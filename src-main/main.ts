import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appConfigLoad, appConfigSave, paramsLoad, configsLoad, saveConfigEntry, deleteConfigEntry } from './config';
import type { AppConfig, ParamsFile, ConfigsMap } from './config';
import { prepareLaunch, summarize } from './build';
import { ProcessState } from './process';

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
      const win = mainWin();
      if (win) { win.show(); win.focus(); }
    } },
    { label: '退出', click: () => {
      const win = mainWin();
      if (win) win.webContents.send('tray-exit-request', {});
    } },
  ]);
  tray.setContextMenu(menu);
}

// ---------- 窗口 ----------
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';
function createWindow(): void {
  const win = new BrowserWindow({
    title: 'lms_launcher',
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
  emitLog("[lms_launcher] 启动配置 · " + summary, "sys");
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
// params_file 行的文件选择器（规格 #7B）：m/mmproj → gguf 过滤；其余任意文件。canceled / 无窗口 → null
ipcMain.handle('open_file_dialog', async (_e, key: string): Promise<string | null> => {
  const { dialog } = await import('electron');
  const win = mainWin();
  if (!win) return null;
  const options: Electron.OpenDialogOptions = {};
  if (key === 'm' || key === 'mmproj') {
    options.filters = [{ name: 'Model files', extensions: ['gguf'] }];
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
// ---------- app lifecycle ----------
app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
