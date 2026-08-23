import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ParamsFile, ConfigEntry, ConfigsMap } from './config';
import { validateConfigId } from './config';

// Windows 路径规则：含空格或引号 → 整体加引号（Rust quoted() 的 TS 版，模板字符串无引号漂移风险）
export function quoted(v: string): string {
  if (v.includes(' ') || v.includes('"')) return '"' + v + '"';
  return v;
}

// 拼完整命令行向量 [exe, flag1, val1, ...]；空值参数整组跳过；必填空 / 未知 key → VALIDATION
export function buildArgVector(exe: string, pf: ParamsFile, entry: ConfigEntry): string[] {
  for (const key of pf.required) {
    const v = (entry.values[key] ?? '').trim();
    if (v.length === 0) throw new Error(`VALIDATION: 必填参数 "${pf.params[key] ?? key}" 未填写`);
  }
  const out = [exe];
  const boolKeys = pf.params_boolean ?? [];
  for (const [k, v] of Object.entries(entry.values)) {
    if (v.trim().length === 0) continue;
    const flag = pf.params[k];
    if (flag === undefined) throw new Error(`VALIDATION: 参数 "${k}" 不在 llama_params.yaml 的映射表里`);
    if (boolKeys.includes(k)) {
      if (v.trim() === 'true') { out.push(flag); continue; }        // boolean true → 只拼 flag，无值对
      if (v.trim() !== 'false') { out.push(flag, quoted(v.trim())); continue; } // 其他字面量兜底：flag+值
      continue;                                                       // false → 整对跳过（与空值一致）
    }
    out.push(flag, quoted(v.trim()));
  }
  return out;
}

// 启动前完整校验：id 合法 + exe 存在 + 配置存在 + 拼装成功；返回完整向量
export function prepareLaunch(dir: string, pf: ParamsFile, configs: ConfigsMap, id: string): string[] {
  if (!validateConfigId(id)) throw new Error('VALIDATION: id 须为小写字母开头的字母数字串');
  const exe = join(dir, 'llama-server.exe');
  if (!existsSync(exe)) throw new Error(`MISSING: llama-server.exe 不存在（目录：${dir}）`);
  const entry = configs[id];
  if (!entry) throw new Error(`MISSING: 配置 "${id}" 不存在`);
  return buildArgVector(exe, pf, entry);
}

// 日志/列表用的 flag 形式摘要，如 -m "D:\x.gguf" --port 9931
export function summarize(e: ConfigEntry, pf: ParamsFile): string {
  const boolKeys = pf.params_boolean ?? [];
  return Object.entries(e.values)
    .filter(([, v]) => v.trim().length > 0)
    .filter(([k]) => pf.params[k] !== undefined)
    .filter(([k, v]) => !(boolKeys.includes(k) && v.trim() === 'false')) // false 与 buildArgVector 一致：不出现
    .map(([k, v]) => boolKeys.includes(k) && v.trim() === 'true' ? pf.params[k]! : `${pf.params[k]} ${quoted(v.trim())}`)
    .join(' ');
}
