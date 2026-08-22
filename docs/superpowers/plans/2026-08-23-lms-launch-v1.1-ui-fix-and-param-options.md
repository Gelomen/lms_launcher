# lms_launcher v1.1 实现计划：UI 修复 + 参数选项增强（单计划，内部两执行批次）

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在已完成的 lms_launcher v1（Electron + Vue 3 + Vitest）上，交付 v1.1 规格（docs/superpowers/specs/2026-08-23-lms-launch-v1.1-ui-fix-and-param-options.md）的全部 #1–#13：无配置红字改普通文案、弹窗保存后才校验、params_file「选择文件」按钮、params_options/params_boolean 下拉、flag-grid 标签自适应 + 圆角修复、滚动条美化、目录按钮省略号、下拉菜单限高。

**架构：** 主进程（Node/TS）承担 yaml schema 扩展（config.ts 新增 params_options / params_boolean / params_file 三段）与命令拼装规则（build.ts boolean 只拼 flag、options 透传）；渲染端（Vue 3）做弹窗 rows 三分支（文本 / 选项下拉 / 布尔下拉）、校验门控 attemptedSave、全局 CSS（滚动条）。IPC 仅新增一个命令 open_file_dialog。

**技术栈：** Electron 28 + Vue 3 + TypeScript + Vitest + Vite + yaml + electron-builder portable。

**工作区：** 主仓库 `D:\AI\Workspace\lms_launcher`，分支 master（v1 已由 lms-launch-v1 分支/worktree 合并回 master，原 worktree 删除；基线提交 6ec7147）。**所有命令的 workdir 均为该目录。**

**总原则（规格批注）：**
- **开发阶段无兼容原则**：已生成的 yaml 运行时按最新 schema 解析，新段缺失按空处理；不做迁移/回写。defaultParams() 首次创建即写完整新模板。
- options/boolean 取值由 UI 下拉收敛，**build.ts 不做 VALIDATION 拒绝**。
- 前端不引入组件测试框架：主进程 TDD（红→绿），前端走任务 10 的手动验收清单。

**涉及文件清单（规格 §五）：**

| 文件 | 动作 | 归属任务 |
|------|------|----------|
| src-main/config.ts + config.test.ts | 修改/新增测试（ParamsFile 新段 + defaultParams） | 1 |
| src-main/build.ts + build.test.ts | 修改/新增测试（boolean/options 拼装） | 1 |
| src-main/main.ts、src/ipc.ts、src/modules/TemplateModule.vue | IPC open_file_dialog 面 | 2 |
| src/modules/TemplateModal.vue | rows 三分支 + 「选择文件」按钮 + flag-grid 自适应 + modal-box 防护 | 3 |
| src/modules/TemplateModal.vue | attemptedSave 门控 + 去 * 号 + id「必填」文案 | 4 |
| src/modules/TemplateModule.vue、LaunchBar.vue | 无配置文案：深色「目前没有模板配置」/ 移除提示行 + 下拉占位文案规则 | 5 |
| src/modules/DirModule.vue | 「…」（title=选择 llama.cpp 安装目录） | 6 |
| src/style.css | webkit/Firefox 滚动条美化 | 7 |
| （任务 8 目检后可能：TemplateModal.vue / LaunchBar.vue + style.css） | 全局下拉限高 3 行 + 圆角风格一致 | 8 |
| docs/superpowers/superpowers-sdd-progress.md | 每任务完成后更新台账行 | 1–9 |

**现有测试基线（红→绿的参照物）：** config.test.ts 9 用例、build.test.ts 6 用例，当前全绿。注意 config.test.ts 的 `params_reread_after_default_write_succeeds` 硬断言 `toHaveLength(26)`，defaultParams 新增 2 个 key 后必须同步改 28（任务 1 步骤 1）。

**批次归属（规格总原则：一个计划、两个批次）：**
- **参数选项批**（新 schema 先行）：任务 1（config/build TDD）、任务 2（IPC open_file_dialog）、任务 3（弹窗三分支 + 选择文件按钮）。
- **UI 修复批**：任务 4（校验门控）、任务 5（无配置文案）、任务 6（…按钮）、任务 7（滚动条）、任务 8（下拉限高）。
- 收尾：任务 9（全量回归 + release）。

