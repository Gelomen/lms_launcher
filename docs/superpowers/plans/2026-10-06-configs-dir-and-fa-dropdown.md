# 配置目录收敛与 -fa 下拉化 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把三份 yaml 收敛到 `<dataDir>/configs/`，让 `configs/llama_params.yaml` 成为仓库受控并随包分发的唯一参数表真相源，同时把 `-fa` 从自由文本输入框改为 `auto / on / off` 下拉。

**架构：** 主进程新增 `configDir()`，`yamlPaths()` 改指 `configs/`（唯一构造路径的函数，调用点零改动）；`paramsLoad()` 由「缺失时生成」改为「缺失即抛 MISSING」，代码内置的 `defaultParams()` 全部删除；前端新增参数表缺失的错误提示与按钮禁用，并在弹窗 `fill()` 层对 `fa` 的存量值做回显归一。

**技术栈：** TypeScript、Electron 28、Vue 3 + Vitest（happy-dom）、electron-builder、YAML（`yaml` 包）。

---

## 参考文档

- 设计规格：`docs/superpowers/specs/2026-10-06-configs-dir-and-fa-dropdown-design.md`
- 相关代码：`src-main/config.ts`、`src-main/main.ts`、`src/modules/TemplateModal.vue`、`src/modules/TemplateModule.vue`

## 文件结构

**创建**

| 文件 | 职责 |
|------|------|
| `configs/llama_params.yaml` | 参数表唯一真相源；随包分发的受控资产；新增 flag 只改这里 |
| `docs/superpowers/specs/2026-10-06-configs-dir-and-fa-dropdown-design.md` | 设计规格（已完成） |
| `docs/superpowers/plans/2026-10-06-configs-dir-and-fa-dropdown.md` | 本实现计划 |

**修改**

| 文件 | 改动 |
|------|------|
| `.gitignore` | 根路径三条旧规则 → `configs/` 下的两条用户数据规则 |
| `src-main/config.ts` | 删除 `defaultParams()`；`paramsLoad` 缺文件抛 MISSING |
| `src-main/main.ts` | `configDir()` + `yamlPaths()` 指向 `configs/`；启动早期建目录 |
| `src-main/i18n/dict.ts` | 新增 `err.config.paramsMissing` 与 `tpl.paramsMissing`（中英各一条） |
| `src-main/test-utils.ts` | 新增 `repoParamsText()` / `repoParams()` 夹具 |
| `src-main/config.test.ts` | 改写依赖 `defaultParams()` 的用例；新增缺失与资产守卫用例 |
| `src/modules/TemplateModal.vue` | `fill()` 增加 `fa` 存量值归一 |
| `src/modules/TemplateModal.test.ts` | 夹具换 `repoParams()`；新增 fa 下拉/归一用例 |
| `src/modules/TemplateModule.vue` | 参数表缺失显示错误并禁用「新建」「编辑」 |
| `src/modules/TemplateModule.test.ts` | 夹具换 `repoParams()`；新增缺失禁用用例 |
| `electron-builder.yml` | `extraFiles` 增 `configs/llama_params.yaml` |
| `scripts/lms-launcher-update.ps1` | 修订第 4 行注释 |

**删除**

| 文件 | 原因 |
|------|------|
| `llama_params.yaml`（仓库根） | 旧版本的运行时产物（已 gitignore），不再被任何代码读取 |

---

## 任务 1：参数表入仓并声明 `fa` 选项

**文件：**
- 创建：`configs/llama_params.yaml`
- 修改：`src-main/test-utils.ts`、`src-main/config.test.ts`、`.gitignore`
- 删除：`llama_params.yaml`（仓库根）

- [ ] **步骤 1：在测试夹具里加入参数表读取器**

修改 `src-main/test-utils.ts`，在文件顶部补 import，并在末尾追加三个函数：

```ts
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import type { ParamsFile } from './config';
```

```ts
/** 参数表真相源路径（2026-10-06）：仓库 configs/llama_params.yaml，代码不再内置参数表。 */
export function repoParamsPath(): string {
  return join(__dirname, '..', 'configs', 'llama_params.yaml');
}

/** 参数表原文（写临时文件用的往返夹具）。 */
export function repoParamsText(): string {
  return readFileSync(repoParamsPath(), 'utf8');
}

/** 解析后的参数表（等价于主进程 paramsLoad 的产物，供组件测试与断言使用）。 */
export function repoParams(): ParamsFile {
  return parse(repoParamsText()) as ParamsFile;
}
```

