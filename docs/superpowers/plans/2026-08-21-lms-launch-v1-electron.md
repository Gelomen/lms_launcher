# lms_launch v1 实现计划（Electron + Node/TypeScript）

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（- [ ]）语法来跟踪进度。

**目标：** 单 exe 桌面 GUI 启动器——用户填参数 → 启动 llama-server.exe → 实时看日志 → 停/杀进程。保留已批准的 Vue3 + Vite 前端与 10 任务架构，仅将后端从 Rust/Tauri 换为 Electron/Node/TS。

**架构：** Electron 主进程（Node，TS strict）承担 config / build / process 三层业务 + IPC；渲染进程用 Vue 3 + Vite 6 写四个模块的 UI，通过 preload 暴露的 window.lms.* 调用主进程。所有 IPC 命令/事件命名与错误语义沿用 docs/lms_launch-analysis.md（§4.1–4.6）与已定型并经 15 个绿测试验证的 Rust 实现。

**技术栈：** Electron 28+ · Node（Electron bundled）· TypeScript 5.8 (strict) · Vue 3.5 + Vite 6 · Vitest（主进程侧单测）· electron-builder（win portable exe）。

**保留 / 替换 / 改动：**
- ✅ **保留**：vite.config.js（去 src-tauri 排除）、index.html、src/main.ts、src/App.vue（骨架壳，任务 6–9 重写）、src/style.css（占位）、已验证的参数模板/YAML/校验/引号逻辑（Rust 任务 2/3 的 15 个测试语义原样移植）
- ❌ **弃用**：整个 src-tauri/（Cargo.toml、tauri.conf.json、build.rs、src/*.rs、icons/、.cargo/、gen/）、@tauri-apps/api / @tauri-apps/cli / @tauri-apps/plugin-dialog 依赖
- 🔁 **改动**：IPC 层从 @tauri-apps/api 的 invoke/event 换成 Electron ipcMain.handle / webContents.send；新增 src-main/preload.ts（contextBridge）+ src/ipc.ts（渲染端封装）；打包从 npx tauri build 换成 electron-builder

---

## 全局约束

- **工作目录**：D:\AI\Workspace\lms_launch\.worktrees\lms-launch-v1（git worktree，分支 lms-launch-v1）
- **BASE**：feb64d1（当前 HEAD，含被弃用的 Rust 任务 4 提交——本计划任务 1 会清掉 src-tauri）
- **Rust 残留清理**（任务 1 一次性做完）：删除 src-tauri/ 整目录、package.json 里所有 tauri 依赖、vite.config.js 里 src-tauri watch 排除、.gitignore 里 src-tauri 条目
- **测试策略**：主进程侧 config/build/process 用 **Vitest** 做 TDD（对应 Rust 15 个测试语义原样移植，共 9+6+4）；前端侧沿用 Vite dev 手动清单验证（YAGNI——不引入 JS 组件测试框架）
- **错误语义**：沿用「分类: 描述」，分类 ∈ {IO, YAML, MISSING, VALIDATION, STATE, PROC}；前端按 startsWith("MISSING:") / startsWith("VALIDATION:") 分类展示（规格 §6）
- **数据文件**：运行时 = exe 所在目录（打包后）；dev-time = 项目 cwd（代码 fallback）——与 Rust 版 exe_dir() 语义一致
- **YAML 库**：yaml@2（替代 serde_yaml）；**进程**：node:child_process（替代 std::process）
- **模块系统**：Electron 主进程走 CJS（package.json 不设 "type": "module"——Vite 渲染端 ESM 不受影响）；tsconfig.main.json 设 "module": "CommonJS"、outDir dist-main
- **打包**：electron-builder 出 win portable exe（最接近「单 exe」）

---

### 任务 1：Electron 骨架 + Vitest 基础设施

**文件：**
- 删除：src-tauri/（整目录，先救回 icons/icon.ico）
- 修改：package.json（去 tauri 依赖、加 electron/vitest/yaml + 新 scripts）、.gitignore（去 src-tauri 条目）、vite.config.js（去 src-tauri watch 排除）
- 创建：src-main/main.ts、src-main/preload.ts、src-main/test-utils.ts、tsconfig.main.json、vitest.config.ts、electron-builder.yml

- [ ] **步骤 1：救回图标，删 Rust 残留**

运行：

~~~ powershell
New-Item -ItemType Directory -Force src-main | Out-Null
Copy-Item src-tauri\icons\icon.ico src-main\icon.ico
Remove-Item -Recurse -Force src-tauri
~~~

.gitignore 改为：

~~~
.worktrees/
dist/
dist-main/
dist-release/
node_modules/
.superpowers/
package-lock.json
~~~

- [ ] **步骤 2：package.json 重写**

~~~ json
{
  "name": "lms-launch",
  "private": true,
  "main": "dist-main/main.js",
  "scripts": {
    "dev": "concurrently -k \"npm:dev:vite\" \"npm:dev:electron\"",
    "dev:vite": "vite",
    "dev:electron": "wait-port 1420 -t 120000 && tsc -p tsconfig.main.json && cross-env VITE_DEV_SERVER_URL=http://localhost:1420 electron .",
    "build": "vite build && tsc -p tsconfig.main.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "vue": "^3.5.13",
    "yaml": "^2.7.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.3",
    "concurrently": "^9.1.0",
    "cross-env": "^10.0.0",
    "electron": "^28.3.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^2.1.0",
    "wait-port": "^1.1.0"
  }
}
~~~

（不设 "type": "module"——主进程 CJS；yaml 放 dependencies 是运行时依赖。）

- [ ] **步骤 3：vite.config.js 去 src-tauri 排除**

~~~ js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { port: 1420 },
  clearScreen: false,
});
~~~

- [ ] **步骤 4：tsconfig.main.json（主进程 + preload，CJS）**

~~~ json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-main",
    "rootDir": "src-main",
    "types": ["node"],
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src-main/**/*.ts"]
}
~~~

