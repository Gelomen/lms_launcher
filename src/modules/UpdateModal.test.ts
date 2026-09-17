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
type Item = { name: string; phase: Phase; version?: string; pct?: number; errorText?: string; localVersion?: string };

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

  // ---- 2026-09-18 需求：打开弹窗默认（idle/checking 态）显示当前本地版本号（用户反馈：
  // 「LMS 启动器」与「检查更新」按钮之间默认空白）。契约：idle/checking 态中段渲染
  // item.localVersion（灰字，同 up-to-date 的 .update-row__latest 样式）；无 localVersion
  // 时中段不渲染（保持空白兜底，与旧行为一致）。
// LMS 启动器行中段（排除 llama.cpp 行自带的 .llama-middle，避免 querySelector 抓到后者）
function lmsMiddle(): HTMLElement | null {
  return document.querySelector('.update-row__middle:not(.llama-middle)') as HTMLElement | null;
}

  it('idle: 带 localVersion 时中段显示当前版本号（灰字）', () => {
    const w = mountModal({ items: [makeItem({ localVersion: '0.2.0' })] });
    const middle = lmsMiddle();
    expect(middle).not.toBeNull();
    expect(middle!.classList.contains('update-row__latest')).toBe(true);
    expect(middle!.textContent?.trim()).toBe('0.2.0');
    w.unmount();
  });

  it('idle: 无 localVersion 时中段不渲染（保持空白兜底）', () => {
    const w = mountModal({ items: [makeItem()] });
    expect(lmsMiddle()).toBeNull();
    w.unmount();
  });

  it('checking: 带 localVersion 时中段同样显示当前版本号', () => {
    const w = mountModal({ items: [makeItem({ phase: 'checking', localVersion: '0.2.0' })] });
    const middle = lmsMiddle();
    expect(middle).not.toBeNull();
    expect(middle!.textContent?.trim()).toBe('0.2.0');
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

  // 2026-09-16 回归：卡片左上/右上圆角丢失（截图 bug）。
  // 根因：bf9698f 移除 .update-card 的 overflow:hidden（防裁剪 Dropdown 向下展开的弹层）后，
  // 卡片顶缘 .update-head 背景与卡片同色、自身无圆角 → 左上角直（右上角仅由 .update-close
  // 自身 border-top-right-radius 兜底）。修复契约：.update-head 自身带 border-top-left-radius
  // 与 border-top-right-radius（不恢复卡片 overflow:hidden，否则 Dropdown 弹层再被裁）。
  it('布局：.update-head 自带顶部左右圆角（卡片去掉 overflow:hidden 后顶缘圆角不丢）', () => {
    const src = readFileSync(resolve(__dirname, 'UpdateModal.vue'), 'utf-8');
    const m = src.match(/\.update-head\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('border-top-left-radius: var(--radius-card)');
    expect(m![1]).toContain('border-top-right-radius: var(--radius-card)');
  });

  // 2026-09-16 布局回归（截图 bug）：两行中段提示文字（「已是最新版本 0.2.0」/「已是最新版本 bNNNNN」）
  // 未与弹窗居中对齐——LMS 行偏左 ~13px、llama.cpp 行偏左 ~20px（截图像素实测）。
  // 根因：名称列自然宽（「LMS 启动器」~78px /「llama.cpp」~63px）与按钮列（七态恒 99.03px）不对称，
  // 中段 flex:1 只居中于「名称..按钮」之间，几何中心偏卡片中心 (99.03−名称宽)/2。
  // 契约：名称列定宽 = 按钮 min-width 99.03px（左右两列等宽对称）→ 中段几何中心恰为卡片中心，
  // 两行同时居中；llama.cpp 行中段另需 .llama-info 内 flex:1 + min-width:0（占满可收缩）。
  it('布局：名称列定宽 99.03px 与按钮列对称 → 两行中段文字对齐卡片中心', () => {
    const src = readFileSync(resolve(__dirname, 'UpdateModal.vue'), 'utf-8');
    // 名称列：flex:none 定宽 99.03px（与 .update-row .btn 的 min-width 同值）
    const nameRule = src.match(/\.update-row__name\s*\{[^}]*\}/);
    expect(nameRule).not.toBeNull();
    expect(nameRule![0]).toContain('flex: none');
    expect(nameRule![0]).toContain('width: 99.03px');
    // 按钮列 min-width 基准保持 99.03px（名称列宽必须与其一致才对称）
    const btnRule = src.match(/\.update-row \.btn\s*\{[^}]*\}/);
    expect(btnRule).not.toBeNull();
    expect(btnRule![0]).toContain('min-width: 99.03px');
    // llama.cpp 行中段：.llama-info 内 flex:1 占满 + min-width:0 可收缩
    const infoMiddle = src.match(/\.llama-info \.update-row__middle\s*\{[^}]*\}/);
    expect(infoMiddle).not.toBeNull();
    expect(infoMiddle![0]).toContain('flex: 1');
    expect(infoMiddle![0]).toContain('min-width: 0');
    const info = src.match(/\.llama-info\s*\{([^}]*)\}/);
    expect(info).not.toBeNull();
    expect(info![1]).toContain('flex: 1');
    expect(info![1]).toContain('min-width: 0');
  });
});

