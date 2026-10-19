// @vitest-environment happy-dom
// 单元测试：渲染端唯一出口 src/ipc.ts 的 invoke ——「送进主进程的参数必须能过结构化克隆」这条契约。
// 起因（2026-10-19 用户反馈）：快捷启动卡 [可执行程序] 行点 [复制] 失败，提示 "An object could not be cloned."；
// 同一条 [命令行] 行却正常。成因不在卡片，而在出口：结构化克隆对带 [[PrimaryTemplate]] 内部槽的对象
// （= Proxy）一律 DataCloneError，而卡片列表挂在 ref 上 = Vue 深层响应式，浅拷贝只拆最外层。
// 这里不碰主进程，只把「能不能过 structuredClone」钉成断言。真实两端的文案不同
// （Chromium: "An object could not be cloned." / Node: "[object Array] could not be cloned."），
// 所以断言只钉「抛 DataCloneError」这个行为，不钉文案。
import { describe, it, expect, beforeEach } from 'vitest';
import { ref, isProxy } from 'vue';
import { invoke } from './ipc';
import type { QuickLaunchEntry } from '../src-main/quick-launch-config';

interface Call { cmd: string; args: unknown[] }
const calls: Call[] = [];

beforeEach(() => {
  calls.length = 0;
  (window as any).lms = {
    invoke: (cmd: string, ...args: unknown[]) => {
      calls.push({ cmd, args });
      return Promise.resolve(null);
    },
  };
});

describe('ipc.invoke 的出站参数', () => {
  // 真实成因的形状：卡片里的列表 = ref（QuickLaunch.vue 里的 `const list = ref(...)`），复制按钮做的
  // = 浅拷贝 + 改名（那里的 onCopy）。exe 是数组 → 浅拷贝后那个数组仍是响应式代理。
  it('reactive_object_arg_arrives_as_plain_data_that_structured_clone_accepts', async () => {
    const list = ref<{ items: Record<string, QuickLaunchEntry> }>({
      items: { e: { name: 'game', type: 'exe', exe: ['D:/game/game.exe'], admin: false } },
    });
    const src = list.value.items.e;

    await invoke('ql_save', null, { ...src, name: 'game - copy' });

    const payload = calls[0].args[1] as QuickLaunchEntry;
    expect(payload).toEqual({ name: 'game - copy', type: 'exe', exe: ['D:/game/game.exe'], admin: false });
    expect(isProxy(payload.exe), '嵌套数组不得仍是响应式代理').toBe(false);
    expect(() => structuredClone(payload)).not.toThrow();
  });

  // 反证：不带出口那道还原，浅拷贝的 exe 会原样抛错 —— 钉住「这条测试真的能红」。
  it('the_same_payload_without_the_boundary_guard_throws_data_clone_error', () => {
    const list = ref<{ items: Record<string, QuickLaunchEntry> }>({
      items: { e: { name: 'game', type: 'exe', exe: ['D:/game/game.exe'], admin: false } },
    });
    const shallowCopy = { ...list.value.items.e, name: 'game - copy' };
    let err: unknown;
    try { structuredClone(shallowCopy); } catch (e) { err = e; }
    expect(err, '响应式代理必须过不了结构化克隆（否则上面那条门是假勾）').toBeInstanceOf(Error);
    expect((err as Error).name).toBe('DataCloneError');
  });

  // 标量参数不得被动过：只有对象/数组才重建（ql_start / ql_resize / tray-tooltip-update 全是标量）
  it('scalar_args_pass_through_untouched', async () => {
    await invoke('ql_start', 'ql0001');
    await invoke('ql_resize', 'ql0001', 80, 24);
    await invoke('tray-tooltip-update', null);
    expect(calls.map((c) => [c.cmd, c.args])).toEqual([
      ['ql_start', ['ql0001']],
      ['ql_resize', ['ql0001', 80, 24]],
      ['tray-tooltip-update', [null]],
    ]);
  });

  // 出站副本与调用方状态脱钩：主进程收到的是快照。这条要按「往原数组里 push」来验，
  // 不是重新赋值字段 —— 重新赋值换的是属性、旧代理仍指着旧数组，即使没有那道还原也照样「通过」，门就成了假勾。
  it('object_args_are_snapshots_not_the_callers_own_array', async () => {
    const list = ref<Record<string, QuickLaunchEntry>>({
      e: { name: 'game', type: 'exe', exe: ['D:/game/game.exe'], admin: false },
    });
    const src = list.value.e;
    await invoke('ql_save', 'e', src);
    const sentExe = calls[0].args[1] as QuickLaunchEntry;
    src.exe!.push('D:/tool/tool.exe'); // 调用方随后改了同一份列表
    expect(sentExe.exe).toEqual(['D:/game/game.exe']);
  });
});