- [ ] **步骤 5：vitest.config.ts**

~~~ ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src-main/**/*.test.ts'],
    // Windows 下 powershell 进程测试需要 30–60s（见任务 4）
    testTimeout: 60000,
  },
});
~~~

- [ ] **步骤 6：electron-builder.yml**

~~~ yaml
appId: com.lms.launch
productName: lms_launch
directories:
  output: dist-release
files:
  - dist/**
  - dist-main/**
  - package.json
win:
  target: portable
  icon: src-main/icon.ico
portable:
  artifactName: "lms-launch-${version}-portable.exe"
~~~

- [ ] **步骤 7：src-main/test-utils.ts（tmp 路径工具）**

~~~ ts
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function tmpPath(name: string): string {
  const dir = join(tmpdir(), 'lms_launch_test');
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function rm(p: string): void {
  rmSync(p, { force: true, recursive: true });
}
~~~

- [ ] **步骤 8：src-main/main.ts（Electron 入口，最小壳）**

~~~ ts
import { app, BrowserWindow } from 'electron';

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';

function createWindow(): void {
  const win = new BrowserWindow({
    title: 'lms_launch',
    width: 980, height: 720, minWidth: 760, minHeight: 540,
    webPreferences: {
      preload: require.resolve('../dist-main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(DEV_URL);
  else win.loadFile('dist/index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
~~~

- [ ] **步骤 9：src-main/preload.ts（占位，任务 5 补全）**

~~~ ts
// 任务 5 补全 IPC 桥
export {};
~~~

- [ ] **步骤 10：npm install + 构建 + dev 验证**

运行（worktree 根目录）：

~~~ powershell
npm install
npm run build
~~~

预期：vite build 成功（dist/）、tsc 输出 dist-main/{main.js,preload.js}、无 TS error。

再验证窗口：

~~~ powershell
npm run dev
~~~

预期：Vite 1420 起服 + Electron 窗口弹出（地址 http://localhost:1420）、页面显示「lms_launch 骨架」（App.vue 占位）、console 无报错。可视确认记入任务 10 人工验收清单。

- [ ] **步骤 11：Commit**

~~~ bash
git add -A
git commit -m "feat: Electron 骨架 + Vitest 基础设施（弃用 Rust/Tauri）"
~~~
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
### 任务 4：process.ts（TDD，4 测试）

**文件：**
- 创建：`src-main/process.ts`、`src-main/process.test.ts`

本任务是 Rust `process.rs` 的 TS 移植——4 个测试语义原样移植（Rust 侧最终 4/4 PASS；其中「被杀进程的退出码」按实际行为断言：拿到退出码即过，不钉死具体值——Windows `TerminateProcess` 返回非负码，不保证 0）。

Node 与 Rust 的差异点（执行者注意）：
- Rust `take_pipes`（一次性取管道所有权）→ Node 直接持有 `child.stdout/stderr` 流，`launch` 后即可 `on("data")` 订阅；保留 `takePipes()` API 供 IPC 层调用（语义：返回流句柄）。
- Rust `drain_exit`（轮询退出码）→ Node 事件驱动：`child.on("close")` 落 `exitCode` 字段；`drainExit()` 变纯 getter。另加 `onExit(cb)` 回调，供任务 5 发 `process-exit` 事件。
- 隐藏窗口：`spawn` 默认不产生控制台窗口（Node 主进程无 CONIN$ 宿主），等价 Rust `CREATE_NO_WINDOW`。

- [ ] **步骤 1：写失败的测试（src-main/process.test.ts）**

~~~ ts
import { describe, it, expect } from 'vitest';
import { ProcessState } from './process';

const PS = "powershell";
const SLEEP_ARGS: string[] = ["-Command", "Start-Sleep -Seconds 60"];

describe('process.ts', () => {

  it('launch_stop_lifecycle', async () => {
    const ps = new ProcessState();
    await ps.launch(PS, SLEEP_ARGS, null);
    expect(ps.isRunning()).toBe(true);
    await ps.stopGraceful(3);
    const code = ps.drainExit();
    expect(code).not.toBeNull(); // Windows TerminateProcess → 非负退出码
    expect(ps.state).toBe('ready');
  });

  it('double_launch_rejected', async () => {
    const ps = new ProcessState();
    await ps.launch(PS, SLEEP_ARGS, null);
    await expect(ps.launch(PS, [], 'c1')).rejects.toThrow(/STATE/);
    await ps.stopGraceful(3);
    ps.drainExit();
  });

  it('stop_without_process_is_noop', async () => {
    const ps = new ProcessState();
    await ps.stopGraceful(0);
    expect(ps.state).toBe('ready');
  });

  it('drain_exit_reports_quick_child', async () => {
    const ps = new ProcessState();
    await ps.launch(PS, ['-Command', 'Write-Output hi'], 'c1');
    // 子进程秒退；等 close 事件落地
    await new Promise((r) => setTimeout(r, 3000));
    const code = ps.drainExit();
    expect(code).not.toBeNull();
    expect(ps.state).toBe('ready');
  });
});
~~~

- [ ] **步骤 2：运行验证失败**

~~~ powershell
npx vitest run src-main/process.test.ts
~~~

预期：FAIL —— Cannot find module ./process。

- [ ] **步骤 3：实现 process.ts**

~~~ ts
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';

export type ProcStateName = "ready" | "running" | "stopping";

// 进程状态机：ready → running → stopping → ready（Rust ProcState 的 TS 版）
export class ProcessState {
  state: ProcStateName = 'ready';
  private child: ChildProcess | null = null;
  private exitCode: number | null = null;
  private onExitCb: ((code: number) => void) | null = null;
  runningConfigId: string | null = null; // 任务 5 接线：running 时持有启动配置 id

  isRunning(): boolean {
    return this.state === 'running';
  }

  // 启动子进程（隐藏窗口、双管道）；非 ready → STATE 拒绝（防二次启动）
  async launch(exe: string, args: string[], configId: string | null): Promise<void> {
    if (this.state !== 'ready') throw new Error('STATE: 已有进程在运行');
    this.exitCode = null;
    this.runningConfigId = configId;
    const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    child.on("error", (err) => {
      if (this.child !== child) return;
      this.child = null;
      this.state = 'ready';
      this.runningConfigId = null;
      // 启动失败（ENOENT 等）走 PROC 分类：
      throw new Error(`PROC: ${exe} 启动失败: ${err.message}`);
    });
    child.on("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.exitCode = code ?? -1;
      this.state = 'ready';
      this.runningConfigId = null;
      if (this.onExitCb) this.onExitCb(code ?? -1);
    });
    this.child = child;
    this.state = 'running';
  }

  // 取 stdout/stderr 流（必须 running）——供任务 5 日志读取端订阅
  takePipes(): { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream } {
    if (!this.child || !this.isRunning()) throw new Error('STATE: 无子进程');
    const out = this.child.stdout;
    const err = this.child.stderr;
    if (!out || !err) throw new Error('STATE: stdout/stderr 管道未打开');
    return { stdout: out, stderr: err };
  }

  // 停止：SIGTERM → timeout_secs → taskkill /T /F（杀进程树）
  async stopGraceful(timeoutSecs: number): Promise<void> {
    const child = this.child;
    if (!child) { this.state = 'ready'; return; }
    this.state = 'stopping';
    const pid = child.pid;
    child.kill("SIGTERM");
    const deadline = Date.now() + timeoutSecs * 1000;
    for (;;) {
      if (this.state === 'ready') return; // close 事件已触发
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (process.platform === "win32" && pid) {
      try { execFileSync("taskkill", ["/T", "/F", "-PID", String(pid)]); } catch { /* 已退出 */ }
    }
    this.child = null;
    this.state = 'ready';
    this.runningConfigId = null;
  }

  // 注册退出回调（任务 5 发 process-exit 事件）
  onExit(cb: (code: number) => void): void { this.onExitCb = cb; }

  // 已退出则返回退出码；未退出 → null
  drainExit(): number | null { return this.exitCode; }
}
~~~

