// @vitest-environment happy-dom
// GpuModule 单测（spec 2026-09-09-gpu-card-design §7；2026-09-10 首帧占位恢复——占位与数据态
// 位置结构恒一致，内容区恒预留 32px 让位、‹ › 恒渲染，见 docs/superpowers/changes/2026-09-10-gpu-first-frame-placeholder.md）：
// 首帧占位（– / – / –）/ 数据到达四格 + 合计行 / 单卡按钮禁用单点实心 / 多卡 N 点当前实心其余空心 / 模运算绕回。
// formatGb fixture 与 src-main/gpu-stats.test.ts 同一组数值（两份实现防漂移）。
import { describe, it, expect } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import { nextTick } from 'vue';
import GpuModule from './GpuModule.vue';
import type { GpuStats } from '../ipc';

const gpuHandlers: Array<(e: { gpus: unknown[] }) => void> = [];
function mockLms(): void {
  gpuHandlers.length = 0;
  (window as any).lms = {
    onGpuStats: (cb: (e: { gpus: unknown[] }) => void) => { gpuHandlers.push(cb); return () => {}; },
  };
}

const GB = 1073741824; // 1 GiB = 1024^3
const GPU_A: GpuStats = { luid: '0x0000edff_00000000', name: 'NVIDIA GeForce RTX 4090', utilization: 28, dedicatedUsed: 22 * GB, dedicatedTotal: 24 * GB, sharedUsed: 1 * GB, sharedTotal: 48 * GB };
const GPU_B: GpuStats = { luid: '0x00010f23_00000000', name: 'Microsoft Basic Render Driver', utilization: 5, dedicatedUsed: 0, dedicatedTotal: 0, sharedUsed: 2 * GB, sharedTotal: 48 * GB };
const GPU_C: GpuStats = { luid: '0x0003be77_00000000', name: 'AMD Radeon RX 7900 XTX', utilization: 50, dedicatedUsed: 16 * GB, dedicatedTotal: 20 * GB, sharedUsed: 1 * GB, sharedTotal: 32 * GB };

function fire(gpus: GpuStats[]): void {
  gpuHandlers.at(-1)!({ gpus: gpus as unknown[] });
}
// 四格数值（当前层）：专用 / 共享 / 合计（组件层 = 专用 + 共享）/ 利用率（顺序 2026-09-10 用户调整）
function cellTexts(w: any): string[] {
  return w.findAll('.gpu-layer:not(.gpu-layer--off) .gpu-val').map((v: any) => v.text());
}
function activeDot(w: any): number {
  return w.findAll('.dot').findIndex((d: any) => d.classes().includes('dot--active'));
}
// 层内标题（用户 2026-09-11：标题随层滑动，不再置于舞台级立即切换）：取第 i 层内的 .gpu-title。
// 动画期间目标恒在 1 层（槽位不变量），故目标卡标题在 layerTitle(w,1)。
function layerTitle(w: any, i: number): string {
  return w.findAll('.gpu-layer')[i].find('.gpu-title').text();
}
// 跨浏览器帧等待：滑动帧是 setTimeout(0) 宏任务（真实 Chromium 在定位帧绘制后才执行）。
// happy-dom 无绘制概念，纯 nextTick 微任务级联不会让出事件循环、跨不了帧，必须用真实小等待观测滑动帧。
const waitFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

