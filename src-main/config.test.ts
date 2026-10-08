import { applyLang } from './i18n';
import { describe, it, expect } from 'vitest';
import { appConfigLoad, appConfigSave, paramsLoad, configsLoad, saveConfigEntry, deleteConfigEntry, validateConfigId, validateParamKey, suggestConfigId, existingConfigIds, saveProxy, saveLlamaDir, saveLanguage, saveLlamaUpdateConfig, saveVramTotal } from './config';
import { tmpPath, rm, writeText, jp, repoParams, repoParamsText } from './test-utils';

describe('config.ts', () => {

  it('app_config_defaults_when_missing', () => {
    const p = tmpPath('app1.yaml');
    rm(p);
    expect(appConfigLoad(p).llama_dir).toBe('');
    appConfigSave(p, { llama_dir: 'C:\\llama-cpp' });
    expect(appConfigLoad(p).llama_dir).toBe('C:\\llama-cpp');
  });

  it('app_config_fallback_returns_a_fresh_clean_object', () => {
    // appConfigLoad 的契约（2026-10-08 settings-save-change-only）：两条 fallback 路径
    // ——A 文件不存在、B 文件存在但内容为空——必须每次新建干净的默认对象。
    // 调用方（saveProxy/saveLlamaDir/set_language）拿到 cfg 后就地写脏再落盘，
    // 共享单例会被写脏：下一次读取读到的是「上一次保存留下的值」，
    // 而 saveProxy 的判定基线正是这个读取结果（spec H2）→ 真实变化被误判为未变化，设置静默丢失。
    // 上面的 app_config_defaults_when_missing 从不写脏返回值，共享单例回归它照样绿——本用例补的就是这条契约。
    const p = tmpPath('app_fallback_purity.yaml');
    for (const pre of ['missing', 'blank'] as const) {
      rm(p);
      if (pre === 'blank') writeText(p, '  \n'); // 前置 B：文件存在但内容为空
      const a = appConfigLoad(p);
      expect(a, pre).toEqual({ llama_dir: '' });
      a.proxy = { host: '1.2.3.4', port: 1 }; // 调用方的就地写脏
      a.llama_dir = 'X';
      const b = appConfigLoad(p);
      expect(b, pre).not.toBe(a); // 不得是同一个对象
      expect(b.llama_dir, pre).toBe('');
      expect(b.proxy, pre).toBeUndefined();
      expect(b, pre).toEqual({ llama_dir: '' });
    }
    rm(p);
  });

  it('params_missing_reports_missing', () => {
    const p = tmpPath('params1.yaml');
    rm(p);
    expect(() => paramsLoad(p)).toThrow(/^MISSING:/);
    writeText(p, 'params:\n  zz: "--zz"\nrequired: []\n');
    const pf = paramsLoad(p);
    expect(pf.params['zz']).toBe('--zz');
    expect(pf.required.length).toBe(0);
    rm(p);
  });

  it('configs_missing_reports_missing', () => {
    const p = tmpPath('cfg_missing.yaml');
    rm(p);
    expect(() => configsLoad(p)).toThrow(/^MISSING:/);
  });

  it('repo_params_file_exists_and_declares_fa_options', () => {
    const pf = repoParams();
    expect(pf.params['fa']).toBe('-fa');
    expect(pf.params_options?.fa).toEqual(['auto', 'on', 'off']);
    expect(pf.required).toEqual(['m']);
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

  it('repo_params_covers_run_bat_common', () => {
    const pf = repoParams();
    const keys = ['m','mmproj','spec_type','ngl','fa','load_mode','np','c','b','ub','t','tb','ctk','ctv','jinja','chat_template_file','reasoning_format','reasoning_effort','spec_draft_n_max','md','temp','top_p','top_k','min_p','presence_penalty','repeat_penalty','port','alias'];
    for (const k of keys) expect(pf.params[k], k).toBeDefined();
    expect(pf.required).toEqual(['m']);
  });

  it('params_reread_from_disk_validates_keys_without_throwing', () => {
    const p = tmpPath('params_reread.yaml');
    rm(p);
    writeText(p, repoParamsText());
    const pf2 = paramsLoad(p);
    expect(Object.keys(pf2.params)).toHaveLength(38);
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

  it('repo_params_includes_v1_1_keys_and_sections', () => {
    const pf = repoParams();
    expect(pf.params['reasoning']).toBe('-rea');
    expect(pf.params['reasoning_preserve']).toBe('--reasoning-preserve');
    // #14：五个新参数（n_cpu_moe / fit / fit_ctx / fit_target 为普通文本参数；metrics 为 boolean flag）
    expect(pf.params['n_cpu_moe']).toBe('-ncmoe');
    expect(pf.params['fit']).toBe('-fit');
    expect(pf.params['fit_ctx']).toBe('-fitc');
    expect(pf.params['fit_target']).toBe('-fitt');
    expect(pf.params['metrics']).toBe('--metrics');
    expect(Object.keys(pf.params)).toHaveLength(38); // 既有 26 + v1.1 新增 7 + alias + #15 image_min_tokens + md + ngld + no_reasoning_preserve
    expect(pf.params['alias']).toBe('-a');
    // #15：image_min_tokens 紧随 mmproj 之后，--mmproj 有值时可启用
    expect(pf.params['image_min_tokens']).toBe('--image-min-tokens');
    const pk = Object.keys(pf.params);
    expect(pk[pk.indexOf('mmproj') + 1]).toBe('image_min_tokens');
    // spec_type 与 configs/llama_params.yaml 对齐（收敛为 4 项）
    expect(pf.params_options?.spec_type).toEqual(['none','draft-mtp','draft-dflash','draft-dspark']);
    expect(pf.params_options?.load_mode).toEqual(['none','auto','mmap','mlock','mmap+mlock','dio']);
    expect(pf.params_options?.reasoning).toEqual(['auto','on','off']);
    expect(pf.params_options?.reasoning_format).toEqual(['none','hide','deepseek']);
    expect(pf.params_options?.reasoning_effort).toEqual(['default','low','medium','high','xhigh','max']);
    // ctk/ctv：KV cache dtype 下拉（精度从低到高，q4_0 为默认首项）
    expect(pf.params_options?.ctk).toEqual(['q4_0','q5_0','q8_0','f16']);
    expect(pf.params_options?.ctv).toEqual(['q4_0','q5_0','q8_0','f16']);
    expect(pf.params_boolean).toEqual(['jinja','reasoning_preserve','no_reasoning_preserve','metrics']); // #14：metrics 声明为 boolean

    expect(pf.params_file).toEqual(['m','mmproj','chat_template_file','md']);
    // md（--spec-draft-model）紧随 spec_draft_n_max 之后，params_file 类型
    expect(pf.params['md']).toBe('-md');
    expect(pk[pk.indexOf('spec_draft_n_max') + 1]).toBe('md'); // pk 见上文 image_min_tokens 断言
    // ngld（--spec-draft-ngl，draft 模型 GPU 层数）紧随 md 之后，普通数值参数
    expect(pf.params['ngld']).toBe('-ngld');
    expect(pk[pk.indexOf('md') + 1]).toBe('ngld');
  });

  it('language_round_trips_and_survives_incremental_saves', () => {
    const p = tmpPath('app_lang.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', language: 'en' });
    expect(appConfigLoad(p).language).toBe('en');
    // 增量保存（saveLlamaDir / saveProxy 均基于 ...cfg）不得丢语言
    saveLlamaDir(p, '/y');
    expect(appConfigLoad(p).language).toBe('en');
    expect(appConfigLoad(p).llama_dir).toBe('/y');
    rm(p);
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

  it('repo_params_includes_params_default_and_fit_options', () => {
    const pf = repoParams();
    expect(pf.params_default).toEqual({ port: '9931', fit: 'off' });
    expect(pf.params_options?.fit).toEqual(['off', 'on']);
    expect(pf.params_boolean ?? []).not.toContain('fit');
  });

  it('params_yaml_roundtrip_preserves_params_default', () => {
    const p = tmpPath('params_default_rt.yaml');
    rm(p);
    writeText(p, repoParamsText());
    const pf = paramsLoad(p);
    expect(pf.params_default).toEqual({ port: '9931', fit: 'off' });
    expect(pf.params_options?.fit).toEqual(['off', 'on']);
    rm(p);
  });

  it('save_config_backfills_missing_params_defaults', () => {
    // 存量模板缺 port/fit → 保存时自动补默认值（用户已设的 port 不覆盖）
    const p = tmpPath('cfg_backfill.yaml');
    rm(p);
    saveConfigEntry(p, 'old', '存量', { m: 'x.gguf', port: '8080' }, repoParams());
    const map = configsLoad(p);
    expect(map.old.values['port']).toBe('8080'); // 已有用户值保留
    expect(map.old.values['fit']).toBe('off');   // 缺失 fit → 默认补齐
    rm(p);
  });

  it('save_config_backfill_keeps_user_set_fit', () => {
    // 用户显式 fit=on → 不覆盖；缺失的 port 补默认
    const p = tmpPath('cfg_backfill2.yaml');
    rm(p);
    saveConfigEntry(p, 'u', '用户', { m: 'x.gguf', fit: 'on' }, repoParams());
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

describe('proxy 节（2026-09-18 分组格式）', () => {
  it('无 proxy 节 → undefined', () => {
    const p = tmpPath('app_proxy_legacy.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x');
    const cfg = appConfigLoad(p);
    expect(cfg.proxy).toBeUndefined();
    expect(cfg.llama_dir).toBe('/x');
    rm(p);
  });

  it('save 后 proxy 节持久化', () => {
    const p = tmpPath('app_proxy.yaml');
    rm(p);
    const cfg = { llama_dir: '/x', proxy: { host: '127.0.0.1', port: 10808 } };
    appConfigSave(p, cfg);
    const loaded = appConfigLoad(p);
    expect(loaded.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    rm(p);
  });

  it('yaml 字面格式：proxy 嵌套节（host/port 缩进在节内）', () => {
    const p = tmpPath('app_proxy_literal.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', proxy: { host: '127.0.0.1', port: 10808 } });
    const s = require('node:fs').readFileSync(p, 'utf8');
    expect(s).toContain('proxy:\n  host: 127.0.0.1\n  port: 10808');
    expect(s).not.toContain('proxy_host');
    rm(p);
  });

  it('yaml 字面格式：update 嵌套节（last_llama_type 在节内）', () => {
    const p = tmpPath('app_update_literal.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'Windows x64 (CUDA 13)' } });
    const s = require('node:fs').readFileSync(p, 'utf8');
    expect(s).toContain('update:\n  last_llama_type:');
    expect(s).not.toContain('llama_update');
    expect(s).not.toContain('last_version_type');
    rm(p);
  });
});

// mtime 哨兵（spec V1）：钉到 1970 后任何一次落盘都会把 mtimeMs 推回 now → 「未变化不写盘」才有牙
function pinMtime(p: string): void { require('node:fs').utimesSync(p, new Date(0), new Date(0)); }
function mtime(p: string): number { return require('node:fs').statSync(p).mtimeMs; }

describe('saveProxy', () => {
  it('host+port 合法 → trim 后写回', () => {
    const p = tmpPath('saveproxy_ok.yaml');
    rm(p);
    const { cfg } = saveProxy(p, '127.0.0.1 ', ' 10808 ');
    expect(cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    rm(p);
  });
  it('两参均空 → 清除代理（整节消失）', () => {
    const p = tmpPath('saveproxy_clear.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', proxy: { host: 'h', port: 1 } });
    const { cfg } = saveProxy(p, '  ', '');
    expect(cfg.proxy).toBeUndefined();
    rm(p);
  });
  it('host 非空 port 空 → throw 端口不能为空', () => {
    const p = tmpPath('saveproxy_noport.yaml');
    rm(p);
    expect(() => saveProxy(p, '127.0.0.1', '')).toThrow('端口不能为空');
    // P8 的「不写」半边：校验先于判定，throw 路径不得创建/改动文件
    expect(require('node:fs').existsSync(p)).toBe(false);
    rm(p);
  });
  it('port 非法（0 / 99999 / abc）→ throw', () => {
    const p = tmpPath('saveproxy_badport.yaml');
    rm(p);
    expect(() => saveProxy(p, 'h', '0')).toThrow('端口须为 1–65535');
    expect(() => saveProxy(p, 'h', '99999')).toThrow('端口须为 1–65535');
    expect(() => saveProxy(p, 'h', 'abc')).toThrow('端口须为 1–65535');
    // P8 的「不写」半边：三次非法端口均未落盘，文件从未被创建
    expect(require('node:fs').existsSync(p)).toBe(false);
    rm(p);
  });

  it('P8 文件已有合法代理 + 只填一半 → throw 且既有文件的 mtime 与字节均未动', () => {
    // 挡住「先写后校验」的实现：throw 之前不得把半成品（proxy 节被抹掉）写进已存在的文件
    const p = tmpPath('saveproxy_half_input_noop.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', proxy: { host: '127.0.0.1', port: 10808 } });
    pinMtime(p);
    const before = require('node:fs').readFileSync(p, 'utf8');
    expect(() => saveProxy(p, '127.0.0.1', '')).toThrow('端口不能为空');
    expect(mtime(p)).toBe(0);
    expect(require('node:fs').readFileSync(p, 'utf8')).toBe(before);
    rm(p);
  });

  it('P8 文件已有合法代理 + 端口越界（99999 / 0）→ throw 且既有文件的 mtime 与字节均未动', () => {
    // 补 P8「不写」半边的**端口范围**分支：上面「port 非法」用例跑在**不存在的文件**上
    // （只断言 existsSync === false），带 mtime + 字节逐字哨兵的版本只走「只填一半」
    // （err.config.proxyPortEmpty）。于是「先 appConfigSave 落盘、后校验端口范围」的实现
    // 在两者上都照样绿——本用例挡住它：越界端口必须在落盘前 throw，既有文件分毫不动。
    const p = tmpPath('saveproxy_badport_noop.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', proxy: { host: '127.0.0.1', port: 10808 } });
    pinMtime(p);
    const before = require('node:fs').readFileSync(p, 'utf8');
    for (const bad of ['99999', '0']) {
      expect(() => saveProxy(p, '127.0.0.1', bad)).toThrow('端口须为 1–65535');
      // 逐次核对：越界端口每一次都必须停在落盘之前（mtime 哨兵 + 字节逐字 + 读回原代理）
      expect(mtime(p), bad).toBe(0);
      expect(require('node:fs').readFileSync(p, 'utf8'), bad).toBe(before);
      expect(appConfigLoad(p).proxy, bad).toEqual({ host: '127.0.0.1', port: 10808 });
    }
    rm(p);
  });

  it('P4 同值再保存 → changed=false 且不写盘（mtime 哨兵）', () => {
    const p = tmpPath('saveproxy_noop.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    pinMtime(p);
    const r = saveProxy(p, '127.0.0.1', '10808');
    expect(r.changed).toBe(false);
    expect(r.cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(mtime(p)).toBe(0);
    rm(p);
  });

  it('P1 文件无 proxy 节 + 输入均空 → changed=false 且不写盘', () => {
    const p = tmpPath('saveproxy_noop_clear.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    const r = saveProxy(p, '  ', '');
    expect(r.changed).toBe(false);
    expect(r.cfg.proxy).toBeUndefined();
    expect(mtime(p)).toBe(0);
    rm(p);
  });

  it('P2 proxy: {} 与无节等价 → 输入均空 changed=false', () => {
    const p = tmpPath('saveproxy_emptyshell.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nproxy: {}\n');
    pinMtime(p);
    const r = saveProxy(p, '', '');
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    // cfg.proxy 是**文件原样**（{}），不是归一化后的 undefined：归一只发生在比较内部，不回写 cfg。
    // 调用方只能凭 changed 决定是否记日志，不得把 cfg.proxy 当「已归一的当前代理」用（spec H8）。
    expect(r.cfg.proxy).toEqual({});
    rm(p);
  });

  it('P2 只有 host 的畸形节 + 输入均空 → changed=false 且不写盘', () => {
    // H8：proxy 节缺 port 与 proxy: {}、无节三者语义相同（都归一为直连）→ 输入均空不算变化
    const p = tmpPath('saveproxy_hostonly_shell.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nproxy:\n  host: h\n');
    pinMtime(p);
    const r = saveProxy(p, '', '');
    expect(r.changed).toBe(false);
    expect(r.cfg.proxy).toEqual({ host: 'h' }); // 原样返回，未被归一化抹平
    expect(mtime(p)).toBe(0);
    expect(require('node:fs').readFileSync(p, 'utf8')).toBe('llama_dir: /x\nproxy:\n  host: h\n');
    rm(p);
  });

  it('P2 port 为 0 的畸形节 + 输入均空 → changed=false 且不写盘', () => {
    // H8：port 越界（0）与 proxy: {}、只有 host、无节四者语义相同（都归一直连）→ 输入均空不算变化
    const p = tmpPath('saveproxy_port0_shell.yaml');
    rm(p);
    const raw = 'llama_dir: /x\nproxy:\n  host: h\n  port: 0\n';
    writeText(p, raw);
    pinMtime(p);
    const r = saveProxy(p, '', '');
    expect(r.changed).toBe(false);
    expect(r.cfg.proxy).toEqual({ host: 'h', port: 0 }); // 原样返回，未被归一化抹平（spec H8）
    expect(mtime(p)).toBe(0);
    expect(require('node:fs').readFileSync(p, 'utf8')).toBe(raw);
    rm(p);
  });

  it('P2 port 写成字符串 "10808" 的畸形节 + 输入均空 → changed=false 且不写盘', () => {
    // normalizeProxy 的 typeof p?.port === 'number' 一支：yaml 里 port 带引号 → 不是 number → 与无节同义
    const p = tmpPath('saveproxy_portstring_shell.yaml');
    rm(p);
    const raw = 'llama_dir: /x\nproxy:\n  host: h\n  port: "10808"\n';
    writeText(p, raw);
    pinMtime(p);
    const r = saveProxy(p, '', '');
    expect(r.changed).toBe(false);
    // 读取侧不做类型归一：cfg.proxy 原样带字符串 port，只有比较内部才归一
    expect((r.cfg as { proxy?: unknown }).proxy).toEqual({ host: 'h', port: '10808' });
    expect(mtime(p)).toBe(0);
    expect(require('node:fs').readFileSync(p, 'utf8')).toBe(raw);
    rm(p);
  });

  it('H6 镜像：文件只有 host 的畸形节 + 本次输入完整 → changed=true 且落盘为完整代理', () => {
    // 畸形节归一直连，与「完整代理」不同 → 必须判变化，并把畸形节整节覆盖为新代理
    const p = tmpPath('saveproxy_malformed_to_full.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nproxy:\n  host: h\n');
    const r = saveProxy(p, 'proxy.example.com', '8080');
    expect(r.changed).toBe(true);
    expect(r.cfg.proxy).toEqual({ host: 'proxy.example.com', port: 8080 });
    expect(appConfigLoad(p).proxy).toEqual({ host: 'proxy.example.com', port: 8080 });
    rm(p);
  });

  it('P5 端口写成 010808 → 归一后同值，changed=false 且文件仍是 10808', () => {
    const p = tmpPath('saveproxy_leadingzero.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    pinMtime(p);
    const r = saveProxy(p, ' 127.0.0.1 ', '010808');
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(appConfigLoad(p).proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    rm(p);
  });

  it('P3 缺节 → 有值 = 变化：changed=true 且写入', () => {
    const p = tmpPath('saveproxy_add.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    const r = saveProxy(p, '127.0.0.1', '10808');
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    rm(p);
  });

  it('P6 改端口 = 变化：changed=true 且覆盖为新值', () => {
    const p = tmpPath('saveproxy_change.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    const r = saveProxy(p, '127.0.0.1', '7890');
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).proxy).toEqual({ host: '127.0.0.1', port: 7890 });
    rm(p);
  });

  it('P6 只改 host 不改 port = 变化：changed=true 且覆盖为新 host', () => {
    // sameProxy 的 host 分支：port 相同不足以判「未变」，host 不同即变化
    const p = tmpPath('saveproxy_change_host.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    const r = saveProxy(p, 'proxy.example.com', '10808');
    expect(r.changed).toBe(true);
    expect(r.cfg.proxy).toEqual({ host: 'proxy.example.com', port: 10808 });
    expect(appConfigLoad(p).proxy).toEqual({ host: 'proxy.example.com', port: 10808 });
    rm(p);
  });

  it('P7 有值 → 空 = 变化：changed=true 且 proxy 节从文件消失', () => {
    const p = tmpPath('saveproxy_clear_real.yaml');
    rm(p);
    saveProxy(p, '127.0.0.1', '10808');
    const r = saveProxy(p, '', '');
    expect(r.changed).toBe(true);
    expect(require('node:fs').readFileSync(p, 'utf8')).not.toContain('proxy');
    rm(p);
  });
});

describe('saveLanguage', () => {
  it('L1 文件缺 language 键 → changed=true 且写入（spec H6）', () => {
    const p = tmpPath('lang_add.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    const r = saveLanguage(p, 'zh');
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).language).toBe('zh');
    rm(p);
  });

  it('L2 同值 → changed=false 且不写盘（mtime 哨兵）', () => {
    const p = tmpPath('lang_noop.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', language: 'zh' });
    pinMtime(p);
    const r = saveLanguage(p, 'zh');
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    rm(p);
  });

  it('L3 不同值 → changed=true 且写入，其余节（llama_dir/vram/proxy/update）全部原样保留', () => {
    // 增量保存的完整契约：saveLanguage 只能改 language 一个键，多节夹具逐项核对
    const p = tmpPath('lang_change.yaml');
    rm(p);
    appConfigSave(p, {
      llama_dir: '/x',
      language: 'zh',
      vram_total_gb: 24,
      proxy: { host: '127.0.0.1', port: 10808 },
      update: { last_llama_type: 'Windows x64 (CUDA 12)' },
    });
    const r = saveLanguage(p, 'en');
    expect(r.changed).toBe(true);
    const cfg = appConfigLoad(p);
    expect(cfg.language).toBe('en');
    expect(cfg.llama_dir).toBe('/x');
    expect(cfg.vram_total_gb).toBe(24);
    expect(cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(cfg.update).toEqual({ last_llama_type: 'Windows x64 (CUDA 12)' });
    rm(p);
  });
});

describe('saveLlamaDir', () => {
  it('save 后 llama_dir 持久化（trim）', () => {
    const p = tmpPath('savedir_ok.yaml');
    rm(p);
    saveLlamaDir(p, ' C:\\llama ');
    expect(appConfigLoad(p).llama_dir).toBe('C:\\llama');
    rm(p);
  });

  it('增量保存：不破坏 proxy / vram_total_gb / update 节', () => {
    // 2026-09-14 bug 回归：旧 save_llama_dir 用全新 {llama_dir} 对象 appConfigSave
    // 全量重写 yaml → proxy/vram_total_gb/update 全被清空。
    // 修复后必须 load→改→save，其余字段原样保留。
    const p = tmpPath('savedir_preserve.yaml');
    rm(p);
    appConfigSave(p, {
      llama_dir: 'C:\\old',
      vram_total_gb: 24,
      proxy: { host: '127.0.0.1', port: 10808 },
      update: { last_llama_type: 'Windows x64 (CUDA 12)' },
    });
    saveLlamaDir(p, 'C:\\new');
    const cfg = appConfigLoad(p);
    expect(cfg.llama_dir).toBe('C:\\new');
    expect(cfg.vram_total_gb).toBe(24);
    expect(cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(cfg.update).toEqual({ last_llama_type: 'Windows x64 (CUDA 12)' });
    rm(p);
  });


  it('文件不存在 → 首次创建并写入', () => {
    const p = tmpPath('savedir_missing.yaml');
    rm(p);
    saveLlamaDir(p, 'D:\\llama');
    expect(appConfigLoad(p).llama_dir).toBe('D:\\llama');
    rm(p);
  });

  


  it('en: MISSING/VALIDATION 前缀保留、后缀英文', () => {
    applyLang('en');
    expect(() => configsLoad('D:/nope/llama_launch_configs.yaml')).toThrow(
      /^MISSING: llama_launch_configs\.yaml not found/,
    );
    expect(validateConfigId('Bad_Id')).toBe(false);
    expect(() => saveConfigEntry('tmp.yaml', 'Bad_Id', { values: {} })).toThrow(/^VALIDATION: id must be an alphanumeric/);
    applyLang('zh');
  });

});

describe('en prefix retention', () => {
  it('en: MISSING prefix preserved', () => {
    applyLang('en');
    expect(() => configsLoad('D:/nope/llama_launch_configs.yaml')).toThrow(/^MISSING/);
    applyLang('zh');
  });
});

describe('saveLlamaUpdateConfig', () => {
  const bytes = (p: string): string => require('node:fs').readFileSync(p, 'utf8');

  it('U1 文件无 update 节 + 有值 → changed=true 且写入该节', () => {
    const p = tmpPath('upd_u1.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'Windows x64 (CUDA 13)' });
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'Windows x64 (CUDA 13)' });
    expect(mtime(p)).not.toBe(0);
    rm(p);
  });

  it('U2 同值 → changed=false，文件与 mtime 都不动', () => {
    const p = tmpPath('upd_u2.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'A' } });
    pinMtime(p);
    const before = bytes(p);
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'A' });
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe(before);
    rm(p);
  });

  it('U3 不同值 → changed=true 且覆盖为新值', () => {
    const p = tmpPath('upd_u3.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'A' } });
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'B' });
    expect(r.changed).toBe(true);
    expect(r.cfg.update).toEqual({ last_llama_type: 'B' });
    expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'B' });
    rm(p);
  });

  it('U4 opts 不含该键 → changed=false 且不出现 update: {}（D4/F2）', () => {
    const p = tmpPath('upd_u4.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    const r = saveLlamaUpdateConfig(p, {});
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).not.toContain('update');
    rm(p);
  });

  it('U4b 文件已有 update.last_llama_type + opts 不含该键 → changed=false，该节原样保留（D4：缺键 = 不触碰，绝不删节）', () => {
    // U4 的「文件当前 = 任意」半边：既有 U4 只跑「文件无 update 节」，缺键被实现成
    // target = undefined 时它照样绿。文件里真有值时，缺键若走「清除」分支就会把整个 update 节删掉。
    const p = tmpPath('upd_u4b.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'A' } });
    pinMtime(p);
    const before = bytes(p);
    const r = saveLlamaUpdateConfig(p, {});
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe(before);
    expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'A' });
    rm(p);
  });

  it('U4c 非字符串入参（null/数字/布尔/对象）→ changed=false，该节原样保留（与缺键同口径）', () => {
    // IPC 参数是未类型化的 JSON：null/数字都进得来。它们与缺键一样是「没有有效值」，
    // 不是「清除」——只有空串（字符串）才清除（D5）。
    for (const v of [null, 42, true, { x: 1 }] as unknown[]) {
      const p = tmpPath('upd_u4c.yaml');
      rm(p);
      appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'A' } });
      pinMtime(p);
      const before = bytes(p);
      expect(saveLlamaUpdateConfig(p, { last_llama_type: v as unknown as string }).changed).toBe(false);
      expect(mtime(p)).toBe(0);
      expect(bytes(p)).toBe(before);
      expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'A' });
      rm(p);
    }
  });

  it('U4d opts 本身是 null/undefined → changed=false 且不抛（旧代码在此解引用会 TypeError → 记 saveFail）', () => {
    for (const opts of [null, undefined]) {
      const p = tmpPath('upd_u4d.yaml');
      rm(p);
      appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'A' } });
      pinMtime(p);
      const before = bytes(p);
      expect(saveLlamaUpdateConfig(p, opts as unknown as { last_llama_type?: string }).changed).toBe(false);
      expect(mtime(p)).toBe(0);
      expect(bytes(p)).toBe(before);
      rm(p);
    }
  });

  it('U5 有值 + 空串 → changed=true 且整个 update 节从文件消失（D5/F11）', () => {
    const p = tmpPath('upd_u5.yaml');
    rm(p);
    appConfigSave(p, {
      llama_dir: '/x',
      vram_total_gb: 24,
      proxy: { host: '127.0.0.1', port: 10808 },
      language: 'zh',
      update: { last_llama_type: 'A' },
    });
    const r = saveLlamaUpdateConfig(p, { last_llama_type: '' });
    expect(r.changed).toBe(true);
    expect(bytes(p)).not.toContain('update');
    expect(appConfigLoad(p).update).toBeUndefined();
    // V2 说的是「任何分支」：清除分支同样不得丢其它节（cfg.update = undefined 只删这一节）
    const cfg = appConfigLoad(p);
    expect(cfg.llama_dir).toBe('/x');
    expect(cfg.vram_total_gb).toBe(24);
    expect(cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(cfg.language).toBe('zh');
    rm(p);
  });

  it('U6 文件已是 update: {} + 空串或无键 → changed=false 且垃圾节原样保留', () => {
    const p = tmpPath('upd_u6.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nupdate: {}\n');
    pinMtime(p);
    expect(saveLlamaUpdateConfig(p, { last_llama_type: '' }).changed).toBe(false);
    expect(saveLlamaUpdateConfig(p, {}).changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe('llama_dir: /x\nupdate: {}\n');
    rm(p);
  });

  it('U7 文件已是 update: {} + 有值 → changed=true 且写入该节', () => {
    const p = tmpPath('upd_u7.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nupdate: {}\n');
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'A' });
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'A' });
    rm(p);
  });

  it('update 节是标量（手工编辑的坏 yaml）→ 覆盖为对象，不写出字符键', () => {
    // 坏数据 update: foo：把字符串展开成 {0:'f',1:'o',2:'o'} 会落盘成 "0": f 这类垃圾键。
    // LlamaUpdateConfig 只有 last_llama_type 一个字段（F4），展开保留不了任何真实字段。
    const p = tmpPath('upd_scalar.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nupdate: foo\n');
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'A' });
    expect(r.changed).toBe(true);
    const s = bytes(p);
    expect(s).not.toMatch(/^\s*["']?0["']?:/m); // 行首的字符键（yaml 把字符串展开成 "0": f）
    expect(s).not.toContain('foo');
    expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'A' });
    rm(p);
  });

  it('变化分支不丢其它节（V2）', () => {
    const p = tmpPath('upd_keep.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', vram_total_gb: 24, proxy: { host: '127.0.0.1', port: 10808 }, language: 'zh' });
    expect(saveLlamaUpdateConfig(p, { last_llama_type: 'B' }).changed).toBe(true);
    const cfg = appConfigLoad(p);
    expect(cfg.llama_dir).toBe('/x');
    expect(cfg.vram_total_gb).toBe(24);
    expect(cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(cfg.language).toBe('zh');
    rm(p);
  });
});