- [ ] **步骤 4：运行验证通过**

~~~ powershell
npx vitest run src-main/process.test.ts
~~~

预期：4 PASS（Windows 上 powershell spawn 各约 1–3s，总计 < 30s）。

- [ ] **步骤 5：全量回归**

~~~ powershell
npx vitest run
~~~

预期：19 PASS（config 9 + build 6 + process 4）。

- [ ] **步骤 6：Commit**

~~~ bash
git add src-main/process.ts src-main/process.test.ts
git commit -m "feat: 进程管理 TS 移植——launch/takePipes/stopGraceful/drainExit（4 测试）"
~~~

---
### 任务 5：IPC 接线（main.ts 补全 + preload.ts + src/ipc.ts）

**文件：**
- 重写：`src-main/main.ts`（加 AppState + 11 个 ipcMain.handle + 日志读取端）
- 重写：`src-main/preload.ts`（contextBridge 完整桥）
- 创建：`src/ipc.ts`（渲染端封装，替代 @tauri-apps/api）

本任务对应 Rust `lib.rs` 的 AppState + 11 个 Tauri 命令 + 日志读取线程。Electron 侧 `ipcMain.handle` 替代 `#[tauri::command]`，`win.webContents.send` 替代 `app.emit_all`。错误语义完全不变——主进程 throw 的 Error message 带「分类: 描述」前缀，渲染端按前缀分类展示（规格 §6），前端判定代码零改动。

