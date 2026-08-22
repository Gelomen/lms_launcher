### 任务 2：config.ts（TDD，9 测试）

**文件：**
- 修改：`src-main/test-utils.ts`（追加 3 个文件助手）
- 创建：`src-main/config.ts`、`src-main/config.test.ts`

本任务是 Rust `config.rs` 的 TS 移植——9 个测试语义原样移植（Rust 侧已 9/9 PASS，TS 侧也应 9/9 PASS）。

- [ ] **步骤 1：test-utils.ts 追加助手**

在 `src-main/test-utils.ts` 末尾追加（把 `writeFileSync` 加进已有的 fs import；`join` 已在 path import 中）：

~~~ ts
export function writeText(p: string, s: string): void {
  writeFileSync(p, s);
}

export function mkDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

export function jp(dir: string, name: string): string {
  return join(dir, name);
}
~~~

- [ ] **步骤 2：写失败的测试（src-main/config.test.ts）**

~~~ ts
import { describe, it, expect } from 'vitest';
import { appConfigLoad, appConfigSave, paramsLoad, configsLoad, saveConfigEntry, deleteConfigEntry, validateConfigId, validateParamKey, defaultParams } from './config';
import { tmpPath, rm, writeText, jp } from './test-utils';

describe('config.ts', () => {

  it('app_config_defaults_when_missing', () => {
    const p = tmpPath('app1.yaml');
    rm(p);
    expect(appConfigLoad(p).llama_dir).toBe('');
    appConfigSave(p, { llama_dir: 'C:\\llama-cpp' });
    expect(appConfigLoad(p).llama_dir).toBe('C:\\llama-cpp');
  });

  it('params_default_written_only_when_missing', () => {
    const p = tmpPath('params1.yaml');
    rm(p);
    const pf = paramsLoad(p);
    expect(pf.params['m']).toBe('-m');
    expect(pf.required).toEqual(['m']);
    writeText(p, 'params:\n  zz: "--zz"\nrequired: []\n');
    const pf2 = paramsLoad(p);
    expect(pf2.params['zz']).toBe('--zz');
    expect(pf2.required.length).toBe(0);
    rm(p);
  });

  it('configs_missing_reports_missing', () => {
    const p = tmpPath('cfg_missing.yaml');
    rm(p);
    expect(() => configsLoad(p)).toThrow(/^MISSING:/);
  });

  it('save_and_delete_config_entry', () => {
    const p = tmpPath('cfg2.yaml');
    rm(p);
    saveConfigEntry(p, 'c1', '日常', { m: 'x.gguf', port: ' 9931 ' });
    const map = configsLoad(p);
    expect(map.c1.values['m']).toBe('x.gguf');
    expect(map.c1.values['port']).toBe('9931'); // 首尾空格被去除
    deleteConfigEntry(p, 'c1');
    expect(Object.keys(configsLoad(p))).toHaveLength(0);
    expect(() => deleteConfigEntry(p, 'c1')).toThrow(/^VALIDATION:/);
    rm(p);
  });

  it('save_config_entry_rejects_invalid_id', () => {
    const p = tmpPath('cfg3.yaml');
    rm(p);
    expect(() => saveConfigEntry(p, 'Bad Id', undefined, { m: 'x.gguf' })).toThrow(/^VALIDATION:/);
  });

  it('bad_yaml_reports_yaml', () => {
    const p = tmpPath('bad.yaml');
    rm(p);
    writeText(p, 'a: [unclosed\n');
    expect(() => configsLoad(p)).toThrow(/^YAML:/);
    rm(p);
  });

  it('param_key_must_be_identifier', () => {
    expect(validateParamKey('m')).toBe(true);
    expect(validateParamKey('-m')).toBe(false);
    expect(validateParamKey('a b')).toBe(false);
    expect(validateParamKey('A')).toBe(false);
  });

  it('config_id_rules', () => {
    expect(validateConfigId('abc')).toBe(true);
    expect(validateConfigId('a1b2')).toBe(true);
    expect(validateConfigId('')).toBe(false);
    expect(validateConfigId('Ab')).toBe(false);
    expect(validateConfigId('a b')).toBe(false);
    expect(validateConfigId('1abc')).toBe(false);
  });

  it('default_params_covers_run_bat_common', () => {
    const pf = defaultParams();
    const keys = ['m','mmproj','spec_type','ngl','fa','load_mode','np','c','b','ub','t','tb','ctk','ctv','jinja','chat_template_file','reasoning_format','reasoning_effort','spec_draft_n_max','temp','top_p','top_k','min_p','presence_penalty','repeat_penalty','port'];
    for (const k of keys) expect(pf.params[k], k).toBeDefined();
    expect(pf.required).toEqual(['m']);
  });
});
~~~

