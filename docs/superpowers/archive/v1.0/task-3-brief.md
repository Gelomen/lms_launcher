### 任务 3：build.ts（TDD，6 测试）

**文件：**
- 修改：`src-main/test-utils.ts`（追加 `mkDir` 已含于任务 2 步骤 1）
- 创建：`src-main/build.ts`、`src-main/build.test.ts`

本任务是 Rust `build.rs` 的 TS 移植——6 个测试语义原样移植（Rust 侧 6/6 PASS）。

- [ ] **步骤 1：写失败的测试（src-main/build.test.ts）**

~~~ ts
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
~~~

- [ ] **步骤 2：运行验证失败**

~~~ powershell
npx vitest run src-main/build.test.ts
~~~

预期：FAIL —— Cannot find module ./build。

- [ ] **步骤 3：实现 build.ts**

~~~ ts
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
  for (const [k, v] of Object.entries(entry.values)) {
    if (v.trim().length === 0) continue;
    const flag = pf.params[k];
    if (flag === undefined) throw new Error(`VALIDATION: 参数 "${k}" 不在 llama_params.yaml 的映射表里`);
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
  return Object.entries(e.values)
    .filter(([, v]) => v.trim().length > 0)
    .filter(([k]) => pf.params[k] !== undefined)
    .map(([k, v]) => `${pf.params[k]} ${quoted(v.trim())}`)
    .join(' ');
}
~~~

- [ ] **步骤 4：运行验证通过**

~~~ powershell
npx vitest run src-main/build.test.ts
~~~

预期：6 PASS。

- [ ] **步骤 5：Commit**

~~~ bash
git add src-main/build.ts src-main/build.test.ts
git commit -m "feat: 命令行拼装 TS 移植——引号/空值跳过/必填校验（6 测试）"
~~~

---
