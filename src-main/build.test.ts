import { describe, it, expect } from 'vitest';
import { buildArgVector, prepareLaunch, summarize } from './build';
import type { ParamsFile, ConfigEntry } from './config';
import { tmpPath, rm, writeText, mkDir, jp } from './test-utils';

const pf: ParamsFile = {
  params: { m: '-m', mmproj: '--mmproj', port: '--port' },
  required: ['m'],
};

function entry(pairs: Array<[string, string]>): ConfigEntry {
  return { values: Object.fromEntries(pairs) };
}

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
});