- [ ] **步骤 2：编写失败的测试**

在 `src-main/config.test.ts` 的 `import` 区追加 `repoParams`，并新增用例（放在 `configs_missing_reports_missing` 之后即可）：

```ts
import { tmpPath, rm, writeText, jp, repoParams, repoParamsText } from './test-utils';
```

```ts
  it('repo_params_file_exists_and_declares_fa_options', () => {
    const pf = repoParams();
    expect(pf.params['fa']).toBe('-fa');
    expect(pf.params_options?.fa).toEqual(['auto', 'on', 'off']);
    expect(pf.required).toEqual(['m']);
  });
```

- [ ] **步骤 3：运行测试验证失败**

运行：`npx vitest run src-main/config.test.ts -t repo_params_file_exists_and_declares_fa_options`

预期：FAIL，报 `ENOENT`（`configs/llama_params.yaml` 尚不存在）。

- [ ] **步骤 4：创建参数表文件**

创建 `configs/llama_params.yaml`，内容如下（等于旧根目录那份 + `params_options.fa`，其余区块逐字不变）：

```yaml
params:
  m: -m
  mmproj: -mm
  image_min_tokens: --image-min-tokens
  alias: -a
  ngl: -ngl
  fa: -fa
  n_cpu_moe: -ncmoe
  load_mode: -lm
  np: -np
  c: -c
  b: -b
  ub: -ub
  t: -t
  tb: -tb
  ctk: -ctk
  ctv: -ctv
  spec_type: --spec-type
  spec_draft_n_max: --spec-draft-n-max
  md: -md
  ngld: -ngld
  temp: --temp
  top_p: --top-p
  top_k: --top-k
  min_p: --min-p
  presence_penalty: --presence_penalty
  repeat_penalty: --repeat_penalty
  jinja: --jinja
  chat_template_file: --chat-template-file
  reasoning: -rea
  reasoning_format: --reasoning-format
  reasoning_effort: --reasoning-effort
  reasoning_preserve: --reasoning-preserve
  no_reasoning_preserve: --no-reasoning-preserve
  port: --port
  metrics: --metrics
  fit: -fit
  fit_ctx: -fitc
  fit_target: -fitt
required:
  - m
params_options:
  fa:
    - auto
    - on
    - off
  ctk:
    - q4_0
    - q5_0
    - q8_0
    - f16
  ctv:
    - q4_0
    - q5_0
    - q8_0
    - f16
  spec_type:
    - none
    - draft-mtp
    - draft-dflash
    - draft-dspark
  load_mode:
    - none
    - auto
    - mmap
    - mlock
    - mmap+mlock
    - dio
  reasoning:
    - auto
    - on
    - off
  reasoning_format:
    - none
    - hide
    - deepseek
  reasoning_effort:
    - default
    - low
    - medium
    - high
    - xhigh
    - max
  fit:
    - off
    - on
params_boolean:
  - jinja
  - reasoning_preserve
  - no_reasoning_preserve
  - metrics
params_file:
  - m
  - mmproj
  - chat_template_file
  - md
params_default:
  port: "9931"
  fit: off
```

- [ ] **步骤 5：运行测试验证通过**

运行：`npx vitest run src-main/config.test.ts -t repo_params_file_exists_and_declares_fa_options`

预期：PASS。

- [ ] **步骤 6：调整 .gitignore 并删除根目录旧文件**

把 `.gitignore` 第 17-19 行：

```gitignore
llama_params.yaml
llama_launch_configs.yaml
lms_launcher.yaml
```

替换为：

```gitignore
# configs/（2026-10-06）：llama_params.yaml 是随包分发的受控资产，进版本管理；
# 另两份是运行时用户数据。
configs/lms_launcher.yaml
configs/llama_launch_configs.yaml
```

删除仓库根目录的旧运行时产物：

```powershell
Remove-Item -LiteralPath llama_params.yaml -Force
```

- [ ] **步骤 7：Commit**

```bash
git add configs/llama_params.yaml .gitignore src-main/test-utils.ts src-main/config.test.ts
git commit -m "feat(config): 参数表入仓 configs/llama_params.yaml 并声明 -fa 下拉选项"
```

---

