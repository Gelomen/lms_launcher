// src-main/boot.ts
// 任务 11 第三轮（2026-10-14-quick-launch-admin §6.4-1 / 裁决 R-23 / 索引 K65）：应用入口的分流。
// package.json 的 "main" = dist-main/boot.js，所以 Electron 先加载本文件。这里只做一件事：
//   process.argv 里有 --ql-host → 提权 PTY 宿主的分支（ql-pty-host.ts 的 main()）；没有 → 与今天逐字一致，加载 main.js。
// 为什么必须在取单实例锁之前分流（本表 C4 / 取证 P15）：不加载 main.js 就不会 requestSingleInstanceLock，
//   被提权的第二个实例就不会撞锁退出 0 —— 那正是 P15 里「宿主永不连管道、handshake=exit(code=0)」的成因。
// 边界（本表 B1 / C6 / G6）：不 import electron、不读管道、不解析参数内容（参数原样交给宿主自己读，本表 C1）；
//   字符串字面量全 ASCII（i18n/no-hardcoded.test.ts:15-28 扫的是非测试文件的字面量，注释不限）。
// 可测接缝（本表 C3，与 K58 同一手法）：bootMain(argv, load) —— load 是唯一的副作用出口，
//   boot.test.ts 用假的模块注册表钉住三条分流（E1/E2/E3），不真起 Electron。

// 宿主分支的开关：与 ql-elevated.ts 的 createHostLauncher().launch 拼的是同一个串（本表 C2），两处字面量互指。
const HOST_FLAG = '--ql-host';

/**
 * 分流（本表 C3 逐字）：argv 里有开关 → 加载宿主入口并调它的 main()；否则 → 加载 main.js。
 * 开关后面的两个参数（管道名、token）一律不解析、不重排、不改写：宿主自己从 process.argv 里取（本表 C1/E3）。
 */
export function bootMain(argv: string[], load: (name: string) => unknown): void {
  if (argv.includes(HOST_FLAG)) {
    (load('./ql-pty-host') as { main: () => void }).main();
    return;
  }
  load('./main.js');
}

// 模块顶层只调用它一次（本表 C3）。带 process.versions.electron 这个条件的原因（登记在报告 §7）：
//   单测会 import 本文件，而 vitest 的加载器里 require 虽然存在、却解析不了同目录的 .ts
//   （实测 require('./ql-pty-host') → Cannot find module，见本表 J-21），不加条件 = boot.test.ts 在 import 阶段就炸；
//   而 ql-pty-host.ts:209 的 require.main === module 在这里不可靠：Electron 28 把 require.main /
//   process.mainModule 留成 undefined（electron/electron#40501），真机上的表现会是「应用一行代码都不跑」，
//   这条门本机又跑不了（K64 ④）。process.versions.electron 在 dev（electron .）与打包（app.asar 入口）
//   两种布局下都成立，在跑测试的纯 Node 下不成立。
if (process.versions.electron) {
  bootMain(process.argv, (name) => require(name));
}
