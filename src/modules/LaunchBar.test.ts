// @vitest-environment happy-dom
// 组件测试：LaunchBar 配置下拉截断 —— 与模板行名同机制（spec 2026-08-26-launchbar-dropdown-truncation）：
// 视觉宽度预算 24（CJK=2 / 拉丁=1，由卡片列 --card-col-w 335 反推，算术见 LaunchBar.vue 那段注释）；
// 只有「宽 > 预算 + grace=2」才手动截成前缀 + …(U+2026)，hover tooltip 显示完整名字（trigger data-tooltip + 面板 li）。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import LaunchBar from './LaunchBar.vue';
import { t, applyLangLocal } from '../i18n';

const LONG = '这是一个非常长的配置描述名称用来验证启动控制下拉的截断与省略号行为'; // 29 汉字 = 宽 58，远超预算 24
const READY = { running: false, stopping: false, configId: null };

// 数据 key：desc → name（2026-09，main 返回 ConfigEntry.name）
// 记录 invoke 调用（2026-09-05 tray-tooltip-template）：断言 tray-tooltip-update 推送的模板名 / null
const trayTooltipCalls: Array<string | null> = [];
function mockLms(map: Record<string, { name?: string; values: Record<string, string> }>): void {
  trayTooltipCalls.length = 0;
  (window as any).lms = {
    invoke: (cmd: string, ...args: unknown[]) => {
      if (cmd === 'get_configs') return Promise.resolve(map);
      if (cmd === 'tray-tooltip-update') trayTooltipCalls.push(args[0] as string | null);
      return Promise.resolve(undefined);
    },
    onLogLine: () => () => {},
    onProcessExit: () => () => {},
    onTrayExitRequest: () => () => {},
  };
}