**SDD 流程约定：** 每任务完成后——跑 `npx vitest run` 全绿 → git commit（提交信息格式见各任务）→ 更新 docs/superpowers/superpowers-sdd-progress.md 对应行（状态 done + 提交区间）→ commit 台账。任务顺序即依赖顺序（1→2→3…），勿并行改同一文件。

---

### 任务 1：参数系统基础——config.ts ParamsFile 新段 + build.ts boolean/options（TDD）

**文件：**
- 修改：`src-main/config.ts`、`src-main/build.ts`
- 测试：`src-main/config.test.ts`、`src-main/build.test.ts`

- [ ] **步骤 1：编写失败的测试（config）**

在 `src-main/config.test.ts` 的 `describe('config.ts')` 内追加三个用例，并把既有断言 26 改为 28：

```ts
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
  expect(pf.params['reasoning']).toBe('--reasoning');
  expect(pf.params['reasoning_preserve']).toBe('--reasoning-preserve');
  expect(Object.keys(pf.params)).toHaveLength(28); // 既有 26 + reasoning*2
  expect(pf.params_options?.spec_type).toEqual(['none','draft-mtp','draft-simple','draft-eagle3','draft-dflash','draft-dspark','ngram-cache','ngram-simple','ngram-map-k','ngram-map-k4v','ngram-mod']);
  expect(pf.params_options?.load_mode).toEqual(['none','auto','mmap','mlock','mmap+mlock','dio']);
  expect(pf.params_options?.reasoning).toEqual(['auto','on','off']);
  expect(pf.params_options?.reasoning_format).toEqual(['none','hide','deepseek']);
  expect(pf.params_options?.reasoning_effort).toEqual(['none','low','medium','high','xhigh','max']);
  expect(pf.params_boolean).toEqual(['jinja','reasoning_preserve']);
  expect(pf.params_file).toEqual(['m','mmproj','chat_template_file']);
});
```

并修改既有 `params_reread_after_default_write_succeeds`：expect(Object.keys(pf2.params)).toHaveLength(26) → **28**。

在 `src-main/build.test.ts` 追加四个用例（顶部新增 pfV11 测试夹具）：

```ts
const pfV11: ParamsFile = {
  params: { m: '-m', jinja: '--jinja', spec_type: '--spec-type', port: '--port' },
  required: ['m'],
  params_boolean: ['jinja'],
  params_options: { spec_type: ['none', 'draft-mtp'] },
};

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
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run`（workdir = 仓库根 D:\AI\Workspace\lms_launcher）
预期：config.test 3 个新用例 FAIL（params_options/params_boolean/params_file 为 undefined、params key 数 26≠28），build.test 5 个新用例 FAIL（boolean 行被拼成 `--jinja true` 值对 / summarize 出现 `--jinja false` 噪声）；既有 15 用例仍绿。

- [ ] **步骤 3：修改 config.ts**

```ts
// 接口扩展（第 5 行替换）
export interface ParamsFile {
  params: Record<string, string>;
  required: string[];
  params_options?: Record<string, string[]>;
  params_boolean?: string[];
  params_file?: string[];
}
```

defaultParams() 内 items 数组增加两行并在 return 前补齐三段（第 99–114 行整体替换）：

```ts
// 默认参数模板：run.bat COMMON 全量 flag-form 映射 + v1.1 新增 reasoning/reasoning_preserve；
// required = [m]；params_options / params_boolean / params_file 三段随首建模板一次写入（§#9A）
export function defaultParams(): ParamsFile {
  const items: Array<[string, string]> = [
    ['m', '-m'], ['mmproj', '--mmproj'], ['spec_type', '--spec-type'], ['ngl', '-ngl'],
    ['fa', '-fa'], ['load_mode', '--load-mode'], ['np', '-np'], ['c', '-c'],
    ['b', '-b'], ['ub', '-ub'], ['t', '-t'], ['tb', '-tb'], ['ctk', '-ctk'],
    ['ctv', '--ctv'], ['jinja', '--jinja'], ['chat_template_file', '--chat-template-file'],
    ['reasoning_format', '--reasoning-format'], ['reasoning_effort', '--reasoning-effort'],
    ['reasoning', '--reasoning'], ['reasoning_preserve', '--reasoning-preserve'],
    ['spec_draft_n_max', '--spec-draft-n-max'], ['temp', '--temp'], ['top_p', '--top-p'],
    ['top_k', '--top-k'], ['min_p', '--min-p'],
    ['presence_penalty', '--presence_penalty'], ['repeat_penalty', '--repeat_penalty'],
    ['port', '--port'],
  ];
  const params: Record<string, string> = Object.fromEntries(items);
  return {
    params,
    required: ['m'],
    params_options: {
      spec_type: ['none', 'draft-mtp', 'draft-simple', 'draft-eagle3', 'draft-dflash', 'draft-dspark',
                 'ngram-cache', 'ngram-simple', 'ngram-map-k', 'ngram-map-k4v', 'ngram-mod'],
      load_mode: ['none', 'auto', 'mmap', 'mlock', 'mmap+mlock', 'dio'],
      reasoning: ['auto', 'on', 'off'],
      reasoning_format: ['none', 'hide', 'deepseek'],
      reasoning_effort: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    },
    params_boolean: ['jinja', 'reasoning_preserve'],
    params_file: ['m', 'mmproj', 'chat_template_file'],
  };
}
```

