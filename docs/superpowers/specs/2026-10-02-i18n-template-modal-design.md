# LMS 启动器 i18n · S5 模板弹窗设计

**日期：** 2026-10-02
**分支：** feat/i18n
**分片：** S5（模板弹窗）
**设计权威：** `2026-09-22-i18n-design.md`（跨切片不变量）+ `2026-09-22-i18n-slices.md`（分片卡）
**性质：** S5 独立规格（分片卡标注「建议展开」：38 条说明 + 校验 + 明细，预计 > 1 人日）

> 本文件与设计总纲冲突时，以设计总纲为准；本文件只细化 S5 的实现契约。

---

## 1. 背景与目标

`src/modules/TemplateModal.vue`（新建 / 编辑模板弹窗）是 S5 的唯一业务文件。它是全项目文案最密集的组件：38 条参数说明 tooltip、必填校验、删除二次确认、VRAM 指示与明细浮层。

**目标：** 弹窗内全部渲染端文案接入 `t()`，中英即时切换；38 条参数说明译成英文（第一行长 flag 保留原文）；既有 899 行中文断言零改动全绿。

**关键事实（探索结论）：**

- `defaultParams()`（`src-main/config.ts:184`）恰好 38 个参数 key，与组件内 `PARAM_TIPS` 的 38 条一一对应（测试 `every_param_label_carries_two_line_tooltip_long_flag_plus_zh` 已锁定该数量）。
- `PARAM_TIPS` 第一行是**长 flag**（如 `-md, --spec-draft-model`），与 params 表里 label 显示的**短 flag**（`-md`）不是同一个串——拆表时不可混用。
- 渲染端 `t()` 读响应式 `lang` ref：**在 `computed` / 模板内调用即自动重译**，无需「存 key 再翻译」的额外机制（该机制是 S0 为 `saveError` 这类**非响应式快照**引入的）。
- 现有测试大量依赖中文串定位元素（`名字`、`-m`、`删除模板`、`必填项未填写`、明细行文本），**zh 词典值必须与现状逐字一致**。

---

## 2. 范围与非目标

### 2.1 范围内

| # | 文案组 | 现状位置（`TemplateModal.vue`） |
|---|---|---|
| 1 | 弹窗标题「新建模板」/「编辑模板」 | 模板 L366 |
| 2 | 名字 label + placeholder | L380–381 |
| 3 | 必填「必填」+「必填项未填写：…」 | L194、L414 |
| 4 | 38 条参数说明（第二行） | L91–130 |
| 5 | 删除确认标题 + 正文（含超长名截断 tip） | L246–247、L466 |
| 6 | VRAM 指示 aria、明细浮层标题、7 条明细行 | L340–348、L435、L453 |
| 7 | VRAM 降级文案 4 条 + 估算中 + IPC 失败兜底 | L283、L351–356 |
| 8 | 图标按钮 aria：关闭弹窗 / 保存 / 删除 / 选择文件（tooltip 同值） | L368、L396、L422、L439 |

### 2.2 非目标（本轮零改动）

1. **主进程返回的错误原文**：`errMsg(e)` 透传的 `VALIDATION:` / `IO:` / `MISSING:` 文案，以及 `vram_estimate` 返回的 `reason`（如 `GGUF: 非 GGUF 文件（magic 不符）`）→ 归 **S10**（主进程错误消息）。
2. **`ConfirmDialog.vue` 的 [取消] / [确认] 按钮与默认 aria** → 归 **S9**；S5 只改调用方传入的 `title` / `message` / `tip`。
3. **不译项**：`id: {id}` 前缀与值、布尔下拉的 `true` / `false`、选项值（`q4_0` / `off` / `auto` …）、单位 `GB` 与占位 `--`、VRAM 数字、`--` 与 `/` 分隔、数字格式（`22.0`）。
4. 不引入新依赖；不改 `TemplateModule.vue`；不改主进程文件；不改既有 zh 文案的字面量。

