import { app, BrowserWindow } from 'electron';

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';

function createWindow(): void {
  const win = new BrowserWindow({
    title: 'lms_launch',
    width: 980, height: 720, minWidth: 760, minHeight: 540,
    webPreferences: {
      preload: require.resolve('../dist-main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(DEV_URL);
  else win.loadFile('dist/index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
