// 应用启动时的 llama.cpp 安装目录检测（规格 2026-08-31-startup-llama-check-design）。
// 纯函数模块：不 import electron / 不读 yaml / 不写日志——main.ts 负责接线与 emitLog。
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type LlamaInstallStatus = 'unset' | 'dir_missing' | 'exe_missing' | 'ok';

// 判定已保存的 llama_dir（trim 后）：
// 空 → unset；目录不存在或是文件 → dir_missing；缺 llama-server.exe → exe_missing；否则 ok。
// 不抛错：statSync 用 throwIfNoEntry:false 处理不存在路径。
export function checkLlamaInstall(dir: string): LlamaInstallStatus {
  const d = dir.trim();
  if (d.length === 0) return 'unset';
  const st = statSync(d, { throwIfNoEntry: false });
  if (st === undefined || st === null || !st.isDirectory()) return 'dir_missing';
  return existsSync(join(d, 'llama-server.exe')) ? 'ok' : 'exe_missing';
}

// 日志行文案（全部不带括号文字；dir 原样展示，不转义不截断）。
export function installCheckMessage(dir: string, status: LlamaInstallStatus): string {
  switch (status) {
    case 'unset': return '[lms_launcher] 启动检测 · 未配置 llama.cpp 安装目录';
    case 'dir_missing': return '[lms_launcher] 启动检测 · llama.cpp 安装目录不存在：' + dir;
    case 'exe_missing': return '[lms_launcher] 启动检测 · 目录中未找到 llama-server.exe：' + dir;
    case 'ok': return '[lms_launcher] 启动检测 · llama-server.exe 已找到：' + dir;
  }
}