paramsLoad() 保持不变（yaml 缺新段 → 字段 undefined → 前端用 `?? {} / ?? []` 容错；params key 校验逻辑不动）。

- [ ] **步骤 4：修改 build.ts**

buildArgVector 值循环内加 boolean 分支（第 18–25 行替换）：

```ts
  const out = [exe];
  const boolKeys = pf.params_boolean ?? [];
  for (const [k, v] of Object.entries(entry.values)) {
    if (v.trim().length === 0) continue;
    const flag = pf.params[k];
    if (flag === undefined) throw new Error(`VALIDATION: 参数 "${k}" 不在 llama_params.yaml 的映射表里`);
    if (boolKeys.includes(k)) {
      if (v.trim() === 'true') { out.push(flag); continue; }        // boolean true → 只拼 flag，无值对
      if (v.trim() !== 'false') { out.push(flag, quoted(v.trim())); continue; } // 其他字面量兜底：flag+值
      continue;                                                       // false → 整对跳过（与空值一致）
    }
    out.push(flag, quoted(v.trim()));
  }
  return out;
```

summarize 加同款规则（第 38–45 行替换）：

```ts
export function summarize(e: ConfigEntry, pf: ParamsFile): string {
  const boolKeys = pf.params_boolean ?? [];
  return Object.entries(e.values)
    .filter(([, v]) => v.trim().length > 0)
    .filter(([k]) => pf.params[k] !== undefined)
    .filter(([k, v]) => !(boolKeys.includes(k) && v.trim() === 'false')) // false 与 buildArgVector 一致：不出现
    .map(([k, v]) => boolKeys.includes(k) && v.trim() === 'true' ? pf.params[k]! : `${pf.params[k]} ${quoted(v.trim())}`)
    .join(' ');
}
```

- [ ] **步骤 5：运行测试验证通过**

运行：`npx vitest run`
预期：PASS——config.test 10 + build.test 6 既有用例全绿，另有 v1.1 新增（config 3、build 5）全部通过；process.test 不受影响。

- [ ] **步骤 6：Commit**

```bash
git add src-main/config.ts src-main/build.ts src-main/config.test.ts src-main/build.test.ts
git commit -m "feat: params_options/params_boolean/params_file schema + boolean arg building"
```

- [ ] **步骤 7：更新 SDD 进度台账**

把 docs/superpowers/superpowers-sdd-progress.md 的 v1.1 批次表更新（任务 1 行标 done + 本次提交哈希；若表尚为旧表则整表替换）（新表替换旧表），任务 1 行标 done + 本次提交哈希。commit：`chore: sdd ledger task 1 (v1.1)`。

---

### 任务 2：IPC——open_file_dialog（main.ts + preload + ipc.ts + TemplateModule ParamMeta）

**文件：**
- 修改：`src-main/main.ts`、`src/main/ipc.ts`、`src/modules/TemplateModule.vue`
- （preload.ts 白名单为泛化 invoke，**无需改动**——确认即可）

- [ ] **步骤 1：main.ts 注册 open_file_dialog**

在 `open_dir_dialog` handler 旁（约 133–139 行后）追加：

```ts
// params_file 行的文件选择器（规格 #7B）：m/mmproj → gguf 过滤；其余任意文件。canceled / 无窗口 → null
ipcMain.handle('open_file_dialog', async (_e, key: string): Promise<string | null> => {
  const { dialog } = await import('electron');
  const win = mainWin();
  if (!win) return null;
  const options: Electron.OpenDialogOptions = {};
  if (key === 'm' || key === 'mmproj') {
    options.filters = [{ name: 'Model files', extensions: ['gguf'] }];
  }
  const res = await dialog.showOpenDialog(win, options);
  return res.canceled ? null : res.filePaths[0];
});
```