---

## 3. key 契约（新增 66 个）

scope `tplModal` 已在设计总纲 §3.2 白名单内，无需登记新 scope；`common` 同理。

### 3.1 弹窗框架（12）

| key | zh | en |
|---|---|---|
| `tplModal.title.new` | 新建模板 | New template |
| `tplModal.title.edit` | 编辑模板 | Edit template |
| `tplModal.close` | 关闭弹窗 | Close dialog |
| `tplModal.name.label` | 名字 | Name |
| `tplModal.name.placeholder` | 如：qwen27b 日常推理 | e.g. qwen27b daily reasoning |
| `tplModal.required` | 必填 | Required |
| `tplModal.required.missing` | 必填项未填写：{names} | Required not filled: {names} |
| `tplModal.btn.pickFile` | 选择文件 | Select file |
| `tplModal.btn.save` | 保存 | Save |
| `tplModal.btn.delete` | 删除 | Delete |
| `tplModal.delete.title` | 删除模板 | Delete template |
| `tplModal.delete.message` | 确定删除配置「{name}」吗？ | Delete template "{name}"? |

- `tplModal.required.missing` 的 `{names}` 由组件用 `t('common.listSep')` 拼接（见 §3.4）。
- `tplModal.delete.message` 的 `{name}` 传**截断后**的名字；`tip` 传**未截断**的完整正文。
- `tplModal.close` / `tplModal.btn.save` 与 `settings.close` / `settings.save` 同值但**不合并**：scope 分离，避免任一分片改动波及其它弹窗文案。

### 3.2 参数说明（38）

第一行长 flag 不进词典（见 §4.1）；下表只登记第二行。

| key（`tplModal.tip.<paramKey>`） | zh（现状逐字） | en |
|---|---|---|
| `.m` | 模型文件（gguf） | Model file (gguf) |
| `.mmproj` | 视觉投影文件（mmproj gguf） | Vision projector file (mmproj gguf) |
| `.image_min_tokens` | 每张图片消耗的 token 数（下限） | Minimum tokens consumed per image |
| `.alias` | 模型服务别名 | Model server alias |
| `.ngl` | 放到 GPU 的层数（N/auto/all） | Layers offloaded to GPU (N/auto/all) |
| `.fa` | Flash Attention 开关（on/off/auto） | Flash Attention switch (on/off/auto) |
| `.n_cpu_moe` | MoE 专家权重保留在 CPU 的前 N 层 | MoE expert weights kept on CPU for the first N layers |
| `.load_mode` | 模型加载模式（auto/mmap/mlock/dio 等） | Model load mode (auto/mmap/mlock/dio, etc.) |
| `.np` | 并发请求数（slots） | Concurrent requests (slots) |
| `.c` | 上下文长度（ctx 大小） | Context length (ctx size) |
| `.b` | 批处理大小（batch） | Batch size (batch) |
| `.ub` | 物理最大批大小（ubatch） | Physical max batch size (ubatch) |
| `.t` | CPU 线程数 | CPU threads |
| `.tb` | 批处理和提示词处理的线程数 | Threads for batch and prompt processing |
| `.ctk` | KV 缓存 K 部分的量化类型 | Quantization type for the K part of the KV cache |
| `.ctv` | KV 缓存 V 部分的量化类型 | Quantization type for the V part of the KV cache |
| `.spec_type` | 投机解码类型（none/draft-mtp/draft-dflash/draft-dspark） | Speculative decoding type (none/draft-mtp/draft-dflash/draft-dspark) |
| `.spec_draft_n_max` | 投机解码一次最多生成的 token 数（默认 3） | Max tokens per speculative decoding step (default 3) |
| `.md` | 投机解码草稿模型文件（gguf） | Draft model file for speculative decoding (gguf) |
| `.ngld` | 草稿模型放到 GPU 的层数 | Draft model layers offloaded to GPU |
| `.temp` | 采样温度 | Sampling temperature |
| `.top_p` | nucleus sampling 的 p 值 | Nucleus sampling p value |
| `.top_k` | 候选 token 数上限 | Max number of candidate tokens |
| `.min_p` | 最小概率阈值 | Minimum probability threshold |
| `.presence_penalty` | 出现惩罚 | Presence penalty |
| `.repeat_penalty` | 重复惩罚 | Repeat penalty |
| `.jinja` | 是否用 jinja 解析模板（true/false） | Whether to use jinja for the chat template (true/false) |
| `.chat_template_file` | 自定义 jinja 模板文件 | Custom jinja template file |
| `.reasoning` | 推理/思考模式开关（on/off/auto） | Reasoning / thinking mode switch (on/off/auto) |
| `.reasoning_format` | 推理输出的格式（none/hide/deepseek） | Reasoning output format (none/hide/deepseek) |
| `.reasoning_effort` | 推理强度档位（default~max） | Reasoning effort level (default~max) |
| `.reasoning_preserve` | 保留历史推理块（true/false） | Preserve historical reasoning blocks (true/false) |
| `.no_reasoning_preserve` | 丢弃历史推理块（true/false） | Drop historical reasoning blocks (true/false) |
| `.port` | 服务监听端口 | Server listening port |
| `.metrics` | 开启 Prometheus 指标（true/false） | Enable Prometheus metrics (true/false) |
| `.fit` | 自动调整未设置参数以适配显存（on/off） | Auto-adjust unset params to fit VRAM (on/off) |
| `.fit_ctx` | `--fit` 可设置的最小 ctx 大小 | Minimum ctx size that --fit may set |
| `.fit_target` | `--fit` 的目标显存（MiB0,MiB1,...） | Target VRAM for --fit (MiB0,MiB1,...) |