describe('saveVramTotal', () => {
  const bytes = (p: string): string => require('node:fs').readFileSync(p, 'utf8');

  it('W1 文件无该键 + 24 → changed=true 且写入', () => {
    const p = tmpPath('vram_w1.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    expect(saveVramTotal(p, 24).changed).toBe(true);
    expect(appConfigLoad(p).vram_total_gb).toBe(24);
    expect(mtime(p)).not.toBe(0);
    rm(p);
  });

  it('W2 同值 → changed=false，文件与 mtime 都不动', () => {
    const p = tmpPath('vram_w2.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', vram_total_gb: 24 });
    pinMtime(p);
    const before = bytes(p);
    expect(saveVramTotal(p, 24).changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe(before);
    rm(p);
  });

  it('W3 已有值 + 0/NaN/Infinity → changed=true 且该键从文件消失（D6）', () => {
    for (const gb of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = tmpPath('vram_w3.yaml');
      rm(p);
      appConfigSave(p, { llama_dir: '/x', vram_total_gb: 24 });
      expect(saveVramTotal(p, gb).changed).toBe(true);
      expect(bytes(p)).not.toContain('vram_total_gb');
      expect(appConfigLoad(p).vram_total_gb).toBeUndefined();
      rm(p);
    }
  });

  it('W4 文件无该键 + 0 → changed=false 且不写', () => {
    const p = tmpPath('vram_w4.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    const before = bytes(p);
    expect(saveVramTotal(p, 0).changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe(before);
    rm(p);
  });

  it('变化分支不丢其它节（V2）', () => {
    const p = tmpPath('vram_keep.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', proxy: { host: '127.0.0.1', port: 10808 }, language: 'en', update: { last_llama_type: 'A' } });
    expect(saveVramTotal(p, 16).changed).toBe(true);
    const cfg = appConfigLoad(p);
    expect(cfg.llama_dir).toBe('/x');
    expect(cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(cfg.language).toBe('en');
    expect(cfg.update).toEqual({ last_llama_type: 'A' });
    rm(p);
  });
});
