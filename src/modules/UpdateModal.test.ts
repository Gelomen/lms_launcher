// @vitest-environment happy-dom
// UpdateModal 组件级测试（计划 task-2 步骤 1 用例清单）：七态状态机 UI——
// 纯渲染层（props 驱动）+ 事件契约（action(index, kind) / close）；open=false 不渲染。
// 弹窗经 <Teleport to="body"> 渲染，故在 document 层级断言 DOM（同 TemplateModal.test 风格）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import UpdateModal from './UpdateModal.vue';

// Mock window.lms for UpdateModal tests
beforeEach(() => {
  window.lms = {
    invoke: vi.fn(async () => ({})),
    onLogLine: () => () => {},
    onProcessExit: () => () => {},
    onTrayExitRequest: () => () => {},
    onWinMaxChanged: () => () => {},
    onUpdateDownloadProgress: () => () => {},
    onLlamaUpdateProgress: () => () => {},
    onTrayUpdateRequest: () => () => {},
    onTraySettingsRequest: () => () => {},
    onGpuStats: () => () => {},
  };
});

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

  // ---- 用例 4：downloading(42%)（按钮禁用 + 按钮本身即进度条：紫填充 42% + 文字双色渐变分界 42% + 中段恒显新版号）----
  it('downloading(42%): 按钮「下载中 42%」disabled; 紫填充宽 42%; 文字渐变分界 42%; 中段显示新版号', () => {
    const w = mountModal({ items: [makeItem({ phase: 'downloading', version: 'v0.2.0', pct: 42 })] });
    const btn = actionBtns()[0];
    expect(btn.textContent?.trim()).toBe('下载中 42%');
    expect(btn.disabled).toBe(true);
    // 下载中版本号文件不隐藏：「LMS Launcher | v0.2.0 | 下载中 42%」三段齐全
    expect(document.querySelector('.update-row__version')?.textContent?.trim()).toBe('v0.2.0');
    // 按钮本身即进度条：左侧紫填充宽度 = pct%
    const fill = btn.querySelector('.update-row__fill') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe('42%');
    // 文字双色渐变硬边界 = 填充右缘（同一坐标系）：紫段上白字 / 未填充保持禁用灰 --muted
    const label = btn.querySelector('.update-row__label') as HTMLElement;
    expect(label).not.toBeNull();
    const labelStyle = label.getAttribute('style') ?? '';
    expect(labelStyle).toContain('#fff 42%');
    expect(labelStyle).toContain('var(--muted) 42%');
    // 按钮下方的独立进度条节点已移除
    expect(document.querySelector('.update-progress')).toBeNull();
    w.unmount();
  });

  // ---- 用例 4b：非 downloading 态按钮不充当进度条 ----
  it('available/idle: 无紫填充与文字渐变（非下载态）', () => {
    const w = mountModal({ items: [makeItem({ phase: 'available', version: 'v0.2.0' }), makeItem()] });
    for (const btn of actionBtns()) {
      expect(btn.querySelector('.update-row__fill')).toBeNull();
      expect(btn.querySelector('.update-row__label')?.getAttribute('style') ?? '').not.toContain('linear-gradient');
    }
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

  // ---- 用例 7b：按钮尺寸恒定——七态同宽，以下载态按钮为基准（最长标签「下载中 100%」）----
  // 实测（应用渲染器 Segoe UI 14px，真实盒模型：下载态 padding 14/16 + 边框 2）：
  // 「下载中 100%」= 99.03px 为七态最宽；其余态自然宽 57.33–85.33px。
  // 全局 box-sizing:border-box → min-width 即总宽下限：短标签撑满到 99.03px 不收缩，
  // 下载态 0–100% 各百分比恰好贴满不扩不缩（复验：七态按钮实测全部 99.02px）。white-space:nowrap 防 CJK 按字换行。
  it('七态按钮同尺寸：scoped 规则 min-width 99.03px + nowrap 恒定（以「下载中 100%」99.03px 为基准）', () => {
    // vitest(happy-dom) 不向 DOM 注入 SFC <style>（实测 document 无 style 节点）→
    // 直接读组件源码断言规则存在且基准值正确（防规则误删/改值回归）
    const src = readFileSync(resolve(__dirname, 'UpdateModal.vue'), 'utf-8');
    const m = src.match(/\.update-row \.btn\s*\{[^}]*min-width:\s*([^;]+);[^}]*white-space:\s*nowrap/);
    expect(m).not.toBeNull();
    // 下载态「下载中 100%」实测总宽 = 99.03px（border-box 下 min-width 即总宽下限）
    expect(m![1].trim()).toBe('99.03px');
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

// ---- Task 7 回归：llama.cpp 更新状态需在每次「打开弹窗」时重新检查 ----
// 根因（2026-09-14 bug）：UpdateModal 恒常驻挂载，旧逻辑仅在 onMounted 检查一次。
// 用户在会话运行中才在主界面选定 llama.cpp 安装目录 → 那次一次性检查发生在
// llama_dir 为空时 → 状态永久卡在 'unconfigured' → 重新打开弹窗不重新检查，
// 仍提示「请先在主界面选择 llama.cpp 安装目录」且无按钮。
describe('UpdateModal · llama.cpp 重新打开弹窗（回归）', () => {
  // 持久 invoke mock：同一 vi.fn 实例贯穿 open→false→true，用 mockImplementation 切换主进程返回值
  let invokeMock: ReturnType<typeof vi.fn>;
  function countCheckCalls(): number {
    return invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'check_llama_update').length;
  }

  it('首次打开：llama_dir 未配置 → 显示「请先在主界面选择 llama.cpp 安装目录」且无按钮', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'check_llama_update') return { success: false, error: 'unconfigured' };
      if (cmd === 'get_llama_local_version') return { success: false, error: 'unconfigured' };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-unconfigured-hint')?.textContent?.trim())
      .toBe('请先在主界面选择 llama.cpp 安装目录');
    // unconfigured 态有意无动作按钮（仅提示）
    expect(document.querySelector('.llama-section .btn-primary')).toBeNull();
    w.unmount();
  });

  // 2026-09-14 bug 回归：本地版本显示。主进程返回真实解析结果
  // { type: 'prerelease', version: '0.3.0', build: 10679 }（旧契约 {version, commit} 已废弃），
  // 旧代码 localResult.version.version 虽能取到 '0.3.0'，但模板拼 'v' 前缀 + 远端 tag 是 b 号，
  // 显示必须不出现 undefined 且体现 build 号（b10679）。
  it('本地 dev 构建版本显示 build 号且不出现 undefined', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b10955',
        versionOptions: [{ label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' }],
      };
      if (cmd === 'get_llama_local_version') return {
        success: true,
        version: { type: 'prerelease', version: '0.3.0', build: 10679 },
      };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    const localEl = document.querySelector('.llama-version');
    expect(localEl).not.toBeNull();
    expect(localEl!.textContent).not.toContain('undefined');
    expect(localEl!.textContent).toContain('10679');
    // 远端是 nightly b 号 tag：显示不应出现 undefined
    const newEl = document.querySelector('.llama-new-version');
    expect(newEl).not.toBeNull();
    expect(newEl!.textContent).toContain('b10955');
    expect(newEl!.textContent).not.toContain('undefined');
    w.unmount();
  });

  it('关闭后再打开：llama_dir 已配置 → 重新执行检查，状态刷新（提示消失）', async () => {
    // 阶段 1：未配置
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'check_llama_update') return { success: false, error: 'unconfigured' };
      if (cmd === 'get_llama_local_version') return { success: false, error: 'unconfigured' };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-unconfigured-hint')).not.toBeNull();
    const callsBeforeReopen = countCheckCalls();
    expect(callsBeforeReopen).toBeGreaterThan(0);

    // 阶段 2：用户已在主界面选定目录 → 主进程返回 up-to-date
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'check_llama_update') return { success: true, status: 'up-to-date' };
      if (cmd === 'get_llama_local_version') return { success: true, version: { version: '1', commit: null } };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });

    // 关闭 → 重新打开
    await w.setProps({ open: false });
    await nextTick();
    await w.setProps({ open: true });
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // 重新打开后必须再次执行 check_llama_update
    expect(countCheckCalls()).toBeGreaterThan(callsBeforeReopen);
    // 旧的 unconfigured 提示应消失（状态已刷新为 up-to-date）
    expect(document.querySelector('.llama-unconfigured-hint')).toBeNull();
    expect(document.querySelector('.llama-up-to-date')?.textContent?.trim()).toBe('已是最新版本');
    w.unmount();
  });
});
