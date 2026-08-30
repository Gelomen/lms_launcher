import { describe, it, expect } from 'vitest';
import { appConfigLoad, appConfigSave, paramsLoad, configsLoad, saveConfigEntry, deleteConfigEntry, validateConfigId, validateParamKey, defaultParams, suggestConfigId, existingConfigIds } from './config';
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

  it('config_entry_uses_name_key_not_desc', () => {
    // 字段 key 由 desc → name（2026-09）：保存后 yaml 条目带 name，不再出现 desc
    const p = tmpPath('cfg_name.yaml');
    rm(p);
    saveConfigEntry(p, 'c1', '日常推理', { m: 'x.gguf' });
    const map = configsLoad(p);
    expect(map.c1.name).toBe('日常推理');
    expect((map.c1 as Record<string, unknown>).desc).toBeUndefined();
    rm(p);
  });

  it('legacy_desc_key_normalized_to_name_on_load', () => {
    // 存量 llama_launch_configs.yaml（desc: 键）读取时归一为 name，后续保存即以 name 持久化
    const p = tmpPath('cfg_legacy_name.yaml');
    rm(p);
    writeText(p, ['c1:', '  desc: 日常', "  values: { m: x.gguf }", ''].join(String.fromCharCode(10)));
    const map = configsLoad(p);
    expect(map.c1.name).toBe('日常');
    saveConfigEntry(p, 'c2', '新', {}); // 任意一次保存后，legacy 条目也以 name 落盘
    expect((configsLoad(p).c1 as Record<string, unknown>).name ?? (configsLoad(p).c1 as Record<string, unknown>).desc).toBe('日常');
    rm(p);
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

  it('existing_config_ids_empty_when_file_missing', () => {
    // 首个模板保存前 llama_launch_configs.yaml 不存在——suggest 拿现有 id 列表必须得 []，不能抛 MISSING
    const p = tmpPath('cfg_suggest_missing.yaml');
    rm(p);
    expect(existingConfigIds(p)).toEqual([]);
    rm(p);
    // 已有条目 → 正常返回 key 列表；空文件 → []
    saveConfigEntry(p, 'c1', 'x', { m: 'x.gguf' });
    expect(existingConfigIds(p)).toEqual(['c1']);
    writeText(p, '');
    expect(existingConfigIds(p)).toEqual([]);
    rm(p);
  });

  it('suggest_config_id_is_unique_and_yaml_safe', () => {
    // id 将作为 yaml key 保存：必须符合 validateConfigId（小写字母开头 [a-z0-9] ≤32），且与现有条目不重名
    const existing = ['tplabc1', 'qwen'];
    const id = suggestConfigId(existing);
    expect(id).not.toBe('tplabc1');
    expect(id).not.toBe('qwen');
    expect(validateConfigId(id)).toBe(true);
    // 连取 50 个也不碰撞（随机尾巴）
    const batch: string[] = [];
    for (let i = 0; i < 50; i++) batch.push(suggestConfigId([...batch]));
    expect(new Set(batch).size).toBe(50);
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
    const keys = ['m','mmproj','spec_type','ngl','fa','load_mode','np','c','b','ub','t','tb','ctk','ctv','jinja','chat_template_file','reasoning_format','reasoning_effort','spec_draft_n_max','md','temp','top_p','top_k','min_p','presence_penalty','repeat_penalty','port','alias'];
    for (const k of keys) expect(pf.params[k], k).toBeDefined();
    expect(pf.required).toEqual(['m']);
  });

  it('params_reread_after_default_write_succeeds', () => {
    const p = tmpPath('params_reread.yaml');
    rm(p);
    // First load writes defaultParams yaml (includes 16 underscore keys)
    paramsLoad(p);
    // Second load rereads the on-disk file and validates keys — must not throw VALIDATION
    const pf2 = paramsLoad(p);
    expect(Object.keys(pf2.params)).toHaveLength(37);
    expect(pf2.params['spec_type']).toBe('--spec-type');
    expect(pf2.params['presence_penalty']).toBe('--presence_penalty');
    rm(p);
  });

  it('params_new_sections_parsed', () => {
    const p = tmpPath('params_new.yaml');
    rm(p);
    writeText(p, `params:
  m: "-m"
  jinja: "--jinja"
params_options:
  spec_type: ["none", "draft-mtp"]
params_boolean:
  - jinja
params_file:
  - m
`);
    const pf = paramsLoad(p);
    expect(pf.params_options?.spec_type).toEqual(['none', 'draft-mtp']);
    expect(pf.params_boolean).toEqual(['jinja']);
    expect(pf.params_file).toEqual(['m']);
    rm(p);
  });

  it('params_missing_new_sections_are_empty', () => {
    const p = tmpPath('params_legacy.yaml');
    rm(p);
    writeText(p, 'params:\n  m: "-m"\nrequired: ["m"]\n');
    const pf = paramsLoad(p);
    expect(pf.params_options ?? {}).toEqual({});
    expect(pf.params_boolean ?? []).toEqual([]);
    expect(pf.params_file ?? []).toEqual([]);
    rm(p);
  });

  it('default_params_includes_v1_1_keys_and_sections', () => {
    const pf = defaultParams();
    expect(pf.params['reasoning']).toBe('-rea');
    expect(pf.params['reasoning_preserve']).toBe('--reasoning-preserve');
    // #14：五个新参数（n_cpu_moe / fit / fit_ctx / fit_target 为普通文本参数；metrics 为 boolean flag）
    expect(pf.params['n_cpu_moe']).toBe('-ncmoe');
    expect(pf.params['fit']).toBe('-fit');
    expect(pf.params['fit_ctx']).toBe('-fitc');
    expect(pf.params['fit_target']).toBe('-fitt');
    expect(pf.params['metrics']).toBe('--metrics');
    expect(Object.keys(pf.params)).toHaveLength(37); // 既有 26 + v1.1 新增 7 + alias + #15 image_min_tokens + md + ngld
    expect(pf.params['alias']).toBe('-a');
    // #15：image_min_tokens 紧随 mmproj 之后，--mmproj 有值时可启用
    expect(pf.params['image_min_tokens']).toBe('--image-min-tokens');
    const pk = Object.keys(pf.params);
    expect(pk[pk.indexOf('mmproj') + 1]).toBe('image_min_tokens');
    // spec_type 与 config.ts defaultParams 对齐（收敛为 4 项）
    expect(pf.params_options?.spec_type).toEqual(['none','draft-mtp','draft-dflash','draft-dspark']);
    expect(pf.params_options?.load_mode).toEqual(['none','auto','mmap','mlock','mmap+mlock','dio']);
    expect(pf.params_options?.reasoning).toEqual(['auto','on','off']);
    expect(pf.params_options?.reasoning_format).toEqual(['none','hide','deepseek']);
    expect(pf.params_options?.reasoning_effort).toEqual(['none','low','medium','high','xhigh','max']);
    // ctk/ctv：KV cache dtype 下拉（精度从低到高，q4_0 为默认首项）
    expect(pf.params_options?.ctk).toEqual(['q4_0','q5_0','q8_0','f16']);
    expect(pf.params_options?.ctv).toEqual(['q4_0','q5_0','q8_0','f16']);
    expect(pf.params_boolean).toEqual(['jinja','reasoning_preserve','metrics']); // #14：metrics 声明为 boolean

    expect(pf.params_file).toEqual(['m','mmproj','chat_template_file','md']);
    // md（--spec-draft-model）紧随 spec_draft_n_max 之后，params_file 类型
    expect(pf.params['md']).toBe('-md');
    expect(pk[pk.indexOf('spec_draft_n_max') + 1]).toBe('md'); // pk 见上文 image_min_tokens 断言
    // ngld（--spec-draft-ngl，draft 模型 GPU 层数）紧随 md 之后，普通数值参数
    expect(pf.params['ngld']).toBe('-ngld');
    expect(pk[pk.indexOf('md') + 1]).toBe('ngld');
  });

  it('vram_total_gb_roundtrip', () => {
    const p = tmpPath('app_vram.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: 'd:', vram_total_gb: 24 });
    expect(appConfigLoad(p).vram_total_gb).toBe(24);
    expect(appConfigLoad(p).llama_dir).toBe('d:');
  });

  it('vram_total_gb_absent_in_legacy_yaml', () => {
    const p = tmpPath('app_vram_legacy.yaml');
    rm(p);
    writeText(p, 'llama_dir: d:\\x\\\n');
    const cfg = appConfigLoad(p);
    expect(cfg.vram_total_gb).toBeUndefined();
    expect(cfg.llama_dir).toBe('d:\\x\\');
    rm(p);
  });

  it('default_params_includes_params_default_and_fit_options', () => {
    // params_default：新建模板自动填写的默认值（port/fit）；fit 同时是下拉（off/on），非 boolean
    const pf = defaultParams();
    expect(pf.params_default).toEqual({ port: '9931', fit: 'off' });
    expect(pf.params_options?.fit).toEqual(['off', 'on']);
    expect(pf.params_boolean ?? []).not.toContain('fit');
  });

  it('params_yaml_roundtrip_preserves_params_default', () => {
    // 首次加载把默认 params 写盘 → 再读回 params_default / fit 选项仍在（往返不丢）
    const p = tmpPath('params_default_rt.yaml');
    rm(p);
    paramsLoad(p);
    const pf = paramsLoad(p);
    expect(pf.params_default).toEqual({ port: '9931', fit: 'off' });
    expect(pf.params_options?.fit).toEqual(['off', 'on']);
    rm(p);
  });

  it('save_config_backfills_missing_params_defaults', () => {
    // 存量模板缺 port/fit → 保存时自动补默认值（用户已设的 port 不覆盖）
    const p = tmpPath('cfg_backfill.yaml');
    rm(p);
    saveConfigEntry(p, 'old', '存量', { m: 'x.gguf', port: '8080' }, defaultParams());
    const map = configsLoad(p);
    expect(map.old.values['port']).toBe('8080'); // 已有用户值保留
    expect(map.old.values['fit']).toBe('off');   // 缺失 fit → 默认补齐
    rm(p);
  });

  it('save_config_backfill_keeps_user_set_fit', () => {
    // 用户显式 fit=on → 不覆盖；缺失的 port 补默认
    const p = tmpPath('cfg_backfill2.yaml');
    rm(p);
    saveConfigEntry(p, 'u', '用户', { m: 'x.gguf', fit: 'on' }, defaultParams());
    const map = configsLoad(p);
    expect(map.u.values['fit']).toBe('on');
    expect(map.u.values['port']).toBe('9931');
    rm(p);
  });

  it('save_config_without_defaults_keeps_legacy_behavior', () => {
    // defaults 省略（向后兼容签名）→ 不回填
    const p = tmpPath('cfg_backfill3.yaml');
    rm(p);
    saveConfigEntry(p, 'l', 'Legacy', { m: 'x.gguf' });
    const map = configsLoad(p);
    expect(map.l.values['port']).toBeUndefined();
    expect(map.l.values['fit']).toBeUndefined();
    rm(p);
  });
});