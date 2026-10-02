# LMS 启动器 i18n · S5 模板弹窗实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 `TemplateModal.vue` 的全部渲染端文案接入 `t()`，38 条参数说明译成英文（第一行长 flag 保留），中文界面零回归。

**架构：** 词典单一真源 `src-main/i18n/dict.ts` 新增 66 个 key（`tplModal.*` 65 个 + `common.listSep`）；组件内把 `PARAM_TIPS` 单串表拆成「原文 flag 表 + 词典说明」，其余文案直接换 `t()` 调用；`deleteFullMsg` 由静态常量改 computed；测试在 `TemplateModal.test.ts` 末尾追加 en 冒烟块。

**技术栈：** Vue 3 + TypeScript + Vitest（happy-dom）+ 自建轻量 `t()`（零新依赖）。

**规格：** `docs/superpowers/specs/2026-10-02-i18n-template-modal-design.md`

---

## 文件结构

| 文件 | 职责 | 改动 |
|---|---|---|
| `src-main/i18n/dict.ts` | 双语词典单一真源 | 新增 66 key × 2 语言 |
| `src/modules/TemplateModal.vue` | 模板弹窗全部文案 | `PARAM_TIPS` → `PARAM_FLAGS`；15 处文案接入 `t()` |
| `src/modules/TemplateModal.test.ts` | 弹窗契约测试 | 末尾追加 en 冒烟 10 条 + 词典覆盖 1 条（既有 899 行不动） |
| `docs/superpowers/specs/2026-09-22-i18n-slices.md` | 分片看板 | S5 行 ☐→◐→✅ + 变更记录 |

**不动：** `ConfirmDialog.vue`（S9）、`TemplateModule.vue`、任何主进程业务文件、任何 CSS 规则。

---

## 任务 1：词典新增 66 个 key

**文件：**
- 修改：`src-main/i18n/dict.ts`

- [ ] **步骤 1：在 `common.cancel` 之后插入分隔符 key**

zh 段（`'common.cancel': '取消',` 下一行）：

```ts
    // S5 模板弹窗（2026-10-02-i18n-template-modal-design）：列表类文案的分隔符
    'common.listSep': '、',
```

en 段（`'common.cancel': 'Cancel',` 下一行）：

```ts
    // S5 模板弹窗（2026-10-02-i18n-template-modal-design）
    'common.listSep': ', ',
```

- [ ] **步骤 2：在 `tpl.empty.none` 之后插入 zh 的 65 个 `tplModal.*` key**

