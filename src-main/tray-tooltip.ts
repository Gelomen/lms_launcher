// 托盘图标 hover 提示文案（规格 2026-09-05-tray-tooltip-template-design）：
// 显示启动控制当前所选模板完整名；无选择（null/空/空白）→ 固定占位文案。
// 纯函数，单测覆盖；main.ts 的 ipcMain.handle('tray-tooltip-update') 与 createTray 初始值共用。
export function trayTooltipText(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed : '暂无模板配置';
}
