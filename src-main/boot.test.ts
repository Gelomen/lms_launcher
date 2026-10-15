// src-main/boot.test.ts
// 任务 11 第三轮（R-23 / 规格 §6.4-1，check C3 / E1-E3）：入口分流的三条守测试，逐字对应 plan 任务 11（第三轮）步骤 1 的 ①②③。
// 接缝 = bootMain(argv, load)：load 是唯一的副作用出口（与 K58「导出可注入接缝」同一手法），这里给它一个假的模块注册表。
// 真 require 不在这条门里（check B5 / F5）：真加载 ./main.js 会拉起 Electron、真加载 ./ql-pty-host 会去连管道，
//   两者都不是「分流对不对」的判据；参数怎么被读走由 ql-pty-host.test.ts 的两条新用例守（check E3 / E4）。
import { describe, expect, it } from 'vitest';
import { bootMain } from './boot';

const FLAG = '--ql-host';
const PIPE = '\\\\.\\pipe\\lms-ql-1a2b3c4d';
const TOKEN = 'tok-1';
const HOST_MODULE = './ql-pty-host';
const APP_MODULE = './main.js';

/** 假的模块注册表：loaded 记录「加载了谁、按什么顺序」；宿主模块交出一个可记录的 main() */
function fakeRegistry(): { load: (name: string) => unknown; loaded: string[]; mainCalls: string[] } {
  const loaded: string[] = [];
  const mainCalls: string[] = [];
  const load = (name: string): unknown => {
    loaded.push(name);
    if (name === HOST_MODULE) return { main: (): void => mainCalls.push(HOST_MODULE) };
    if (name === APP_MODULE) return { appMainLoaded: true };
    throw new Error('unexpected module loaded: ' + name);
  };
  return { load, loaded, mainCalls };
}

describe('boot：应用入口按 --ql-host 分流（规格 §6.4-1 / R-23）', () => {

  // ---------- E1（§6.4-1 / P15）：有开关 → 只走宿主分支，不加载 main.js（不取单实例锁、不建窗口）----------
  it('host_flag_loads_only_the_host_entry', () => {
    const { load, loaded, mainCalls } = fakeRegistry();
    bootMain(['C:\\Program Files\\lms launcher\\win-unpacked\\lms_launcher.exe', FLAG, PIPE, TOKEN], load);

    expect(loaded).toEqual([HOST_MODULE]); // 只加载宿主入口
    expect(loaded).not.toContain(APP_MODULE); // E1：main.js 没被加载 → 不会撞单实例锁（P15 的 exit 0 就是撞锁）
    expect(mainCalls).toEqual([HOST_MODULE]); // 并且调用了它的 main()
  });

  // ---------- E2（G3「不勾选的路径逐字节不变」）：没有开关 → 与今天完全一致 ----------
  it('no_host_flag_loads_only_the_app_entry', () => {
    const { load, loaded, mainCalls } = fakeRegistry();
    bootMain(['C:\\Program Files\\lms launcher\\win-unpacked\\lms_launcher.exe'], load);

    expect(loaded).toEqual([APP_MODULE]);
    expect(mainCalls).toEqual([]); // 宿主分支一行都没跑
  });

  // ---------- E3（§6.4-2 / 索引 K2）：boot 不解析、不重排，开关与两个参数原样到达宿主 ----------
  it('the_arguments_after_the_flag_reach_the_host_untouched', () => {
    // 打包布局的真实形状：exe、入口脚本、Chromium 自己的开关、我们的开关 + 两个参数、后面还有 Chromium 开关
    const argv = [
      'C:\\Program Files\\lms launcher\\win-unpacked\\lms_launcher.exe',
      'C:\\Program Files\\lms launcher\\win-unpacked\\resources\\app.asar\\dist-main\\boot.js',
      '--disable-gpu',
      FLAG,
      PIPE,
      TOKEN,
      '--user-data-dir=C:\\Users\\me\\AppData\\Roaming\\lms-launcher',
    ];
    const snapshot = argv.slice();
    const savedArgv = process.argv;
    process.argv = argv; // 宿主自己读 process.argv：分流不得改写它
    try {
      const seen: string[] = [];
      const load = (name: string): unknown => {
        if (name === HOST_MODULE) return { main: (): void => { seen.push(...process.argv); } };
        if (name === APP_MODULE) return { appMainLoaded: true };
        throw new Error('unexpected module loaded: ' + name);
      };
      bootMain(argv, load);

      expect(seen).toEqual(snapshot); // 原样、顺序不错位，前面有别的参数也不错位
      expect(argv).toEqual(snapshot); // 也没有就地改写传进来的 argv
    } finally {
      process.argv = savedArgv;
    }
  });
});