**翻译风格（已定稿）：** 简洁名词短语，与 zh 信息量逐条对应；括号内的取值域与专名（`N/auto/all`、`MiB0,MiB1,...`、`true/false`）原样保留，翻译为半角括号。

### 3.3 VRAM 指示与明细（15）

| key | zh | en |
|---|---|---|
| `tplModal.vram.aria` | 显存估算明细 | VRAM estimate details |
| `tplModal.vram.tip.title` | 显存占用预测，仅供参考 | VRAM estimate, for reference only |
| `tplModal.vram.row.model` | 模型文件（-m） | Model file (-m) |
| `tplModal.vram.row.mmproj` | 视觉投影（--mmproj） | Vision projector (--mmproj) |
| `tplModal.vram.row.kv` | KV 缓存（-c/-ctk/-ctv/-ngl） | KV cache (-c/-ctk/-ctv/-ngl) |
| `tplModal.vram.row.batch` | batch 缓冲（-b/-ub） | Batch buffers (-b/-ub) |
| `tplModal.vram.row.draft` | draft 缓存（--spec-type + --spec-draft-n-max） | Draft cache (--spec-type + --spec-draft-n-max) |
| `tplModal.vram.row.draftModel` | draft 模型（-md） | Draft model (-md) |
| `tplModal.vram.row.fixed` | GPU 固定开销约 2GB | ~2 GB fixed GPU overhead |
| `tplModal.vram.fallback.noModel` | 填写模型文件（-m）后自动估算 | Fill in the model file (-m) to estimate |
| `tplModal.vram.fallback.noTotal` | 未配置显卡显存，点击 VRAM 按钮设置 | VRAM not set, click the VRAM button to set it |
| `tplModal.vram.fallback.retry` | 填写模型文件后自动估算 | Fill in the model file to estimate |
| `tplModal.vram.fallback.fail` | 估算失败 | Estimate failed |
| `tplModal.vram.fallback.pending` | 估算中… | Estimating... |
| `tplModal.vram.ipcFail` | IPC 调用失败 | IPC call failed |

明细行的数值拼装（`label + ' ' + gb.toFixed(1) + ' GB'`）在模板内完成，`GB` 与数字不译；`note` 行（`row.fixed`）不拼数值。