## 任务 2：`paramsLoad` 缺失即抛 `MISSING`，删除 `defaultParams()`

**文件：**
- 修改：`src-main/config.test.ts`、`src-main/config.ts`、`src/modules/TemplateModal.test.ts`、`src/modules/TemplateModule.test.ts`

- [ ] **步骤 1：改写依赖 `defaultParams()` 的旧用例**

`src-main/config.test.ts`：删除 import 里的 `defaultParams`，并把下列用例整体替换。

```ts
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
```

```ts
  it('repo_params_covers_run_bat_common', () => {
    const pf = repoParams();
    const keys = ['m','mmproj','spec_type','ngl','fa','load_mode','np','c','b','ub','t','tb','ctk','ctv','jinja','chat_template_file','reasoning_format','reasoning_effort','spec_draft_n_max','md','temp','top_p','top_k','min_p','presence_penalty','repeat_penalty','port','alias'];
    for (const k of keys) expect(pf.params[k], k).toBeDefined();
    expect(pf.required).toEqual(['m']);
  });
```

```ts
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
```

```ts
  it('repo_params_includes_v1_1_keys_and_sections', () => {
    const pf = repoParams();
    expect(pf.params['reasoning']).toBe('-rea');
    expect(pf.params['reasoning_preserve']).toBe('--reasoning-preserve');
    expect(pf.params['n_cpu_moe']).toBe('-ncmoe');
    expect(pf.params['fit']).toBe('-fit');
    expect(pf.params['fit_ctx']).toBe('-fitc');
    expect(pf.params['fit_target']).toBe('-fitt');
    expect(pf.params['metrics']).toBe('--metrics');
    expect(Object.keys(pf.params)).toHaveLength(38);
    expect(pf.params['alias']).toBe('-a');
    expect(pf.params['image_min_tokens']).toBe('--image-min-tokens');
    const pk = Object.keys(pf.params);
    expect(pk[pk.indexOf('mmproj') + 1]).toBe('image_min_tokens');
    expect(pf.params_options?.spec_type).toEqual(['none','draft-mtp','draft-dflash','draft-dspark']);
    expect(pf.params_options?.load_mode).toEqual(['none','auto','mmap','mlock','mmap+mlock','dio']);
    expect(pf.params_options?.reasoning).toEqual(['auto','on','off']);
    expect(pf.params_options?.reasoning_format).toEqual(['none','hide','deepseek']);
    expect(pf.params_options?.reasoning_effort).toEqual(['default','low','medium','high','xhigh','max']);
    expect(pf.params_options?.ctk).toEqual(['q4_0','q5_0','q8_0','f16']);
    expect(pf.params_options?.ctv).toEqual(['q4_0','q5_0','q8_0','f16']);
    expect(pf.params_boolean).toEqual(['jinja','reasoning_preserve','no_reasoning_preserve','metrics']);
    expect(pf.params_file).toEqual(['m','mmproj','chat_template_file','md']);
    expect(pf.params['md']).toBe('-md');
    expect(pk[pk.indexOf('spec_draft_n_max') + 1]).toBe('md');
    expect(pf.params['ngld']).toBe('-ngld');
    expect(pk[pk.indexOf('md') + 1]).toBe('ngld');
  });
```

```ts
  it('repo_params_includes_params_default_and_fit_options', () => {
    const pf = repoParams();
    expect(pf.params_default).toEqual({ port: '9931', fit: 'off' });
    expect(pf.params_options?.fit).toEqual(['off', 'on']);
    expect(pf.params_boolean ?? []).not.toContain('fit');
  });
```

```ts
  it('params_yaml_roundtrip_preserves_params_default', () => {
    const p = tmpPath('params_default_rt.yaml');
    rm(p);
    writeText(p, repoParamsText());
    const pf = paramsLoad(p);
    expect(pf.params_default).toEqual({ port: '9931', fit: 'off' });
    expect(pf.params_options?.fit).toEqual(['off', 'on']);
    rm(p);
  });
```

并把两个回填用例里的 `defaultParams()` 替换为 `repoParams()`：

```ts
    saveConfigEntry(p, 'old', '存量', { m: 'x.gguf', port: '8080' }, repoParams());
```

```ts
    saveConfigEntry(p, 'u', '用户', { m: 'x.gguf', fit: 'on' }, repoParams());
```