```ts
    // 模板弹窗（S5 2026-10-02-i18n-template-modal）：值与 TemplateModal.vue 现状中文串逐字一致
    'tplModal.title.new': '新建模板',
    'tplModal.title.edit': '编辑模板',
    'tplModal.close': '关闭弹窗',
    'tplModal.name.label': '名字',
    'tplModal.name.placeholder': '如：qwen27b 日常推理',
    'tplModal.required': '必填',
    'tplModal.required.missing': '必填项未填写：{names}',
    'tplModal.btn.pickFile': '选择文件',
    'tplModal.btn.save': '保存',
    'tplModal.btn.delete': '删除',
    'tplModal.delete.title': '删除模板',
    'tplModal.delete.message': '确定删除配置「{name}」吗？',
    'tplModal.tip.m': '模型文件（gguf）',
    'tplModal.tip.mmproj': '视觉投影文件（mmproj gguf）',
    'tplModal.tip.image_min_tokens': '每张图片消耗的 token 数（下限）',
    'tplModal.tip.alias': '模型服务别名',
    'tplModal.tip.ngl': '放到 GPU 的层数（N/auto/all）',
    'tplModal.tip.fa': 'Flash Attention 开关（on/off/auto）',
    'tplModal.tip.n_cpu_moe': 'MoE 专家权重保留在 CPU 的前 N 层',
    'tplModal.tip.load_mode': '模型加载模式（auto/mmap/mlock/dio 等）',
    'tplModal.tip.np': '并发请求数（slots）',
    'tplModal.tip.c': '上下文长度（ctx 大小）',
    'tplModal.tip.b': '批处理大小（batch）',
    'tplModal.tip.ub': '物理最大批大小（ubatch）',
    'tplModal.tip.t': 'CPU 线程数',
    'tplModal.tip.tb': '批处理和提示词处理的线程数',
    'tplModal.tip.ctk': 'KV 缓存 K 部分的量化类型',
    'tplModal.tip.ctv': 'KV 缓存 V 部分的量化类型',
    'tplModal.tip.spec_type': '投机解码类型（none/draft-mtp/draft-dflash/draft-dspark）',
    'tplModal.tip.spec_draft_n_max': '投机解码一次最多生成的 token 数（默认 3）',
    'tplModal.tip.md': '投机解码草稿模型文件（gguf）',
    'tplModal.tip.ngld': '草稿模型放到 GPU 的层数',
    'tplModal.tip.temp': '采样温度',
    'tplModal.tip.top_p': 'nucleus sampling 的 p 值',
    'tplModal.tip.top_k': '候选 token 数上限',
    'tplModal.tip.min_p': '最小概率阈值',
    'tplModal.tip.presence_penalty': '出现惩罚',
    'tplModal.tip.repeat_penalty': '重复惩罚',
    'tplModal.tip.jinja': '是否用 jinja 解析模板（true/false）',
    'tplModal.tip.chat_template_file': '自定义 jinja 模板文件',
    'tplModal.tip.reasoning': '推理/思考模式开关（on/off/auto）',
    'tplModal.tip.reasoning_format': '推理输出的格式（none/hide/deepseek）',
    'tplModal.tip.reasoning_effort': '推理强度档位（default~max）',
    'tplModal.tip.reasoning_preserve': '保留历史推理块（true/false）',
    'tplModal.tip.no_reasoning_preserve': '丢弃历史推理块（true/false）',
    'tplModal.tip.port': '服务监听端口',
    'tplModal.tip.metrics': '开启 Prometheus 指标（true/false）',
    'tplModal.tip.fit': '自动调整未设置参数以适配显存（on/off）',
    'tplModal.tip.fit_ctx': '--fit 可设置的最小 ctx 大小',
    'tplModal.tip.fit_target': '--fit 的目标显存（MiB0,MiB1,...）',
    'tplModal.vram.aria': '显存估算明细',
    'tplModal.vram.tip.title': '显存占用预测，仅供参考',
    'tplModal.vram.row.model': '模型文件（-m）',
    'tplModal.vram.row.mmproj': '视觉投影（--mmproj）',
    'tplModal.vram.row.kv': 'KV 缓存（-c/-ctk/-ctv/-ngl）',
    'tplModal.vram.row.batch': 'batch 缓冲（-b/-ub）',
    'tplModal.vram.row.draft': 'draft 缓存（--spec-type + --spec-draft-n-max）',
    'tplModal.vram.row.draftModel': 'draft 模型（-md）',
    'tplModal.vram.row.fixed': 'GPU 固定开销约 2GB',
    'tplModal.vram.fallback.noModel': '填写模型文件（-m）后自动估算',
    'tplModal.vram.fallback.noTotal': '未配置显卡显存，点击 VRAM 按钮设置',
    'tplModal.vram.fallback.retry': '填写模型文件后自动估算',
    'tplModal.vram.fallback.fail': '估算失败',
    'tplModal.vram.fallback.pending': '估算中…',
    'tplModal.vram.ipcFail': 'IPC 调用失败',
```

- [ ] **步骤 3：在 en 段 `tpl.empty.none` 之后插入对应的 65 个 en key**