### 3.4 列表分隔符（1，scope common）

| key | zh | en |
|---|---|---|
| `common.listSep` | 、 | , |

用于 `tplModal.required.missing` 的 `{names}` 拼接：`emptyRequired.map((k) => paramsMeta.params[k]).join(t('common.listSep'))`（列表元素仍是 flag 原文，不译）。

---

## 4. 组件改造设计

### 4.1 PARAM_TIPS → PARAM_FLAGS + 词典

现状是单条字符串 `'-m, --model\n模型文件（gguf）'`。改为两张平行表：

```ts
// 第一行 = llama.cpp 官方长 flag（全称），不译；第二行进词典 tplModal.tip.<key>
const PARAM_FLAGS: Record<string, string> = {
  m: '-m, --model',
  mmproj: '-mm, --mmproj',
  // …共 38 条，逐条与现状 PARAM_TIPS 第一行一致
};
```

`rows` computed 里：

```ts
out.push({
  key: k, flag, required: props.paramsMeta.required.includes(k), type, opts: opts[k] ?? [],
  tip: PARAM_FLAGS[k] === undefined ? '' : PARAM_FLAGS[k] + '\n' + t('tplModal.tip.' + k),
});
```

- **未收录 key 仍不弹 tooltip**（`PARAM_FLAGS[k] === undefined` → `tip = ''`，`onFlagEnter` 对空串直接 return），与现状行为一致。
- `rows` 是 computed，内部调用 `t()` 会读 `lang` ref → **切换语言时 38 条 tooltip 文本自动重算**。
- 已展开的 `flagTip.value.text` 是 hover 瞬间的快照：hover 中切换语言不刷新，移开再 hover 即为新语言。**接受**（与设计 §3.5「已产生内容不回改」一致）。

### 4.2 校验文案的即时重译

- `descError` 现状返回字面量 `'必填'`：改为 `return (formDesc.value ?? '').trim().length === 0 ? t('tplModal.required') : null;`。它是 computed，随 `lang` 变化自动重算。
- 模板里的 `{{ descError }}` 与 `必填项未填写：…` 改为：
  - `t('tplModal.required.missing', { names: emptyRequired.map((k) => props.paramsMeta.params[k]).join(t('common.listSep')) })`
- `saveError`（`errMsg` 透传）**保持 ref<string|null> 原样**，不翻译（§2.2 第 1 条）。

### 4.3 删除确认的 computed 化（关键修正）

现状 `deleteFullMsg` 是 **setup 顶层静态常量**，只求值一次——直接换成 `t()` 会导致**切换语言后完整 tip 仍是旧语言**。必须改为 computed：

```ts
const deleteFullMsg = computed(() => t('tplModal.delete.message', { name: props.name || '' }));
const deleteShortMsg = computed(() => t('tplModal.delete.message', { name: deleteMsgName.value }));
```

模板绑定同步改为 `:message="deleteShortMsg"` 与 `:tip="visualWidth(props.name || '') > NAME_BUDGET + 2 ? deleteFullMsg : undefined"`。

截断契约不变：`NAME_BUDGET = 16` + grace 2，仅「手动截断」时传完整 tip。

### 4.4 VRAM 明细与降级

- `breakdown` computed 的 7 条 label 改 `t('tplModal.vram.row.*')`；`note` 行不拼数值的规则不变。
- `breakdownFallback` computed 的 5 条分支改 `t('tplModal.vram.fallback.*')`；`(vramReason ?? t('tplModal.vram.fallback.fail'))` 保留主进程 reason 优先。
- `scheduleVramEstimate` 的 `.catch` 里 `'IPC 调用失败'` → `t('tplModal.vram.ipcFail')`。**注意**：该值写入 `vramReason` ref（非响应式快照），切换语言不重译——与主进程 reason 同属「已产生内容」，接受。
- 单位 `GB`、占位 `--`、`/ ` 分隔与 `.toFixed(1)` 全部保持。