describe('GpuModule 首帧与数据', () => {
  it('首帧未到达：占位与数据态位置结构一致（标题 "–"、GPU 利用率 "–"、内存格 "– / –"、‹ › 渲染但禁用、无圆点）——用户 2026-09-10 指定', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    expect(w.find('h2').text()).toBe('GPU 信息');
    expect(w.find('.gpu-title').text()).toBe('–'); // 卡名（含占位 "–"）左右居中由 CSS 承担（.gpu-title text-align:center，2026-09-10）
    expect(cellTexts(w)).toEqual(['– / –', '– / –', '– / –', '–']); // 专用 / 共享 / 合计 / GPU 利用率
    expect(w.findAll('.dot').length).toBe(0);
    // ‹ › 恒渲染（内容区恒预留 32px 让位），首帧不可点击
    const left = w.find('.gpu-nav-btn--left');
    const right = w.find('.gpu-nav-btn--right');
    expect(left.exists()).toBe(true);
    expect(right.exists()).toBe(true);
    expect(left.attributes('disabled')).toBeDefined();
    expect(right.attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('数据到达：四格数值 + 合计行正确，标题 = 当前卡名（始终显示）', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A, GPU_B]);
    await flush();
    expect(w.find('.gpu-title').text()).toBe('NVIDIA GeForce RTX 4090');
    expect(cellTexts(w)).toEqual(['22.0 / 24.0 GB', '1.0 / 48.0 GB', '23.0 / 72.0 GB', '28 %']);
    w.unmount();
  });

  it('上限为 0（join 不上回退）：该格显示 –', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_B]);
    await flush();
    // GPU_B：dedicatedUsed=0 → '–'；dedicatedTotal=0 → '–'
    expect(cellTexts(w)).toEqual(['– / –', '2.0 / 48.0 GB', '2.0 / 48.0 GB', '5 %']);
    w.unmount();
  });

  it('formatGb 副本防漂移锁定：1610612736→1.5 GB、22GB+880MiB→22.9 GB（与 src-main fixture 同组）', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([{ luid: '0x0000edff_00000000', name: 'NVIDIA GeForce RTX 4090', utilization: 10, dedicatedUsed: 1610612736, dedicatedTotal: 24 * GB, sharedUsed: 22 * GB + 880 * 1048576, sharedTotal: 48 * GB }]);
    await flush();
    expect(cellTexts(w)).toEqual(['1.5 / 24.0 GB', '22.9 / 48.0 GB', '24.4 / 72.0 GB', '10 %']);
    w.unmount();
  });
});

describe('GpuModule 圆点与按钮', () => {
  it('单卡：‹ › 渲染但禁用（不可点击），1 个实心点', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A]);
    await flush();
    const left = w.find('.gpu-nav-btn--left');
    const right = w.find('.gpu-nav-btn--right');
    expect(left.exists()).toBe(true);
    expect(right.exists()).toBe(true);
    expect(left.attributes('disabled')).toBeDefined();
    expect(right.attributes('disabled')).toBeDefined();
    expect(w.findAll('.dot').length).toBe(1);
    expect(w.findAll('.dot')[0].classes()).toContain('dot--active');
    w.unmount();
  });

  it('多卡：N 个圆点，当前实心其余空心；‹ 贴左缘 › 贴右缘', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A, GPU_B, GPU_C]);
    await flush();
    const dots = w.findAll('.dot');
    expect(dots.length).toBe(3);
    expect(dots[0].classes()).toContain('dot--active');
    expect(dots[1].classes()).not.toContain('dot--active');
    expect(dots[2].classes()).not.toContain('dot--active');
    const left = w.find('.gpu-nav-btn--left');
    const right = w.find('.gpu-nav-btn--right');
    expect(left.exists()).toBe(true);
    expect(right.exists()).toBe(true);
    expect(left.attributes('aria-label')).toBe('上一张卡');
    expect(right.attributes('aria-label')).toBe('下一张卡');
    w.unmount();
  });
});

describe('GpuModule 轮播（模运算绕回）', () => {
  it('2 卡：点 › 前进，点 ‹ 回绕', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A, GPU_B]);
    await flush();
    await w.find('.gpu-nav-btn--right').trigger('click');
    await nextTick(); await nextTick();
    expect(activeDot(w)).toBe(1);
    expect(layerTitle(w, 1)).toBe('Microsoft Basic Render Driver'); // 目标卡标题在目标层（1 层），随层滑入
    await w.find('.gpu-nav-btn--left').trigger('click');
    await nextTick(); await nextTick();
    expect(activeDot(w)).toBe(0);
    w.unmount();
  });

  it('3 卡：› 从末位回绕到 0；‹ 从 0 回绕到末位', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A, GPU_B, GPU_C]);
    await flush();
    // 0 → 1 → 2（› 两次）
    await w.find('.gpu-nav-btn--right').trigger('click');
    await nextTick(); await nextTick();
    await w.find('.gpu-nav-btn--right').trigger('click');
    await nextTick(); await nextTick();
    expect(activeDot(w)).toBe(2);
    // 2 → 0（› 回绕）
    await w.find('.gpu-nav-btn--right').trigger('click');
    await nextTick(); await nextTick();
    expect(activeDot(w)).toBe(0);
    expect(layerTitle(w, 1)).toBe('NVIDIA GeForce RTX 4090'); // 回绕目标卡标题在目标层（1 层）
    // 0 → 2（‹ 回绕）
    await w.find('.gpu-nav-btn--left').trigger('click');
    await nextTick(); await nextTick();
    expect(activeDot(w)).toBe(2);
    w.unmount();
  });
});

