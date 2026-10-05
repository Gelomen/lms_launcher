// IPC 错误通道使用的词典 key（单一真源）
// 2026-10-05 i18n 响应性修复：主进程不再经 IPC 传「已翻译的成品串」——渲染端把它存进 ref/state 后
// 就无法随语言重译（用户反馈：llama.cpp 行错误提示冻结在旧语言）。改为传 key，渲染端在**渲染时** t() 翻译。
// 本文件的用途：
//   (a) 主进程返回值与日志文案共用同一常量（避免同一 key 写两处、改名漏改）；
//   (b) dict.test.ts 用 IPC_ERROR_KEYS 守护「这些 key 在 zh/en 词典中都存在」。
export const ERR_LLAMA_BUSY = 'err.llama.busy';
export const ERR_LLAMA_TARGET_BUSY = 'err.llama.targetBusy';
export const ERR_LLAMA_DL404 = 'err.llama.dl404';
export const ERR_UPDATE_INCOMPLETE = 'err.update.incomplete';
export const ERR_UPDATE_DIGEST_MISMATCH = 'err.update.digestMismatch';
export const ERR_UPDATE_VERIFY_FALLBACK = 'err.update.verifyFallback';
export const ERR_UPDATE_NO_TASK = 'err.update.noTask';

/** 守护清单（dict.test.ts 断言 zh/en 双词典都存在）。新增 IPC 错误 key 时必须登记。 */
export const IPC_ERROR_KEYS: readonly string[] = [
  ERR_LLAMA_BUSY,
  ERR_LLAMA_TARGET_BUSY,
  ERR_LLAMA_DL404,
  ERR_UPDATE_INCOMPLETE,
  ERR_UPDATE_DIGEST_MISMATCH,
  ERR_UPDATE_VERIFY_FALLBACK,
  ERR_UPDATE_NO_TASK,
];
