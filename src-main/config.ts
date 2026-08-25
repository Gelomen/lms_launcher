import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, stringify as dump } from 'yaml';

export interface AppConfig { llama_dir: string }
export interface ParamsFile {
  params: Record<string, string>;
  required: string[];
  params_options?: Record<string, string[]>;
  params_boolean?: string[];
  params_file?: string[];
}
export interface ConfigEntry { desc?: string; values: Record<string, string> }
export type ConfigsMap = Record<string, ConfigEntry>

const EMPTY_APP_CONFIG: AppConfig = { llama_dir: '' };

function parseYaml(path: string, s: string, name: string): unknown {
  let parsed: unknown;
  try {
    parsed = parse(s);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`YAML: ${name} 失败: ${msg}`);
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`YAML: ${name} 失败: 空文件`);
  }
  return parsed;
}

// app_config：缺失 → 默认 {llama_dir: ""}；坏 yaml → 同样回落默认（宽松加载）
export function appConfigLoad(path: string): AppConfig {
  try {
    const s = readFileSync(path, 'utf8');
    if (s.trim().length === 0) return EMPTY_APP_CONFIG;
    const parsed = parseYaml(path, s, 'lms_launcher.yaml') as Partial<AppConfig> | null;
    return { llama_dir: parsed?.llama_dir ?? '' };
  } catch {
    return EMPTY_APP_CONFIG;
  }
}

export function appConfigSave(path: string, cfg: AppConfig): void {
  writeFileSync(path, dump(cfg));
}

// params：缺失 → 写入默认模板并返回；已存在 → 不覆盖，只校验 key 合法性
export function paramsLoad(path: string): ParamsFile {
  if (!existsSync(path)) {
    const pf = defaultParams();
    writeFileSync(path, dump(pf));
    return pf;
  }
  const s = readFileSync(path, 'utf8');
  const pf = parseYaml(path, s, 'llama_params.yaml') as ParamsFile;
  for (const k of Object.keys(pf.params)) {
    if (!validateParamKey(k)) {
      throw new Error(`VALIDATION: 参数 key "${k}" 不是小写字母开头的字母数字串`);
    }
  }
  return pf;
}

// configs：缺失 → MISSING（不创建）；空文件 → {}；坏 yaml → YAML:
export function configsLoad(path: string): ConfigsMap {
  if (!existsSync(path)) throw new Error('MISSING: llama_launch_configs.yaml 不存在（新建第一个模板后自动生成）');
  const s = readFileSync(path, 'utf8');
  if (s.trim().length === 0) return {};
  return parseYaml(path, s, 'llama_launch_configs.yaml') as ConfigsMap;
}

// save：坏 id → VALIDATION；值 trim 后空串丢弃；文件不存在则首次创建
export function saveConfigEntry(path: string, id: string, desc: string | undefined, values: Record<string, string>): void {
  if (!validateConfigId(id)) throw new Error('VALIDATION: id 须为小写字母开头的字母数字串（不含空格/大写），最长 32 位');
  let map: ConfigsMap = {};
  if (existsSync(path)) map = configsLoad(path);
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const t = v.trim();
    if (t.length > 0) clean[k] = t;
  }
  map[id] = desc ? { desc, values: clean } : { values: clean };
  writeFileSync(path, dump(map));
}

export function deleteConfigEntry(path: string, id: string): void {
  const map = configsLoad(path);
  if (!(id in map)) throw new Error(`VALIDATION: 配置 "${id}" 不存在`);
  delete map[id];
  writeFileSync(path, dump(map));
}

export function validateConfigId(id: string): boolean {
  if (id.length === 0 || id.length > 32) return false;
  if (!/^[a-z]/.test(id)) return false;
  return /^[a-z0-9]+$/.test(id);
}

export function validateParamKey(key: string): boolean {
  if (key.length === 0) return false;
  if (!/^[a-z]/.test(key)) return false;
  return /^[a-z0-9_]+$/.test(key);
}

// params_options / params_boolean / params_file
export function defaultParams(): ParamsFile {
  const items: Array<[string, string]> = [
    ['m', '-m'], ['mmproj', '--mmproj'], ['image_min_tokens', '--image-min-tokens'],
    ['alias', '--alias'], ['ngl', '-ngl'],
    ['fa', '-fa'], ['n_cpu_moe', '--n-cpu-moe'], ['load_mode', '--load-mode'],
    ['np', '-np'], ['c', '-c'], ['b', '-b'], ['ub', '-ub'], ['t', '-t'], ['tb', '-tb'],
    ['ctk', '-ctk'], ['ctv', '-ctv'], ['spec_type', '--spec-type'], ['spec_draft_n_max', '--spec-draft-n-max'],
    ['temp', '--temp'], ['top_p', '--top-p'], ['top_k', '--top-k'], ['min_p', '--min-p'],
    ['presence_penalty', '--presence_penalty'], ['repeat_penalty', '--repeat_penalty'],
    ['jinja', '--jinja'], ['chat_template_file', '--chat-template-file'],
    ['reasoning', '--reasoning'], ['reasoning_format', '--reasoning-format'],
    ['reasoning_effort', '--reasoning-effort'], ['reasoning_preserve', '--reasoning-preserve'],
    ['port', '--port'],
    ['metrics', '--metrics'], ['fit', '--fit'], ['fit_ctx', '--fit-ctx'], ['fit_target', '--fit-target'],
  ];
  const params: Record<string, string> = Object.fromEntries(items);
  return {
    params,
    required: ['m'],
    params_options: {
      ctk: ['q4_0', 'q5_0', 'q8_0', 'f16'], // KV cache dtype（ctk/ctv 同表），精度从低到高，q4_0 为默认
      ctv: ['q4_0', 'q5_0', 'q8_0', 'f16'],
      spec_type: ['none', 'draft-mtp', 'draft-dflash', 'draft-dspark'],
      load_mode: ['none', 'auto', 'mmap', 'mlock', 'mmap+mlock', 'dio'],
      reasoning: ['auto', 'on', 'off'],
      reasoning_format: ['none', 'hide', 'deepseek'],
      reasoning_effort: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    },
    params_boolean: ['jinja', 'reasoning_preserve', 'metrics'],
    params_file: ['m', 'mmproj', 'chat_template_file'],
  };
}