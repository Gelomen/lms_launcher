import { describe, it, expect } from 'vitest';
import { buildArgVector, prepareLaunch, summarize, commandLine } from './build';
import type { ParamsFile, ConfigEntry } from './config';
import { tmpPath, rm, writeText, mkDir, jp } from './test-utils';

const pf: ParamsFile = {
  params: { m: '-m', mmproj: '--mmproj', port: '--port' },
  required: ['m'],
};

function entry(pairs: Array<[string, string]>): ConfigEntry {
  return { values: Object.fromEntries(pairs) };
}

const pfV11: ParamsFile = {
  params: {
    m: '-m', jinja: '--jinja', spec_type: '--spec-type', port: '--port',
    n_cpu_moe: '--n-cpu-moe', fit: '--fit', fit_ctx: '--fit-ctx', fit_target: '--fit-target', metrics: '--metrics', // #14
  },
  required: ['m'],
  params_boolean: ['jinja', 'metrics'], // #14：metrics 为无值 flag
  params_options: { spec_type: ['none', 'draft-mtp'] },
};

describe('build.ts', () => {

  it('quotes_path_values_only_when_needed', () => {
    const e = entry([['m', 'D:\\AI\\Models\\a gguf.q8.gguf'], ['port', '9931']]);
    expect(buildArgVector('C:\\x\\llama-server.exe', pf, e)).toEqual([
      'C:\\x\\llama-server.exe',
      '-m',
      '"D:\\AI\\Models\\a gguf.q8.gguf"',
      '--port',
      '9931',
    ]);
  });

  it('empty_values_are_skipped_whole_pair', () => {
    const e = entry([['port', '  '], ['m', 'x.gguf']]);
    expect(buildArgVector('llama-server.exe', pf, e)).toEqual(['llama-server.exe', '-m', 'x.gguf']);
  });

  it('required_empty_rejected_with_flag_name', () => {
    const e = entry([['m', '   ']]);
    expect(() => buildArgVector('llama-server.exe', pf, e)).toThrow(/VALIDATION.*-m/);
  });

  it('unknown_keys_rejected', () => {
    const e = entry([['m', 'x.gguf'], ['zzz', '1']]);
    expect(() => buildArgVector('llama-server.exe', pf, e)).toThrow(/VALIDATION.*zzz/);
  });

  it('prepare_launch_requires_exe_and_config', () => {
    const dir = tmpPath('launchdir');
    rm(dir); mkDir(dir);
    expect(() => prepareLaunch(dir, pf, { c1: entry([['m', 'x.gguf']]) }, 'c1')).toThrow(/MISSING/);
    writeText(jp(dir, 'llama-server.exe'), 'stub');
    expect(() => prepareLaunch(dir, pf, { c1: entry([['m', 'x.gguf']]) }, 'nope')).toThrow(/MISSING/);
    rm(dir);
  });

  it('summarize_uses_flag_form', () => {
    const e = entry([['m', 'D:\\x\\a gguf.q8.gguf'], ['port', '9931']]);
    expect(summarize(e, pf)).toBe('-m "D:\\x\\a gguf.q8.gguf" --port 9931');
  });

  it('boolean_true_writes_flag_only_no_value_pair', () => {
    const e = entry([['m', 'x.gguf'], ['jinja', 'true']]);
    expect(buildArgVector('llama-server.exe', pfV11, e)).toEqual(['llama-server.exe', '-m', 'x.gguf', '--jinja']);
  });

  it('boolean_false_or_empty_is_skipped', () => {
    const e1 = entry([['m', 'x.gguf'], ['jinja', 'false']]);
    expect(buildArgVector('llama-server.exe', pfV11, e1)).toEqual(['llama-server.exe', '-m', 'x.gguf']);
    const e2 = entry([['m', 'x.gguf'], ['jinja', '   ']]);
    expect(buildArgVector('llama-server.exe', pfV11, e2)).toEqual(['llama-server.exe', '-m', 'x.gguf']);
  });

  it('options_value_passthrough_no_validation', () => {
    const e = entry([['m', 'x.gguf'], ['spec_type', 'draft-mtp'], ['port', '9931']]);
    expect(buildArgVector('llama-server.exe', pfV11, e)).toEqual(
      ['llama-server.exe', '-m', 'x.gguf', '--spec-type', 'draft-mtp', '--port', '9931']);
  });

  it('boolean_fallback_literal_treated_as_plain_pair', () => {
    const e = entry([['m', 'x.gguf'], ['jinja', 'yes']]); // 非 true/false 字面量兜底：flag+值
    expect(buildArgVector('llama-server.exe', pfV11, e)).toEqual(['llama-server.exe', '-m', 'x.gguf', '--jinja', 'yes']);
  });

  it('summarize_boolean_true_flag_only_false_or_empty_skipped', () => {
    const e = entry([['m', 'x.gguf'], ['jinja', 'true'], ['port', '9931']]);
    expect(summarize(e, pfV11)).toBe('-m x.gguf --jinja --port 9931');
    const e2 = entry([['m', 'x.gguf'], ['jinja', 'false'], ['port', '9931']]);
    expect(summarize(e2, pfV11)).toBe('-m x.gguf --port 9931');
  });

  it('#14_new_params_build_flag_value_pairs', () => {
    const e = entry([['m', 'x.gguf'], ['n_cpu_moe', '0'], ['fit', 'on'], ['fit_ctx', '128000'], ['fit_target', '1024']]);
    expect(buildArgVector('llama-server.exe', pfV11, e)).toEqual(
      ['llama-server.exe', '-m', 'x.gguf', '--n-cpu-moe', '0', '--fit', 'on', '--fit-ctx', '128000', '--fit-target', '1024']);
  });

  it('#14_metrics_boolean_true_flag_only_false_skipped', () => {
    const on = entry([['m', 'x.gguf'], ['metrics', 'true']]);
    expect(buildArgVector('llama-server.exe', pfV11, on)).toEqual(['llama-server.exe', '-m', 'x.gguf', '--metrics']);
    const off = entry([['m', 'x.gguf'], ['metrics', 'false']]);
    expect(buildArgVector('llama-server.exe', pfV11, off)).toEqual(['llama-server.exe', '-m', 'x.gguf']);
  });

  it('command_line_joins_full_vector_with_single_spaces', () => {
    // launcher 日志行：exe 全路径 + 完整参数向量（含 quoted 值）
    const e = entry([['m', 'x.gguf'], ['port', '9931'], ['jinja', 'true']]);
    const args = buildArgVector('llama-server.exe', pfV11, e);
    expect(commandLine(args)).toBe('llama-server.exe -m x.gguf --port 9931 --jinja');
    const e2 = entry([['m', 'my model.gguf']]);
    const args2 = buildArgVector('llama-server.exe', pf, e2);
    expect(commandLine(args2)).toBe('llama-server.exe -m "my model.gguf"');
  });
});