```ts
    // Template modal (S5 2026-10-02-i18n-template-modal)
    'tplModal.title.new': 'New template',
    'tplModal.title.edit': 'Edit template',
    'tplModal.close': 'Close dialog',
    'tplModal.name.label': 'Name',
    'tplModal.name.placeholder': 'e.g. qwen27b daily reasoning',
    'tplModal.required': 'Required',
    'tplModal.required.missing': 'Required not filled: {names}',
    'tplModal.btn.pickFile': 'Select file',
    'tplModal.btn.save': 'Save',
    'tplModal.btn.delete': 'Delete',
    'tplModal.delete.title': 'Delete template',
    'tplModal.delete.message': 'Delete template "{name}"?',
    'tplModal.tip.m': 'Model file (gguf)',
    'tplModal.tip.mmproj': 'Vision projector file (mmproj gguf)',
    'tplModal.tip.image_min_tokens': 'Minimum tokens consumed per image',
    'tplModal.tip.alias': 'Model server alias',
    'tplModal.tip.ngl': 'Layers offloaded to GPU (N/auto/all)',
    'tplModal.tip.fa': 'Flash Attention switch (on/off/auto)',
    'tplModal.tip.n_cpu_moe': 'MoE expert weights kept on CPU for the first N layers',
    'tplModal.tip.load_mode': 'Model load mode (auto/mmap/mlock/dio, etc.)',
    'tplModal.tip.np': 'Concurrent requests (slots)',
    'tplModal.tip.c': 'Context length (ctx size)',
    'tplModal.tip.b': 'Batch size (batch)',
    'tplModal.tip.ub': 'Physical max batch size (ubatch)',
    'tplModal.tip.t': 'CPU threads',
    'tplModal.tip.tb': 'Threads for batch and prompt processing',
    'tplModal.tip.ctk': 'Quantization type for the K part of the KV cache',
    'tplModal.tip.ctv': 'Quantization type for the V part of the KV cache',
    'tplModal.tip.spec_type': 'Speculative decoding type (none/draft-mtp/draft-dflash/draft-dspark)',
    'tplModal.tip.spec_draft_n_max': 'Max tokens per speculative decoding step (default 3)',
    'tplModal.tip.md': 'Draft model file for speculative decoding (gguf)',
    'tplModal.tip.ngld': 'Draft model layers offloaded to GPU',
    'tplModal.tip.temp': 'Sampling temperature',
    'tplModal.tip.top_p': 'Nucleus sampling p value',
    'tplModal.tip.top_k': 'Max number of candidate tokens',
    'tplModal.tip.min_p': 'Minimum probability threshold',
    'tplModal.tip.presence_penalty': 'Presence penalty',
    'tplModal.tip.repeat_penalty': 'Repeat penalty',
    'tplModal.tip.jinja': 'Whether to use jinja for the chat template (true/false)',
    'tplModal.tip.chat_template_file': 'Custom jinja template file',
    'tplModal.tip.reasoning': 'Reasoning / thinking mode switch (on/off/auto)',
    'tplModal.tip.reasoning_format': 'Reasoning output format (none/hide/deepseek)',
    'tplModal.tip.reasoning_effort': 'Reasoning effort level (default~max)',
    'tplModal.tip.reasoning_preserve': 'Preserve historical reasoning blocks (true/false)',
    'tplModal.tip.no_reasoning_preserve': 'Drop historical reasoning blocks (true/false)',
    'tplModal.tip.port': 'Server listening port',
    'tplModal.tip.metrics': 'Enable Prometheus metrics (true/false)',
    'tplModal.tip.fit': 'Auto-adjust unset params to fit VRAM (on/off)',
    'tplModal.tip.fit_ctx': 'Minimum ctx size that --fit may set',
    'tplModal.tip.fit_target': 'Target VRAM for --fit (MiB0,MiB1,...)',
    'tplModal.vram.aria': 'VRAM estimate details',
    'tplModal.vram.tip.title': 'VRAM estimate, for reference only',
    'tplModal.vram.row.model': 'Model file (-m)',
    'tplModal.vram.row.mmproj': 'Vision projector (--mmproj)',
    'tplModal.vram.row.kv': 'KV cache (-c/-ctk/-ctv/-ngl)',
    'tplModal.vram.row.batch': 'Batch buffers (-b/-ub)',
    'tplModal.vram.row.draft': 'Draft cache (--spec-type + --spec-draft-n-max)',
    'tplModal.vram.row.draftModel': 'Draft model (-md)',
    'tplModal.vram.row.fixed': '~2 GB fixed GPU overhead',
    'tplModal.vram.fallback.noModel': 'Fill in the model file (-m) to estimate',
    'tplModal.vram.fallback.noTotal': 'VRAM not set, click the VRAM button to set it',
    'tplModal.vram.fallback.retry': 'Fill in the model file to estimate',
    'tplModal.vram.fallback.fail': 'Estimate failed',
    'tplModal.vram.fallback.pending': 'Estimating...',
    'tplModal.vram.ipcFail': 'IPC call failed',
```

- [ ] **步骤 4：验证词典双语对称**

运行：`npx vitest run src/i18n.test.ts src-main/i18n --reporter=basic`
预期：PASS（S0 的「zh/en key 集合完全相等」与「无空值」单测覆盖 66 个新 key；若 zh/en 数量不齐会立刻红）

- [ ] **步骤 5：Commit**

```bash
git add src-main/i18n/dict.ts
git commit -m "feat(i18n): 词典新增模板弹窗 tplModal.* 65 key + common.listSep（S5）"
```

---

## 任务 2：en 冒烟 10 条 + 词典覆盖 1 条（RED）

**文件：**
- 测试：`src/modules/TemplateModal.test.ts`（末尾 `}` 之后追加）

- [ ] **步骤 1：在文件顶部补 import**

```ts
import { applyLangLocal } from '../i18n';
import { dict } from '../../src-main/i18n/dict';
```

- [ ] **步骤 2：在文件末尾追加 en 冒烟块**

