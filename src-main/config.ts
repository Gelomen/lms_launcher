import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, stringify as dump } from 'yaml';

export interface AppConfig { llama_dir: string; vram_total_gb?: number; proxy_host?: string; proxy_port?: number }
export interface ParamsFile {
  params: Record<string, string>;
  required: string[];
  params_options?: Record<string, string[]>;
  params_boolean?: string[];
  params_file?: string[];
  // params_default（2026-09）：新建模板自动填写的默认值——保存时也写入用户模板配置（用户改过则用用户的）
  params_default?: Record<string, string>;
}
// 字段 key：desc → name（2026-09）；存量 yaml 的 desc 键由 configsLoad 归一，任意一次保存后即以 name 持久化
export interface ConfigEntry { name?: string; values: Record<string, string> }
export type ConfigsMap = Record<string, ConfigEntry>

// legacy desc → name 归一（2026-09 key 改名）：存量 yaml 条目若带 desc 键则搬进 name
function normalizeEntry(entry: { desc?: string; name?: string; values: Record<string, string> }): ConfigEntry {
  if (entry.name !== undefined) return entry;
  return entry.desc !== undefined ? { name: entry.desc, values: entry.values } : { values: entry.values };
}

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
    return { llama_dir: parsed?.llama_dir ?? '', vram_total_gb: parsed?.vram_total_gb, proxy_host: parsed?.proxy_host, proxy_port: parsed?.proxy_port };
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
  const map = parseYaml(path, s, 'llama_launch_configs.yaml') as Record<string, { desc?: string; name?: string; values: Record<string, string> }>;
  // legacy desc → name（2026-09 key 改名）：读取时归一，任意一次保存后 yaml 即只含 name
  const out: ConfigsMap = {};
  for (const [id, e] of Object.entries(map)) out[id] = normalizeEntry(e);
  return out;
}

// 现有条目 id 列表：文件缺失（首个模板尚未创建）→ []；空文件 → []。
// suggest 需要它做防重——不能直接用 configsLoad，其 MISSING 异常是给「加载配置」语义的，不该挡在保存前
export function existingConfigIds(path: string): string[] {
  if (!existsSync(path)) return [];
  const s = readFileSync(path, 'utf8');
  if (s.trim().length === 0) return [];
  return Object.keys(configsLoad(path));
}

// suggest：自动生成唯一配置 id——保存后写入 yaml key，故必须符合 validateConfigId（小写字母开头、[a-z0-9]、≤32）且与现有条目不重名。
// 碰撞概率低（时间戳+随机尾巴），但渲染端可能连续两次秒级保存同一时间戳 → 循环重试直至唯一
export function suggestConfigId(existing: string[]): string {
  const rand = (): string => Math.floor(Math.random() * 10000).toString(16).padStart(4, '0');
  for (let i = 0; i < 100; i++) {
    const candidate = 'tpl' + Date.now().toString(36) + rand();
    if (validateConfigId(candidate) && !existing.includes(candidate)) return candidate;
  }
  throw new Error('VALIDATION: id 生成失败（无法产生唯一值）');
}

// save：坏 id → VALIDATION；值 trim 后空串丢弃；文件不存在则首次创建。
// defaults（2026-09 params_default）：被保存条目缺失的默认值自动补入（用户已设值不覆盖）
export function saveConfigEntry(path: string, id: string, name: string | undefined, values: Record<string, string>, defaults?: ParamsFile): void {
  if (!validateConfigId(id)) throw new Error('VALIDATION: id 须为小写字母开头的字母数字串（不含空格/大写），最长 32 位');
  let map: ConfigsMap = {};
  if (existsSync(path)) map = configsLoad(path); // legacy desc → name 归一（任意一次保存后即固化）
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const t = v.trim();
    if (t.length > 0) clean[k] = t;
  }
  for (const [k, v] of Object.entries(defaults?.params_default ?? {})) { // params_default 回填：缺失才补
    const t = v.trim();
    if (t.length > 0 && clean[k] === undefined) clean[k] = t;
  }
  map[id] = name ? { name, values: clean } : { values: clean }; // 字段 key：desc → name（2026-09）
  writeFileSync(path, dump(map));
}

// params_default 存量兼容（2026-09）：现有模板配置里缺失的默认值自动为用户新增（已有值不覆盖）。
// configs yaml 缺失（首个模板尚未创建）→ 直接跳过；返回是否有改动（改动才落盘）。
export function configsBackfillDefaults(path: string, pf: ParamsFile): boolean {
  let map: ConfigsMap;
  try {
    map = configsLoad(path);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('MISSING')) return false;
    throw e;
  }
  let changed = false;
  for (const entry of Object.values(map)) {
    for (const [k, v] of Object.entries(pf.params_default ?? {})) {
      const cur = (entry.values[k] ?? '').trim();
      const t = v.trim();
      if (cur.length === 0 && t.length > 0) { entry.values[k] = t; changed = true; }
    }
  }
  if (changed) writeFileSync(path, dump(map));
  return changed;
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
    ['m', '-m'], ['mmproj', '-mm'], ['image_min_tokens', '--image-min-tokens'],
    ['alias', '-a'], ['ngl', '-ngl'],
    ['fa', '-fa'], ['n_cpu_moe', '-ncmoe'], ['load_mode', '-lm'],
    ['np', '-np'], ['c', '-c'], ['b', '-b'], ['ub', '-ub'], ['t', '-t'], ['tb', '-tb'],
    ['ctk', '-ctk'], ['ctv', '-ctv'], ['spec_type', '--spec-type'], ['spec_draft_n_max', '--spec-draft-n-max'], ['md', '-md'], ['ngld', '-ngld'],
    ['temp', '--temp'], ['top_p', '--top-p'], ['top_k', '--top-k'], ['min_p', '--min-p'],
    ['presence_penalty', '--presence_penalty'], ['repeat_penalty', '--repeat_penalty'],
    ['jinja', '--jinja'], ['chat_template_file', '--chat-template-file'],
    ['reasoning', '-rea'], ['reasoning_format', '--reasoning-format'],
    ['reasoning_effort', '--reasoning-effort'], ['reasoning_preserve', '--reasoning-preserve'],
    ['port', '--port'],
    ['metrics', '--metrics'], ['fit', '-fit'], ['fit_ctx', '-fitc'], ['fit_target', '-fitt'],
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
      fit: ['off', 'on'], // -fit 显存自动调整开关（默认 off：llama-server 自身默认 on，launcher 显式 off 保持参数显式可控）
    },
    params_boolean: ['jinja', 'reasoning_preserve', 'metrics'],
    params_file: ['m', 'mmproj', 'chat_template_file', 'md'],
    params_default: { port: '9931', fit: 'off' }, // 新建模板自动填写 + 保存时写入用户模板；存量配置由 configsBackfillDefaults 补齐
  };
}