### 4.5 模板内的其余替换

| 位置 | 替换 |
|---|---|
| 标题 | `{{ isEdit ? t('tplModal.title.edit') : t('tplModal.title.new') }}` |
| [x] aria | `t('tplModal.close')` |
| 名字 label / placeholder | `t('tplModal.name.label')` / `:placeholder="t('tplModal.name.placeholder')"` |
| 选择文件按钮 | `:data-tooltip` 与 `:aria-label` 均 `t('tplModal.btn.pickFile')` |
| 删除按钮 aria | `t('tplModal.btn.delete')` |
| 保存按钮 aria | `t('tplModal.btn.save')` |
| VRAM 明细 aria | `t('tplModal.vram.aria')` |
| 浮层标题行 | `t('tplModal.vram.tip.title')` |
| 删除确认 title | `t('tplModal.delete.title')` |

---

## 5. 英文文案规则与布局

- 术语表（设计 §2）：模板 / 配置统一 `template`；显存 `VRAM`；专名 `llama-server` / `GGUF` / `jinja` 保留。
- 标点用半角；中文直角引号「」在英文里换半角双引号 `"..."`（仅 `tplModal.delete.message` 一处）。
- **不预置 `html[lang="en"]` 作用域 CSS**（本轮已定）：受影响元素要么是 `position: fixed` + `nowrap` 的自由宽度浮层（`.flag-tip` / `.vram-tip`），要么自带换行与 `word-break: break-all` 兜底（`.error-text` / `.confirm-sub`）；`.flag-grid` 的 label 列内容是不译的 flag，列宽不受语言影响。
- 中文布局冻结：不新增、不改动任何既有 CSS 规则。

---

## 6. 测试设计

### 6.1 既有断言不动

`TemplateModal.test.ts` 现有 899 行、全部在 zh 下运行（`test-setup.ts` 已固定 zh）。新增词典的 **zh 值必须与现状字面量逐字一致**，否则 `名字` / `必填项未填写` / `删除模板` / 明细行 / tooltip 第二行含 CJK 等断言会红。

### 6.2 新增块：en 冒烟 10 条

追加到文件末尾，结构同 S4：

```ts
describe('TemplateModal en 冒烟', () => {
  beforeEach(() => { applyLangLocal('en'); });
  afterEach(() => { applyLangLocal('zh'); });
  // …
});
```

| # | 断言点 |
|---|---|
| 1 | 新建标题 = `New template`；`:open` 编辑态 = `Edit template` |
| 2 | 名字 label = `Name`、placeholder = `e.g. qwen27b daily reasoning` |
| 3 | 必填：清空名字点保存 → 显示 `Required` 且不发 `save_config` |
| 4 | 必填项未填写：`Required not filled: -m`（单元素无分隔符）+ 双元素用 `", "` 分隔（用 `paramsMeta.required` 注入 `['m','port']` 的临时 meta 断言） |
| 5 | 选择文件按钮 `data-tooltip` 与 `aria-label` = `Select file`；关闭/保存/删除 aria = `Close dialog` / `Save` / `Delete` |
| 6 | 删除确认：标题 `Delete template`、正文 `Delete template "qwen27b 日常推理"?` |
| 7 | 参数说明抽样：`-m` 行的 `data-tooltip` = `-m, --model\nModel file (gguf)`（验第一行不译 + 第二行译） |
| 8 | VRAM 明细：`{"model":16,"kv":4,"fixed":2,"mmproj":0,"batch":0,"draft":0}` → 3 行，首行 `Model file (-m) 16.0 GB`、末行 `~2 GB fixed GPU overhead` |
| 9 | VRAM 降级：未填 `-m` → `Fill in the model file (-m) to estimate`；未配 total → `VRAM not set, click the VRAM button to set it` |
| 10 | 浮层标题 = `VRAM estimate, for reference only`；`.vram-info` aria = `VRAM estimate details` |