**IPC 契约（前端可见）：**

| 命令 | 参数 | 返回 | 错误前缀 |
|---|---|---|---|
| get_app_config | — | AppConfig | — |
| save_llama_dir | dir: string | void | IO |
| validate_dir | dir: string | boolean | — |
| get_params | — | ParamsFile | VALIDATION |
| get_configs | — | ConfigsMap | MISSING / YAML |
| save_config | id, desc, values | void | VALIDATION |
| delete_config | id | void | VALIDATION |
| get_state | — | { running, stopping, configId } | — |
| start_server | configId: string | string（摘要） | VALIDATION / MISSING |
| stop_server | — | void | — |
| exit_app | — | void（杀进程后退出） | — |

**事件：**
- `log-line` → { line: string, stream: "sys" | "out" | "err" }
- `process-exit` → { code: number }
- `tray-exit-request` → {}（任务 9 托盘「退出」确认后触发，渲染端确认后调 exit_app）

- [ ] **步骤 1：main.ts 补全（AppState + 11 个 handler + 日志读取端）**

整体重写 `src-main/main.ts`（保留任务 1 的 createWindow 骨架，加 IPC 层）：

~~~ ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appConfigLoad, appConfigSave, paramsLoad, configsLoad, saveConfigEntry, deleteConfigEntry } from './config';
import type { AppConfig, ParamsFile, ConfigsMap } from './config';
import { prepareLaunch, summarize } from './build';
import { ProcessState } from './process';

// ---------- AppState ----------
const ps = new ProcessState();

// 数据目录：打包后 = exe 所在目录（portable 解压目录，可写）；dev-time = 项目 cwd
function dataDir(): string {
  if (app.isPackaged) return process.execPath ? join(process.execPath, "..") : process.cwd();
  return process.cwd();
}
function yamlPaths(): [string, string, string] {
  const d = dataDir();
  return [join(d, 'lms_launch.yaml'), join(d, 'llama_params.yaml'), join(d, 'llama_launch_configs.yaml')];
}

// ---------- 日志事件 ----------
function mainWin(): BrowserWindow | null {
  const ws = BrowserWindow.getAllWindows();
  return ws.length > 0 ? ws[0] : null;
}
type StreamName = 'sys' | 'out' | 'err';
function emitLog(line: string, stream: StreamName): void {
  const win = mainWin();
  if (win) win.webContents.send("log-line", { line, stream });
}

