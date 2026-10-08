import { t, type Lang } from './i18n';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, stringify as dump } from 'yaml';

export interface ProxyConfig { host?: string; port?: number; }

export interface LlamaUpdateConfig {
  last_llama_type?: string;
}

export interface AppConfig {
  llama_dir: string;
  vram_total_gb?: number;
  proxy?: ProxyConfig;
  update?: LlamaUpdateConfig;
  /** i18n（spec §3.4）：用户选择的语言；缺省 = 跟随系统。 */
  language?: 'zh' | 'en';
}
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

// 2026-09-17：include_pre_release 移除（stable 无 Windows 包，恒查 pre-release/nightly）；2026-09-18：默认 update 值移除——首次保存不再写入用户从未选择的版本类型
// 2026-10-08 settings-save-change-only：默认值改为每次新建，不再共享单例。调用方（saveProxy/saveLlamaDir/set_language）拿到 cfg 后会就地改字段再落盘，
// 共享对象会被写脏：文件缺失/为空时 appConfigLoad 读到的是「上一次保存留下的值」，而 saveProxy 的判定基线正是这个读取结果（spec H2）→ 会把真实变化误判为未变化
function emptyAppConfig(): AppConfig { return { llama_dir: '' }; }

function parseYaml(path: string, s: string, name: string): unknown {
  let parsed: unknown;
  try {
    parsed = parse(s);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error('YAML: ' + t('err.config.yamlLoadFail', { name, msg }));
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('YAML: ' + t('err.config.yamlEmpty', { name }));
  }
  return parsed;
}

// app_config：缺失 → 默认 {llama_dir: ""}；坏 yaml → 同样回落默认（宽松加载）
export function appConfigLoad(path: string): AppConfig {
  try {
    const s = readFileSync(path, 'utf8');
    if (s.trim().length === 0) return emptyAppConfig();
    const parsed = parseYaml(path, s, 'lms_launcher.yaml') as Partial<AppConfig> | null;
    return {
      llama_dir: parsed?.llama_dir ?? '',
      vram_total_gb: parsed?.vram_total_gb,
      proxy: parsed?.proxy,
      update: parsed?.update,
      language: parsed?.language,
    };
  } catch {
    return emptyAppConfig();
  }
}
export function appConfigSave(path: string, cfg: AppConfig): void {
  writeFileSync(path, dump(cfg));
}

// params：缺失 → MISSING（2026-10-06：参数表改为随包分发的受控资产，代码不再生成默认表）。
// 已存在 → 只校验 key 合法性；文件由仓库 configs/llama_params.yaml 提供，用户不可在应用内编辑。
export function paramsLoad(path: string): ParamsFile {
  if (!existsSync(path)) throw new Error('MISSING: ' + t('err.config.paramsMissing'));
  const s = readFileSync(path, 'utf8');
  const pf = parseYaml(path, s, 'llama_params.yaml') as ParamsFile;
  for (const k of Object.keys(pf.params)) {
    if (!validateParamKey(k)) {
      throw new Error('VALIDATION: ' + t('err.config.paramKey', { k }));
    }
  }
  return pf;
}

// configs：缺失 → MISSING（不创建）；空文件 → {}；坏 yaml → YAML:
export function configsLoad(path: string): ConfigsMap {
  if (!existsSync(path)) throw new Error('MISSING: ' + t('err.config.missing'));
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
  throw new Error('VALIDATION: ' + t('err.config.idGen'));
}

