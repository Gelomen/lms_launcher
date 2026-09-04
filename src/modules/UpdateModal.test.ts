// @vitest-environment happy-dom
// UpdateModal 组件级测试（计划 task-2 步骤 1 用例清单）：七态状态机 UI——
// 纯渲染层（props 驱动）+ 事件契约（action(index, kind) / close）；open=false 不渲染。
// 弹窗经 <Teleport to="body"> 渲染，故在 document 层级断言 DOM（同 TemplateModal.test 风格）。
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import UpdateModal from './UpdateModal.vue';

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date';
type Item = { name: string; phase: Phase; version?: string; pct?: number; errorText?: string };

// 构造一行更新项（默认 idle），按需覆盖字段
function makeItem(over: Partial<Item> = {}): Item {
  return { name: 'lms_launcher', phase: 'idle', ...over };
}

function mountModal(props: { open?: boolean; items?: Item[] } = {}) {
  return mount(UpdateModal, {
    attachTo: document.body,
    props: { open: true, items: [makeItem()], ...props },
  });
}

afterEach(() => { document.body.innerHTML = ''; });

// 行内动作按钮（.btn .btn-primary 紫底白字，同 VramDialog [保存] 样式）
function actionBtns(): HTMLButtonElement[] {
  return [...document.querySelectorAll('.update-modal .update-row .btn-primary')] as HTMLButtonElement[];
}
function closeBtn(): HTMLButtonElement | null {
  return document.querySelector('.update-modal .update-close') as HTMLButtonElement | null;
}

describe('UpdateModal', () => {
  // ---- 用例 1：idle 初始态 ----
  it('idle: 按钮「检查更新」可点; 关闭按钮存在; 无进度条', () => {
    const w = mountModal();
    const btn = actionBtns()[0];
    expect(btn.textContent?.trim()).toBe('检查更新');
    expect(btn.disabled).toBe(false);
    expect(closeBtn()).not.toBeNull();
    expect(document.querySelector('.update-progress')).toBeNull();
    w.unmount();
  });

  // ---- 用例 2：checking ----
  it('checking: 按钮「检查中...」disabled', () => {
    const w = mountModal({ items: [makeItem({ phase: 'checking' })] });
    const btn = actionBtns()[0];
    expect(btn.textContent?.trim()).toBe('检查中...');
    expect(btn.disabled).toBe(true);
    w.unmount();
  });

  // ---- 用例 3：available（中段显示新版号）----
  it('available: 按钮「下载更新」; 中段显示新版号 v0.2.0', () => {
    const w = mountModal({ items: [makeItem({ phase: 'available', version: 'v0.2.0' })] });
    const btn = actionBtns()[0];
    expect(btn.textContent?.trim()).toBe('下载更新');
    expect(btn.disabled).toBe(false);
    expect(document.querySelector('.update-row__version')?.textContent?.trim()).toBe('v0.2.0');
    w.unmount();
  });

  // ---- 用例 4：downloading(42%)（按钮禁用 + 4px 高紫色进度条 width 42%）----
  it('downloading(42%): 按钮「下载中 42%」disabled; 进度条 width 42%', () => {
    const w = mountModal({ items: [makeItem({ phase: 'downloading', pct: 42 })] });
    const btn = actionBtns()[0];
    expect(btn.textContent?.trim()).toBe('下载中 42%');
    expect(btn.disabled).toBe(true);
    // 进度条：轨道 + 填充（填充宽度 = pct%）
    const track = document.querySelector('.update-row .update-progress') as HTMLElement;
    expect(track).not.toBeNull();
    const bar = track.querySelector('.update-progress-bar') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.width).toBe('42%');
    w.unmount();
  });

  // ---- 用例 5：ready（中段仍显示新版号）----
  it('ready: 按钮「重启应用」; 中段仍显示新版号', () => {
    const w = mountModal({ items: [makeItem({ phase: 'ready', version: 'v0.2.0' })] });
    const btn = actionBtns()[0];
    expect(btn.textContent?.trim()).toBe('重启应用');
    expect(btn.disabled).toBe(false);
    expect(document.querySelector('.update-row__version')?.textContent?.trim()).toBe('v0.2.0');
    w.unmount();
  });

  // ---- 用例 6：error（中段红字错误原因）----
  it('error: 按钮「重试」; 中段显示错误原因文本', () => {
    const w = mountModal({ items: [makeItem({ phase: 'error', errorText: '网络不可达' })] });
    const btn = actionBtns()[0];
    expect(btn.textContent?.trim()).toBe('重试');
    expect(btn.disabled).toBe(false);
    const err = document.querySelector('.update-row__error');
    expect(err).not.toBeNull();
    expect(err?.textContent?.trim()).toBe('网络不可达');
    w.unmount();
  });

  // ---- 用例 7：up-to-date（中段灰字「已是最新版本 v0.1.0」）----
  it('up-to-date: 按钮「检查更新」; 中段显示「已是最新版本 v0.1.0」', () => {
    const w = mountModal({ items: [makeItem({ phase: 'up-to-date', version: 'v0.1.0' })] });
    const btn = actionBtns()[0];
    expect(btn.textContent?.trim()).toBe('检查更新');
    const latest = document.querySelector('.update-row__latest');
    expect(latest).not.toBeNull();
    expect(latest?.textContent).toContain('已是最新版本 v0.1.0');
    w.unmount();
  });

  // ---- 用例 8：事件契约（action / close / open=false 不渲染）----
  it('emit: idle 与 up-to-date 点击发射 action(index, "check")', () => {
    const w = mountModal({ items: [makeItem(), makeItem({ phase: 'up-to-date' })] });
    const btns = actionBtns();
    btns[0].click();
    btns[1].click();
    expect(w.emitted('action')).toEqual([[0, 'check'], [1, 'check']]);
    w.unmount();
  });

  it('emit: available→download / ready→restart / error→retry', () => {
    const w = mountModal({ items: [makeItem({ phase: 'available' }), makeItem({ phase: 'ready' }), makeItem({ phase: 'error' })] });
    const btns = actionBtns();
    btns[0].click(); btns[1].click(); btns[2].click();
    expect(w.emitted('action')).toEqual([[0, 'download'], [1, 'restart'], [2, 'retry']]);
    w.unmount();
  });

  it('emit: checking/downloading 按钮禁用——点击不发射 action', () => {
    const w = mountModal({ items: [makeItem({ phase: 'checking' }), makeItem({ phase: 'downloading', pct: 10 })] });
    const btns = actionBtns();
    expect(btns[0].disabled).toBe(true);
    expect(btns[1].disabled).toBe(true);
    btns[0].click(); btns[1].click();
    expect(w.emitted('action')).toBeUndefined();
    w.unmount();
  });

  it('emit: 关闭按钮发射 close（仅此事件，不触发 action）', () => {
    const w = mountModal();
    closeBtn()!.click();
    expect(w.emitted('close')).toHaveLength(1);
    expect(w.emitted('action')).toBeUndefined();
    w.unmount();
  });

  it('open=false: 不渲染（DOM 无 update-modal）', () => {
    const w = mountModal({ open: false });
    expect(document.querySelector('.update-modal')).toBeNull();
    w.unmount();
  });
});
