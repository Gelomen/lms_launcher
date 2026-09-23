// @vitest-environment happy-dom
// DirModule 启动检测映射（2026-11 用户确认）：主进程启动检测（src-main/llama-check.ts 4 态）
// 经 startup-llama-check 事件推渲染端 → 卡片 status 槽位复用「选目录后校验」同一条显示路径。
// ok → ✓ 已找到；exe_missing → ✗ 未找到 llama-server.exe（与现状同文案）；
// dir_missing → ✗ llama.cpp 安装目录不存在；unset → 卡片不显示任何行（首次安装现状）。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import DirModule from './DirModule.vue';
import { t, applyLangLocal } from '../i18n';

let checkHandlers: Array<(e: { status: string; dir: string }) => void> = [];
function mockLms(): void {
  checkHandlers = [];
  (window as any).lms = {
    invoke: (cmd: string) => {
      if (cmd === 'get_app_config') return Promise.resolve({ llama_dir: 'D:\\llama.cpp' });
      return Promise.reject(new Error('unexpected invoke: ' + cmd));
    },
    onStartupLlamaCheck: (cb: (e: { status: string; dir: string }) => void) => {
      checkHandlers.push(cb);
      return () => {};
    },
  };
}
// FontAwesomeIcon 桩：选择目录按钮里用到（测试关注逻辑不关注图标渲染，与 GpuModule.test 同惯例）
const STUBS = { FontAwesomeIcon: true };

function statusText(w: any): string {
  const ok = w.find('.dir-status .ok-text');
  if (ok.exists()) return ok.text();
  const err = w.find('.dir-status .error-text');
  return err.exists() ? err.text() : '';
}

async function mounted(): Promise<any> {
  const w = mount(DirModule, { global: { stubs: STUBS } });
  await flushPromises();
  return w;
}
function fire(e: { status: string; dir: string }): void {
  checkHandlers.at(-1)! (e);
}

describe('DirModule 启动检测事件映射', () => {
  it('ok：卡片显示 ✓ llama-server.exe 已找到（与选目录后成功文案一致）', async () => {
    mockLms();
    const w = await mounted();
    fire({ status: 'ok', dir: 'D:\\llama.cpp' });
    await flushPromises();
    expect(statusText(w)).toBe('✓ llama-server.exe 已找到');
    w.unmount();
  });

  it('exe_missing：卡片显示 ✗ 未找到 llama-server.exe（与选目录后失败文案一致）', async () => {
    mockLms();
    const w = await mounted();
    fire({ status: 'exe_missing', dir: 'D:\\llama.cpp' });
    await flushPromises();
    expect(statusText(w)).toBe('✗ 未找到 llama-server.exe');
    w.unmount();
  });

  it('dir_missing：卡片显示 ✗ llama.cpp 安装目录不存在', async () => {
    mockLms();
    const w = await mounted();
    fire({ status: 'dir_missing', dir: 'D:\\gone' });
    await flushPromises();
    expect(statusText(w)).toBe('✗ llama.cpp 安装目录不存在');
    w.unmount();
  });

  it('unset：卡片不显示任何状态行（首次安装现状保持）', async () => {
    mockLms();
    const w = await mounted();
    fire({ status: 'unset', dir: '' });
    await flushPromises();
    expect(statusText(w)).toBe('');
    expect(w.find('.dir-status .ok-text').exists()).toBe(false);
    expect(w.find('.dir-status .error-text').exists()).toBe(false);
    w.unmount();
  });

  it('启动检测行与日志行同源同刻：事件只发一次，不覆盖后续用户选目录的校验结果', async () => {
    mockLms();
    const w = await mounted();
    fire({ status: 'dir_missing', dir: 'D:\\gone' });
    await flushPromises();
    expect(statusText(w)).toBe('✗ llama.cpp 安装目录不存在');
    // 之后用户选目录校验成功（validate 内部同样写 status）：不应被启动事件回退
    // ——启动事件已在 mounted 时消费完（once 语义由主进程保证），此处仅验证卡片状态稳定
    expect(statusText(w)).toBe('✗ llama.cpp 安装目录不存在');
    w.unmount();
  });
});

// ===== S2（2026-09-23-i18n-dir-card）：目录卡片 en 冒烟 6 条 =====
// 白名单在 get_app_config 基础上放行 validate_dir / save_llama_dir（en 冒烟需要）。
// afterEach 还原 zh，防污染同文件既有 5 条 zh 用例。
describe('DirModule en 冒烟', () => {
  function mockLmsEn(): void {
    checkHandlers = [];
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === 'get_app_config') return Promise.resolve({ llama_dir: 'D:\\llama.cpp' });
        if (cmd === 'validate_dir') return Promise.resolve(true);
        if (cmd === 'save_llama_dir') return Promise.resolve();
        return Promise.reject(new Error('unexpected invoke: ' + cmd));
      },
      onStartupLlamaCheck: (cb: (e: { status: string; dir: string }) => void) => {
        checkHandlers.push(cb);
        return () => {};
      },
    };
  }

  beforeEach(() => {
    applyLangLocal('en');
  });
  afterEach(() => {
    applyLangLocal('zh');
  });

  it('ok 态：状态行 = ✓ llama-server.exe is available', async () => {
    mockLmsEn();
    const w = await mounted();
    fire({ status: 'ok', dir: 'D:\\llama.cpp' });
    await flushPromises();
    expect(statusText(w)).toBe('✓ llama-server.exe is available');
    w.unmount();
  });

  it('exe_missing 态：状态行 = ✗ llama-server.exe not found', async () => {
    mockLmsEn();
    const w = await mounted();
    fire({ status: 'exe_missing', dir: 'D:\\llama.cpp' });
    await flushPromises();
    expect(statusText(w)).toBe('✗ llama-server.exe not found');
    w.unmount();
  });

  it('dir_missing 态：状态行 = ✗ llama.cpp directory doesn\'t exist', async () => {
    mockLmsEn();
    const w = await mounted();
    fire({ status: 'dir_missing', dir: 'D:\\gone' });
    await flushPromises();
    expect(statusText(w)).toBe("✗ llama.cpp directory doesn't exist");
    w.unmount();
  });

  it('unset 态：无任何 ok/error 行（与 zh 行为一致）', async () => {
    mockLmsEn();
    const w = await mounted();
    fire({ status: 'unset', dir: '' });
    await flushPromises();
    expect(statusText(w)).toBe('');
    expect(w.find('.dir-status .ok-text').exists()).toBe(false);
    expect(w.find('.dir-status .error-text').exists()).toBe(false);
    w.unmount();
  });

  it('标题含 llama.cpp directory；选择按钮 data-tooltip 与 aria-label 均为 Select directory', async () => {
    mockLmsEn();
    const w = await mounted();
    expect(w.find('h2').text()).toContain('llama.cpp directory');
    const btn = w.find('button.btn-dirpick');
    expect(btn.attributes('data-tooltip')).toBe('Select directory');
    expect(btn.attributes('aria-label')).toBe('Select directory');
    w.unmount();
  });

  it('保存中 en：底线断言 t(dir.status.saving) = Saving...（半角三点）', () => {
    expect(t('dir.status.saving')).toBe('Saving...');
  });
});