注：`writeText(p, '<yaml>')` 中 `\n` 是测试源码里的换行转义——写文件时按 TS 字符串解析，落盘为真实换行。

- [ ] **步骤 3：运行验证失败**

~~~ powershell
npx vitest run src-main/config.test.ts
~~~

预期：FAIL —— Cannot find module ./config（config.ts 尚未创建）。

- [ ] **步骤 4：实现 config.ts**

~~~ ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, dump } from 'yaml';

export interface AppConfig { llama_dir: string }
export interface ParamsFile { params: Record<string, string>; required: string[] }
export interface ConfigEntry { desc?: string; values: Record<string, string> }
export type ConfigsMap = Record<string, ConfigEntry>

const EMPTY_APP_CONFIG: AppConfig = { llama_dir: '' };

function parseYaml(path: string, s: string, name: string): unknown {
  let parsed: unknown;
  try {
    parsed = parse(s);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`YAML: 解析 ${name} 失败: ${msg}`);
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`YAML: 解析 ${name} 失败: 空文件`);
  }
  return parsed;
}

// app_config：缺失 → 默认 {llama_dir: ""}；坏 yaml → 同样回落默认（宽松加载）
export function appConfigLoad(path: string): AppConfig {
  try {
    const s = readFileSync(path, 'utf8');
    if (s.trim().length === 0) return EMPTY_APP_CONFIG;
    const parsed = parseYaml(path, s, 'lms_launch.yaml') as Partial<AppConfig> | null;
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
  return /^[a-z0-9]+$/.test(key);
}

// 默认参数模板：run.bat COMMON 全量 flag-form 映射（m → -m …）；required = [m]
export function defaultParams(): ParamsFile {
  const items: Array<[string, string]> = [
    ['m', '-m'], ['mmproj', '--mmproj'], ['spec_type', '--spec-type'], ['ngl', '-ngl'],
    ['fa', '-fa'], ['load_mode', '--load-mode'], ['np', '-np'], ['c', '-c'],
    ['b', '-b'], ['ub', '-ub'], ['t', '-t'], ['tb', '-tb'], ['ctk', '-ctk'],
    ['ctv', '--ctv'], ['jinja', '--jinja'], ['chat_template_file', '--chat-template-file'],
    ['reasoning_format', '--reasoning-format'], ['reasoning_effort', '--reasoning-effort'],
    ['spec_draft_n_max', '--spec-draft-n-max'], ['temp', '--temp'], ['top_p', '--top-p'],
    ['top_k', '--top-k'], ['min_p', '--min-p'],
    ['presence_penalty', '--presence_penalty'], ['repeat_penalty', '--repeat_penalty'],
    ['port', '--port'],
  ];
  const params: Record<string, string> = Object.fromEntries(items);
  return { params, required: ['m'] };
}
~~~

- [ ] **步骤 5：运行验证通过**

~~~ powershell
npx vitest run src-main/config.test.ts
~~~

预期：9 PASS。

- [ ] **步骤 6：Commit**

~~~ bash
git add src-main/config.ts src-main/config.test.ts src-main/test-utils.ts
git commit -m "feat: 配置层 TS 移植——三个 yaml 的读写/校验/默认参数模板（9 测试）"
~~~

---