get_params handler（86–89 行）已直接返回 paramsLoad 结果——任务 1 后自动携带三段，无需改动。

- [ ] **步骤 2：src/ipc.ts 无新增**（invoke 白名单机制为命令名透传；仅确认无类型缺口）。

- [ ] **步骤 3：TemplateModule.vue ParamMeta 类型扩展**

第 7 行替换：

```ts
interface ParamMeta { params: Record<string, string>; required: string[]; params_options?: Record<string, string[]>; params_boolean?: string[]; params_file?: string[] }
```

（TemplateModal props.paramsMeta 的类型见任务 3 步骤 2，两处结构一致。）

- [ ] **步骤 4：验证（编译 + 全量测试）**

运行：`npx tsc -p tsconfig.main.json && npx vitest run`
预期：编译无错、测试全绿。本任务前端行为验收并入任务 3/10（dev 窗口点「选择文件」）。

- [ ] **步骤 5：Commit**

```bash
git add src-main/main.ts src/modules/TemplateModule.vue
git commit -m "feat: open_file_dialog IPC for params_file rows (gguf filter)"
```

（台账行 2 更新 + chore commit。）

---

### 任务 3：TemplateModal——rows 三分支 + 「选择文件」按钮 + flag-grid 自适应 + modal-box 圆角防护

> 本任务同时承载规格 #7B / #8 / #9D / #11。#11 根因 = 内容横向撑破卡片，由 #8 列宽修复解决；`overflow-x: hidden` 为兜底。

**文件：**
- 修改：`src/modules/TemplateModal.vue`

- [ ] **步骤 1：props 类型 + rows 三分支**

```ts
const props = withDefaults(defineProps<{
  open: boolean;
  id: string;
  values: Record<string, string>;
  desc?: string;
  paramsMeta: {
    params: Record<string, string>;
    required: string[];
    params_options?: Record<string, string[]>;
    params_boolean?: string[];
    params_file?: string[];
  };
  existingIds: string[];
}>(), { desc: '' });
```

Row 类型与 rows 计算（原第 56–63 行替换）：

```ts
type RowType = 'text' | 'options' | 'boolean';
type Row = { key: string; flag: string; required: boolean; type: RowType; opts: string[] };
const rows = computed((): Row[] => {
  const opts = props.paramsMeta.params_options ?? {};
  const bools: string[] = props.paramsMeta.params_boolean ?? [];
  const files: string[] = props.paramsMeta.params_file ?? [];
  const out: Row[] = [];
  for (const [k, flag] of Object.entries(props.paramsMeta.params)) {
    let type: RowType = 'text';
    if (bools.includes(k)) type = 'boolean';
    else if (opts[k] !== undefined) type = 'options';
    out.push({ key: k, flag, required: props.paramsMeta.required.includes(k), type, opts: opts[k] ?? [] });
  }
  return out;
});
const fileKeys = computed((): string[] => props.paramsMeta.params_file ?? []);
```

- [ ] **步骤 2：fill() 回填规则（options 默认首个；boolean 默认 false；存值不在列表回落首个）**

```ts
function fill(): void {
  formId.value = props.id;
  formDesc.value = props.desc ?? '';
  const opts = props.paramsMeta.params_options ?? {};
  const bools: string[] = props.paramsMeta.params_boolean ?? [];
  const init: Record<string, string> = {};
  for (const row of rows.value) {
    if (row.type === 'boolean') init[row.key] = 'false';            // §#9D：boolean 恒默认 false（'false' 不写入 yaml）
    else if (row.type === 'options') init[row.key] = row.opts[0];   // options 恒默认首个选项（无未设置占位）
    else init[row.key] = '';
  }
  if (isEdit.value) {
    for (const [k, v] of Object.entries(props.values)) {
      const t = (v ?? '').trim();
      if (t.length === 0) continue;
      const row = rows.value.find((r) => r.key === k);
      if (!row) continue; // 存值 key 不在 params 表（开发阶段无兼容）
      if (row.type === 'options' && !row.opts.includes(t)) init[k] = row.opts[0]; // 回落首个
      else init[k] = t;
    }
  }
  formValues.value = init;
  saveError.value = null;
}
```

- [ ] **步骤 3：「选择文件」按钮 + 三分支模板渲染**