同时删除这两个已被上面取代的旧用例：`params_default_written_only_when_missing`、`default_params_covers_run_bat_common`、`params_reread_after_default_write_succeeds`、`default_params_includes_v1_1_keys_and_sections`、`default_params_includes_params_default_and_fit_options`。

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/config.test.ts`

预期：FAIL —— `params_missing_reports_missing` 未抛错（当前 `paramsLoad` 会自动生成文件）。

- [ ] **步骤 3：改写 config.ts**

`src-main/config.ts` 的 `paramsLoad`（第 76-90 行）替换为：

```ts
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
```

删除整个 `defaultParams()` 函数（第 185-219 行，含其上方的 `// params_options / params_boolean / params_file` 注释）。

- [ ] **步骤 4：更新两个前端测试文件的夹具**

`src/modules/TemplateModal.test.ts`：

```ts
// 旧：import { defaultParams } from '../../src-main/config';
import { repoParams } from '../../src-main/test-utils';
```

```ts
// 旧：const paramsMeta = defaultParams();
const paramsMeta = repoParams();
```

`src/modules/TemplateModule.test.ts`：

```ts
// 旧：import { defaultParams } from '../../src-main/config';
import { repoParams } from '../../src-main/test-utils';
```

```ts
        if (cmd === 'get_params') return Promise.resolve(repoParams());
```

同时把 `TemplateModal.test.ts` 中「计数 = defaultParams().params 条目数」的注释改为「计数 = repoParams().params 条目数」。

- [ ] **步骤 5：运行全量测试验证通过**

运行：`npm test`

预期：PASS，无任何 `defaultParams` 未定义错误。

- [ ] **步骤 6：Commit**

```bash
git add src-main/config.ts src-main/config.test.ts src/modules/TemplateModal.test.ts src/modules/TemplateModule.test.ts
git commit -m "refactor(config): paramsLoad 缺文件抛 MISSING，删除代码内置 defaultParams()"
```

---

## 任务 3：主进程路径收敛到 `configs/`

**文件：**
- 修改：`src-main/main.ts:69-77`、`src-main/main.ts:965`

> 说明：`main.ts` 依赖 Electron 运行时，仓库内没有主进程单测覆盖路径逻辑（`vitest.config.ts` 只收录 `*.test.ts`，`src-main` 下无 `main.test.ts`）。本任务的验证手段是 `tsc` 编译 + dev 手测，属计划内的既定取舍。

- [ ] **步骤 1：改写目录与路径函数**

`src-main/main.ts` 第 69-77 行整体替换为：

```ts
// 数据目录：打包后 = exe 所在目录（portable 解压目录，可写）；dev-time = 项目 cwd
function dataDir(): string {
  if (app.isPackaged) return process.execPath ? join(process.execPath, "..") : process.cwd();
  return process.cwd();
}
// 配置目录（2026-10-06）：三份 yaml 统一收纳在 <dataDir>/configs/ 下。
// llama_params.yaml 随包分发（electron-builder extraFiles），另两份为运行时用户数据。
function configDir(): string { return join(dataDir(), 'configs'); }
function yamlPaths(): [string, string, string] {
  const d = configDir();
  return [join(d, 'lms_launcher.yaml'), join(d, 'llama_params.yaml'), join(d, 'llama_launch_configs.yaml')];
}
```

- [ ] **步骤 2：启动早期补建目录**

`src-main/main.ts` 的 `app.whenReady().then(() => {` 之后、`initI18n();` 之前插入：

```ts
  // configs/ 兜底（2026-10-06）：随包已带该目录；用户误删后在此补建，否则后续保存会 ENOENT
  try { mkdirSync(configDir(), { recursive: true }); } catch { /* 建目录失败由后续读写报错暴露 */ }
```

（`mkdirSync` 已在第 6 行 import，无需新增导入。）

- [ ] **步骤 3：编译验证**

运行：`npx tsc -p tsconfig.main.json`

预期：无输出、退出码 0。

- [ ] **步骤 4：dev 手测**

```powershell
# 清掉全新状态，确认应用会创建 configs/ 而不是在根目录写 yaml
Remove-Item -Recurse -Force configs -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path configs | Out-Null
Copy-Item $env:TEMP\nonexistent llama_params.yaml -ErrorAction SilentlyContinue
npm run dev
```