// ---- Task 7 回归：llama.cpp 更新状态需在每次「打开弹窗」时重新检查 ----
// 2026 契约变更：弹窗恒常驻挂载（组件状态不随开关丢失）。打开时的自动动作
// 仅为「本地版本查询」（get_llama_local_version，无网络）：unknown/unconfigured 态
// 查询并显示当前本地版本（unconfigured 是死锁逃生口——用户选完目录重开即恢复）；
// 其它状态（checking/available/downloading/stop-update/available/up-to-date/error/ready）
// 重开不重置、不重查，仅重挂进度监听。网络检查（check_llama_update）只由手动
// 「检查更新」/「重试」/「切换版本」触发。
// （历史根因 2026-09-14：曾在 onMounted 只查一次导致 unconfigured 死锁；
//  2026-09-16 曾改为每次重开网络检查导致状态被覆盖；本契约为其终局。）
describe('UpdateModal · llama.cpp 重新打开弹窗（回归）', () => {
  // 持久 invoke mock：同一 vi.fn 实例贯穿 open→false→true，用 mockImplementation 切换主进程返回值
  let invokeMock: ReturnType<typeof vi.fn>;
  function countCheckCalls(): number {
    return invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'check_llama_update').length;
  }

  // 2026 契约变更：打开弹窗的自动动作仅为「本地版本查询」（get_llama_local_version，无网络检查）；
  // 未配置由本地查询返回 unconfigured 判定（不再依赖 check_llama_update）。
  it('首次打开：llama_dir 未配置（本地查询返回 unconfigured）→ llama.cpp 行恒显示，提示文字 + 置灰「检查更新」按钮', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: false, error: 'unconfigured' };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 2026-09 需求：llama.cpp 行恒显示；未配置目录 → 提示文字（2026-09 优化：名称行下方独立一行，
    // .llama-below，可换行完整显示）+「检查更新」按钮
    // 2026-09-15 需求：未选择安装目录时按钮置灰不可点（无法检查，点了只会再得到 unconfigured）
    expect(document.querySelector('.llama-section')).not.toBeNull();
    expect(document.querySelector('.llama-below')?.textContent?.trim())
      .toBe('请先在主界面选择 llama.cpp 安装目录');
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent?.trim()).toBe('检查更新');
    expect(btn!.disabled).toBe(true);
    // 打开时零网络检查（本地查询不经过 check_llama_update）
    expect(countCheckCalls()).toBe(0);
    w.unmount();
  });

  // 2026-09-15 需求：未配置态按钮置灰不可点；用户选定目录后重新打开（本地查询成功）→ 按钮恢复可点
  it('unconfigured：「检查更新」按钮置灰禁用；重新打开（目录已配置，本地查询成功）后恢复可点并显示本地版本', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: false, error: 'unconfigured' };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const btn = () => document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn()!.disabled).toBe(true);
    expect(btn()!.textContent?.trim()).toBe('检查更新');

    // 用户已在主界面选定目录 → 本地查询成功（返回本地版本）→ 重开后按钮恢复可点 + 中段显示本地版本
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10679 } };
      return {};
    });
    await w.setProps({ open: false });
    await nextTick();
    await w.setProps({ open: true });
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-below')).toBeNull();
    expect(btn()!.disabled).toBe(false);
    expect(btn()!.textContent?.trim()).toBe('检查更新');
    // 中段显示当前本地版本（裸版本号，灰字，同 LMS 启动器行显示方式）
    expect(document.querySelector('.llama-section .llama-state-text')?.textContent?.trim()).toBe('b10679');
    // 全程零网络检查
    expect(countCheckCalls()).toBe(0);
    w.unmount();
  });

  // 2026-09-15 布局回归：未配置/出错时 .llama-below 提示行以 width:100% 独占整行，
  // 若按钮容器（.update-row__action）排在提示行之后会被挤到下一行，与「llama.cpp」文字不同行（截图 bug）。
  // 按钮容器必须是名称行 .llama-info 的直接后继兄弟，恒与名称同处第一行。
  it('布局：llama.cpp 行「检查更新」按钮与名称文字同处第一行（不被 .llama-below 挤到下一行）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: false, error: 'unconfigured' };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const section = document.querySelector('.llama-section');
    expect(section).not.toBeNull();
    const action = section!.querySelector(':scope > .update-row__action');
    const info = section!.querySelector(':scope > .llama-info');
    const below = section!.querySelector(':scope > .llama-below');
    expect(action).not.toBeNull();
    expect(below).not.toBeNull();
    // 按钮容器紧跟名称行 → 同一 flex 行；提示行在按钮之后独占下一行
    expect(action!.previousElementSibling).toBe(info);
    expect(info!.nextElementSibling).toBe(action);
    expect(action!.nextElementSibling).toBe(below);
    w.unmount();
  });

  it('布局：error 态「重试」按钮同样与名称文字同处第一行（手动检查失败后）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10679 } };
      if (cmd === 'check_llama_update') return { success: false, error: 'failed to fetch remote release info' };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开只做了本地查询 → 手动点「检查更新」→ 检查失败 → error 态
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const section = document.querySelector('.llama-section');
    const action = section!.querySelector(':scope > .update-row__action');
    const info = section!.querySelector(':scope > .llama-info');
    expect(action!.previousElementSibling).toBe(info);
    w.unmount();
  });

  // 2026-09-16 需求：「本地: bNNNNN」独立 span 删除（用户反馈与中段状态文字冗余）——
  // 本地版本号收敛到 up-to-date 中段「已是最新版本 bNNNNN」（与 LMS 启动器行「已是最新版本 0.2.0」同格式）。
  it('「本地:」span 不再渲染；up-to-date 中段显示「已是最新版本 bNNNNN」（与 LMS 启动器行同格式）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10679 } };
      if (cmd === 'check_llama_update') return { success: true, status: 'up-to-date', localVersion: { type: 'prerelease', build: 10679 } };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 本地版本号独立 span 已删除
    expect(document.querySelector('.llama-version')).toBeNull();
    expect(document.querySelector('.llama-section')!.textContent).not.toContain('本地:');
    // 手动点「检查更新」→ up-to-date 中段带本地版本号（与 LMS 启动器行「已是最新版本 0.2.0」同格式）
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-section .llama-state-text')?.textContent?.trim()).toBe('已是最新版本 b10679');
    w.unmount();
  });

  // 2026-09 优化回归：检查失败（error 态）的红色错误文字也移到名称行下方独立一行，
  // 不再占用中段（.llama-middle 不渲染），中段「已是最新版本/新版本」位置不受影响。
  it('error 态：红色错误文字显示在名称行下方 .llama-below--error，中段留空（手动检查失败后）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10679 } };
      if (cmd === 'check_llama_update') return { success: false, error: 'failed to fetch remote release info' };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开只做了本地查询 → 手动点「检查更新」→ 检查失败 → error 态
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const below = document.querySelector('.llama-below');
    expect(below).not.toBeNull();
    expect(below!.classList.contains('llama-below--error')).toBe(true);
    expect(below!.textContent?.trim()).toBe('failed to fetch remote release info');
    // 错误文字不再占中段
    expect(document.querySelector('.llama-section .llama-middle')).toBeNull();
    // 按钮为「重试」
    expect(document.querySelector('.llama-section .btn-primary')?.textContent?.trim()).toBe('重试');
    w.unmount();
  });

  // 2026-09-14 bug 回归：本地版本显示。主进程返回真实解析结果
  // { type: 'prerelease', version: '0.3.0', build: 10679 }（旧契约 {version, commit} 已废弃），
  // 旧代码 localResult.version.version 虽能取到 '0.3.0'，但模板拼 'v' 前缀 + 远端 tag 是 b 号，
  // 显示必须不出现 undefined 且体现 build 号（b10679）。
  it('本地 dev 构建版本显示 build 号且不出现 undefined', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', version: '0.3.0', build: 10679 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b10955',
        versionOptions: [{ label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' }],
      };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开时本地查询成功 → 手动点「检查更新」→ update-available
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // 2026-09-16：「本地:」独立 span 已删除（本地版本号仅 up-to-date 中段显示）
    expect(document.querySelector('.llama-version')).toBeNull();
    // 远端是 nightly b 号 tag：显示不应出现 undefined
    const newEl = document.querySelector('.llama-new-version');
    expect(newEl).not.toBeNull();
    expect(newEl!.textContent).toContain('b10955');
    expect(newEl!.textContent).not.toContain('undefined');
    w.unmount();
  });

  // 2026 契约变更：重开的自动动作是「本地版本查询」（unconfigured 态每次重开重查，作为死锁逃生口），
  // 不是 check_llama_update 网络检查；成功后中段显示当前本地版本（裸版本号），按钮恢复可点。
  it('关闭后再打开：llama_dir 已配置（本地查询成功）→ 状态刷新（提示消失），零网络检查', async () => {
    // 阶段 1：未配置（本地查询返回 unconfigured）
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: false, error: 'unconfigured' };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-section')).not.toBeNull();
    expect(document.querySelector('.llama-below')?.textContent?.trim()).toBe('请先在主界面选择 llama.cpp 安装目录');
    expect(countCheckCalls()).toBe(0); // 打开时零网络检查

    // 阶段 2：用户已在主界面选定目录 → 本地查询成功（返回本地版本）
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10679 } };
      return {};
    });

    // 关闭 → 重新打开
    await w.setProps({ open: false });
    await nextTick();
    await w.setProps({ open: true });
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // 重新打开后执行的是本地查询（unconfigured → 重查），不是 check_llama_update
    expect(countCheckCalls()).toBe(0);
    // 刷新后：提示消失，中段显示当前本地版本（裸版本号），按钮「检查更新」可点
    expect(document.querySelector('.llama-below')).toBeNull();
    expect(document.querySelector('.llama-section')).not.toBeNull();
    expect(document.querySelector('.llama-state-text')?.textContent?.trim()).toBe('b10679');
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent?.trim()).toBe('检查更新');
    expect(btn!.disabled).toBe(false);
    w.unmount();
  });
  // 2026-09 需求：llama.cpp 行恒显示（弹窗打开即见）；检查到更新（update-available）后
  // 中段显示新版本号 + 版本选择器，按钮切换为「下载更新」（与 LMS 启动器行同文案）。
  it('打开时本地查询显示裸版本号；手动「检查更新」到更新后显示新版本与「下载更新」按钮', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10679 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b10955',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' },
          { label: 'Windows x64 (CUDA 12)', downloadUrl: 'https://example.com/c.zip', cudaDllsUrl: 'https://example.com/dlls.zip' },
        ],
      };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开时仅本地查询 → 中段显示当前本地版本（裸版本号，灰字）+「检查更新」按钮，零网络检查
    expect(document.querySelector('.llama-section')).not.toBeNull();
    expect(document.querySelector('.llama-state-text')?.textContent?.trim()).toBe('b10679');
    expect(document.querySelector('.llama-section .btn-primary')?.textContent?.trim()).toBe('检查更新');
    // 「本地:」独立 span 已删除（版本号收敛到中段）
    expect(document.querySelector('.llama-version')).toBeNull();
    expect(countCheckCalls()).toBe(0);

    // 手动点「检查更新」且检查到更新 → 区域显示（版本号 + 选择器 + 更新按钮）
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(countCheckCalls()).toBe(1);

    expect(document.querySelector('.llama-section')).not.toBeNull();
    expect(document.querySelector('.llama-new-version')?.textContent?.trim()).toBe('新版本: b10955');
    // 2026-09 视觉统一：版本选择器改共享 Dropdown 组件（.select-trigger 触发按钮 + 弹层 .dropdown-panel）
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CPU)'); // 默认选中第一项
    trigger!.click();
    await nextTick();
    const liOptions = document.querySelectorAll('.llama-section .dropdown-panel li');
    expect(liOptions.length).toBe(2);
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent?.trim()).toBe('下载更新');
    expect(btn!.disabled).toBe(false);
    w.unmount();
  });

  // 2026-09-16 优化：llama.cpp 行按钮下方的独立细进度条（.llama-download-progress：细条 +
  // "download" 阶段文字）删除——按钮本身即进度条（「下载中 NN%」+ 左侧紫填充），细条与阶段文字冗余。
  // 回归契约：下载中（downloading）时 DOM 无 .llama-download-progress / .llama-progress-bar /
  // .llama-progress-stage；按钮仍渲染填充节点与「下载中 NN%」文案（进度不丢失，仅收敛到按钮内）。
  it('downloading：llama.cpp 行无独立细进度条与阶段文字；按钮本身即进度条（填充 + 「下载中 NN%」）', async () => {
    let downloadResolve: (v: unknown) => void;
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10679 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b10955',
        versionOptions: [{ label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' }],
      };
      if (cmd === 'download_llama_update') return new Promise((r) => { downloadResolve = r; }); // 挂起 → 停留 downloading
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动点「检查更新」检查到更新 → 点击「下载更新」进入 downloading
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent?.trim()).toBe('下载更新');
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 独立细进度条与阶段文字已删除
    expect(document.querySelector('.llama-download-progress')).toBeNull();
    expect(document.querySelector('.llama-progress-bar')).toBeNull();
    expect(document.querySelector('.llama-progress-stage')).toBeNull();
    // 按钮本身即进度条：禁用 + 「下载中 0%」+ 紫填充节点（无进度事件时 pct=0）
    const b = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(b!.textContent?.trim()).toBe('下载中 0%');
    expect(b!.disabled).toBe(true);
    const fill = b!.querySelector('.update-row__fill') as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe('0%');
    w.unmount();
    downloadResolve({ success: true }); // 收尾：放行挂起的下载 promise
  });

  // 同源回归：细进度条的 CSS 定义一并删除（防模板删了样式残留的死代码）
  it('源码回归：UpdateModal.vue 不再包含 llama 细进度条的模板与样式', () => {
    const src = readFileSync(resolve(__dirname, 'UpdateModal.vue'), 'utf-8');
    expect(src).not.toContain('llama-download-progress');
    expect(src).not.toContain('llama-progress-bar');
    expect(src).not.toContain('llama-progress-stage');
  });

  // 2026-09-17 定稿：pre-release 勾选框移除——llama.cpp stable release 无 Windows 包（仅
  // nightly-tag.txt，2026-09-17 实测 v0.4.1），nightly（b 号）是唯一可下载来源，恒查 pre-release，
  // 无需用户开关。回归契约：DOM 无勾选框；check_llama_update 不带 include_pre_release 参数。
  // （2026-11 契约更新：get_llama_update_config 取 last_version_type 作为下拉默认选中，
  // 读取时机 = 打开弹窗时（下拉出现前），见下方「默认选中」用例组。）
  it('恒查 pre-release：无勾选框 UI，检查不带 include_pre_release 参数', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10679 } };
      if (cmd === 'check_llama_update') return { success: true, status: 'up-to-date' };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 勾选框已移除
    expect(document.querySelector('.llama-prerelease')).toBeNull();
    expect(document.querySelector('.llama-section input[type="checkbox"]')).toBeNull();
    // 手动点「检查更新」→ 检查正常发起，且不带 include_pre_release 参数
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const checkCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'check_llama_update');
    expect(checkCalls.length).toBe(1);
    expect(checkCalls[0][1]).toBeUndefined();
    w.unmount();
  });

  // ---- 2026-09-17 两阶段更新：下载完成但 llama-server 运行中 → 按钮「停止并更新」----
  // 背景：旧实现在下载后立即解压覆盖 llama_dir，运行中的 llama-server 锁住 ggml-base.dll → EBUSY。
  // 修复契约：下载阶段不触碰目标目录；下载完成判定服务运行——运行中则按钮切「停止并更新」
  // （点击 → 主进程停服务 + 安装已下载的包），未运行则自动安装（用户无感知）。
  it('stop-update：下载返回 installed=false → 按钮「停止并更新」可点 + 名称行下方灰字提示', async () => {
    let pendingDownloaded = false; // 模拟主进程：下载完成（installed=false）后才存在暂存包
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10996 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b10997',
        versionOptions: [{ label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' }],
      };
      // 主进程判定：下载完成，但 llama-server 运行中 → 包已暂存
      if (cmd === 'download_llama_update') { pendingDownloaded = true; return { success: true, installed: false }; }
      if (cmd === 'get_pending_llama_download') return { pending: pendingDownloaded, serverRunning: true, lockedFiles: [] };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动点「检查更新」→ 检查到更新 → 点击「下载更新」
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent?.trim()).toBe('下载更新');
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // 下载完成（服务运行中）→ 不再是 downloading，按钮切「停止并更新」
    const b = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(b!.textContent?.trim()).toBe('停止并更新');
    expect(b!.disabled).toBe(false);
    // 名称行下方灰字提示（引导用户）
    const below = document.querySelector('.llama-below') as HTMLElement | null;
    expect(below).not.toBeNull();
    expect(below!.classList.contains('llama-below--hint')).toBe(true);
    expect(below!.textContent).toContain('llama-server 正在运行');
    expect(below!.textContent).toContain('停止并更新');
    w.unmount();
  });

  it('stop-update 点击 → 调 install_llama_update；成功后保存配置 + llama-complete(true) + 重查', async () => {
    let installResolve: (v: unknown) => void;
    let pendingDownloaded = false; // 模拟主进程：下载完成（installed=false）后才存在暂存包
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10996 } };
      if (cmd === 'check_llama_update') return { success: true, status: 'update-available', remoteVersion: 'b10997', versionOptions: [{ label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' }] };
      if (cmd === 'download_llama_update') { pendingDownloaded = true; return { success: true, installed: false }; }
      if (cmd === 'install_llama_update') return new Promise((r) => { installResolve = r; }); // 挂起 → 可断言安装中禁用
      if (cmd === 'get_pending_llama_download') return { pending: pendingDownloaded, serverRunning: true, lockedFiles: [] };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动「检查更新」→ 「下载更新」→ downloading/stop-update
    let btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn!.textContent?.trim()).toBe('下载更新');
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // 进入 stop-update → 点击「停止并更新」
    btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn!.textContent?.trim()).toBe('停止并更新');
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(invokeMock).toHaveBeenCalledWith('install_llama_update');
    // 安装中复用 downloading 视觉通道（禁用 + 进度条空载 0%）
    const installing = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(installing!.disabled).toBe(true);

    // 放行安装成功 → 保存配置 + llama-complete(true) + 重查落 up-to-date
    installResolve!({ success: true });
    invokeMock.mockImplementation(async (cmd: string) => {
      // 安装成功后重查：主进程返回更新后的本地版本（随 check 的 localVersion 字段）
      if (cmd === 'check_llama_update') return { success: true, status: 'up-to-date', localVersion: { type: 'prerelease', build: 10997 } };
      if (cmd === 'get_pending_llama_download') return { pending: false, serverRunning: false, lockedFiles: [] };
      return {};
    });
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    const setCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'set_llama_update_config');
    expect(setCalls.length).toBeGreaterThan(0);
    expect(w.emitted('llama-complete')?.find((e) => e[0] === true)).toBeDefined();
    // 重查落定：已是最新（本地版本号并入中段）+ 按钮「检查更新」
    expect(document.querySelector('.llama-section .llama-state-text')?.textContent?.trim()).toBe('已是最新版本 b10997');
    expect(document.querySelector('.llama-section .btn-primary')?.textContent?.trim()).toBe('检查更新');
    w.unmount();
  });

  it('stop-update 点击 → 非占用类安装失败（如验证失败）→ error 态「重试」+ 红字原因', async () => {
    let pendingDownloaded = false; // 模拟主进程：下载完成后才存在暂存包
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10996 } };
      if (cmd === 'check_llama_update') return { success: true, status: 'update-available', remoteVersion: 'b10997', versionOptions: [{ label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' }] };
      if (cmd === 'download_llama_update') { pendingDownloaded = true; return { success: true, installed: false }; }
      if (cmd === 'install_llama_update') return { success: false, error: 'verify failed: llama-server 未找到' };
      if (cmd === 'get_pending_llama_download') return { pending: pendingDownloaded, serverRunning: true, lockedFiles: [] };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动「检查更新」→ 「下载更新」
    let btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn!.textContent?.trim()).toBe('下载更新');
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn!.textContent?.trim()).toBe('停止并更新');
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    expect(document.querySelector('.llama-section .btn-primary')?.textContent?.trim()).toBe('重试');
    const below = document.querySelector('.llama-below') as HTMLElement | null;
    expect(below).not.toBeNull();
    expect(below!.classList.contains('llama-below--error')).toBe(true);
    expect(below!.textContent).toContain('verify failed');
    expect(w.emitted('llama-complete')?.find((e) => e[0] === false)).toBeDefined();
    w.unmount();
  });

  // 2026-09-17 二轮：占用类安装失败（busy:true，如 ggml-cuda.dll 被外部 CUDA 版
  // llama-server 锁住）→ 按钮回到「停止并更新」（pending 包保留，可再次点击），
  // 而不是「重试」（重走完整下载）。用户场景：探测清单漏 CUDA 变体时裸露 EBUSY。
  it('stop-update 点击 → 占用类安装失败（busy:true）→ 回到「停止并更新」可再次点击', async () => {
    let pendingDownloaded = false;
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10996 } };
      if (cmd === 'check_llama_update') return { success: true, status: 'update-available', remoteVersion: 'b10997', versionOptions: [{ label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' }] };
      if (cmd === 'download_llama_update') { pendingDownloaded = true; return { success: true, installed: false }; }
      if (cmd === 'install_llama_update') return { success: false, busy: true, error: '目标文件仍被占用（llama.cpp 进程可能未完全退出），请关闭外部启动的 llama.cpp 进程后重试' };
      if (cmd === 'get_pending_llama_download') return { pending: pendingDownloaded, serverRunning: true, lockedFiles: ['ggml-cuda.dll'] };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动「检查更新」→ 「下载更新」
    let btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn!.textContent?.trim()).toBe('下载更新');
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn!.textContent?.trim()).toBe('停止并更新');
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // busy 失败 → 不是「重试」，而是回到「停止并更新」（可再次点击，不重走下载）
    const b = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(b!.textContent?.trim()).toBe('停止并更新');
    expect(b!.disabled).toBe(false);
    expect(w.emitted('llama-complete')?.find((e) => e[0] === false)).toBeDefined();
    // 再次点击 → 再次发起 install_llama_update（pending 包保留）
    b!.click();
    await nextTick();
    const installCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'install_llama_update');
    expect(installCalls.length).toBe(2);
    w.unmount();
  });

  // ---- 2026 契约：adopt 移除 ----
  // 旧契约（每次打开弹窗重置状态 + 重查 + adopt 暂存包）已废止：打开仅做本地版本查询，
  // 组件状态不随开关重置 → 上一轮下载落定的 stop-update 态在重开时自然保留，无需 adopt。
  // stop-update 仅由下载 installed=false / 安装 busy 进入（见上方三组用例）。
  // 故「打开时主进程有暂存包」不再有独立 UI 路径；该场景由 stop-update 重开保留覆盖。

  it('无暂存包时手动「检查更新」→ 不误入 stop-update（adopt 默认安全）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 10996 } };
      if (cmd === 'check_llama_update') return { success: true, status: 'update-available', remoteVersion: 'b10997', versionOptions: [{ label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/a.zip' }] };
      if (cmd === 'get_pending_llama_download') return { pending: false, serverRunning: false, lockedFiles: [] };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-section .btn-primary')?.textContent?.trim()).toBe('下载更新');
    w.unmount();
  });

  // ---- 2026-09-18：up-to-date 态也显示 Windows 版本下拉；按钮文案随「选中项 vs lms_launcher.yaml 配置」切换 ----
  // 背景：用户要求「检查到已是最新版本时，下方也要显示各 Windows 版本的下拉菜单，允许切换版本」；
  // 后续优化：所选版本与 yaml 里 llama_update.last_version_type 一致时按钮应为「检查更新」，
  // 不一致（用户在弹窗里切换了下拉）时为「切换版本」。
  // 契约：up-to-date + 有 versionOptions → 下拉渲染；
  //   选中项与配置一致（无配置 = 第一项视为一致 / 配置命中选中项）→ 按钮「检查更新」（点击重查）；
  //   不一致 → 按钮「切换版本」（点击 → 调 download_llama_update 携带所选选项 URL，不重发 check）。
  it('up-to-date + 有版本选项（无配置）：显示 Windows 版本下拉 + 按钮「检查更新」', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11001 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'up-to-date',
        localVersion: { type: 'prerelease', build: 11001 },
        remoteVersion: 'b11001',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/cuda13-dlls.zip' },
          { label: 'Windows x64 (Vulkan)', downloadUrl: 'https://example.com/vk.zip' },
        ],
      };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动点「检查更新」→ up-to-date 落定
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // 已是最新中段显示本地版本号（与 LMS 启动器行同格式）
    expect(document.querySelector('.llama-section .llama-state-text')?.textContent?.trim()).toBe('已是最新版本 b11001');
    // 下拉渲染：默认选中第一项 + 3 个选项
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CPU)');
    trigger!.click();
    await nextTick();
    expect(document.querySelectorAll('.llama-section .dropdown-panel li').length).toBe(3);
    // 无配置（第一项视为一致）→ 按钮「检查更新」且可点
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent?.trim()).toBe('检查更新');
    expect(btn!.disabled).toBe(false);
    w.unmount();
  });

  it('up-to-date 点击「切换版本」（切换变体后）：调 download_llama_update（所选选项 URL），不重发 check', async () => {
    let downloadResolve: (v: unknown) => void;
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11001 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'up-to-date',
        remoteVersion: 'b11001',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/cuda13-dlls.zip' },
        ],
      };
      if (cmd === 'download_llama_update') return new Promise((r) => { downloadResolve = r; }); // 挂起 → 停留 downloading
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动点「检查更新」→ up-to-date 落定（下拉出现）
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // 切换下拉到第 2 项（CUDA 13）——与配置（无配置=第一项）不一致 → 按钮切「切换版本」
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    trigger!.click();
    await nextTick();
    const lis = document.querySelectorAll('.llama-section .dropdown-panel li');
    (lis[1] as HTMLElement).click();
    await nextTick();
    // 按钮文案反应式切换为「切换版本」且可点；点击 → 下载所选变体（不重发 check）
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn!.textContent?.trim()).toBe('切换版本');
    expect(btn!.disabled).toBe(false);
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // 调用了 download_llama_update 且携带所选 CUDA 13 选项的主包 + DLLs URL
    const dlCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'download_llama_update');
    expect(dlCalls.length).toBe(1);
    expect(dlCalls[0][1]).toEqual({
      download_url: 'https://example.com/cuda13.zip',
      cuda_dlls_url: 'https://example.com/cuda13-dlls.zip',
    });
    // 「切换版本」直接下载，不重发 check_llama_update（手动检查 1 次，点击后不增加）
    const checkCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'check_llama_update');
    expect(checkCalls.length).toBe(1);
    // 进入 downloading（按钮禁用）
    const b = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(b!.disabled).toBe(true);
    w.unmount();
    downloadResolve({ success: true, installed: true }); // 收尾：放行挂起的下载 promise
  });

  // ---- 2026-09-18：up-to-date 按钮随「选中项 vs yaml 配置」切换（检查更新 / 切换版本）----
  // 契约：选中项 label 与 llama_update.last_version_type 一致 → 「检查更新」（点击重发
  // check_llama_update，不发起下载）；不一致 → 「切换版本」（点击下载所选变体）。
  it('up-to-date + 配置命中选中项：按钮「检查更新」；点击重发 check，不发起下载', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11001 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'up-to-date',
        remoteVersion: 'b11001',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip' },
        ],
      };
      if (cmd === 'get_llama_update_config') return { success: true, config: { last_version_type: 'Windows x64 (CUDA 13)' } };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动点「检查更新」（手动路径读配置恢复默认选中）→ up-to-date 落定
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 配置命中 → 默认选中 CUDA 13，按钮「检查更新」
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger!.textContent).toContain('Windows x64 (CUDA 13)');
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement | null;
    expect(btn!.textContent?.trim()).toBe('检查更新');
    expect(btn!.disabled).toBe(false);
    // 点击「检查更新」→ 重发 check（不发起 download_llama_update）
    btn!.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const checkCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'check_llama_update');
    expect(checkCalls.length).toBe(2);
    expect(invokeMock.mock.calls.some((c: unknown[]) => c[0] === 'download_llama_update')).toBe(false);
    // 重查落定后按钮仍「检查更新」
    expect(document.querySelector('.llama-section .btn-primary')?.textContent?.trim()).toBe('检查更新');
    w.unmount();
  });

  it('up-to-date + 配置命中后切换变体：按钮「切换版本」；点击下载所选变体，成功后回写配置并重查落回「检查更新」', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11001 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'up-to-date',
        remoteVersion: 'b11001',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/cuda13-dlls.zip' },
        ],
      };
      if (cmd === 'get_llama_update_config') return { success: true, config: { last_version_type: 'Windows x64 (CUDA 13)' } };
      if (cmd === 'download_llama_update') return { success: true, installed: true };
      if (cmd === 'set_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动点「检查更新」→ up-to-date 落定（配置命中 → 默认选中 CUDA 13）
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 配置命中 → 默认选中 CUDA 13，按钮「检查更新」
    const btn = () => document.querySelector('.llama-section .btn-primary') as HTMLButtonElement;
    expect(btn().textContent?.trim()).toBe('检查更新');
    // 切换到 CPU（与配置不一致）→ 按钮「切换版本」
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    trigger!.click();
    await nextTick();
    const lis = document.querySelectorAll('.llama-section .dropdown-panel li');
    (lis[0] as HTMLElement).click();
    await nextTick();
    expect(btn().textContent?.trim()).toBe('切换版本');
    expect(btn().disabled).toBe(false);
    // 点击「切换版本」→ 下载 CPU 变体（不重发 check）
    btn().click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    await nextTick();
    const dlCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'download_llama_update');
    expect(dlCalls.length).toBe(1);
    expect(dlCalls[0][1]).toEqual({ download_url: 'https://example.com/cpu.zip', cuda_dlls_url: undefined });
    // 下载成功 → 回写配置 CPU
    const setCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'set_llama_update_config');
    expect(setCalls.length).toBe(1);
    expect(setCalls[0][1]).toEqual({ last_version_type: 'Windows x64 (CPU)' });
    // 重查落定：选中项与（回写后的）配置一致 → 按钮落回「检查更新」
    expect(document.querySelector('.llama-section .select-trigger')!.textContent).toContain('Windows x64 (CPU)');
    expect(document.querySelector('.llama-section .btn-primary')?.textContent?.trim()).toBe('检查更新');
    w.unmount();
  });

  // ---- 2026 日志去重（契约随「打开只查本地版本」重定）----
  // 根因（2026-09-16 发现）：打开弹窗的「本地版本查询」与 check_llama_update 内部
  // 各自执行一次 llama-server --version 并各落一条「本地版本」日志 → 日志区重复。
  // 契约：打开弹窗只做一次本地查询；手动「检查更新」后不再重复查询本地版本——
  // 本地版本显示统一由 check_llama_update 返回的 localVersion 派生（check 内部同一
  // 查询只落一条日志）。
  it('日志去重：打开仅本地查询一次；手动检查后不再重复查询，中段版本号由 check 返回的 localVersion 派生', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', version: '0.4.0-dev', build: 11000 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'up-to-date',
        localVersion: { type: 'prerelease', version: '0.4.1-dev', build: 11002 },
      };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开时本地版本查询恰好一次
    expect(invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'get_llama_local_version').length).toBe(1);
    // 手动点「检查更新」→ 检查落定后不再重复查询本地版本
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'get_llama_local_version').length).toBe(1);
    // up-to-date 中段「已是最新版本」版本号由 check 返回的 localVersion 派生（b 号优先）
    expect(document.querySelector('.llama-section .llama-state-text')?.textContent?.trim()).toBe('已是最新版本 b11002');
    w.unmount();
  });

  it('日志去重：本地查询与 check 均未返回 localVersion → 中段回退「已是最新版本」不带版本号（不出现 undefined）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true };
      if (cmd === 'check_llama_update') return { success: true, status: 'up-to-date' };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-section .llama-state-text')?.textContent?.trim()).toBe('已是最新版本');
    expect(document.querySelector('.llama-section')!.textContent).not.toContain('undefined');
    w.unmount();
  });

  // 回归守护：up-to-date 但主进程未返回版本选项（异常/旧版本契约）→ 不渲染下拉、按钮保持「检查更新」
  it('up-to-date 无版本选项：不渲染下拉，按钮保持「检查更新」', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11001 } };
      if (cmd === 'check_llama_update') return { success: true, status: 'up-to-date' };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-section .select-trigger')).toBeNull();
    expect(document.querySelector('.llama-section .btn-primary')?.textContent?.trim()).toBe('检查更新');
    w.unmount();
  });

  // ---- 2026-09-18：版本下拉默认选中「上一次使用的版本类型」----
  // 背景：lms_launcher.yaml 的 llama_update.last_version_type 在每次下载成功后写入
  // （如 'Windows x64 (CUDA 13)'），但弹窗打开时下拉恒默认第一项，用户每次都要手动
  // 重选变体。
  // 契约：打开弹窗取 get_llama_update_config 的 last_version_type，检查返回选项表后
  // 按 label 精确匹配恢复选中项；无配置/取配置失败/选项表不含该 label（新版本选项
  // 变化）→ 回退第一项，且不影响检查主流程。
  it('默认选中：配置 last_version_type 命中选项 → 下拉默认选中该项（非第一项）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11000 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b11001',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 12)', downloadUrl: 'https://example.com/cuda12.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip' },
        ],
      };
      if (cmd === 'get_llama_update_config') return { success: true, config: { last_version_type: 'Windows x64 (CUDA 13)' } };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动「检查更新」（手动路径读配置）→ 选项表就绪后按配置恢复选中
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CUDA 13)');
    w.unmount();
  });

  it('默认选中：配置命中但选项表已无该 label（release 选项变化）→ 回退第一项', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11000 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b11001',
        // CUDA 13 已被上游移除 → 配置里的 last_version_type 找不到对应选项
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (Vulkan)', downloadUrl: 'https://example.com/vk.zip' },
        ],
      };
      if (cmd === 'get_llama_update_config') return { success: true, config: { last_version_type: 'Windows x64 (CUDA 13)' } };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CPU)');
    w.unmount();
  });

  it('默认选中：无配置（首次使用）→ 手动检查前取一次配置后回退第一项，不影响检查', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11000 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b11001',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip' },
        ],
      };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 2026-11：打开时读一次配置（下拉出现前恢复默认选中）——首次使用无 last_version_type
    expect(invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'get_llama_update_config').length).toBe(1);
    // 手动点「检查更新」→ 完整检查（不再重读配置）
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 点击路径不重读配置（配置读取唯一时机 = 打开弹窗时）
    const cfgCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'get_llama_update_config');
    expect(cfgCalls.length).toBe(1);
    // 无 last_version_type → 第一项
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CPU)');
    // 检查主流程不受配置读取影响
    const checkCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'check_llama_update');
    expect(checkCalls.length).toBe(1);
    w.unmount();
  });

  it('默认选中：下载完成重查后，下拉保持本次所选变体（不被打开时的旧配置重置）', async () => {
    // 手动检查时配置为空 → 默认第一项 CPU；用户切到 CUDA 13 下载成功（installed=true 自动安装）
    // → set_llama_update_config 写入 CUDA 13 → 重查 → 下拉必须仍是 CUDA 13
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11000 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'up-to-date',
        remoteVersion: 'b11001',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip' },
        ],
      };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      if (cmd === 'download_llama_update') return { success: true, installed: true };
      if (cmd === 'set_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开仅本地查询 → 手动「检查更新」→ up-to-date 落定（默认第一项 CPU）
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 切到 CUDA 13（与打开时配置不一致）→ 按钮「切换版本」
    const trigger = () => document.querySelector('.llama-section .select-trigger') as HTMLButtonElement;
    trigger().click();
    await nextTick();
    const lis = document.querySelectorAll('.llama-section .dropdown-panel li');
    (lis[1] as HTMLElement).click();
    await nextTick();
    // 2026-09-18 契约：无配置时初始按钮为「检查更新」（点击=重查，不下载）；
    // 先点击重查落定（此时选中项与配置仍不一致 → 按钮「切换版本」），再点下载
    const btn = () => document.querySelector('.llama-section .btn-primary') as HTMLButtonElement;
    expect(btn().textContent?.trim()).toBe('切换版本');
    // （初始「检查更新」点击=重查——此处直接断言切换后即为「切换版本」，点击即下载）
    btn().click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    await nextTick();
    // 下载成功路径保存了配置
    const setCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'set_llama_update_config');
    expect(setCalls.length).toBe(1);
    expect(setCalls[0][1]).toEqual({ last_version_type: 'Windows x64 (CUDA 13)' });
    // 重查完成后下拉仍为本次所选 CUDA 13
    expect(trigger().textContent).toContain('Windows x64 (CUDA 13)');
    w.unmount();
  });

  it('默认选中：取配置失败 → 不阻塞检查，下拉回退第一项', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11000 } };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        remoteVersion: 'b11001',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip' },
        ],
      };
      if (cmd === 'get_llama_update_config') throw new Error('ipc channel unavailable');
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开路径取配置抛错 → 静默（下拉回退第一项）；手动「检查更新」照常完整检查
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 配置抛错不进入错误态（检查正常完成）
    expect(document.querySelector('.llama-section .llama-below--error')).toBeNull();
    const checkCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'check_llama_update');
    expect(checkCalls.length).toBe(1);
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CPU)');
    w.unmount();
  });
});