flag-grid 内 template（原第 115–127 行替换）：

```html
<div class="flag-grid">
  <template v-for="row in rows" :key="row.key">
    <label class="label flag-label">{{ row.flag }}</label>
    <!-- boolean / options → 原生 select；text → input（params_file 行右侧加「选择文件」按钮） -->
    <div class="row-cell" v-if="row.type === 'text'">
      <input
        class="input"
        :class="{ error: requiredError(row) }"
        :value="formValues[row.key]"
        @input="(ev: Event) => { formValues[row.key] = (ev.target as HTMLInputElement).value; }"
      />
      <button v-if="fileKeys.includes(row.key)" class="btn btn-secondary file-btn" @click="pickFile(row.key)">选择文件</button>
    </div>
    <select v-else-if="row.type === 'boolean'" class="select" :value="formValues[row.key]"
            @change="(ev: Event) => { formValues[row.key] = (ev.target as HTMLSelectElement).value; }">
      <option value="false">false</option>
      <option value="true">true</option>
    </select>
    <select v-else class="select" :value="formValues[row.key]"
            @change="(ev: Event) => { formValues[row.key] = (ev.target as HTMLSelectElement).value; }">
      <option v-for="o in row.opts" :key="o" :value="o">{{ o }}</option>
    </select>
  </template>
</div>
```

脚本补两个函数（pickFile、requiredError）：

```ts
function requiredError(row: Row): boolean {
  return props.paramsMeta.required.includes(row.key) && (formValues.value[row.key] ?? '').trim().length === 0;
}
async function pickFile(key: string): Promise<void> {
  const picked = await invoke<string | null>('open_file_dialog', key);
  if (picked !== null) formValues.value[key] = picked; // null（取消）不动
}
```

- [ ] **步骤 4：scoped CSS——grid 自适应 + 圆角防护 + file-btn**

```css
.flag-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: auto 1fr;   /* #8：130px → auto，长 label（--chat-template-file）完整可见 */
  gap: 6px 10px;
  align-items: center;
}
.flag-label {
  text-align: right;
  font-family: var(--font-mono);
  white-space: nowrap;               /* #8：去掉 overflow/ellipsis，保留 nowrap */
}
.modal-box {
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  overflow-y: auto;
  overflow-x: hidden;                /* #11 兜底：内容不得横向撑破卡片 */
}
.row-cell { display: flex; gap: 8px; min-width: 0; }
.row-cell .input { flex: 1; }
.file-btn { width: 72px; flex-shrink: 0; height: var(--h-control); padding: 0 6px; font-size: var(--fs-label); }
.row-cell .select, .flag-grid > .select { width: 100%; min-width: 0; }
```

（.select 在 style.css 已有 width:100%，scoped 内重复声明只为保证 grid cell 内生效。）

- [ ] **步骤 5：dev 手动检查**

运行：`npm run dev`，目检：① jinja/reasoning_preserve 行为 false|true 下拉默认 false；② spec_type/load_mode/reasoning* 为下拉默认首个选项；③ m/mmproj/chat_template_file 行右侧出现「选择文件」按钮，m 弹出 gguf 过滤对话框、chat_template_file 无过滤，选定回填输入框；④ --chat-template-file 标签完整可见，弹窗四角圆角完好。

- [ ] **步骤 6：Commit**

```bash
git add src/modules/TemplateModal.vue
git commit -m "feat: template modal three-way rows (options/boolean dropdowns) + file picker + adaptive flag-grid"
```

（台账行 3。）

---

### 任务 4：TemplateModal——attemptedSave 保存后才校验 + 去 * 号 + id「必填」文案（#3/#4/#5）

**文件：**
- 修改：`src/modules/TemplateModal.vue`

- [ ] **步骤 1：门控状态**

脚本加：

```ts
const attemptedSave = ref(false);
function fill(): void { /* …步骤 3 的 fill… */ attemptedSave.value = false; } // 打开弹窗重置（在 fill 开头）
async function save(): Promise<void> {
  attemptedSave.value = true;   // 保存失败不重置；关闭经 fill() 重置
  /* …其余 save 逻辑不变… */
}
```

- [ ] **步骤 2：idError 空值文案 + * 号移除**

idError computed 空值分支 `'id 必填'` → **`'必填'`**（格式/超长/重复分支文案不变）。模板第 118 行 flag-label 去掉 `<span v-if="row.required" title="必填">*</span>`，只留 `{{ row.flag }}`（required 数据仍读取，仅展示变化）。