// save：坏 id → VALIDATION；值 trim 后空串丢弃；文件不存在则首次创建。
// defaults（2026-09 params_default）：被保存条目缺失的默认值自动补入（用户已设值不覆盖）
export function saveConfigEntry(path: string, id: string, name: string | undefined, values: Record<string, string>, defaults?: ParamsFile): void {
  if (!validateConfigId(id)) throw new Error('VALIDATION: ' + t('err.config.idFormat'));
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
  if (!(id in map)) throw new Error('VALIDATION: ' + t('err.config.notFound', { id }));
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



/**
 * 保存 llama.cpp 安装目录（2026-09-14 修复）。
 * load→改→save 增量保存：旧 save_llama_dir 用全新 {llama_dir} 对象 appConfigSave
 * 全量重写 yaml，把 proxy/vram_total_gb/update 全部清空。
 */
export function saveLlamaDir(p: string, dir: string): AppConfig {
  const cfg = appConfigLoad(p);
  cfg.llama_dir = (dir ?? '').trim();
  appConfigSave(p, cfg);
  return cfg;
}

/** 保存结果：changed = 本次是否真的修改了 yaml；false 表示未落盘，调用方据此不记日志（2026-10-08 settings-save-change-only）。 */
export interface ConfigSaveResult { cfg: AppConfig; changed: boolean; }

/**
 * 代理归一化：host/port 任一缺失或非法 → undefined（= 直连）。
 * 文件侧与输入侧共用同一函数——yaml 缺 proxy 节、proxy: {}、输入框留空三者语义相同（spec H8）。
 */
function normalizeProxy(p: ProxyConfig | undefined): ProxyConfig | undefined {
  const host = typeof p?.host === 'string' ? p.host.trim() : '';
  const port = typeof p?.port === 'number' ? p.port : NaN;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return { host, port };
}

/** 两侧归一后是否为同一代理状态（undefined 只与 undefined 相同）。 */
function sameProxy(a: ProxyConfig | undefined, b: ProxyConfig | undefined): boolean {
  const x = normalizeProxy(a);
  const y = normalizeProxy(b);
  if (x === undefined || y === undefined) return x === y;
  return x.host === y.host && x.port === y.port;
}

/**
 * 保存代理设置（端口走字符串，由主进程校验防注入）；两参均空 = 清除代理。
 * 变更才落盘（2026-10-08 settings-save-change-only）：判定基线是 **yaml 当前内容**（不是内存态，spec H2），
 * 与文件现值归一后相同 → 不写文件、changed=false（调用方据此不记日志）。校验先于判定，throw 契约不变。
 */
export function saveProxy(p: string, host: string, port: string): ConfigSaveResult {
  const cfg = appConfigLoad(p);
  const h = (host ?? '').trim();
  const ps = (port ?? '').trim();
  const clearing = !h && !ps;
  if (!clearing && (!h || !ps)) throw new Error(t('err.config.proxyPortEmpty'));
  let target: ProxyConfig | undefined;
  if (!clearing) {
    const n = Number(ps);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(t('settings.proxy.err.port'));
    target = { host: h, port: n };
  }
  if (sameProxy(cfg.proxy, target)) return { cfg, changed: false }; // 未变：不落盘，mtime 不动
  cfg.proxy = target; // undefined → yaml stringify 省略该键，整节消失（spec F8）
  appConfigSave(p, cfg);
  return { cfg, changed: true };
}

/**
 * 保存语言（2026-10-08 settings-save-change-only）：与 **yaml 里的 language** 比较，不用 getLang()——
 * 运行期语言可能来自系统 locale（main.ts initI18n），文件缺键时用户选值仍算变化（spec H2/H6、L1）。
 * 相同 → 不写文件、changed=false；调用方（set_language）仍照常 applyLang + 重建托盘（spec H10）。
 */
export function saveLanguage(p: string, lang: Lang): ConfigSaveResult {
  const cfg = appConfigLoad(p);
  if (cfg.language === lang) return { cfg, changed: false };
  cfg.language = lang;
  appConfigSave(p, cfg);
  return { cfg, changed: true };
}

/**
 * 保存 llama.cpp 更新配置（2026-10-09 llama-update-config-vram spec D1–D5）：与 yaml 里的
 * update.last_llama_type 比较，相同 → 完全不写（D2/D3）。opts 不含该键 → 什么都不做，
 * 绝不凭空造 update: {}（D4，修 main.ts 旧代码 F2）。空串 = 未配置：要让整节消失必须把
 * cfg.update 置为 undefined——stringify({update:{}}) 会输出 update: {}，节不会自行消失（F11）。
 */
export function saveLlamaUpdateConfig(p: string, opts: { last_llama_type?: string }): ConfigSaveResult {
  const cfg = appConfigLoad(p);
  const current = typeof cfg.update?.last_llama_type === 'string' && cfg.update.last_llama_type !== '' ? cfg.update.last_llama_type : undefined;
  const target = typeof opts.last_llama_type === 'string' && opts.last_llama_type !== '' ? opts.last_llama_type : undefined;
  if (current === target) return { cfg, changed: false };
  if (target === undefined) cfg.update = undefined;
  else cfg.update = { ...(cfg.update ?? {}), last_llama_type: target };
  appConfigSave(p, cfg);
  return { cfg, changed: true };
}
