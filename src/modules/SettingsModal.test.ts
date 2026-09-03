// @vitest-environment happy-dom
// 组件级测试：SettingsModal 代理输入校验——host 格式白名单（拒绝 http://evil、host:80 等），
// 与后端 save_proxy 的端口校验契约对齐。Teleport 到 body → document 层级断言。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import SettingsModal from './SettingsModal.vue';

const invoke = vi.fn();
vi.mock('../ipc', () => ({
  invoke: (cmd: string, ...args: unknown[]) => invoke(cmd, ...args),
  errMsg: (e: unknown): string => (e as Error).message,
}));
// FontAwesomeIcon 桩：弹窗按钮里用到的图标组件（测试关注逻辑不关注图标渲染）
import { config } from '@fortawesome/fontawesome-svg-core';
config.autoGenerateCss = false;

// get_app_config 返回空代理（测试只关注 validate/save 行为）
invoke.mockImplementation((cmd: string) => {
  if (cmd === 'get_app_config') return Promise.resolve({ llama_dir: '/x' });
  if (cmd === 'save_proxy') return Promise.resolve({ ok: true });
  return Promise.resolve(null);
});

function mountModal() {
  return mount(SettingsModal, {
    attachTo: document.body,
    props: { open: true },
    global: {
      stubs: { FontAwesomeIcon: true },
    },
  });
}

// 通过原生 setter 驱动 v-model（Teleport 到 body，document 层级取 DOM）
async function setField(id: string, v: string): Promise<void> {
  const el = document.querySelector('#' + id) as HTMLInputElement | null;
  if (!el) throw new Error('field not found: ' + id);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}

async function clickSave(): Promise<void> {
  const btn = document.querySelector('.modal-save') as HTMLButtonElement | null;
  if (!btn) throw new Error('save button not found');
  btn.click();
  await flush();
}

function saveErrorText(): string {
  const el = document.querySelector('.error-text');
  return el ? (el.textContent || '') : '';
}

beforeEach(() => {
  invoke.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SettingsModal 代理输入校验', () => {
  it('合法 host+port → 无错误且触发 save_proxy', async () => {
    mountModal(); await flush();
    await setField('proxy-host', '127.0.0.1');
    await setField('proxy-port', '10808');
    await clickSave();
    expect(saveErrorText()).toBe('');
    expect(invoke).toHaveBeenCalledWith('save_proxy', '127.0.0.1', '10808');
  });

  it('host 含 scheme（http://evil）→ 阻止保存并提示格式错误', async () => {
    mountModal(); await flush();
    await setField('proxy-host', 'http://evil');
    await setField('proxy-port', '10808');
    await clickSave();
    expect(saveErrorText()).toContain('代理地址须为 IPv4 或主机名');
    expect(invoke).not.toHaveBeenCalledWith('save_proxy', expect.anything(), expect.anything());
  });

  it('host 带端口（host:80）→ 阻止保存并提示格式错误', async () => {
    mountModal(); await flush();
    await setField('proxy-host', 'proxy.local:80');
    await setField('proxy-port', '10808');
    await clickSave();
    expect(saveErrorText()).toContain('代理地址须为 IPv4 或主机名');
    expect(invoke).not.toHaveBeenCalledWith('save_proxy', expect.anything(), expect.anything());
  });

  it('host 带空格/路径 → 阻止保存并提示格式错误', async () => {
    mountModal(); await flush();
    await setField('proxy-host', 'a b/c');
    await setField('proxy-port', '10808');
    await clickSave();
    expect(saveErrorText()).toContain('代理地址须为 IPv4 或主机名');
    expect(invoke).not.toHaveBeenCalledWith('save_proxy', expect.anything(), expect.anything());
  });

  it('合法主机名（含点号子域）→ 允许保存', async () => {
    mountModal(); await flush();
    await setField('proxy-host', 'proxy.example.com');
    await setField('proxy-port', '10808');
    await clickSave();
    expect(saveErrorText()).toBe('');
    expect(invoke).toHaveBeenCalledWith('save_proxy', 'proxy.example.com', '10808');
  });

  it('端口非法（99999）→ 提示端口范围错误（host 校验已通过）', async () => {
    mountModal(); await flush();
    await setField('proxy-host', '127.0.0.1');
    await setField('proxy-port', '99999');
    await clickSave();
    expect(saveErrorText()).toContain('端口须为 1–65535 的数字');
    expect(invoke).not.toHaveBeenCalledWith('save_proxy', expect.anything(), expect.anything());
  });

  it('host 与 port 一空一满 → 提示端口不能为空（保留原契约）', async () => {
    mountModal(); await flush();
    await setField('proxy-host', '127.0.0.1');
    // port 留空
    await clickSave();
    expect(saveErrorText()).toContain('端口不能为空（或留空禁用代理）');
    expect(invoke).not.toHaveBeenCalledWith('save_proxy', expect.anything(), expect.anything());
  });
});