- [ ] **步骤 3：模板校验提示门控**

三处渲染加 attemptedSave 条件：

```html
<!-- id 输入框红框：原 :class="{ error: idError !== null }" -->
:class="{ error: attemptedSave && idError !== null }"
<!-- id 红字：原 v-if="idError" -->
<p v-if="attemptedSave && idError" class="error-text">{{ idError }}</p>
<!-- 必填行红框（步骤 3 已抽成 requiredError(row)，加门控）：
     模板 :class="{ error: attemptedSave && requiredError(row) }" -->
<!-- 汇总行：原 v-if="emptyRequired.length > 0" -->
<p v-if="attemptedSave && emptyRequired.length > 0" class="error-text">必填项未填写：…</p>
```

保存按钮 disabled（规格 #3：打开时恒可用，仅 saving 态禁用）：

```html
<button class="btn btn-primary" :disabled="saving" @click="save">
```

- [ ] **步骤 4：dev 手动检查**

运行 `npm run dev`：新建模板弹窗打开即无任何红框/红字、-m 行标签无 * 号；空表单点保存 → id 下红字「必填」+ -m 输入框红框 + 「必填项未填写：-m」汇总行，保存被拒。

- [ ] **步骤 5：Commit**

```bash
git add src/modules/TemplateModal.vue
git commit -m "feat: modal validation only after save attempt; drop required asterisk"
```

（台账行 4。）

---

### 任务 5：无配置文案——TemplateModule 深色「目前没有模板配置」+ LaunchBar 移除提示行、下拉占位规则（#2/#6）

**文件：**
- 修改：`src/modules/TemplateModule.vue`、`src/modules/LaunchBar.vue`

- [ ] **步骤 1：TemplateModule #2**

模板第 79–80 行替换：

```html
<p v-if="missing && error" class="label">目前没有模板配置</p>
<p v-else-if="error && !missing" class="error-text">{{ error }}</p>
```

（MISSING → 深色普通文案，不再红字、不展示原始错误串；非 MISSING 错误仍红字原文案；configs={} 的「暂无配置」灰字保持。）

- [ ] **步骤 2：LaunchBar #6 + 下拉文案规则**

- 模板第 62 行整行 `<p v-if="error" class="error-text">…</p>` **删除**（MISSING / 空 configs 一律不显示提示文字；其余运行时错误仍由主进程日志 sys 行与状态按钮 disabled 体现）。
- script：`error` ref 保留但仅用于内部判断（可选清理——为免死代码，将 load() catch 内 `error.value = msg` 删除，只留 missing/configs/selected 赋值；missing ref 保留供占位文案用）。
- select 占位项与 option 文案（第 64–69 行替换）：

```html
<select class="select" v-model="selected" :disabled="state.running">
  <option value="" disabled>
    {{ missing || (configs !== null && Object.keys(configs).length === 0) ? '（目前没有模板配置）' : '选择配置…' }}
  </option>
  <option v-for="id in configs ? Object.keys(configs) : []" :key="id" :value="id">{{ id }}</option>
</select>
```

规则：未选择 → 「选择配置…」；MISSING/空 → 「（目前没有模板配置）」（不可选占位项）；选中后只显示 id 名（去掉「— desc」后缀）。启动按钮 disabled 逻辑不变。

- [ ] **步骤 3：dev 手动检查**

全新态（llama_launch_configs.yaml 不存在）：模板模块一行深色「目前没有模板配置」、启动控制模块无任何提示行、下拉占位「（目前没有模板配置）」；删光配置后占位同文案；有 ≥1 配置时占位恢复「选择配置…」且选中项只显示 id。

- [ ] **步骤 4：Commit**

```bash
git add src/modules/TemplateModule.vue src/modules/LaunchBar.vue
git commit -m "feat: empty-state copy without red text; select placeholder rules"
```

（台账行 5。）

---

### 任务 6：DirModule——「…」按钮 + title（#1）

**文件：**
- 修改：`src/modules/DirModule.vue`

- [ ] **步骤 1：按钮文案**

模板第 63 行替换：

```html
<button class="btn btn-secondary" title="选择 llama.cpp 安装目录" @click="pickDir">…</button>
```

flex 布局（input + button）保持不动；文字变短后原错位根因自然消失。

- [ ] **步骤 2：dev 手动检查**