```ts
// ===== S5（2026-10-02-i18n-template-modal）：模板弹窗 en 冒烟 10 条 + 词典覆盖 1 条 =====
// TDD 先行（红）：TemplateModal.vue 尚未接入 t()，组件仍输出中文串——en 断言预期红。
// 复用模块级 mockLms / mountModal / mountEdit / findDeleteBtn / setInput / paramsMeta / calls；
// afterEach 还原 zh，防污染同文件既有 899 行 zh 用例（S2/S3/S4 同款）。
describe('TemplateModal en 冒烟', () => {
  function enModal(props: Record<string, unknown> = {}) {
    return mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: '', values: {}, paramsMeta, ...props },
    });
  }
  function descInputEn(): HTMLInputElement {
    const label = [...document.querySelectorAll('.modal-box label.label')].find(
      (l) => (l.textContent ?? '').trim() === 'Name',
    )!;
    return label.nextElementSibling as HTMLInputElement;
  }
  function mockVramParts(parts: Record<string, number>): void {
    calls = [];
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => {
        calls.push({ cmd, args });
        if (cmd === 'vram_estimate') return Promise.resolve({ ok: true, usedGb: 22.0, parts });
        return Promise.resolve(null);
      },
      onLogLine: () => () => {}, onProcessExit: () => () => {}, onTrayExitRequest: () => () => {},
    };
  }
  async function fillModelEn(): Promise<void> {
    await setInput('.flag-grid .row-cell input', 'D:/models/qwen.gguf');
    await new Promise((r) => setTimeout(r, 250)); // 超过 150ms 防抖
    await flush();
  }
  async function saveEn(): Promise<void> {
    (document.querySelector('.modal-save') as HTMLButtonElement).click();
    await flush();
  }

  beforeEach(() => { applyLangLocal('en'); });
  afterEach(() => { applyLangLocal('zh'); });

  it('标题 en：新建 = New template、编辑 = Edit template', async () => {
    calls = []; mockLms();
    const wNew = enModal(); await flush();
    expect(document.querySelector('.modal-head .modal-title')?.textContent).toBe('New template');
    wNew.unmount();
    const wEdit = enModal({ id: 'qwen38', name: 'qwen27b' }); await flush();
    expect(document.querySelector('.modal-head .modal-title')?.textContent).toBe('Edit template');
    wEdit.unmount();
  });

  it('名字 en：label = Name、placeholder = e.g. qwen27b daily reasoning', async () => {
    calls = []; mockLms();
    const w = enModal(); await flush();
    expect(descInputEn().placeholder).toBe('e.g. qwen27b daily reasoning');
    w.unmount();
  });

  it('必填 en：名字留空点保存 → Required 且不发 save_config', async () => {
    calls = []; mockLms();
    const w = enModal(); await flush();
    await setInput('.flag-grid .row-cell input', 'D:/models/qwen.gguf');
    await saveEn();
    expect(calls.filter((c) => c.cmd === 'save_config')).toHaveLength(0);
    expect(document.querySelector('.modal-box')?.textContent).toContain('Required');
    expect(descInputEn().classList.contains('error')).toBe(true);
    w.unmount();
  });

  it('必填项未填写 en：单元素 Required not filled: -m、双元素以 ", " 分隔', async () => {
    calls = []; mockLms();
    const w = enModal(); await flush();
    await setInput('.flag-grid .row-cell input', ''); // -m 留空
    await saveEn();
    expect(document.querySelector('.modal-box')?.textContent).toContain('Required not filled: -m');
    w.unmount();

    // 双元素：临时 meta required = ['m','port'] → 断言 common.listSep(', ') 参与拼接
    const meta2 = { ...paramsMeta, required: ['m', 'port'] };
    const w2 = mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: '', values: {}, paramsMeta: meta2 },
    });
    await flush();
    await saveEn();
    expect(document.querySelector('.modal-box')?.textContent).toContain('Required not filled: -m, --port');
    w2.unmount();
  });

  it('图标按钮 en：Select file / Close dialog / Save / Delete', async () => {
    calls = []; mockLms();
    const w = enModal({ id: 'qwen38', name: 'qwen27b' }); await flush();
    const fileBtn = document.querySelector('.flag-grid .file-btn') as HTMLButtonElement;
    expect(fileBtn.getAttribute('data-tooltip')).toBe('Select file');
    expect(fileBtn.getAttribute('aria-label')).toBe('Select file');
    expect(document.querySelector('.modal-close')?.getAttribute('aria-label')).toBe('Close dialog');
    expect(document.querySelector('.modal-save')?.getAttribute('aria-label')).toBe('Save');
    expect(document.querySelector('.btn-delete')?.getAttribute('aria-label')).toBe('Delete');
    w.unmount();
  });

  it('删除确认 en：标题 Delete template、正文引用配置名', async () => {
    calls = []; mockLms();
    const w = mountEdit(); await flush();
    findDeleteBtn()!.click();
    await flush();
    const box = document.querySelector('.confirm-box') as HTMLElement;
    expect(box.textContent).toContain('Delete template');
    expect(box.textContent).toContain('Delete template "qwen27b 日常推理"?');
    w.unmount();
  });

  it('参数说明 en：第一行长 flag 不译、第二行走词典', async () => {
    calls = []; mockLms();
    const w = enModal(); await flush();
    const find = (flag: string) =>
      [...document.querySelectorAll('.flag-grid .flag-label')].find((l) => l.textContent === flag)!;
    expect(find('-m').getAttribute('data-tooltip')).toBe('-m, --model\nModel file (gguf)');
    expect(find('-ngld').getAttribute('data-tooltip')).toBe('-ngld, --spec-draft-ngl\nDraft model layers offloaded to GPU');
    expect(find('--chat-template-file').getAttribute('data-tooltip')).toBe(
      '--chat-template-file\nCustom jinja template file',
    );
    w.unmount();
  });

  it('VRAM 明细 en：明细行 + 末行固定开销', async () => {
    mockVramParts({ model: 16, mmproj: 0, kv: 4, batch: 0, draft: 0, fixed: 2 });
    const w = enModal({ vramTotalGb: 24 }); await fillModelEn();
    (document.querySelector('.vram-indicator .vram-info') as HTMLElement).dispatchEvent(new Event('mouseenter'));
    await flush();
    const rows = [...document.querySelectorAll('.vram-tip .vram-tip__row')].map((r) => (r.textContent ?? '').trim());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe('Model file (-m) 16.0 GB');
    expect(rows[1]).toBe('KV cache (-c/-ctk/-ctv/-ngl) 4.0 GB');
    expect(rows[2]).toBe('~2 GB fixed GPU overhead');
    w.unmount();
  });

  it('VRAM 降级 en：未填 -m 与未配置 total 的兜底文案', async () => {
    calls = []; mockLms();
    const w1 = enModal({ vramTotalGb: 24 }); await flush();
    (document.querySelector('.vram-indicator .vram-info') as HTMLElement).dispatchEvent(new Event('mouseenter'));
    await flush();
    expect(document.querySelector('.vram-tip')?.textContent).toContain('Fill in the model file (-m) to estimate');
    w1.unmount();
    document.body.innerHTML = '';

    mockVramParts({ model: 16, mmproj: 0, kv: 4, batch: 0, draft: 0, fixed: 2 });
    const w2 = enModal(); await fillModelEn();
    (document.querySelector('.vram-indicator .vram-info') as HTMLElement).dispatchEvent(new Event('mouseenter'));
    await flush();
    expect(document.querySelector('.vram-tip')?.textContent).toContain('VRAM not set, click the VRAM button to set it');
    w2.unmount();
  });

  it('VRAM 浮层 en：标题行 + 明细 aria', async () => {
    calls = []; mockLms();
    const w = enModal({ vramTotalGb: 24 }); await flush();
    expect(document.querySelector('.vram-info')?.getAttribute('aria-label')).toBe('VRAM estimate details');
    (document.querySelector('.vram-info') as HTMLElement).dispatchEvent(new Event('mouseenter'));
    await flush();
    expect(document.querySelector('.vram-tip__title')?.textContent).toBe('VRAM estimate, for reference only');
    w.unmount();
  });

  it('词典覆盖 en：38 个 param key 双语非空 + 组件 38 条 tooltip 第二行已英文化', async () => {
    const keys = Object.keys(defaultParams().params);
    expect(keys.length).toBe(38);
    const zh = dict.zh as Record<string, string>;
    const en = dict.en as Record<string, string>;
    for (const k of keys) {
      expect(zh['tplModal.tip.' + k], k).toBeTruthy();
      expect(en['tplModal.tip.' + k], k).toBeTruthy();
    }
    // 组件侧：en 下 38 个 label 的 tooltip 必须是「第一行 flag + 第二行英文」——任何一条漏接词典，第二行会含 CJK
    calls = []; mockLms();
    const w = enModal(); await flush();
    const labels = [...document.querySelectorAll('.flag-grid .flag-label')];
    expect(labels.length).toBe(38);
    for (const l of labels) {
      const lines = (l.getAttribute('data-tooltip') ?? '').split('\n');
      expect(lines.length, l.textContent ?? '').toBe(2);
      expect(lines[1], l.textContent ?? '').toMatch(/[A-Za-z]/);
      expect(lines[1], l.textContent ?? '').not.toMatch(/[\u4e00-\u9fff]/);
    }
    w.unmount();
  });
});
```