预期：
1. 应用正常启动，模板卡片显示「参数表缺失」错误且「新建」置灰（任务 4 完成后才会出现该文案；本步骤只确认启动不崩、`configs/` 目录存在）。
2. 打开「llama.cpp 安装目录」卡片选择一次目录（触发 `save_llama_dir`），确认 `configs/lms_launcher.yaml` 被创建、根目录**不再**出现 `lms_launcher.yaml`。

- [ ] **步骤 5：Commit**

```bash
git add src-main/main.ts
git commit -m "feat(config): 三份 yaml 收敛到 configs/ 目录并在启动时兜底建目录"
```

---

## 任务 4：参数表缺失时前端报错并禁用新建/编辑

**文件：**
- 修改：`src-main/i18n/dict.ts`、`src/modules/TemplateModule.test.ts`、`src/modules/TemplateModule.vue`

- [ ] **步骤 1：补齐中英词条**

`src-main/i18n/dict.ts` 的 zh 区块：

在 `'err.config.missing'` 行之后插入：

```ts
    'err.config.paramsMissing': 'llama_params.yaml 不存在（随包分发，缺失说明安装包不完整）',
```

在 `'tpl.empty.missing'` 行之后插入：

```ts
    'tpl.paramsMissing': '参数表 configs/llama_params.yaml 缺失，模板功能已禁用（请重新解压完整安装包）',
```

en 区块同样处理，在对应 key 行之后插入：

```ts
    'err.config.paramsMissing': 'llama_params.yaml not found (shipped with the package; missing means the installation is incomplete)',
```

```ts
    'tpl.paramsMissing': 'Parameter table configs/llama_params.yaml is missing; template actions are disabled (re-extract the full package)',
```

- [ ] **步骤 2：编写失败的测试**

在 `src/modules/TemplateModule.test.ts` 的 `describe('TemplateModule')` 内追加：

```ts
  it('params_missing_shows_error_and_disables_new_and_edit_but_not_copy', async () => {
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === 'get_configs') return Promise.resolve(CONFIGS);
        if (cmd === 'get_params') return Promise.reject(new Error('MISSING: llama_params.yaml'));
        if (cmd === 'get_app_config') return Promise.resolve({ llama_dir: 'x' });
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const w = mount(TemplateModule);
    await flush();
    expect(w.find('.error-text').text()).toContain('llama_params.yaml');
    expect(w.find('.module-template .icon-btn').attributes('disabled')).toBeDefined(); // 新建禁用
    const rowButtons = w.findAll('.tpl-row__actions button');
    expect(rowButtons[0].attributes('disabled')).toBeUndefined(); // 复制不禁用
    expect(rowButtons[1].attributes('disabled')).toBeDefined();   // 编辑禁用
    w.unmount();
  });
```

- [ ] **步骤 3：运行测试验证失败**

运行：`npx vitest run src/modules/TemplateModule.test.ts -t params_missing_shows_error`

预期：FAIL —— `.error-text` 不存在（MISSING 被静默吞掉），`disabled` 属性为 `undefined`。

- [ ] **步骤 4：改写 TemplateModule.vue**

script 区，在 `const paramsMissing` 位置附近的 `error` 声明之后新增状态：

```ts
const error = ref<string | null>(null);
const missing = ref(false);
// 参数表缺失（2026-10-06）：params 随包分发，缺失 = 安装包不完整 → 报错并禁用新建/编辑
const paramsMissing = ref(false);
```

`reload()` 里的 `get_params` 分支替换为：

```ts
  try {
    paramsMeta.value = await invoke<ParamMeta>('get_params');
    paramsMissing.value = false;
  } catch (e) {
    const msg = errMsg(e);
    paramsMissing.value = isMissing(msg); // 参数表随包分发：MISSING 不再沿用空表（2026-10-06）
    if (!isMissing(msg) && !isValidation(msg)) error.value = msg;
  }
```

template 区，`<div class="template-list">` 内第一行插入：

```html
      <!-- 参数表缺失（2026-10-06）：显式报错，配合下方按钮禁用 -->
      <p v-if="paramsMissing" class="error-text">{{ t('tpl.paramsMissing') }}</p>
```

「新建」按钮追加 `:disabled="paramsMissing"`：

```html
      <button class="icon-btn icon-btn--sm" :data-tooltip="t('tpl.btn.new')" :aria-label="t('tpl.btn.new')"
        :disabled="paramsMissing"
        @click="openNew">
```

