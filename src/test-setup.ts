// 测试固定语言为 zh（spec §3.7）：vitest 为 node 环境，无系统 locale 语义，
// 不显式固定会让「默认跟随系统」在 CI/沙箱（多为 en）下让中文断言批量失败。
// 注意：渲染端 ./i18n 必须延迟到 beforeEach 内动态 import —— 静态 import 会在测试文件
// 的 vi.mock('./ipc') 注册前把 i18n 绑到真实 ipc（模块图预加载分叉），mock 即失效。
import { beforeEach } from 'vitest';
import { applyLang as applyMainLang } from '../src-main/i18n/index';

beforeEach(async () => {
  applyMainLang('zh');
  try {
    const { applyLangLocal } = await import('./i18n');
    applyLangLocal('zh');
  } catch {
    // node 环境无 document：applyLangLocal 已用 typeof 守卫，此处兜底
  }
});