### 6.3 新增：词典覆盖一致性单测（1 条）

遍历 `defaultParams().params` 的 38 个 key，断言 `dict.zh['tplModal.tip.' + k]` 与 `dict.en['tplModal.tip.' + k]` 均存在且 `trim().length > 0`，并断言 `PARAM_FLAGS` 覆盖同一 key 集合。

> 该断言放在 `TemplateModal.test.ts` 内（组件级锁定「params 表 → 词典」的对应关系），不新建文件。

### 6.4 收尾验证

- `npm test` 全绿（预期 34 文件 / 535 + 11 = 546 用例）。既有 S0 的 zh/en key 集合一致性单测自动覆盖 66 个新 key 的双语对称。
- `npm run build` 通过（渲染端跨目录 import `src-main/i18n/dict.ts` 已在 S0 验证）。
- 人工英文目视验收（留待用户）：tooltip 不溢出视口、删除确认框 360px 内不撑破、明细浮层不越界。

---

## 7. 验收点

1. 弹窗内所有可见文案与 aria/tooltip 随语言即时切换（无需重开弹窗）。
2. 38 条参数 tooltip：第一行长 flag 原文不变，第二行随语言切换。
3. 必填校验在切换语言后**同一条报错**即时改语言（computed 路径）。
4. 删除确认框标题与正文随语言切换；超长名截断与 hover tip 契约不变。
5. VRAM 明细 7 行与 4 条降级文案随语言切换；主进程 reason 原文透传。
6. 既有 899 行 zh 断言零改动全绿；词典 zh/en key 集合相等。
7. 不新增 / 不修改任何 CSS 规则；`TemplateModal.vue` 之外无业务文件改动（词典与测试除外）。

---

## 8. 风险与已定决策

| # | 风险 | 处置 |
|---|---|---|
| R1 | zh 词典值改写导致既有断言语义漂移 | 逐字照抄现状串；任何一处必须与 `TemplateModal.vue` 现文本一致 |
| R2 | `deleteFullMsg` 漏改 computed → 切语言后 tip 仍旧语言 | §4.3 明确要求 computed，en 冒烟第 6 条覆盖正文；实现后人工切语言复核 tip |
| R3 | 38 条 tip 漏译 / key 拼错 | §6.3 覆盖一致性单测（zh + en + PARAM_FLAGS 三方对齐） |
| R4 | 第一行 flag 与 params 表短 flag 混淆 | §4.1 明确 `PARAM_FLAGS` 只存 tooltip 第一行（长形式） |
| R5 | 英文 tooltip 过宽越出视口 | 本轮不预置 CSS；人工目视，若溢出再以 `html[lang="en"]` 兜底（设计 §3.6） |
| R6 | `vramReason` 快照不随语言重译 | 已知并接受（§4.4），属「已产生内容」；主进程 reason 归 S10 |

**已定决策台账（2026-10-02 grill 逐问定稿）：**

1. 文档形态：沿用既有命名两份文件（spec + plan）。
2. PARAM_TIPS 拆分：`PARAM_FLAGS` 原文表 + 词典 `tplModal.tip.<key>` 第二行。
3. tip key 形态：`tplModal.tip.<paramKey>`（3 段）。
4. 列表分隔符：新增 `common.listSep`（zh 「、」/ en `", "`）。
5. 删除确认英文：`Delete template` + `Delete template "{name}"?`（术语表统一 template）。
6. 范围边界：渲染端硬编码归 S5；主进程 reason 归 S10；`ConfirmDialog` 按钮归 S9。
7. 测试：10 条 en 冒烟 + 1 条词典覆盖单测。
8. 译文风格：简洁名词短语，逐条对应 zh。
9. 布局：不预置 en 专用 CSS，人工目视验收。
10. 收尾：沿用四步 commit 惯例；`slices.md` 状态与变更记录照写；spec/plan 保留。