行内「编辑」按钮追加 `:disabled="paramsMissing"`（「复制」按钮不动）：

```html
            <button class="icon-btn icon-btn--sm" :data-tooltip="t('tpl.btn.edit')" :aria-label="t('tpl.btn.edit')"
              :disabled="paramsMissing"
              @click="openEdit(id)">
```

scoped 样式追加：

```css
/* 禁用态（参数表缺失）：新建/编辑置灰，保留占位不改变布局 */
.icon-btn:disabled { opacity: .4; cursor: not-allowed; }
```

- [ ] **步骤 5：运行测试验证通过**

运行：`npx vitest run src/modules/TemplateModule.test.ts`

预期：PASS（含既有 12 条 en 冒烟与空态用例）。

- [ ] **步骤 6：Commit**

```bash
git add src-main/i18n/dict.ts src/modules/TemplateModule.vue src/modules/TemplateModule.test.ts
git commit -m "feat(tpl): 参数表缺失时显式报错并禁用新建/编辑"
```

---

## 任务 5：`-fa` 下拉与存量值归一

**文件：**
- 修改：`src/modules/TemplateModal.test.ts`、`src/modules/TemplateModal.vue:76-85`

- [ ] **步骤 1：编写失败的测试**

在 `src/modules/TemplateModal.test.ts` 文件末尾（en 冒烟段之前）追加：

```ts
describe('TemplateModal fa dropdown', () => {
  function rowControl(flagText: string): Element {
    const label = [...document.querySelectorAll('.flag-grid label.flag-label')].find((l) => (l.textContent ?? '').trim() === flagText)!;
    return label.nextElementSibling!;
  }
  function faTrigger(): HTMLElement {
    return rowControl('-fa').querySelector('.select-label')! as HTMLElement;
  }
  function mountEdit(values: Record<string, string>) {
    return mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: 'tplx', name: 'x', values, paramsMeta },
    });
  }

  it('fa_row_renders_as_dropdown_not_text_input', async () => {
    calls = []; mockLms();
    const w = mountModal(); await flush();
    const cell = rowControl('-fa');
    expect(cell.classList.contains('dropdown')).toBe(true);
    expect(cell.querySelector('input')).toBeNull();
    w.unmount();
  });

  it('fa_new_template_defaults_to_auto', async () => {
    calls = []; mockLms();
    const w = mountModal(); await flush();
    expect(faTrigger().textContent!.trim()).toBe('auto');
    w.unmount();
  });

  it('fa_stored_off_is_preserved', async () => {
    calls = []; mockLms();
    const w = mountEdit({ m: 'x.gguf', fa: 'off' }); await flush();
    expect(faTrigger().textContent!.trim()).toBe('off');
    w.unmount();
  });

  it('fa_stored_uppercase_on_normalizes_to_on', async () => {
    calls = []; mockLms();
    const w = mountEdit({ m: 'x.gguf', fa: 'ON' }); await flush();
    expect(faTrigger().textContent!.trim()).toBe('on');
    w.unmount();
  });

  it('fa_stored_false_normalizes_to_off', async () => {
    calls = []; mockLms();
    const w = mountEdit({ m: 'x.gguf', fa: 'false' }); await flush();
    expect(faTrigger().textContent!.trim()).toBe('off');
    w.unmount();
  });

  it('fa_stored_garbage_falls_back_to_auto', async () => {
    calls = []; mockLms();
    const w = mountEdit({ m: 'x.gguf', fa: 'yes please' }); await flush();
    expect(faTrigger().textContent!.trim()).toBe('auto');
    w.unmount();
  });

  it('fa_saved_value_is_canonical_after_normalization', async () => {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => { calls.push({ cmd, args }); return Promise.resolve(null); },
      onLogLine: () => () => {}, onProcessExit: () => () => {}, onTrayExitRequest: () => () => {},
    };
    const w = mountEdit({ m: 'D:/models/x.gguf', fa: 'true' });
    await flush();
    (document.querySelector('.modal-save') as HTMLButtonElement).click();
    await flush();
    const saved = calls.find((c) => c.cmd === 'save_config');
    expect(saved).toBeDefined();
    const values = (saved!.args as unknown[])[2] as Record<string, string>;
    expect(values['fa']).toBe('on');
    w.unmount();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/modules/TemplateModal.test.ts -t "fa dropdown"`

