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

  it('params_reread_after_default_write_succeeds', () => {
    const p = tmpPath('params_reread.yaml');
    rm(p);
    // First load writes defaultParams yaml (includes 16 underscore keys)
    paramsLoad(p);
    // Second load rereads the on-disk file and validates keys — must not throw VALIDATION
    const pf2 = paramsLoad(p);
    expect(Object.keys(pf2.params)).toHaveLength(26);
    expect(pf2.params['spec_type']).toBe('--spec-type');
    expect(pf2.params['presence_penalty']).toBe('--presence_penalty');
    rm(p);
  });
});