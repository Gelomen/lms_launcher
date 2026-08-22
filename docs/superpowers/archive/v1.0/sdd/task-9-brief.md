### 任务 9：托盘（§4.6）

**文件：**
- 修改：`src-main/main.ts`（加 Tray + 菜单 + tray-exit-request）；
- 渲染端小改：App.vue（tray-exit-request 订阅 → 确认对话框 → invoke exit_app）——简报原文只列 main.ts，但 §4.6 的退出确认弹框在渲染端，按规格 §4.6「退出时若在跑则确认并先停服务」必须落地；preload 桥 onTrayExitRequest 已就位（任务 5）。

按规格 §4.6（窗口与托盘行为）：

**步骤 1：main.ts 加托盘**

```ts
import { Tray, Menu, nativeImage } from 'electron';
let tray: Tray | null = null;

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '..', 'src-main', 'icon.ico'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  const menu = Menu.buildFromTemplate([
    { label: '启动 lms_launch', click: () => {
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
```

- 在 `app.whenReady()` 里 createTray()；
- 「退出」→ 发 tray-exit-request，渲染端弹确认（「将停止 llama-server 并退出，确认？」）→ 确认后 invoke('exit_app')。

**步骤 2：构建验证** —— npm run build 成功。

**步骤 3：Commit** —— git add src-main/main.ts src/App.vue && git commit -m "feat: 系统托盘（§4.6）——启动/退出菜单 + tray-exit-request 事件"