预期：FAIL —— `-fa` 当前渲染为 `.row-cell > input`，`.select-label` 取不到。

- [ ] **步骤 3：实现归一函数并接入 fill()**

`src/modules/TemplateModal.vue`，在 `function fill(): void {` 之前插入：

```ts
// fa 存量值归一（2026-10-06）：下拉化之前 fa 是自由文本框，可能存过 true/1/yes/ON 等值。
// 只在回显层归一（不写回 yaml）：大小写不敏感命中枚举 → 枚举规范值；布尔字面量 → on/off；
// 其余 → 首个选项（auto）。用户点保存后才以规范值落盘。
const FA_ON = new Set(['true', '1', 'yes']);
const FA_OFF = new Set(['false', '0', 'no']);
function normalizeFa(raw: string, opts: string[]): string {
  const v = raw.trim().toLowerCase();
  const hit = opts.find((o) => o.toLowerCase() === v);
  if (hit !== undefined) return hit;
  if (FA_ON.has(v)) return 'on';
  if (FA_OFF.has(v)) return 'off';
  return opts[0];
}
```

`fill()` 内第 82-83 行：

```ts
      if (row.type === 'options' && !row.opts.includes(t)) init[k] = row.opts[0]; // 回落首个
      else init[k] = t;
```

替换为：

```ts
      // options：fa 走存量值归一（2026-10-06），其余键维持「枚举内原样 / 枚举外回落首项」
      if (row.type === 'options') {
        init[k] = row.key === 'fa' ? normalizeFa(t, row.opts) : (row.opts.includes(t) ? t : row.opts[0]);
      } else init[k] = t;
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/modules/TemplateModal.test.ts`

预期：PASS（含既有 options 截断、params_default、vram 与 en 冒烟用例）。

- [ ] **步骤 5：Commit**

```bash
git add src/modules/TemplateModal.vue src/modules/TemplateModal.test.ts
git commit -m "feat(tpl): -fa 改为 auto/on/off 下拉并归一存量文本值"
```

---

## 任务 6：打包链路（参数表随包分发）

**文件：**
- 修改：`electron-builder.yml:15-19`、`scripts/lms-launcher-update.ps1:4-5`

- [ ] **步骤 1：extraFiles 增加参数表**

`electron-builder.yml` 的 `extraFiles` 区块改为：

```yaml
# 更新脚本随包分发：win-unpacked/lms-launcher-update.ps1（portable 解压后与主 exe 同目录）
extraFiles:
  - from: scripts/lms-launcher-update.ps1
    to: lms-launcher-update.ps1
  - from: src-main/gpu-counters.ps1
    to: gpu-counters.ps1
  # 参数表随包分发（2026-10-06）：configs/llama_params.yaml 是唯一真相源，
  # 用户解压覆盖即完成参数表升级；另两份 yaml 是用户数据，不进包。
  - from: configs/llama_params.yaml
    to: configs/llama_params.yaml
```

- [ ] **步骤 2：修订更新脚本注释**

`scripts/lms-launcher-update.ps1` 第 4 行：

```powershell
#       校验关键条目 → 全量覆盖 installDir（zip 不含 yaml/downloads，用户数据不受影响）→
```

替换为：

```powershell
#       校验关键条目 → 全量覆盖 installDir（2026-10-06 起 zip 内含 configs/llama_params.yaml，
#       解压即完成参数表升级；configs/ 下另两份 yaml 与 downloads 不进 zip，用户数据不受影响）→
```

（该行是 `#` 注释，`src-main/i18n/no-hardcoded.test.ts` 的 `psLiteralText` 会跳过注释，不触发中文硬编码断言。）

- [ ] **步骤 3：打包验证**

运行：

```powershell
npx electron-builder --config electron-builder.yml --win portable
Test-Path dist-release\win-unpacked\configs\llama_params.yaml
```