按钮仅显示「…」，hover 出现 title 提示；输入框与按钮同行不换行。

- [ ] **步骤 3：Commit**

```bash
git add src/modules/DirModule.vue
git commit -m "feat: dir picker button uses ellipsis with hover title"
```

（台账行 6。）

---

### 任务 7：全局滚动条美化（#12，style.css）

**文件：**
- 修改：`src/style.css`

- [ ] **步骤 1：追加全局滚动条样式**（文件末尾，不加依赖、不引第三方库）

```css
/* ---- #12 滚动条美化（Solarized 面板底色 + border 色 thumb；主要滚动区：modal-box / log-view）---- */
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background: #CDD3D8;              /* border 色附近浅灰 */
  border-radius: 5px;
  border: 2px solid var(--card);    /* 与容器留白，视觉悬浮 */
}
*::-webkit-scrollbar-thumb:hover { background: #AEB5BD; }
.log-view, .modal-box {
  scrollbar-width: thin;            /* Firefox */
  scrollbar-color: #CDD3D8 transparent;
}
```

- [ ] **步骤 2：dev 手动检查**

log-view（灌入 >500 行日志后）与 modal-box（28 参数表单滚到底）滚动条为定制样式：10px 宽、圆角 thumb、hover 加深；不再出现浏览器默认粗灰条。

- [ ] **步骤 3：Commit**

```bash
git add src/style.css
git commit -m "feat: custom thin scrollbars (webkit + firefox) on log panel and modal"
```

（台账行 7。）

---

### 任务 8：全局下拉菜单限高 3 行 + 风格一致（#13）

> 实现选型（YAGNI，规格 #13）：维持原生 <select>。Electron/Chromium 下 OS 弹层原生支持滚轮/方向键滚动；先目检，不满足才做自定义下拉（步骤 3）。

**文件：**
- 修改：`src/modules/TemplateModal.vue`、`src/modules/LaunchBar.vue`（可能仅确认）+ `src/style.css`（如走自定义下拉）

- [ ] **步骤 1：dev 目检 native select**

运行 `npm run dev`，分别展开 spec_type（11 项）、load_mode（6 项）、配置下拉（需 ≥3 个配置——可临时建 3 条空 desc 配置）。目检：OS 弹层是否约 3 行可视高 + 可滚动选到末尾项（dio / draft-dspark）。

- [ ] **步骤 2A：若原生满足（预期路径）**

不写新组件；确认所有 <select> 已用 `.select` class（round 8px 圆角由 style.css 既有规则保证）。本任务只记录目检结果。

- [ ] **步骤 2B / 步骤 3：若原生不满足——自定义下拉（弹层）**

TemplateModal 的 options/boolean 行与 LaunchBar 配置 select 替换为轻量自定义下拉组件（共享）：

```ts
// src/components/Dropdown.vue（新建，绝对定位 ul + overflow-y auto）
<script setup lang="ts">
import { onMounted, ref } from 'vue';
const props = defineProps<{ value: string; options: Array<{ value: string; label: string }> }>();
const emit = defineEmits<{ (e: 'update:value', v: string): void }>();
const open = ref(false);
function pick(v: string): void { emit('update:value', v); open.value = false; }
onMounted(() => {
  const close = (ev: MouseEvent) => { if (!(ev.target as HTMLElement).closest('.dropdown')) open.value = false; };
  document.addEventListener('click', close);
  return () => document.removeEventListener('click', close);
});
</script>
<template>
  <div class="dropdown">
    <button class="btn select-trigger" @click.stop="open = !open">
      {{ props.options.find((o) => o.value === props.value)?.label ?? props.options[0]?.label }} ▾
    </button>
    <ul v-if="open" class="dropdown-panel">
      <li v-for="o in props.options" :key="o.value"
          :class="{ option: true, selected: o.value === props.value }" @click="pick(o.value)">{{ o.label }}</li>
    </ul>
  </div>
</template>
```

style.css 追加（弹层按卡片风格 + #12 滚动条自动生效）：