- [ ] **步骤 3：运行确认 RED**

运行：`npx vitest run src/modules/TemplateModal.test.ts -t "en 冒烟" --reporter=basic`
预期：FAIL —— 标题仍是「新建模板」、tooltip 第二行仍是中文；词典覆盖用例中的词典断言已 PASS（任务 1 已入库），组件断言 FAIL

- [ ] **步骤 4：Commit**

```bash
git add src/modules/TemplateModal.test.ts
git commit -m "test(i18n): TemplateModal en 冒烟 10 条 + 词典覆盖 1 条先行（S5）"
```

---

## 任务 3：弹窗框架与校验文案接入 `t()`

**文件：**
- 修改：`src/modules/TemplateModal.vue`

- [ ] **步骤 1：加 import**

在 `import { invoke, errMsg } from '../ipc';` 之后插入：

```ts
import { t } from '../i18n';
```

- [ ] **步骤 2：`descError` 改走词典**

把：

```ts
const descError = computed((): string | null => {
  return (formDesc.value ?? '').trim().length === 0 ? '必填' : null;
});
```

改为：

```ts
// S5：走 t() —— 该 computed 依赖响应式 lang ref，切换语言后同一条报错即时重译
const descError = computed((): string | null => {
  return (formDesc.value ?? '').trim().length === 0 ? t('tplModal.required') : null;
});
```