// ---- 2026-11 细化契约：打开弹窗即联网获取版本选项（下拉立即可见）----
// 用户细化：打开弹窗后，就联网获取所有版本选项（下拉菜单立即可见），但最新版本 bNNNNN
// 在点击「检查更新」按钮后才去获取并比较本地版本。实现边界：打开时的自动动作 = 本地版本
// 查询（get_llama_local_version）+ 选项拉取（get_llama_release_options，无 --version、无版本
// 比对，status 保持 unknown）；点击「检查更新」= 完整 check_llama_update（拉取最新 tag +
// 比对本地版本 → status/remoteVersion 落定）。选项拉取失败静默（下拉不出现，不进入错误态）。
describe('UpdateModal · llama.cpp 打开即取版本选项（2026-11 细化）', () => {
  let invokeMock: ReturnType<typeof vi.fn>;
  function countCheckCalls(): number {
    return invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'check_llama_update').length;
  }
  function countOptionsCalls(): number {
    return invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'get_llama_release_options').length;
  }

  it('首次打开（目录已配置）：本地查询 + 选项拉取 → 下拉立即可见，中段裸本地版本，按钮「检查更新」可点；打开时零完整检查', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_release_options') return {
        success: true,
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/dlls.zip' },
          { label: 'Windows x64 (Vulkan)', downloadUrl: 'https://example.com/vk.zip' },
        ],
      };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 下拉立即可见：3 个选项，默认选中第一项（无配置 → 第一项）
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CPU)');
    trigger!.click();
    await nextTick();
    expect(document.querySelectorAll('.llama-section .dropdown-panel li').length).toBe(3);
    // status 保持 unknown：无「新版本/已是最新」文案，中段裸本地版本（灰字）
    expect(document.querySelector('.llama-new-version')).toBeNull();
    expect(document.querySelector('.llama-state-text')?.textContent?.trim()).toBe('b11020');
    // 按钮「检查更新」可点；无提示/错误行
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('检查更新');
    expect(btn.disabled).toBe(false);
    expect(document.querySelector('.llama-below')).toBeNull();
    // 契约边界：打开时不发完整检查；选项仅拉取一次（不重复）
    expect(countCheckCalls()).toBe(0);
    expect(countOptionsCalls()).toBe(1);
    w.unmount();
  });

  it('打开后点击「检查更新」→ 完整检查获取最新版本并比较本地，落定 update-available + 「下载更新」', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_release_options') return { success: true, versionOptions: [
        { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
        { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/dlls.zip' },
      ] };
      if (cmd === 'check_llama_update') return {
        success: true,
        status: 'update-available',
        localVersion: { type: 'prerelease', build: 11020 },
        remoteVersion: 'b11021',
        versionOptions: [
          { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
          { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/dlls.zip' },
        ],
      };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开后下拉已可见，但无版本结论（unknown）
    expect(document.querySelector('.llama-section .select-trigger')).not.toBeNull();
    expect(document.querySelector('.llama-new-version')).toBeNull();
    // 点击「检查更新」→ 完整检查（本地 --version + 最新 tag 比对）
    (document.querySelector('.llama-section .btn-primary') as HTMLButtonElement).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(countCheckCalls()).toBe(1);
    // 落定 update-available：新版本紫字 + 「下载更新」按钮；下拉保持（选项由 check 同步）
    expect(document.querySelector('.llama-new-version')?.textContent?.trim()).toBe('新版本: b11021');
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('下载更新');
    expect(btn.disabled).toBe(false);
    expect(document.querySelector('.llama-section .select-trigger')).not.toBeNull();
    w.unmount();
  });

  it('打开时选项拉取失败（网络错误）→ 静默：下拉不出现、无错误态、按钮仍「检查更新」可点', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_release_options') return { success: false, error: 'failed to fetch remote release info' };
      if (cmd === 'check_llama_update') return { success: true, status: 'up-to-date', localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_update_config') return { success: true, config: {} };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 静默失败：无下拉、无错误红字，中段裸本地版本，按钮可点（用户可手动重试检查）
    expect(document.querySelector('.llama-section .select-trigger')).toBeNull();
    expect(document.querySelector('.llama-below--error')).toBeNull();
    expect(document.querySelector('.llama-state-text')?.textContent?.trim()).toBe('b11020');
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('检查更新');
    expect(btn.disabled).toBe(false);
    // 手动检查仍可恢复（走完整 check_llama_update）
    btn.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(countCheckCalls()).toBe(1);
    expect(document.querySelector('.llama-state-text')?.textContent?.trim()).toBe('已是最新版本 b11020');
    w.unmount();
  });

  it('打开时 unconfigured → 不拉取选项（零网络请求）、无下拉、按钮置灰', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: false, error: 'unconfigured' };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-section .select-trigger')).toBeNull();
    expect(document.querySelector('.llama-below')?.textContent?.trim()).toBe('请先在主界面选择 llama.cpp 安装目录');
    const btn = document.querySelector('.llama-section .btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // unconfigured 不发起任何网络动作（选项拉取 + 完整检查均为 0）
    expect(countOptionsCalls()).toBe(0);
    expect(countCheckCalls()).toBe(0);
    w.unmount();
  });

  it('关闭后重开（status 保持 unknown）→ 重新本地查询 + 重新拉取选项（下拉始终可恢复）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_release_options') return { success: true, versionOptions: [
        { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
      ] };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(countOptionsCalls()).toBe(1);
    expect(document.querySelector('.llama-section .select-trigger')).not.toBeNull();

    await w.setProps({ open: false });
    await nextTick();
    await w.setProps({ open: true });
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 重开（unknown 态）再次拉取选项；全程零完整检查
    expect(countOptionsCalls()).toBe(2);
    expect(countCheckCalls()).toBe(0);
    expect(document.querySelector('.llama-section .select-trigger')).not.toBeNull();
    expect(document.querySelector('.llama-state-text')?.textContent?.trim()).toBe('b11020');
    w.unmount();
  });

  // ---- 回归修复（2026-11 细化后）：默认选中「上一次用的版本」的读取时机随下拉提前到打开时 ----
  // 背景：2026 契约把配置读取挪进 manualLlamaCheck（点击「检查更新」后），而 2026-11 细化让
  // 下拉在打开时即出现（此时配置未读 → 恒选第一项）→ 丢失「默认选中上一次用的版本」功能。
  // 契约：打开时（本地查询成功）先静默读一次 yaml 的 last_version_type 恢复默认选中，再拉选项表；
  // 取配置失败/无该字段静默回退第一项。点击「检查更新」路径不再读配置（避免把用户手动切过的
  // 变体重置回磁盘旧值——2026-09-18 T27 回归根因）。
  it('默认选中：配置 last_version_type 命中 → 打开即选中该项（无需等「检查更新」点击）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_release_options') return { success: true, versionOptions: [
        { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
        { label: 'Windows x64 (CUDA 12)', downloadUrl: 'https://example.com/cuda12.zip' },
        { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/dlls.zip' },
      ] };
      if (cmd === 'get_llama_update_config') return { success: true, config: { last_version_type: 'Windows x64 (CUDA 13)' } };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开即按配置恢复选中（非第一项），全程零完整检查
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CUDA 13)');
    expect(countCheckCalls()).toBe(0);
    expect(countOptionsCalls()).toBe(1);
    w.unmount();
  });

  it('默认选中：配置命中但选项表已无该 label → 打开即回退第一项（不报错）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_release_options') return { success: true, versionOptions: [
        { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
        { label: 'Windows x64 (Vulkan)', downloadUrl: 'https://example.com/vk.zip' },
      ] };
      if (cmd === 'get_llama_update_config') return { success: true, config: { last_version_type: 'Windows x64 (CUDA 13)' } };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const trigger = document.querySelector('.llama-section .select-trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('Windows x64 (CPU)');
    expect(document.querySelector('.llama-below--error')).toBeNull();
    w.unmount();
  });

  // ---- 2026-11 回归修复：「切换版本」按钮态随下拉出现时机扩展到 unknown 态 ----
  // 背景：切换版本 gate 原仅在 up-to-date 态生效，而 2026-11 细化让下拉在 unknown 态（phase
  // idle）即出现 → 用户切换下拉后按钮恒「检查更新」，丢失「切换版本」功能（ac22cd3 时下拉只
  // 在检查落定后出现，切换逻辑一直可用）。
  // 契约：下拉可见的任一状态（up-to-date / update-available / unknown）下，所选 ≠ yaml 配置
  // 变体 → 按钮「切换版本」（点击直接下载所选变体，覆盖安装）；一致 → 原按钮语义
  // （unknown=idle「检查更新」/ available「下载更新」…）。
  it('unknown 态切换下拉到其它变体 → 按钮「切换版本」；点击直接下载所选变体（不重发完整检查）', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_release_options') return { success: true, versionOptions: [
        { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
        { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/dlls.zip' },
      ] };
      if (cmd === 'get_llama_update_config') return { success: true, config: { last_version_type: 'Windows x64 (CPU)' } };
      if (cmd === 'download_llama_update') return { success: true, installed: false };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 打开：配置命中 CPU（第一项）→ 默认选中 CPU，按钮「检查更新」
    const trigger = () => document.querySelector('.llama-section .select-trigger') as HTMLButtonElement;
    expect(trigger().textContent).toContain('Windows x64 (CPU)');
    const btn = () => document.querySelector('.llama-section .btn-primary') as HTMLButtonElement;
    expect(btn().textContent?.trim()).toBe('检查更新');
    // 切换到 CUDA 13（与配置不一致）→ 按钮「切换版本」
    trigger().click();
    await nextTick();
    const lis = document.querySelectorAll('.llama-section .dropdown-panel li');
    (lis[1] as HTMLElement).click();
    await nextTick();
    expect(trigger().textContent).toContain('Windows x64 (CUDA 13)');
    expect(btn().textContent?.trim()).toBe('切换版本');
    expect(btn().disabled).toBe(false);
    // 点击「切换版本」→ 直接下载所选变体（不重发完整检查）
    btn().click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const dlCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'download_llama_update');
    expect(dlCalls.length).toBe(1);
    expect(dlCalls[0][1]).toEqual({ download_url: 'https://example.com/cuda13.zip', cuda_dlls_url: 'https://example.com/dlls.zip' });
    expect(countCheckCalls()).toBe(0);
    // 下载完成（服务运行 → installed=false）→ 两阶段「停止并更新」
    expect(btn().textContent?.trim()).toBe('停止并更新');
    w.unmount();
  });

  it('update-available 态切换下拉到配置不一致项 → 按钮保持「下载更新」（不误显「切换版本」），下载跟随所选变体', async () => {
    invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'get_llama_local_version') return { success: true, localVersion: { type: 'prerelease', build: 11020 } };
      if (cmd === 'get_llama_release_options') return { success: true, versionOptions: [
        { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
        { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/dlls.zip' },
      ] };
      if (cmd === 'get_llama_update_config') return { success: true, config: { last_version_type: 'Windows x64 (CUDA 13)' } };
      if (cmd === 'check_llama_update') return { success: true, status: 'update-available', remoteVersion: 'b11021', versionOptions: [
        { label: 'Windows x64 (CPU)', downloadUrl: 'https://example.com/cpu.zip' },
        { label: 'Windows x64 (CUDA 13)', downloadUrl: 'https://example.com/cuda13.zip', cudaDllsUrl: 'https://example.com/dlls.zip' },
      ] };
      if (cmd === 'download_llama_update') return { success: true, installed: false };
      return {};
    });
    window.lms.invoke = invokeMock as any;
    const w = mountModal();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // 检查落定 update-available（配置命中 CUDA 13 → 默认选中第二项）
    const btn = () => document.querySelector('.llama-section .btn-primary') as HTMLButtonElement;
    (btn()).click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(document.querySelector('.llama-new-version')?.textContent?.trim()).toBe('新版本: b11021');
    const trigger = () => document.querySelector('.llama-section .select-trigger') as HTMLButtonElement;
    expect(trigger().textContent).toContain('Windows x64 (CUDA 13)');
    // 切到 CPU（与配置不一致）→ 按钮仍是「下载更新」（available 态不覆盖为「切换版本」），
    // 但下载目标跟随所选变体
    trigger().click();
    await nextTick();
    (document.querySelectorAll('.llama-section .dropdown-panel li')[0] as HTMLElement).click();
    await nextTick();
    expect(btn().textContent?.trim()).toBe('下载更新');
    btn().click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const dlCalls = invokeMock.mock.calls.filter((c: unknown[]) => c[0] === 'download_llama_update');
    expect(dlCalls.length).toBe(1);
    expect(dlCalls[0][1]).toEqual({ download_url: 'https://example.com/cpu.zip', cuda_dlls_url: undefined });
    expect(btn().textContent?.trim()).toBe('停止并更新');
    w.unmount();
  });

});


