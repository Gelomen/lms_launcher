import { describe, it, expect } from 'vitest';
import { dict, translate, resolveSystemLang } from './dict';

describe('i18n dict', () => {
  it('zh 与 en 的 key 集合完全一致', () => {
    expect(Object.keys(dict.zh).sort()).toEqual(Object.keys(dict.en).sort());
  });

  it('词典无空值', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const [k, v] of Object.entries(dict[lang])) expect(v, k).not.toBe('');
    }
  });

  it('translate 替换 {name} 占位符', () => {
    expect(translate({ 'a.b': '下载中 {pct}%' }, 'a.b', { pct: 42 })).toBe('下载中 42%');
  });

  it('缺失 key 返回 key 本身', () => {
    expect(translate(dict.zh, 'no.such.key')).toBe('no.such.key');
  });

  it('缺失参数保留占位符原文', () => {
    expect(translate({ 'a.b': '{x} and {y}' }, 'a.b', { x: '1' })).toBe('1 and {y}');
  });

  it('resolveSystemLang：zh 系 → zh，其余 → en', () => {
    expect(resolveSystemLang('zh-CN')).toBe('zh');
    expect(resolveSystemLang('zh-TW')).toBe('zh');
    expect(resolveSystemLang('en-US')).toBe('en');
    expect(resolveSystemLang('ja-JP')).toBe('en');
  });

  it('S1：app.* 的 zh 值与既有界面文案逐字一致', () => {
    expect(dict.zh['app.brand']).toBe('LMS 启动器');
    expect(dict.zh['app.winbar.github']).toBe('GitHub 仓库');
    expect(dict.zh['app.update.pill.available']).toBe('有新版本!');
    expect(dict.zh['app.update.pill.downloading']).toBe('下载中 {pct}%');
    expect(dict.zh['app.update.tip.available']).toBe('发现新版本 v{version}，点击查看并安装');
    expect(dict.zh['app.update.tip.downloading']).toBe('下载中 {pct}%，点击查看进度');
    expect(dict.zh['app.exit.title']).toBe('退出程序');
    expect(dict.zh['app.exit.message']).toBe('将停止 llama-server 并退出，是否确认？');
  });

  it('S1：app.* 的 en 值为最短文案（下载态仅百分比）', () => {
    expect(dict.en['app.brand']).toBe('LMS Launcher');
    expect(dict.en['app.winbar.github']).toBe('GitHub repository');
    expect(dict.en['app.update.pill.available']).toBe('New version!');
    expect(dict.en['app.update.pill.downloading']).toBe('{pct}%');
    expect(dict.en['app.update.tip.available']).toBe('Version {version} available, click to view and install');
    expect(dict.en['app.update.tip.downloading']).toBe('Downloading {pct}%, click to view progress');
    expect(dict.en['app.exit.title']).toBe('Exit');
    expect(dict.en['app.exit.message']).toBe('llama-server will be stopped. Continue?');
  });

  // 2026-10-05 S10 收尾：main.ts 两处调用点依赖的 llama 词条，值逐字锁定
  // （zh 与改造前的硬编码完全相同 → 中文界面零回归；en 保证英文界面不再出现中文）
  it('main.ts 调用点依赖的 llama 词条 zh/en 齐备', () => {
    expect(dict.zh['err.llama.busy']).toBe('文件仍被占用（{names}），请关闭外部启动的 llama.cpp 进程后重试');
    expect(dict.en['err.llama.busy']).toBe('Files still in use ({names}). Close the externally started llama.cpp process and retry.');
    expect(dict.zh['log.llama.dll.cleaned']).toBe('llama.cpp · 清理旧 CUDA DLL：{list}');
    expect(dict.en['log.llama.dll.cleaned']).toBe('llama.cpp · stale CUDA DLLs removed: {list}');
  });
});