- [ ] **步骤 3：模板替换——标题、关闭 aria、名字、必填项未填写、选择文件、保存/删除 aria**

| 原文 | 替换为 |
|---|---|
| `{{ isEdit ? '编辑模板' : '新建模板' }}` | `{{ isEdit ? t('tplModal.title.edit') : t('tplModal.title.new') }}` |
| `aria-label="关闭弹窗"` | `:aria-label="t('tplModal.close')"` |
| `>名字</label>` | `>{{ t('tplModal.name.label') }}</label>` |
| `placeholder="如：qwen27b 日常推理"` | `:placeholder="t('tplModal.name.placeholder')"` |
| `data-tooltip="选择文件" aria-label="选择文件"` | `:data-tooltip="t('tplModal.btn.pickFile')" :aria-label="t('tplModal.btn.pickFile')"` |
| `aria-label="保存"`（`.modal-save`） | `:aria-label="t('tplModal.btn.save')"` |
| `aria-label="删除"`（`.btn-delete`） | `:aria-label="t('tplModal.btn.delete')"` |

「必填项未填写」整段替换为：

```html
<p v-if="attemptedSave && emptyRequired.length > 0" class="error-text">{{ t('tplModal.required.missing', { names: emptyRequired.map((k) => props.paramsMeta.params[k]).join(t('common.listSep')) }) }}</p>
```

- [ ] **步骤 4：运行任务 2 的前 5 条用例**

运行：`npx vitest run src/modules/TemplateModal.test.ts -t "en 冒烟" --reporter=basic`
预期：标题 / 名字 / 必填 / 必填项未填写 / 图标按钮 aria 5 条 PASS；PARAM_TIPS、删除确认、VRAM 相关仍 FAIL

- [ ] **步骤 5：Commit**

```bash
git add src/modules/TemplateModal.vue
git commit -m "feat(i18n): 模板弹窗框架与校验文案接入 t()（S5）"
```

---

## 任务 4：`PARAM_TIPS` 拆表 + 38 条说明接入

**文件：**
- 修改：`src/modules/TemplateModal.vue`

- [ ] **步骤 1：把 `PARAM_TIPS` 换成 `PARAM_FLAGS`**

用下面整块替换原 `const PARAM_TIPS: Record<string, string> = { … };`（38 行）：

```ts
// 参数 label 的 hover tooltip = 两行：第一行 = llama.cpp 官方长 flag（全称，不译），第二行 = 词典 tplModal.tip.<key>。
// flag 来自 D:\AI\llama-cpp\llama-server.exe --help（2026-09 核对）。未收录的 key 不弹 tooltip。
const PARAM_FLAGS: Record<string, string> = {
  m: '-m, --model',
  mmproj: '-mm, --mmproj',
  image_min_tokens: '--image-min-tokens',
  alias: '-a, --alias',
  ngl: '-ngl, --gpu-layers',
  fa: '-fa, --flash-attn',
  n_cpu_moe: '-ncmoe, --n-cpu-moe',
  load_mode: '-lm, --load-mode',
  np: '-np, --parallel',
  c: '-c, --context-size',
  b: '-b, --batch-size',
  ub: '-ub, --ubatch-size',
  t: '-t, --threads',
  tb: '-tb, --threads-batch',
  ctk: '-ctk, --cache-type-k',
  ctv: '-ctv, --cache-type-v',
  spec_type: '--spec-type',
  spec_draft_n_max: '--spec-draft-n-max',
  md: '-md, --spec-draft-model',
  ngld: '-ngld, --spec-draft-ngl',
  temp: '--temp',
  top_p: '--top-p',
  top_k: '--top-k',
  min_p: '--min-p',
  presence_penalty: '--presence_penalty',
  repeat_penalty: '--repeat_penalty',
  jinja: '--jinja',
  chat_template_file: '--chat-template-file',
  reasoning: '-rea, --reasoning',
  reasoning_format: '--reasoning-format',
  reasoning_effort: '--reasoning-effort',
  reasoning_preserve: '--reasoning-preserve',
  no_reasoning_preserve: '--no-reasoning-preserve',
  port: '--port',
  metrics: '--metrics',
  fit: '-fit, --fit',
  fit_ctx: '-fitc, --fit-ctx',
  fit_target: '-fitt, --fit-target',
};
```

