// 托盘图标 hover 提示文案（spec 2026-09-05-tray-tooltip-template + 2026-09-22 i18n §3.3）：
// 显示启动控制当前所选模板完整名；无选择（null/空/空白）→ 返回调用方传入的占位文案
// （占位文案由 main.ts 提供 t('tray.tooltip.empty')，使本函数保持纯函数且支持 i18n）。
export function trayTooltipText(name: string | null | undefined, emptyText: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed : emptyText;
}