describe('GpuModule 滑动动画（只断言层 transform 类名切换，不测时长，spec §7）', () => {
  function layerClasses(w: any): string[][] {
    return w.findAll('.gpu-layer').map((l: any) => l.classes());
  }

  it('点 ›：目标层从右侧屏外滑入（gpu-pos-r → gpu-pos-0），当前层滑出到左（gpu-pos-0 → gpu-pos-l）', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A, GPU_B]);
    await flush();
    await w.find('.gpu-nav-btn--right').trigger('click');
    // 定位帧：目标层（layer[1]）在右侧屏外且无过渡
    await nextTick();
    let cls = layerClasses(w);
    expect(cls[1]).toContain('gpu-pos-r');
    expect(cls[1]).toContain('gpu-no-anim');
    // 跨帧锁定（微任务读帧点：事件循环尚未让给宏任务）——滑动帧此时必须尚未落地。
    // 旧实现（纯 nextTick 微任务链）在这里已滑到位：真实 Chromium 中定位帧与滑动帧
    // 合并为同一次绘制 → 目标卡直接弹出（审查重要#1，spec §5.2 的 100%→0 滑入不可见）。
    await nextTick(); await nextTick();
    cls = layerClasses(w);
    expect(cls[1]).toContain('gpu-pos-r');
    expect(cls[1]).toContain('gpu-no-anim');
    expect(cls[0]).toContain('gpu-pos-0'); // 当前层尚未离场
    // 滑动帧（setTimeout(0) 宏任务，真实小等待跨帧）：去掉 no-anim，目标层到中心、当前层到左侧屏外
    await waitFrame();
    cls = layerClasses(w);
    expect(cls[0]).toContain('gpu-pos-l');
    expect(cls[1]).toContain('gpu-pos-0');
    expect(cls[1]).not.toContain('gpu-no-anim');
    // 圆点/标题已切到目标卡
    expect(activeDot(w)).toBe(1);
    w.unmount();
  });

  it('点 ‹：方向相反（当前层 → gpu-pos-r，目标层 gpu-pos-l → gpu-pos-0）', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A, GPU_B, GPU_C]);
    await flush();
    await w.find('.gpu-nav-btn--right').trigger('click'); // 先 0→1，使 index=1 后 ‹ 有非 0 来源
    await nextTick(); await nextTick();
    await waitFrame();                          // 跨滑动帧（宏任务）
    await new Promise((r) => setTimeout(r, 500)); // 等 settle（440ms 定时器自滑动帧起算）完成归位
    await nextTick();
    await w.find('.gpu-nav-btn--left').trigger('click');
    await nextTick();
    let cls = layerClasses(w);
    expect(cls[1]).toContain('gpu-pos-l'); // 目标层在左侧屏外
    // 跨帧锁定：微任务读帧点滑动帧必须尚未落地（见用例 1 注释）
    await nextTick(); await nextTick();
    cls = layerClasses(w);
    expect(cls[1]).toContain('gpu-pos-l');
    expect(cls[1]).toContain('gpu-no-anim');
    expect(cls[0]).toContain('gpu-pos-0'); // 当前层尚未离场
    await waitFrame(); // 跨滑动帧
    cls = layerClasses(w);
    expect(cls[0]).toContain('gpu-pos-r'); // 当前层（原 0 层）滑出到右
    expect(cls[1]).toContain('gpu-pos-0');
    expect(activeDot(w)).toBe(0);
    w.unmount();
  });

  it('连续快速点击：以最后一次点击的目标为准，中间状态立即归位', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A, GPU_B, GPU_C]);
    await flush();
    // 0 → 1（动画在飞，不等待 settle）
    await w.find('.gpu-nav-btn--right').trigger('click');
    await nextTick(); await nextTick();
    await waitFrame(); // 跨滑动帧（settle 440ms 未到，动画仍在飞）
    // 在飞中再点 ›：fast path 必须先取消第一击的帧定时器再归位（否则迟到的帧回调
    // 把第二击定位好的在飞层拉回 pos-0 并置 noAnim——审查点名的风险）
    await w.find('.gpu-nav-btn--right').trigger('click');
    await nextTick(); await nextTick();
    expect(activeDot(w)).toBe(2);
    expect(layerTitle(w, 1)).toBe('AMD Radeon RX 7900 XTX'); // 目标卡标题在目标层（1 层）
    // 归位后继续滑动到 2：跨滑动帧后只有一个可见层且在 gpu-pos-0
    await waitFrame();
    const visible = w.findAll('.gpu-layer:not(.gpu-layer--off)');
    expect(visible.length).toBe(1);
    expect(visible[0].classes()).toContain('gpu-pos-0');
    w.unmount();
  });
});