- [ ] **步骤 2：`rows` computed 拼两行 tooltip**

把：

```ts
out.push({ key: k, flag, required: props.paramsMeta.required.includes(k), type, opts: opts[k] ?? [], tip: PARAM_TIPS[k] ?? '' });
```

改为：

```ts
// S5：第一行 flag 原文 + 第二行词典说明；rows 是 computed，读 lang ref → 切语言自动重算
const flagLine = PARAM_FLAGS[k];
out.push({
  key: k,
  flag,
  required: props.paramsMeta.required.includes(k),
  type,
  opts: opts[k] ?? [],
  tip: flagLine === undefined ? '' : flagLine + '\n' + t('tplModal.tip.' + k),
});
```

- [ ] **步骤 3：运行参数说明相关用例**

运行：`npx vitest run src/modules/TemplateModal.test.ts --reporter=basic`
预期：en 冒烟的「参数说明 en」「词典覆盖 en」PASS；既有 zh 用例（38 条两行 tooltip、hover 浮层、短 flag 长形式）仍 PASS

- [ ] **步骤 4：Commit**

```bash
git add src/modules/TemplateModal.vue
git commit -m "feat(i18n): 参数说明拆 PARAM_FLAGS + 词典，38 条 tooltip 第二行可切换（S5）"
```

---

## 任务 5：删除确认 computed 化

**文件：**
- 修改：`src/modules/TemplateModal.vue`

- [ ] **步骤 1：把两个静态常量改为 computed**

把：

```ts
const deleteFullMsg = '确定删除配置「' + (props.name || '') + '」吗？'; // 静态拼接（props.name 编辑模式不变，无需 computed）
const deleteShortMsg = () => '确定删除配置「' + deleteMsgName.value + '」吗？';
```

改为：

```ts
// S5：必须 computed——静态常量只求值一次，切换语言后完整 tip 会停留在旧语言
const deleteFullMsg = computed(() => t('tplModal.delete.message', { name: props.name || '' }));
const deleteShortMsg = computed(() => t('tplModal.delete.message', { name: deleteMsgName.value }));
```

- [ ] **步骤 2：ConfirmDialog 绑定同步**

把：

```html
<ConfirmDialog :open="confirmDeleteOpen" title="删除模板"
  :message="deleteShortMsg()" :tip="visualWidth(props.name || '') > NAME_BUDGET + 2 ? deleteFullMsg : undefined"
  tone="danger" @confirm="doDelete" @close="() => (confirmDeleteOpen = false)" />
```

改为：

```html
<ConfirmDialog :open="confirmDeleteOpen" :title="t('tplModal.delete.title')"
  :message="deleteShortMsg" :tip="visualWidth(props.name || '') > NAME_BUDGET + 2 ? deleteFullMsg : undefined"
  tone="danger" @confirm="doDelete" @close="() => (confirmDeleteOpen = false)" />
```

- [ ] **步骤 3：运行删除相关用例**

运行：`npx vitest run src/modules/TemplateModal.test.ts -t "delete" --reporter=basic`
预期：既有 6 条 zh 删除用例 PASS（zh 文案逐字不变）+ en 冒烟的「删除确认 en」PASS

- [ ] **步骤 4：Commit**

```bash
git add src/modules/TemplateModal.vue
git commit -m "feat(i18n): 删除确认文案走词典并 computed 化（S5）"
```

---

## 任务 6：VRAM 指示、明细浮层与降级文案

**文件：**
- 修改：`src/modules/TemplateModal.vue`

- [ ] **步骤 1：`catch` 兜底文案**

把：

```ts
.catch(() => { vramUsedGb.value = null; vramOk.value = false; vramReason.value = 'IPC 调用失败'; vramParts.value = null; });
```

改为：

```ts
.catch(() => { vramUsedGb.value = null; vramOk.value = false; vramReason.value = t('tplModal.vram.ipcFail'); vramParts.value = null; });
```

- [ ] **步骤 2：`breakdown` 的 7 条 label**

把 6 行 `label: '…'` 与末行 push 替换为 `t('tplModal.vram.row.*')`：

```ts
  const rows: Array<{ label: string; gb: number }> = [
    { label: t('tplModal.vram.row.model'), gb: p.model ?? 0 },
    { label: t('tplModal.vram.row.mmproj'), gb: p.mmproj ?? 0 },
    { label: t('tplModal.vram.row.kv'), gb: p.kv ?? 0 },
    { label: t('tplModal.vram.row.batch'), gb: p.batch ?? 0 },
    { label: t('tplModal.vram.row.draft'), gb: p.draft ?? 0 },
    { label: t('tplModal.vram.row.draftModel'), gb: p.draftModel ?? 0 },
  ].filter((r) => r.gb > 0); // 0 项隐藏（fixed 除外，恒显）
  rows.push({ label: t('tplModal.vram.row.fixed'), gb: p.fixed ?? 0, note: true }); // 末行说明性文案（不拼数值）
```