预期：打包成功，`Test-Path` 输出 `True`；且 `dist-release\win-unpacked\configs\` 下**只有** `llama_params.yaml`（用户在打包机上运行过 exe 才可能多出另两份——那属于已知的发布包卫生问题，本计划不处理）。

- [ ] **步骤 4：Commit**

```bash
git add electron-builder.yml scripts/lms-launcher-update.ps1
git commit -m "build: 参数表 configs/llama_params.yaml 随包分发"
```

---

## 任务 7：全量回归

- [ ] **步骤 1：全量单测**

运行：`npm test`

预期：全部通过；重点确认 `src-main/config.test.ts`、`src/modules/TemplateModal.test.ts`、`src/modules/TemplateModule.test.ts`、`src-main/i18n/dict.test.ts`（zh/en key 集合一致）四条链路绿。

- [ ] **步骤 2：编译验证**

运行：`npm run build`

预期：`vite build` 与 `tsc -p tsconfig.main.json` 均无错误。

- [ ] **步骤 3：dev 手工验收清单**

```powershell
npm run dev
```

逐条核对：

1. 模板卡片右上角 VRAM 按钮正常，列表正常加载。
2. 点「新建」：`-fa` 一行是下拉，触发按钮显示 `auto`；展开可见 `auto / on / off` 三项。
3. 填 `-m` 与名字后保存，打开 `configs/llama_launch_configs.yaml`，确认该模板含 `fa: auto`。
4. 再次编辑该模板，把 `-fa` 选为 `off` 并保存，确认 yaml 中 `fa: off`（未被改回 auto）。
5. 手工把该模板的 `fa` 改为 `"true"`，重新打开编辑弹窗，确认下拉显示 `on`；不改动直接保存，确认 yaml 中变为 `fa: on`。
6. 手工把该模板的 `fa` 改为 `"乱写"`，重新打开编辑弹窗，确认下拉显示 `auto`。
7. 关闭应用，把 `configs/llama_params.yaml` 改名为 `.bak`，重新启动：模板卡片显示「参数表 configs/llama_params.yaml 缺失…」，「新建」「编辑」置灰，「复制」仍可点击。
8. 还原文件名后重启，一切恢复。
9. 启动一次模板，确认日志区「启动命令」行含 `-fa auto`（或所选值）。

- [ ] **步骤 4：补齐遗漏并 Commit（仅在步骤 1-3 发现问题时）**

```bash
git add -A
git commit -m "fix: 配置目录收敛与 -fa 下拉的回归修正"
```

---

## 计划自检

**1. 规格覆盖度**（对照 `docs/superpowers/specs/2026-10-06-configs-dir-and-fa-dropdown-design.md`）

| 规格条目 | 承接任务 |
|----------|----------|
| P1 路径收敛 | 任务 3 |
| P2 目录兜底 | 任务 3 步骤 2 |
| P3 文件角色 | 任务 1、任务 3 |
| P4 不做迁移 | 全计划无迁移代码；仅任务 1 步骤 6 删除仓库根旧产物 |
| P5 .gitignore | 任务 1 步骤 6 |
| P6 发布包卫生不处理 | 任务 6 步骤 3 明确不处理 |
| S1 删 defaultParams / MISSING | 任务 2 |
| S2 fa 选项与默认 auto | 任务 1、任务 5 |
| S3 回显层归一 | 任务 5 |
| S4 命令行带值 | 无需改动（`buildArgVector` 既有分支已满足）；任务 7 步骤 3 第 9 条人工确认 |
| S5 文案不变 | 任务 1 不触碰 `tplModal.tip.fa` |
| S6 缺失时禁用 | 任务 4 |
| B1 extraFiles | 任务 6 |
| B2 更新脚本注释 | 任务 6 步骤 2 |

**2. 占位符扫描**：无「待定 / TODO / 后续实现 / 类似任务 N」；每个代码步骤都给出完整代码块与精确命令。

**3. 类型一致性**：`ParamsFile` 沿用 `src-main/config.ts` 既有导出；`repoParams()` / `repoParamsText()` / `repoParamsPath()` 在任务 1 定义、任务 2 使用，签名一致；`configDir()` 在任务 3 定义并被 `yamlPaths()` 与 `whenReady` 共用；`normalizeFa(raw, opts)` 在任务 5 内定义并使用，无跨任务签名漂移。

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-10-06-configs-dir-and-fa-dropdown.md`。两种执行方式：

**1. 子代理驱动（推荐）** —— 每个任务调度一个新的子代理，任务间进行审查，快速迭代。必需子技能：`superpowers:subagent-driven-development`。

**2. 内联执行** —— 在当前会话中使用 `superpowers:executing-plans` 按任务批量执行，设有检查点供审查。
