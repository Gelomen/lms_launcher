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
    expect(dict.zh['app.winbar.minimize']).toBe('最小化');
    expect(dict.zh['app.winbar.maximize']).toBe('最大化');
    expect(dict.zh['app.winbar.restore']).toBe('还原');
    expect(dict.zh['app.winbar.close']).toBe('关闭');
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
    expect(dict.en['app.winbar.minimize']).toBe('Minimize');
    expect(dict.en['app.winbar.maximize']).toBe('Maximize');
    expect(dict.en['app.winbar.restore']).toBe('Restore');
    expect(dict.en['app.winbar.close']).toBe('Close');
    expect(dict.en['app.update.pill.available']).toBe('New version!');
    expect(dict.en['app.update.pill.downloading']).toBe('{pct}%');
    expect(dict.en['app.update.tip.available']).toBe('Version {version} available, click to view and install');
    expect(dict.en['app.update.tip.downloading']).toBe('Downloading {pct}%, click to view progress');
    expect(dict.en['app.exit.title']).toBe('Exit');
    expect(dict.en['app.exit.message']).toBe('llama-server will be stopped. Continue?');
  });
});