- [ ] **步骤 3：`breakdownFallback` 的 5 条分支**

```ts
const breakdownFallback = computed((): string => {
  if (!vramHasModel.value) return t('tplModal.vram.fallback.noModel');
  if (props.vramTotalGb === undefined) return t('tplModal.vram.fallback.noTotal');
  if (vramUsedGb.value === null) return (vramOk.value ? t('tplModal.vram.fallback.retry') : (vramReason ?? t('tplModal.vram.fallback.fail')));
  return t('tplModal.vram.fallback.pending'); // usedGb 在手但 parts 缺失（不应发生：主进程恒返回 parts）
});
```

- [ ] **步骤 4：模板里的 aria 与浮层标题**

| 原文 | 替换为 |
|---|---|
| `aria-label="显存估算明细"` | `:aria-label="t('tplModal.vram.aria')"` |
| `<div class="vram-tip__title">显存占用预测，仅供参考</div>` | `<div class="vram-tip__title">{{ t('tplModal.vram.tip.title') }}</div>` |

- [ ] **步骤 5：全量测试**

运行：`npm test`
预期：全绿（34 文件 / 546 用例）；既有 899 行 zh 用例零改动通过

- [ ] **步骤 6：构建验证**

运行：`npm run build`
预期：通过（渲染端跨目录 import 词典已在 S0 验证）

- [ ] **步骤 7：Commit**

```bash
git add src/modules/TemplateModal.vue
git commit -m "feat(i18n): VRAM 指示明细与降级文案接入 t()（S5）"
```

---

## 任务 7：看板收尾

**文件：**
- 修改：`docs/superpowers/specs/2026-09-22-i18n-slices.md`

- [ ] **步骤 1：S5 分片卡补 `独立 spec` 与 `状态`**

把分片卡里的：

```markdown
- **独立 spec**：⚠️ **建议展开**（38 条 + 校验 + 明细，预计 >1 人日）。
- **状态**：☐
```

改为：

```markdown
- **独立 spec**：✅ 已展开 → 规格 `2026-10-02-i18n-template-modal-design.md`；计划 `../plans/2026-10-02-i18n-template-modal.md`。
- **状态**：✅
```

- [ ] **步骤 2：进度总览表 S5 行**

把 `| S5 | 模板弹窗 | \`tplModal\` | ⚠️ 建议展开 | ☐ |` 改为 `| S5 | 模板弹窗 | \`tplModal\` | ✅ 已展开 | ✅ |`。

- [ ] **步骤 3：变更记录追加两条**

```markdown
- 2026-10-02：S5 实现完成（词典 66 key、TemplateModal 15 处文案接入 t()、PARAM_FLAGS 拆表、删除确认 computed 化、11 条新增测试）；vitest 全绿（34 文件 / 546 用例）+ build 通过；人工英文目视验收（规格 §6.4）留待用户执行；S5 状态 ◐→✅。
```

- [ ] **步骤 4：Commit**

```bash
git add docs/superpowers/specs/2026-09-22-i18n-slices.md
git commit -m "docs(i18n): S5 分片卡标记完成 + 变更记录"
```

---

## 自检

**1. 规格覆盖度**

| 规格章节 | 实现任务 |
|---|---|
| §3.1 弹窗框架 12 key | 任务 1 步骤 2/3、任务 3、任务 5 |
| §3.2 参数说明 38 key | 任务 1 步骤 2/3、任务 4 |
| §3.3 VRAM 15 key | 任务 1 步骤 2/3、任务 6 |
| §3.4 common.listSep | 任务 1 步骤 1、任务 3 步骤 3 |
| §4.1 PARAM_FLAGS | 任务 4 |
| §4.2 校验即时重译 | 任务 3 步骤 2/3 |
| §4.3 删除确认 computed | 任务 5 |
| §4.4 VRAM 明细与降级 | 任务 6 |
| §4.5 模板其余替换 | 任务 3 步骤 3、任务 6 步骤 4 |
| §6.2 en 冒烟 10 条 | 任务 2 |
| §6.3 词典覆盖单测 | 任务 2 最后一条用例 |

**2. 占位符扫描**：无「待定 / TODO / 类似任务 N」；38 条双语值与 11 条测试代码均为完整字面量。

**3. 类型一致性**：`t(key, params?)` 签名与 S0 一致；`deleteShortMsg` / `deleteFullMsg` 由「函数 / 常量」统一为 `ComputedRef<string>`，模板侧同步去调用括号；`PARAM_FLAGS` 与 `tplModal.tip.<key>` 的 key 集合由任务 2 最后一条用例锁定为 38 条。