describe('LaunchBar config dropdown truncation（预算 24 = 12 汉字 / 24 拉丁字符）', () => {
  it('trigger_label_truncates_beyond_width_24_and_tooltips_full_name', async () => {
    mockLms({ long_cfg: { name: LONG, values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();

    // 触发按钮标签：前 12 字（宽 24）+ …（预算 24 的反推算术见 LaunchBar.vue「配置下拉截断」那段）
    expect(w.find('.select-label').text()).toBe(LONG.slice(0, 12) + '…');
    // tooltip（样式同「编辑」按钮）：trigger 携带 data-tooltip=完整名字
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBe(LONG);

    // 展开面板：选项同样截断，li 携带完整名 tooltip
    await w.find('.select-trigger').trigger('click');
    await flush();
    const li = w.findAll('.dropdown-panel li')[0];
    expect(li.text()).toBe(LONG.slice(0, 12) + '…');
    expect(li.attributes('data-tooltip')).toBe(LONG);
    w.unmount();
  });

  it('short_name_shows_full_without_tooltip', async () => {
    mockLms({ short_cfg: { name: '日常', values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();

    // 短名（≤预算）：完整显示、无省略号、无 tooltip 属性
    expect(w.find('.select-label').text()).toBe('日常');
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBeUndefined();
    w.unmount();
  });

  // 汉字档三格（2026-10-26 预算 16→24 的读数门）：24 = 12 字；grace=2 让 13 字（宽 26）仍全量渲染——
  // 实测 14px 字号下汉字 14px/个、label 可用宽 189px → 13 字 = 182px 确实放得下，14 字 = 196px 才放不下；
  // 14 字（宽 28 > 26）→ 手动截成前 12 字 + …（168 + …10 = 178px，仍 ≤ 189 ✓）并挂 tooltip。
  it('cjk_name_full_up_to_13_chars_and_cuts_at_12_plus_tooltip_from_14', async () => {
    for (const n of [12, 13, 14] as const) {
      const name = '中'.repeat(n);
      const full = n <= 13;
      mockLms({ cjk: { name, values: {} } });
      const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
      await flush();
      expect(w.find('.select-label').text()).toBe(full ? name : '中'.repeat(12) + '…');
      if (full) expect(w.find('.select-trigger').attributes('data-tooltip')).toBeUndefined();
      else expect(w.find('.select-trigger').attributes('data-tooltip')).toBe(name);
      w.unmount();
    }
  });

  // 中英混排（用户 2026-10-26 截图那一条）：旧预算 16 下只剩 4 个汉字，卡片加宽后 label 右半段是白给的——
  // 现在同一名字截到 7 拉丁 + 8 汉字（宽 7+16=23 ≤ 24）+ …，比旧的 7 拉丁 + 4 汉字（用户截图那一串）多一倍。
  it('mixed_name_cuts_by_real_width_not_char_count', async () => {
    const name = 'abcdefg' + '中文'.repeat(5); // 宽 7 + 20 = 27 > 26 → 手动截
    mockLms({ mix: { name, values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    expect(w.find('.select-label').text()).toBe('abcdefg' + '中文'.repeat(4) + '…'); // 7 拉丁 + 8 汉字（旧预算只有 4 汉字）
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBe(name);
    w.unmount();
  });

  // 宽度预算：拉丁字符宽=1，预算 24——同一英文名下比旧的按 8 字符截断、也比上一版预算 16 显示更多。
  const LATIN = 'qwen-27b-instruct-fp16-batch'; // 28 latin → 宽 28 > 24 + 2
  it('latin_name_truncates_by_width_not_char_count', async () => {
    mockLms({ lat: { name: LATIN, values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    // 默认 grace=2：LATIN(28) > 24+2 → 手动前 24 字符 + …（旧按字符阈值是 slice(0,8)、旧预算是 16）
    expect(w.find('.select-label').text()).toBe(LATIN.slice(0, 24) + '…');
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBe(LATIN);
    await w.find('.select-trigger').trigger('click');
    await flush();
    const li = w.findAll('.dropdown-panel li')[0];
    expect(li.text()).toBe(LATIN.slice(0, 24) + '…');
    expect(li.attributes('data-tooltip')).toBe(LATIN);
    w.unmount();
  });

  // 本轮改动要的实际收益：宽 22 的英文名（旧预算 16 会截成 16 字符）现在全量渲染、连 tooltip 都不挂。
  it('latin_name_of_width_22_that_old_budget_16_cut_now_shows_full', async () => {
    const name = 'qwen-27b-instruct-fp16'; // 22 latin → 宽 22 ≤ 24
    mockLms({ lat: { name, values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    expect(w.find('.select-label').text()).toBe(name);
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBeUndefined();
    w.unmount();
  });

  it('latin_name_exactly_24_chars_shows_full_no_tooltip', async () => {
    mockLms({ lat: { name: 'abcdefghijklmnopqrstuvwx', values: {} } }); // 恰 24 latin → 宽 24
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    expect(w.find('.select-label').text()).toBe('abcdefghijklmnopqrstuvwx');
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBeUndefined();
    w.unmount();
  });

  // grace=2（第二轮定下）：只超预算 1~2 宽度 → 不手动 +…，交 CSS text-overflow。
  // 26 ≤ 24+2 → 全量；实测 26 个拉丁 ≈ 187px ≤ label 可用 189px，即 grace 那一档也真放得下，不出 CSS 省略号。
  it('latin_name_over_budget_by_grace_shows_full_no_manual_ellipsis_no_tooltip', async () => {
    const name = 'Qwen3.8-27B-Ridge-instruct'; // 宽 26 > 24, ≤ 24+2 → untouched
    mockLms({ lat: { name, values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    expect(w.find('.select-label').text()).toBe(name); // no manual …, full render (CSS may auto-ellipsis visually)
    expect(w.find('.select-trigger').attributes('data-tooltip')).toBeUndefined(); // not manually truncated → no tooltip
    w.unmount();
  });

  // 托盘 hover 提示同步（spec 2026-09-05-tray-tooltip-template）：选中完整名推送主进程；无选择 → null（主进程显示「暂无模板配置」）
  describe('tray tooltip sync', () => {
    it('after_load_pushes_selected_template_full_name', async () => {
      mockLms({ a: { name: '模板A', values: {} }, b: { name: '模板B', values: {} } });
      const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
      await flush();
      // 默认选中第一个 → 推送完整名（不截断）
      expect(trayTooltipCalls.at(-1)).toBe('模板A');
      w.unmount();
    });

    it('switching_dropdown_pushes_new_selected_name', async () => {
      mockLms({ a: { name: '模板A', values: {} }, b: { name: '模板B', values: {} } });
      const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
      await flush();
      await w.find('.select-trigger').trigger('click');
      await flush();
      await w.findAll('.dropdown-panel li')[1].trigger('click');
      await flush();
      expect(trayTooltipCalls.at(-1)).toBe('模板B');
      w.unmount();
    });

    it('no_configs_pushes_null_placeholder', async () => {
      mockLms({});
      const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
      await flush();
      expect(trayTooltipCalls.at(-1)).toBeNull();
      w.unmount();
    });
  });
});

// ===== S3（2026-09-23-i18n-launch-card）：启动控制卡片 en 冒烟 3 条 =====
// TDD 先行（红）：LaunchBar.vue 尚未接入 t()，组件仍输出中文串——h2 与空态两条渲染级断言预期红；
// 选择态底线断言只依赖任务 1 词典已入，预期绿。afterEach 还原 zh，防污染同文件既有 8 条用例（S2 DirModule.test.ts 同款）。
describe('LaunchBar en 冒烟', () => {
  beforeEach(() => {
    applyLangLocal('en');
  });
  afterEach(() => {
    applyLangLocal('zh');
  });

  it('标题 en：h2 = Launch llama-server', async () => {
    mockLms({ a: { name: '模板A', values: {} } });
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    expect(w.find('h2').text()).toBe('Launch llama-server');
    w.unmount();
  });

  it('空态 en：无模板时 .select-label 显示 No templates', async () => {
    mockLms({});
    const w = mount(LaunchBar, { props: { state: READY, configsReloadKey: 0 } });
    await flush();
    expect(w.find('.select-label').text()).toBe('No templates');
    w.unmount();
  });

  it('选择态 en：底线断言 t(launch.placeholder.select) = Select a config...（半角三点）', () => {
    expect(t('launch.placeholder.select')).toBe('Select a config...');
  });
});