```css
.dropdown { position: relative; width: 100%; }
.select-trigger { width: 100%; text-align: left; height: var(--h-control); }
.dropdown-panel {
  position: absolute; top: calc(var(--h-control) + 2px); left: 0; right: 0; z-index: 20;
  margin: 0; padding: 4px; list-style: none;
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-btn);
  box-shadow: 0 4px 12px rgba(16, 24, 40, .12);
  max-height: 116px;              /* ≈3 行（28px/行 + padding） */
  overflow-y: auto;
}
.dropdown-panel .option { padding: 5px 8px; border-radius: 4px; cursor: pointer; }
.dropdown-panel .option:hover { background: #F6F7F8; }   /* 与 btn:hover 一致 */
.dropdown-panel .option.selected { color: var(--accent); font-weight: 600; }
```

- [ ] **步骤 4：验收目检**

spec_type（11 项）/ load_mode（6 项）展开后可视区约 3 行、可滚动选到 dio；配置下拉 ≥3 项同理；弹层白底、1px 边框、8px 圆角、hover 底色 #F6F7F8、点击外部关闭。

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: global dropdown cap-height (3 rows) with scroll, card-style panel"
```

（台账行 8。）

---

### 任务 9：全量测试回归 + release 打包验收（#1–#13 前端清单 + 内置模板检查）

**文件：**
- 修改（可能）：dev 中发现的零散修复；`dist-release/` 产物；`docs/superpowers/superpowers-sdd-progress.md`

- [ ] **步骤 1：全量测试**

运行：`npx vitest run && npx tsc -p tsconfig.main.json && npm run build`
预期：config.test 13（10+3）+ build.test 11（6+5）全绿，process.test 维持 v1 状态；编译无错；dist/dist-main 产出。

- [ ] **步骤 2：release portable**

运行：`npx electron-builder --win portable`
产物：`dist-release/lms-launcher-1.0.0-portable.exe`（开发阶段保持 version = 1.0.0，首个可运行稳定版后再考虑升级）。

- [ ] **步骤 3：前端验收清单（规格 §四，dev 窗口逐项过）**

1. 全新态：模板模块深色「目前没有模板配置」；启动控制无任何提示行、下拉占位「（目前没有模板配置）」——无红字。
2. 弹窗打开即时无红框/红字；空表单点保存 → id 下「必填」+ -m 红框 + 汇总行。
3. spec_type/load_mode/reasoning* 为下拉且默认首个选项；jinja/reasoning_preserve 为 false|true 下拉默认 false；保存后 yaml：boolean true 写入 'true'、false 不写入，options 写入所选值；日志区启动命令摘要出现 `--jinja`（true）/不拼（false）。
4. m/mmproj「选择文件」按钮出 gguf 过滤对话框；chat_template_file 任意文件；选定回填。
5. flag-grid 全部标签完整可见；弹窗四角圆角完好；滚动条为定制样式。
6. 「选择目录」按钮仅 …，hover 显 title。
7. spec_type（11 项）/load_mode（6 项）下拉展开后可视区约 3 行、可滚动选到末尾项；配置下拉 ≥3 项时同样行为。

- [ ] **步骤 4：内置 llama_params.yaml 检查**

在干净目录解压 portable exe，首启后查看同目录 llama_params.yaml：必须含 params（28 key）+ required + params_options（5 行）+ params_boolean + params_file 三段完整新模板（任务 1 defaultParams 产物）。

- [ ] **步骤 5：台账收尾 + Commit**

docs/superpowers/superpowers-sdd-progress.md v1.1 批次表全部 done；commit `chore: sdd ledger v1.1 complete`。

---

## 自检记录（writing-plans 三问）

1. **规格覆盖度：** #1→任务6；#2/#6→任务5；#3/#4/#5→任务4；#7（含#10）→任务2+任务3；#8→任务3步骤4；#9→任务1（schema/build）+任务3步骤1–3（UI）；#11→任务3步骤4（overflow-x 兜底 + #8 根因修复）；#12→任务7；#13→任务8。§四验收清单→任务9步骤3/4。无遗漏。
2. **占位符扫描：** 无 TODO/待定；所有代码块完整；「若原生不满足」分支给出了完整自定义下拉实现（Dropdown.vue + CSS），非描述性空话。
3. **类型一致性：** ParamsFile 五字段名三处一致（config.ts / TemplateModule ParamMeta / TemplateModal props）；open_file_dialog 命令名在 main.ts 与 pickFile invoke 一致；Row.type 三分支值 text|options|boolean 全程一致；summarize 与 buildArgVector 的 boolean 规则描述逐字对齐。

---
*计划生成：2026-08-23 · 状态：待终审（用户）· 2026-08 更新：worktree 已合并回主仓库 master，工作目录改为 D:\AI\Workspace\lms_launcher*
