// @vitest-environment happy-dom
// GpuModule 单测（spec 2026-09-09-gpu-card-design §7）：
// 首帧占位 / 数据到达四格 + 合计行 / 单卡无按钮单点实心 / 多卡 N 点当前实心其余空心 / 模运算绕回。
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
// 四格数值（当前层）：利用率 / 专用 / 合计（组件层 = 专用 + 共享）/ 共享
function cellTexts(w: any): string[] {
  return w.findAll('.gpu-layer:not(.gpu-layer--off) .gpu-val').map((v: any) => v.text());
}
function activeDot(w: any): number {
  return w.findAll('.dot').findIndex((d: any) => d.classes().includes('dot--active'));
}

describe('GpuModule 首帧与数据', () => {
  it('首帧未到达：标题与四格显示占位 …，无圆点、无 ‹ › 按钮', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    expect(w.find('h2').text()).toBe('系统 GPU');
    expect(w.find('.gpu-title').text()).toBe('…');
    expect(cellTexts(w)).toEqual(['…', '…', '…', '…']);
    expect(w.findAll('.dot').length).toBe(0);
    expect(w.findAll('.gpu-nav-btn').length).toBe(0);
    w.unmount();
  });

  it('数据到达：四格数值 + 合计行正确，标题 = 当前卡名（始终显示）', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A, GPU_B]);
    await flush();
    expect(w.find('.gpu-title').text()).toBe('NVIDIA GeForce RTX 4090');
    expect(cellTexts(w)).toEqual(['28 %', '22.0 GB / 24.0 GB', '23.0 GB / 72.0 GB', '1.0 GB / 48.0 GB']);
    w.unmount();
  });

  it('上限为 0（join 不上回退）：该格显示 –', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_B]);
    await flush();
    // GPU_B：dedicatedUsed=0 → '–'；dedicatedTotal=0 → '–'
    expect(cellTexts(w)).toEqual(['5 %', '– / –', '2.0 GB / 48.0 GB', '2.0 GB / 48.0 GB']);
    w.unmount();
  });
});

describe('GpuModule 圆点与按钮', () => {
  it('单卡：无 ‹ › 按钮，1 个实心点', async () => {
    mockLms();
    const w = mount(GpuModule);
    await flush();
    fire([GPU_A]);
    await flush();
    expect(w.findAll('.gpu-nav-btn').length).toBe(0);
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
    expect(w.find('.gpu-title').text()).toBe('Microsoft Basic Render Driver');
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
    expect(w.find('.gpu-title').text()).toBe('NVIDIA GeForce RTX 4090');
    // 0 → 2（‹ 回绕）
    await w.find('.gpu-nav-btn--left').trigger('click');
    await nextTick(); await nextTick();
    expect(activeDot(w)).toBe(2);
    w.unmount();
  });
});