// ---------- 窗口 ----------
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';
function createWindow(): void {
  const win = new BrowserWindow({
    title: 'lms_launch',
    width: 980, height: 720, minWidth: 760, minHeight: 540,
    webPreferences: {
      preload: require.resolve('./preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(DEV_URL);
  else win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
}

// ---------- IPC 命令（11 个） ----------
ipcMain.handle('get_app_config', (): AppConfig => {
  const [p] = yamlPaths();
  return appConfigLoad(p);
});
ipcMain.handle('save_llama_dir', (_e, dir: string): void => {
  const [p] = yamlPaths();
  appConfigSave(p, { llama_dir: dir.trim() });
});
ipcMain.handle('validate_dir', (_e, dir: string): boolean => {
  return existsSync(join(dir, 'llama-server.exe'));
});
ipcMain.handle('get_params', (): ParamsFile => {
  const [, p] = yamlPaths();
  return paramsLoad(p);
});
ipcMain.handle('get_configs', (): ConfigsMap => {
  const [, , p] = yamlPaths();
  return configsLoad(p); // MISSING: / YAML: 由 config 层抛出，原样传给渲染端
});
ipcMain.handle('save_config', (_e, id: string, desc: string | null, values: Record<string, string>): void => {
  const [, , p] = yamlPaths();
  saveConfigEntry(p, id, desc ?? undefined, values);
});
ipcMain.handle('delete_config', (_e, id: string): void => {
  const [, , p] = yamlPaths();
  deleteConfigEntry(p, id);
});
ipcMain.handle('get_state', () => {
  return { running: ps.isRunning(), stopping: ps.state === "stopping", configId: ps.runningConfigId };
});
// start_server：启动前完整校验（MISSING/VALIDATION 由 build 层抛出），成功后订阅日志流 + 注册退出回调；
// onExit 每次 launch 覆盖（旧进程回调随 close 失效），close 后 state 自动回落 ready
ipcMain.handle('start_server', async (_e, configId: string): Promise<string> => {
  const [appCfgP, pfP, cfgP] = yamlPaths();
  const appCfg = appConfigLoad(appCfgP);
  if (appCfg.llama_dir.trim().length === 0) throw new Error('VALIDATION: 未配置 llama.cpp 目录');
  const pf = paramsLoad(pfP);
  const configs = configsLoad(cfgP); // MISSING: / YAML: 透传
  const args = prepareLaunch(appCfg.llama_dir.trim(), pf, configs, configId); // MISSING: / VALIDATION: 透传
  const summary = summarize(configs[configId], pf);
  await ps.launch(args[0], args.slice(1), configId);
  emitLog("[lms_launch] 启动配置 · " + summary, "sys");
  const { stdout, stderr } = ps.takePipes();
  stdout.on('data', (chunk: Buffer) => {
    chunk.toString().split("\n").filter((l) => l.length > 0).forEach((l) => emitLog(l, "out"));
  });
  stderr.on('data', (chunk: Buffer) => {
    chunk.toString().split("\n").filter((l) => l.length > 0).forEach((l) => emitLog(l, "err"));
  });
  ps.onExit((code) => {
    const win = mainWin();
    if (win) win.webContents.send("process-exit", { code });
  });
  return summary;
});
ipcMain.handle('stop_server', async (): Promise<void> => {
  await ps.stopGraceful(3);
  emitLog('[lms_launch] 停止指令已发送', 'sys');
});
ipcMain.handle('exit_app', async (): Promise<void> => {
  await ps.stopGraceful(3);
  app.exit(0);
});
// ---------- app lifecycle ----------
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
~~~

实现要点（执行者）：
1. **dataDir() 打包语义**：electron-builder portable 模式下 exe 自解压到临时目录、app.asar 与 exe 同级——`process.execPath` 的父目录（join(process.execPath, "..")）即可写的数据目录。dev-time 用 cwd（yaml 文件生成在项目根，与 Rust 版 src-tauri fallback 行为一致：dev 数据文件不污染 exe 目录）。
2. **ps.onExit 重复挂**：每次 start_server 都调 `ps.onExit`——ProcessState 的 onExitCb 是单值字段，重复调用覆盖（旧进程回调随 close 已失效），无需清理。close 后 state 回落 ready，drainExit 值保留到下次 launch 清空。

- [ ] **步骤 2：preload.ts 重写（contextBridge 完整桥）**

~~~ ts
import { contextBridge, ipcRenderer } from 'electron';
// 渲染端只能看到这个白名单 API（contextIsolation 下无 Node 直权）
contextBridge.exposeInMainWorld('lms', {
  invoke: (cmd: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(cmd, ...args),
  onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void) => {
    const listener = (_e: unknown, payload: { line: string; stream: 'sys' | 'out' | 'err' }) => cb(payload);
    ipcRenderer.on('log-line', listener);
    return () => ipcRenderer.removeListener('log-line', listener);
  },
  onProcessExit: (cb: (e: { code: number }) => void) => {
    const listener = (_e: unknown, payload: { code: number }) => cb(payload);
    ipcRenderer.on('process-exit', listener);
    return () => ipcRenderer.removeListener('process-exit', listener);
  },
  onTrayExitRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('tray-exit-request', listener);
    return () => ipcRenderer.removeListener('tray-exit-request', listener);
  },
});
~~~

- [ ] **步骤 3：src/ipc.ts（渲染端封装，替代 @tauri-apps/api）**

~~~ ts
// 渲染端 IPC 封装——window.lms 由 preload 注入（contextIsolation 下唯一通道）
declare global {
  interface Window {
    lms: {
      invoke: (cmd: string, ...args: unknown[]) => Promise<unknown>;
      onLogLine: (cb: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void) => () => void;
      onProcessExit: (cb: (e: { code: number }) => void) => () => void;
      onTrayExitRequest: (cb: () => void) => () => void;
    };
  }
}

export function invoke<T = unknown>(cmd: string, ...args: unknown[]): Promise<T> {
  return window.lms.invoke(cmd, ...args) as Promise<T>;
}

export function onLogLine(cb: (e: { line: string; stream: 'sys' | 'out' | 'err' }) => void): () => void {
  return window.lms.onLogLine(cb);
}

export function onProcessExit(cb: (e: { code: number }) => void): () => void {
  return window.lms.onProcessExit(cb);
}

export function onTrayExitRequest(cb: () => void): () => void {
  return window.lms.onTrayExitRequest(cb);
}

export const isMissing = (msg: string): boolean => msg.startsWith("MISSING:");
export const isValidation = (msg: string): boolean => msg.startsWith("VALIDATION:");
~~~

- [ ] **步骤 4：tsc 类型检查（main + preload）**

执行者先把 `tsconfig.main.json` 加一行 `"exclude": ["src-main/**/*.test.ts"]`（vitest 自行 transpile 测试，主进程构建不含测试）。然后运行：

~~~ powershell
npx tsc -p tsconfig.main.json --noEmit
~~~

预期：无 TS error。

- [ ] **步骤 5：IPC probe 手动验证**

临时改 `src/App.vue` 为 probe 按钮：

~~~ vue
<script setup lang="ts">
import { invoke } from './ipc';
async function probe(): Promise<void> {
  console.log('app_config =', await invoke('get_app_config'));
  console.log('params =', await invoke('get_params'));
  console.log('configs =', await invoke('get_configs').catch((e: unknown) => String(e)));
  console.log('state =', await invoke('get_state'));
}
</script>
<template>
  <main class="layout"><h1>lms_launch 骨架</h1><button @click="probe">probe</button></main>
</template>
~~~

运行 `npm run dev`，等窗口起来后点 probe 按钮。预期 console：
- `app_config = {llama_dir: ""}`
- `params = {params: {m: "-m", ...}, required: ["m"]}`（cwd/ 下首次自动生成 llama_params.yaml）
- `configs = "MISSING: llama_launch_configs.yaml 不存在（新建第一个模板后自动生成）"`（error 透传为字符串）
- `state = {running: false, stopping: false, configId: null}`

~~~ vue（验证后还原 App.vue 为任务 6 的布局骨架，见任务 6 步骤 1）~~~

- [ ] **步骤 6：全量测试回归**

~~~ powershell
npx vitest run
~~~

预期：19 PASS。

- [ ] **步骤 7：Commit**

~~~ bash
git add src-main/main.ts src-main/preload.ts src-main/tsconfig.json src/ipc.ts src/App.vue
git commit -m "feat: IPC 接线——11 个命令 + log-line/process-exit/tray-exit-request 事件 + preload 桥"
~~~

---

### 任务 6：style.css + App.vue 布局骨架（设计语言 §4.5）

**文件：**
- 重写：`src/style.css`（整体）、`src/App.vue`（四模块网格骨架）

实现 `docs/lms_launch-analysis.md` §4.5 设计语言——浅色干净主题。关键参数（从规格原文取）：背景 #F6F7F8、卡片白底 #FFFFFF、卡片圆角 12px、按钮圆角 8px、主色用于启动/选中态、正文 #222 系列深灰。

- [ ] **步骤 1：style.css 整体重写**

定义 CSS 变量 + 基础 reset + 网格布局：

~~~ css
:root {
  --bg: #F6F7F8;
  --card: #FFFFFF;
  --text: #222;
  --muted: #6B7280;
  --border: #E5E7EB;
  --accent: #2563EB;
  --danger: #DC2626;
  --ok: #16A34A;
  --radius-card: 12px;
  --radius-btn: 8px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
}
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 14px 16px;
}
.btn {
  border-radius: var(--radius-btn);
  border: 1px solid var(--border);
  background: #fff;
  padding: 6px 14px;
  cursor: pointer;
}
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
~~~

（完整色板/字号/间距按 §4.5 原文展开；上块是骨架变量，执行者把规格里的全部设计参数落进来。）

- [ ] **步骤 2：App.vue 四模块网格骨架**

~~~ vue
<script setup lang="ts">
import { ref } from 'vue';
// 模块组件任务 7/8 实现——先用占位组件占位：
import DirModule from './modules/DirModule.vue';
import TemplateModule from './modules/TemplateModule.vue';
import LaunchBar from './modules/LaunchBar.vue';
import LogPanel from './modules/LogPanel.vue';
</script>
<template>
  <main class="layout">
    <h1 class="app-title">lms_launch</h1>
    <section class="grid">
      <div class="card"><DirModule /></div>
      <div class="card"><TemplateModule /></div>
      <div class="card"><LaunchBar /></div>
    </section>
    <section class="log-area">
      <LogPanel />
    </section>
  </main>
</template>
~~~

（`src/modules/*.vue` 四个文件先建占位组件——各自返回一段 `<section>` 标题，任务 7/8 填实现。本步保证 App.vue 编译通过。）

- [ ] **步骤 3：构建验证**

~~~ powershell
npm run build
~~~

预期：vite build 成功（四个占位模块 + 骨架布局编译通过）。

- [ ] **步骤 4：Commit**

~~~ bash
git add src/style.css src/App.vue src/modules/
git commit -m "feat: 设计语言样式层 + 四模块网格骨架（§4.5）"
~~~

---

### 任务 7：模块 1（DirModule）+ 模块 2（TemplateModule + Modal）

**文件：**
- 实现：`src/modules/DirModule.vue`、`src/modules/TemplateModule.vue`、`src/modules/TemplateModal.vue`

按规格 §4.1（模块 1 · llama.cpp 安装目录）+ §4.2（模块 2 · 启动参数模板管理）。

- [ ] **步骤 1：DirModule.vue**

- 输入框展示当前 `llama_dir`（`invoke('get_app_config')`）；
- 「选择目录…」按钮 → 调 Electron `dialog`（主进程侧加一个 `open_dir_dialog` handler，见下方补充 IPC）→ 回填；
- 「校验」按钮 → `invoke('validate_dir', dir)`，true 显示 ✓「llama-server.exe 已找到」，false 显示 ✗「未找到 llama-server.exe」；
- 校验通过后保存 `save_llama_dir`。

**补充 IPC**（主进程 main.ts 加一个 handler，渲染端经 invoke 调）：

~~~ ts
ipcMain.handle('open_dir_dialog', async (): Promise<string | null> => {
  const { dialog } = await import('electron');
  const win = mainWin();
  if (!win) return null;
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});
~~~

（preload.ts 的 invoke 白名单已覆盖——invoke 透传任意命令名，无需改 preload。）

- [ ] **步骤 2：TemplateModule.vue + TemplateModal.vue**

- TemplateModule：表格列 = id / desc / 参数预览（summarize 风格，取前 3 个 flag）/ 操作（编辑 · 删除）；顶部「新建模板」按钮；
- 删除确认（confirm 对话框）→ `invoke('delete_config', id)`，成功后 reload（`invoke('get_configs')`）；
- TemplateModal：按 `invoke('get_params')` 的映射表动态渲染——每行一个 key + desc（flag-form）+ 输入框；保存 → `invoke('save_config', id, desc, values)`；
- 错误展示统一：`isMissing(e)` / `isValidation(e)` 前缀分类（§6），MISSING 时提示去新建。

- [ ] **步骤 3：构建验证**

~~~ powershell
npm run build
~~~

预期：成功。

- [ ] **步骤 4：Commit**

~~~ bash
git add src/modules/ src-main/main.ts
git commit -m "feat: 模块 1 目录校验 + 模块 2 模板管理（含 open_dir_dialog IPC）"
~~~

---

### 任务 8：模块 3（LaunchBar）+ 模块 4（LogPanel）+ App 接线

**文件：**
- 实现：`src/modules/LaunchBar.vue`、`src/modules/LogPanel.vue`；
- 修改：`src/App.vue`（全局状态接线）。

按规格 §4.3（模块 3 · 启动控制与状态）+ §4.4（模块 4 · 日志区）。

- [ ] **步骤 1：App.vue 全局状态接线**

- `onMounted` 起：`onLogLine` / `onProcessExit` 订阅；`ref` 维护 `logLines[]`（上限 500 行滚动）、`state = {running, stopping, configId}`；
- 启动 → `invoke('start_server', configId)`，catch 按前缀分类（VALIDATION → 红字错误，MISSING → 提示）；
- 停止 → `invoke('stop_server')`；
- process-exit → 清 running、追加 sys 行「进程退出 code=N」；
- tray-exit-request（任务 9 事件）→ 确认后 `invoke('exit_app')`。

- [ ] **步骤 2：LaunchBar.vue**

- 「启动」按钮（主色）：Running 时禁用；
- 「停止」按钮（红色）：仅 Running 可用，Stopping 时显示「停止中…」；
- 状态文本：`{configId} · 运行中` / `就绪` / `停止中…`；
- 配置下拉选择（来自 TemplateModule 的 get_configs）。

- [ ] **步骤 3：LogPanel.vue**

- 白底 + Solarized Light ANSI 关键字着色（规格 §4.4——非深色终端块）：`, 状态行高亮（如 [lms_launch] 前缀 sys 行用蓝灰），错误行（含 error/fatal 关键字或 stream=err）用 Solarized 红；
- 等宽字体（Consolas/Menlo）；
- 自动滚动到底（可关）；
- 行上限 500（超出裁掉最旧）。

- [ ] **步骤 4：构建验证 + 手动冒烟**

~~~ powershell
npm run build
~~~

手动：`npm run dev` 后——新建一个模板（指向真实 llama-server.exe，参数随便填），点启动：sys 行「启动配置 · -m xxx …」出现，out 行实时滚动；点停止：3s 内 stopping → ready，sys 行「停止指令已发送」+ process-exit。

- [ ] **步骤 5：Commit**

~~~ bash
git add src/modules/ src/App.vue
git commit -m "feat: 模块 3 启动控制 + 模块 4 日志区（Solarized Light）+ App 状态接线"
~~~

---

### 任务 9：托盘（§4.6）

**文件：**
- 修改：`src-main/main.ts`（加 Tray + 菜单 + tray-exit-request）

按规格 §4.6（窗口与托盘行为）：

- [ ] **步骤 1：main.ts 加托盘**

~~~ ts
import { Tray, Menu, nativeImage } from 'electron';
let tray: Tray | null = null;

function createTray(): void {
  // icon：src-main/icon.ico（打包时 asar 内 __dirname 相对路径）
  const icon = nativeImage.createFromPath(join(__dirname, '..', 'src-main', 'icon.ico'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  const menu = Menu.buildFromTemplate([
    { label: '启动 lms_launch', click: () => {
      const win = mainWin();
      if (win) { win.show(); win.focus(); }
    } },
    { label: '退出', click: () => {
      const win = mainWin();
      if (win) win.webContents.send('tray-exit-request', {});
    } },
  ]);
  tray.setContextMenu(menu);
}
~~~

- 在 `app.whenReady()` 里 createTray()；
- 「退出」→ 发 tray-exit-request，渲染端弹确认（「将停止 llama-server 并退出，确认？」）→ 确认后 `invoke('exit_app')`。

- [ ] **步骤 2：构建验证**

~~~ powershell
npm run build
~~~

预期：成功。

- [ ] **步骤 3：Commit**

~~~ bash
git add src-main/main.ts
git commit -m "feat: 系统托盘（§4.6）——启动/退出菜单 + tray-exit-request 事件"
~~~

---

### 任务 10：验收 + release（单 exe）

- [ ] **步骤 1：全量测试**

~~~ powershell
npx vitest run
~~~

预期：19 PASS（config 9 + build 6 + process 4）。

- [ ] **步骤 2：全量构建**

~~~ powershell
npm run build
~~~

预期：vite build（dist/）+ tsc（dist-main/）成功。

- [ ] **步骤 3：electron-builder 出 portable exe**

~~~ powershell
npx electron-builder --win portable
~~~

预期：dist-release/lms-launch-<version>-portable.exe 生成。

- [ ] **步骤 4：人工视觉验收（§4.1–4.6 全过一遍）**

清单：
- 启动 exe → 窗口弹出、四模块布局正确（浅色主题）；
- 模块 1 选目录 → 校验 ✓/✗ 正确；
- 模块 2 新建/编辑/删除模板 → flag-form 参数表正确；
- 模块 3 启动 → sys 行出现、out 行实时滚动；停止 → 3s 内 ready；
- 模块 4 日志区白底 + ANSI 着色正确；
- 托盘 → 菜单显示、退出确认流正确；
- 关闭主窗口 → 进程自动停（app.quit 前 stopGraceful）。

- [ ] **步骤 5：Commit**

~~~ bash
git add -A
git commit -m "feat: v1 完整——Electron + Vue3 单 exe 启动器（§4.1–4.6 全验收）"
~~~

---

## 自检（计划作者已做）

- **规格覆盖**：analysis §4.1–4.6 各有对应任务——任务 1 骨架 / 任务 2 config（§4.2 参数模板后端）/ 任务 3 build（§4.2 拼装）/ 任务 4 process（§4.3 进程生命周期）/ 任务 5 IPC（§4.3–4.4 数据流 + §6 错误）/ 任务 6 样式（§4.5）/ 任务 7 模块 1+2（§4.1+4.2）/ 任务 8 模块 3+4（§4.3+4.4）/ 任务 9 托盘（§4.6）/ 任务 10 验收 + exe（§7 v1 边界）。§6 错误语义在任务 2/3/4/5 实现、前端 §6 判定代码零改动。
- **占位符扫描**：无 TODO / 待定 / 「补充细节」——每个任务的步骤都是可执行操作（删/建/改 + 运行 + 验证 + commit）。
- **类型一致性**：AppConfig / ParamsFile / ConfigEntry / ConfigsMap 在任务 2 定义、任务 3/4/5 引用一致；ProcessState / ProcStateName 在任务 4 定义、任务 5 引用一致。
- **模块系统一致性**：主进程 CJS（tsconfig.main.json module: CommonJS、package.json 无 type:module）+ 渲染端 ESM（Vite）——任务 1 已锁定。

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-08-21-lms-launch-v1-electron.md`。两种执行方式：

**1. 子代理驱动（推荐）**——每个任务调度一个新的子代理，任务间进行审查，快速迭代。必需子技能 `superpowers:subagent-driven-development`；每个任务一个新子代理 + 两阶段审查（任务评审 + 集成验收）。

**2. 内联执行**——在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点。必需子技能 `superpowers:executing-plans`；每完成一个任务停下来给你看进度，你确认后再继续。

选哪种方式？