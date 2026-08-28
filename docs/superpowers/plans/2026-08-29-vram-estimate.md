# VRAM Estimate 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在模板弹窗底栏正中实时预测显存占用（占用/显卡显存 GB，按余量绿/橙/红），显卡显存总量在模板卡片右上角 VRAM 按钮里配置并持久化。

**架构：** 主进程新增纯函数 `src-main/vram.ts`（GGUF 头解析 + 显存公式，无 IO 副作用），新增 IPC `vram_estimate`（读文件 stat + 调用纯函数）。渲染端：TemplateModule 卡片右上角加 VRAM 按钮 + 小窗（新组件 `VramDialog.vue`），TemplateModal 底栏加指示（watch 9 个参数 + 总量，150ms 防抖调用 IPC）。总量存 `lms_launcher.yaml` 的 `vram_total_gb`。

**技术栈：** Electron + Vue 3 (script setup) + TypeScript + vitest（happy-dom）+ YAML（js-yaml 的 yaml 包）。

**规格：** `docs/superpowers/specs/2026-08-29-vram-estimate-design.md`（已批准）。

**测试运行命令：** `npx vitest run -- <file>`（单文件）；全量 `npm test`。

**文件结构：**

- 创建 `src-main/vram.ts` —— GGUF 元数据头解析 + 显存公式纯函数（唯一职责：估算）。
- 创建 `src-main/vram.test.ts` —— vram.ts 纯函数单测。
- 修改 `src-main/config.ts` —— AppConfig 加 `vram_total_gb`（appConfigLoad/save 兼容旧 yaml）。
- 修改 `src-main/config.test.ts` —— vram_total_gb 持久化单测。
- 修改 `src-main/preload.ts` —— 白名单加 `vram_estimate` / `save_vram_total` 的 invoke 透传（invoke 是通用的，preload 实际无需改动，见任务 6 说明）。
- 修改 `src-main/main.ts` —— 注册 IPC `vram_estimate` 与 `save_vram_total`。
- 创建 `src/modules/VramDialog.vue` —— 显卡显存修改小窗（数字输入 + 保存）。
- 修改 `src/modules/TemplateModule.vue` —— 卡片右上角 VRAM 按钮 + VramDialog 集成 + 向 TemplateModal 传 vramTotal。
- 修改 `src/modules/TemplateModal.vue` —— 底栏 VRAM 指示 + 动态 watch。
- 修改 `src/modules/TemplateModal.test.ts` —— 底栏格式与颜色档位测试。

**颜色值（写入 style.css :root 一次，全局复用）：**

- 紫色底 `#8B5CF6`（与 icon-btn #374151 无关，独立语义色，白字）；
- 指示色：蓝 `#2563EB`（显卡显存，复用 --accent-hover 不新设变量，直接用 --accent-hover）、绿 `var(--ok)`（#16A34A）、橙 `#F59E0B`、红 `var(--danger)`（#EF4444）、灰 `var(--muted)`。
- 在 :root 新增 `--vram-orange: #F59E0B;` 与 `--vram-purple: #8B5CF6;`（--accent/--ok/--danger 复用，不重复设）。

---

### 任务 1：vram.ts 纯函数（GGUF 解析 + 公式）

**文件：**
- 创建：`src-main/vram.ts`
- 测试：`src-main/vram.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// src-main/vram.test.ts
// vram.ts 纯函数单测：GGUF 头解析 + 显存公式边界（规格 §3/§7）。
// GGUF 二进制格式：magic(4B) = 0x46475547 (0x00 起，小端 "GGUF")
// + tensor count (u64) + array element count (u64) + KV (type u32 + 数据)。
import { describe, it, expect } from 'vitest';
import { parseGgufHeader, estimateUsedBytes } from './vram';

// 构造合法 GGUF Buffer：magic + tensor 计数 + KV 元数据（n_layer / n_embd）
function gguf(tensors: number, kv: Record<string, number>): Buffer {
  const b = Buffer.alloc(64 + 8 * 3 + 8 * Object.keys(kv).length);
  b.writeUInt32LE(0x46475547, 0); // magic "GGUF"
  b.writeBigUInt64LE(BigInt(tensors), 4);
  b.writeBigUInt64LE(BigInt(Object.keys(kv).length), 12); // array element count
  let off = 20;
  const kvBytes: Array<[number, string | number]> = [];
  void kvBytes;
  for (const [k, v] of Object.entries(kv)) {
    const kbuf = Buffer.from(k + '\x00');
    b.writeUInt32LE(kbuf.length, off); off += 4;
    b.write(kbuf, off); off += kbuf.length;
    // type=0 → u32
    b.writeUInt32LE(0, off); off += 4;
    b.writeUInt32LE(v, off); off += 4;
  }
  return b;
}

describe('parseGgufHeader', () => {
  it('parses_n_layer_and_n_embd', () => {
    const buf = gguf(2, { n_layer: 48, n_embd: 5120 });
    const h = parseGgufHeader(buf);
    expect(h.n_layer).toBe(48);
    expect(h.n_embd).toBe(5120);
  });

  it('rejects_bad_magic', () => {
    const buf = Buffer.alloc(64);
    expect(() => parseGgufHeader(buf)).toThrow(/GGUF/);
  });

  it('rejects_missing_n_layer', () => {
    const buf = gguf(2, { n_embd: 5120 });
    expect(() => parseGgufHeader(buf)).toThrow(/n_layer/);
  });
});

describe('estimateUsedBytes', () => {
  const base = { nLayer: 48, nEmbD: 5120, modelBytes: 16 * 1024 ** 3, nCtx: 4096 };

  it('ngl_empty_is_100pct', () => {
    const r = estimateUsedBytes({ ...base, ngl: '' });
    expect(r.r).toBe(1);
    expect(r.modelBytes).toBe(16 * 1024 ** 3);
  });

  it('ngl_0_is_0pct', () => {
    const r = estimateUsedBytes({ ...base, ngl: '0' });
    expect(r.modelBytes).toBe(0);
    expect(r.kvBytes).toBe(0);
  });

  it('ngl_999_is_100pct', () => {
    const r = estimateUsedBytes({ ...base, ngl: '999' });
    expect(r.r).toBe(1);
  });

  it('nctx_empty_uses_4096', () => {
    const a = estimateUsedBytes({ ...base, nCtx: '' });
    const b = estimateUsedBytes({ ...base, nCtx: '4096' });
    expect(a.kvBytes).toBe(b.kvBytes);
  });

  it('ctk_ctv_dtype_scales', () => {
    // q4_0(0.5) + q4_0(0.5) → avg 0.5；f16(2)+f16(2) → avg 2 = 4 倍
    const q4 = estimateUsedBytes({ ...base, ctk: 'q4_0', ctv: 'q4_0', ngl: '' });
    const f16 = estimateUsedBytes({ ...base, ctk: 'f16', ctv: 'f16', ngl: '' });
    expect(f16.kvBytes).toBe(q4.kvBytes * 4);
  });

  it('batch_uses_max_of_b_ub', () => {
    const a = estimateUsedBytes({ ...base, b: '4096', ub: '512', ngl: '' });
    const b2 = estimateUsedBytes({ ...base, b: '512', ub: '4096', ngl: '' });
    const none = estimateUsedBytes({ ...base, b: '', ub: '', ngl: '' });
    expect(a.batchBytes).toBe(b2.batchBytes);
    expect(none.batchBytes).toBe(0);
  });

  it('draft_zero_or_negative_is_0', () => {
    const r = estimateUsedBytes({ ...base, specDraftNMax: '0', ngl: '' });
    expect(r.draftBytes).toBe(0);
    expect(estimateUsedBytes({ ...base, specDraftNMax: '-1', ngl: '' }).draftBytes).toBe(0);
  });

  it('mmproj_is_full_size', () => {
    const r = estimateUsedBytes({ ...base, mmprojBytes: 1024 ** 3, ngl: '12' });
    expect(r.mmprojBytes).toBe(1024 ** 3);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run -- src-main/vram.test.ts`
预期：FAIL，"Cannot find module './vram'" 或类似导入错误。

- [ ] **步骤 3：编写实现**

```typescript
// src-main/vram.ts
// 显存占用预测纯函数（规格 2026-08-29-vram-estimate-design §3）。
// 无 IO：文件字节数由调用方 stat 后传入；GGUF 头解析接受 Buffer。
// 只读 GGUF magic + tensor 计数 + KV 元数据，不读张量数据。

export interface GgufHeader { n_layer: number; n_embd: number }

// dtype → KV cache 每字节系数（字节/元素近似：q4=0.5, q5=0.625, q8=1.0, f16=2.0）
const DTYPE_BYTES: Record<string, number> = {
  q4_0: 0.5, q5_0: 0.625, q8_0: 1.0, f16: 2.0,
};

// GGUF 头解析：magic(4B "GGUF" 小端 0x46475547) + tensor count(u64) + array count(u64) + KV 对。
// KV 对：key 长度(u32 LE) + key(bytes) + type(u32, 0=u32 / 12=f32 / 11=f64) + 数据。
// 只提取 n_layer / n_embd，遇到未知 KV type 跳过其值。
export function parseGgufHeader(buf: Buffer): GgufHeader {
  if (buf.length < 20) throw new Error('GGUF: 文件过小');
  if (buf.readUInt32LE(0) !== 0x46475547) throw new Error('GGUF: 非 GGUF 文件（magic 不符）');
  const tensorCount = Number(buf.readBigUInt64LE(4));
  const kvCount = Number(buf.readBigUInt64LE(12));
  let off = 20;
  let nLayer = 0; let nEmbD = 0;
  for (let i = 0; i < kvCount; i++) {
    if (off + 4 > buf.length) break;
    const keyLen = buf.readUInt32LE(off); off += 4;
    if (off + keyLen + 4 > buf.length) break;
    const key = buf.toString('utf8', off, off + keyLen); off += keyLen;
    const type = buf.readUInt32LE(off); off += 4;
    const vSize = type === 0 ? 4 : type === 12 ? 4 : type === 11 ? 8 : type === 6 ? 4 : 0;
    if (vSize === 0) break; // 未知类型：不继续解析
    const v = type === 11 ? Number(buf.readBigUInt64LE(off)) : buf.readUInt32LE(off);
    off += vSize;
    if (key === 'n_layer') nLayer = v;
    else if (key === 'n_embd') nEmbD = v;
  }
  if (nLayer === 0 || nEmbD === 0) throw new Error('GGUF: 缺少 n_layer/n_embd 元数据');
  return { n_layer: nLayer, n_embd: nEmbD };
}

export interface EstimateInput {
  nLayer: number;
  nEmbD: number;
  modelBytes: number;
  mmprojBytes: number;
  ngl: string;
  nCtx: string;
  ctk: string;
  ctv: string;
  b: string;
  ub: string;
  specDraftNMax: string;
}

export interface EstimateResult {
  r: number;           // GPU 层占比（诊断用，测试断言）
  modelBytes: number;
  mmprojBytes: number;
  kvBytes: number;
  batchBytes: number;
  draftBytes: number;
  total: number;        // = modelBytes + mmprojBytes + kvBytes + batchBytes + draftBytes
}

export function estimateUsedBytes(input: EstimateInput): EstimateResult {
  const nLayer = input.nLayer;
  // ngl 空 / ≥999 → r=1；ngl=0 → r=0；其余 → ngl / nLayer
  const nglNum = input.ngl.trim() === '' ? 999 : Number(input.ngl);
  const r = nglNum >= 999 ? 1 : nglNum <= 0 ? 0 : nglNum / nLayer;
  const nCtx = input.nCtx.trim() === '' ? 4096 : Number(input.nCtx) || 4096;
  const kBytes = DTYPE_BYTES[input.ctk] ?? 2.0;
  const vBytes = DTYPE_BYTES[input.ctv] ?? 2.0;
  const modelBytes = input.modelBytes * r;
  const mmprojBytes = input.mmprojBytes; // 全量计入
  const kvBytes = 2 * nCtx * nLayer * input.nEmbD * (kBytes + vBytes) / 2 * r;
  const batchBytes = (() => {
    const bs = input.b.trim() === '' ? 0 : Number(input.b);
    const ubS = input.ub.trim() === '' ? 0 : Number(input.ub);
    const m = Math.max(bs, ubS);
    return m > 0 ? input.nEmbD * nLayer * r * 16 : 0;
  })();
  const nd = Number(input.specDraftNMax);
  const draftBytes = (input.specDraftNMax.trim() !== '' && nd > 0) ? 2 * nd * nLayer * input.nEmbD * kBytes * r : 0;
  return {
    r,
    modelBytes,
    mmprojBytes,
    kvBytes,
    batchBytes,
    draftBytes,
    total: modelBytes + mmprojBytes + kvBytes + batchBytes + draftBytes,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run -- src-main/vram.test.ts`
预期：PASS（11 个用例全绿）。

- [ ] **步骤 5：Commit**

```bash
git add src-main/vram.ts src-main/vram.test.ts
git commit -m "feat: vram estimate pure functions (gguf header + formula)"
```

---

### 任务 2：config.ts 加 vram_total_gb 持久化

**文件：**
- 修改：`src-main/config.ts`（AppConfig、appConfigLoad、appConfigSave）
- 修改：`src-main/config.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `src-main/config.test.ts` 末尾追加：

```typescript
describe('vram_total_gb_persistence', () => {
  it('roundtrip_saves_and_loads_vram_total_gb', () => {
    const p = tmpPath('vram-rg.yaml');
    appConfigSave(p, { llama_dir: 'd:', vram_total_gb: 24 });
    const loaded = appConfigLoad(p);
    expect(loaded.vram_total_gb).toBe(24);
    expect(loaded.llama_dir).toBe('d:');
  });

  it('legacy_yaml_without_vram_total_gb_loads_undefined', () => {
    const p = tmpPath('vram-legacy.yaml');
    // 旧 yaml：只有 llama_dir 字段
    fs.writeFileSync(p, 'llama_dir: d:\\x\\n');
    const loaded = appConfigLoad(p);
    expect(loaded.vram_total_gb).toBeUndefined();
  });
});
```

（若 `tmpPath` 未定义，复用 config.test.ts 现有的临时路径 helper；若测试文件用 `fs` 但未 import，补 `import { writeFileSync } from 'node:fs'`。）

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run -- src-main/config.test.ts`
预期：FAIL，"vram_total_gb does not exist on AppConfig"（TS 类型错误）或 undefined 断言失败。

- [ ] **步骤 3：修改 AppConfig 与 load/save**

```typescript
// config.ts —— AppConfig 加可选字段
export interface AppConfig { llama_dir: string; vram_total_gb?: number }

// appConfigLoad：
export function appConfigLoad(path: string): AppConfig {
  try {
    const s = readFileSync(path, 'utf8');
    if (s.trim().length === 0) return EMPTY_APP_CONFIG;
    const parsed = parseYaml(path, s, 'lms_launcher.yaml') as Partial<AppConfig> | null;
    return { llama_dir: parsed?.llama_dir ?? '', vram_total_gb: parsed?.vram_total_gb };
  } catch {
    return EMPTY_APP_CONFIG;
  }
}
// EMPTY_APP_CONFIG 不变（{ llama_dir: '' }）；vram_total_gb 缺省 → undefined

// appConfigSave：原样 dump 整个对象（含 undefined → yaml 省略该键，行为符合「未配置不写入」）
// appConfigSave 实现不改（已 dump(cfg)）。
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run -- src-main/config.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src-main/config.ts src-main/config.test.ts
git commit -m "feat: persist vram_total_gb in app config yaml"
```

---

### 任务 3：main.ts 注册 IPC（vram_estimate + save_vram_total）

**文件：**
- 修改：`src-main/main.ts`

- [ ] **步骤 1：注册两个 IPC handler**

在 `main.ts` 顶部 import：

```typescript
import { statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { parseGgufHeader, estimateUsedBytes } from './vram';
```

在 ipcMain.handle 区（exit_app 之后）追加：

```typescript
// vram_estimate：显存预测（规格 2026-08-29-vram-estimate-design §3/§4）
// 读取 -m 文件 stat + GGUF 头，计算公式，返回 { ok, usedGb } 或 { ok:false, reason }。
// 文件不存在 / 非 GGUF / 解析失败 → 不抛错，返回 ok:false + reason。
// 入参键名 = 渲染端表单键（m/mmproj/ngl/c/ctk/ctv/b/ub/spec_draft_n_max），与 VRAM_KEYS 对齐
ipcMain.handle('vram_estimate', async (_e, args: {
  m: string; mmproj?: string; ngl?: string; c?: string; ctk?: string; ctv?: string;
  b?: string; ub?: string; spec_draft_n_max?: string;
}): Promise<{ ok: true; usedGb: number } | { ok: false; reason: string }> => {
  try {
    const modelBytes = statSync(args.m).size;
    const headerBuf = readFileSync(args.m).subarray(0, 65536); // 只读头 64KB 足够 KV
    const { n_layer, n_embd } = parseGgufHeader(headerBuf);
    const mmprojBytes = args.mmproj?.trim() ? statSync(args.mmproj).size : 0;
    const res = estimateUsedBytes({
      nLayer: n_layer,
      nEmbD: n_embd,
      modelBytes,
      mmprojBytes,
      ngl: args.ngl ?? '',
      nCtx: args.c ?? '',
      ctk: args.ctk ?? '',
      ctv: args.ctv ?? '',
      b: args.b ?? '',
      ub: args.ub ?? '',
      specDraftNMax: args.spec_draft_n_max ?? '',
    });
    return { ok: true, usedGb: res.total / 1024 ** 3 };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
});
// save_vram_total：持久化显卡显存总量（vram_total_gb 字段）
ipcMain.handle('save_vram_total', (_e, gb: number): void => {
  const [p] = yamlPaths();
  const cfg = appConfigLoad(p);
  appConfigSave(p, { ...cfg, vram_total_gb: gb > 0 ? gb : undefined });
});
```

- [ ] **步骤 2：TypeScript 编译验证**

运行：`npx tsc -p tsconfig.main.json`（若项目用 tsconfig.main.json，见根目录；若无此脚本则 `npx tsc --noEmit`）
预期：无错误。

- [ ] **步骤 3：Commit**

```bash
git add src-main/main.ts
git commit -m "feat: register vram_estimate and save_vram_total IPC"
```

---

### 任务 4：style.css 加 VRAM 颜色变量

**文件：**
- 修改：`src/style.css`

- [ ] **步骤 1：在 :root 加两个变量**

在 `--h-control` 行后追加：

```css
  --vram-orange: #F59E0B;       /* VRAM 指示橙色（余量 ≥1GB 且 <2GB） */
  --vram-purple: #8B5CF6;       /* VRAM 按钮紫底（白字） */
```

- [ ] **步骤 2：Commit**

```bash
git add src/style.css
git commit -m "style: add vram orange/purple color vars"
```

---

### 任务 5：VramDialog.vue 小窗组件

**文件：**
- 创建：`src/modules/VramDialog.vue`

- [ ] **步骤 1：编写组件**

```vue
<script setup lang="ts">
// 显卡显存修改小窗（规格 §5）：纯数字输入（GB），保存后调 save_vram_total。
// 复用 modal-overlay / card / input 既有类（TemplateModal 同款遮罩语言）。
import { ref } from 'vue';
import { invoke, errMsg } from '../ipc';

const props = withDefaults(defineProps<{ open: boolean; vramTotalGb: number | undefined }>(), { vramTotalGb: undefined });
const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void }>();

const value = ref<string>(props.vramTotalGb !== undefined ? String(props.vramTotalGb) : '');
const error = ref<string | null>(null);

function save(): void {
  error.value = null;
  const v = value.value.trim();
  const n = v === '' ? 0 : Number(v);
  if (!Number.isFinite(n) || n <= 0) { error.value = '须为正数'; return; }
  invoke('save_vram_total', n)
    .then(() => { emit('saved'); })
    .catch((e) => { error.value = errMsg(e); });
}
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay">
      <div class="card vram-dialog-box">
        <h3 class="vram-dialog-title">显卡显存 (GB)</h3>
        <input class="input" type="number" min="1" step="1"
          :value="value"
          @input="(ev: Event) => { value = (ev.target as HTMLInputElement).value; }"
          @keydown.enter="save"
          placeholder="如 24" />
        <p v-if="error" class="error-text">{{ error }}</p>
        <div class="vram-dialog-actions">
          <button class="btn btn-secondary" @click="emit('close')">取消</button>
          <button class="btn btn-primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
<style scoped>
.vram-dialog-box { width: 320px; padding: 16px; }
.vram-dialog-title { font-size: var(--fs-title); margin: 0 0 12px; }
.vram-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
```

- [ ] **步骤 2：Commit**

```bash
git add src/modules/VramDialog.vue
git commit -m "feat: vram total dialog component"
```

---

### 任务 6：TemplateModule 卡片右上角 VRAM 按钮

**文件：**
- 修改：`src/modules/TemplateModule.vue`

- [ ] **步骤 1：在 script 加 vramTotal 状态 + dialog 开关**

在 `const modalOpen = ref(false);` 前加：

```typescript
// 显卡显存总量（GB）：从 app_config 读取；VRAM 按钮点击 → VramDialog 修改。
const vramTotal = ref<number | undefined>(undefined);
const vramDialogOpen = ref(false);
import VramDialog from './VramDialog.vue';

async function loadVramTotal(): Promise<void> {
  try {
    const cfg = await invoke<{ llama_dir: string; vram_total_gb?: number }>('get_app_config');
    vramTotal.value = cfg.vram_total_gb;
  } catch {
    vramTotal.value = undefined;
  }
}
onMounted(loadVramTotal);
function onVramSaved(): void {
  vramDialogOpen.value = false;
  void loadVramTotal(); // 刷新本地缓存
}
```

（`onMounted` 已 import；`invoke` 已 import。）

- [ ] **步骤 2：在 template 卡片右上角加按钮 + VramDialog**

在 `<section class="module module-template">` 开头加 `position: relative`（用 style 属性），加：

```html
<!-- VRAM 按钮：卡片右上角，紫底白字，14px，未配置显 VRAM / 已配置显 24GB -->
<button class="vram-badge" @click="vramDialogOpen = true">
  {{ vramTotal !== undefined ? vramTotal + 'GB' : 'VRAM' }}
</button>
<VramDialog :open="vramDialogOpen" :vram-total-gb="vramTotal" @saved="onVramSaved" @close="vramDialogOpen = false" />
```

同时给 TemplateModal 加 `vram-total-gb` prop（见任务 7）：

```html
<TemplateModal
  ...existing...
  :vram-total-gb="vramTotal"
  @saved="onSaved"
  @deleted="onDeleted"
  @close="modalOpen = false"
/>
```

在 template 末尾（`</section>` 前）加 VramDialog。scoped style 加：

```css
.vram-badge {
  position: absolute; top: 0; right: 0;
  border-top-right-radius: var(--radius-card);
  border: none; height: 28px; padding: 0 12px;
  font-size: 14px; font-weight: 600;
  background: var(--vram-purple); color: #fff;
  cursor: pointer;
}
```

（section 加 `style="position: relative;"`。）

- [ ] **步骤 3：Commit**

```bash
git add src/modules/TemplateModule.vue
git commit -m "feat: vram badge on template card top-right"
```

---

### 任务 7：TemplateModal 底栏 VRAM 指示 + 动态 watch

**文件：**
- 修改：`src/modules/TemplateModal.vue`
- 修改：`src/modules/TemplateModal.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `TemplateModal.test.ts` 追加：

```typescript
describe('vram_indicator', () => {
  function mockVram(usedGb: number | null, reason?: string): void {
    const origInvoke = (window as any).lms.invoke;
    (window as any).lms = {
      invoke: (cmd: string, ...args: unknown[]) => {
        calls.push({ cmd, args });
        if (cmd === 'vram_estimate') return Promise.resolve(usedGb !== null ? { ok: true, usedGb } : { ok: false, reason: reason ?? 'fail' });
        if (cmd === 'suggest_config_id') return Promise.resolve(SUGGEST_ID);
        return Promise.resolve(null);
      },
    };
    void origInvoke;
  }

  it('renders_used_over_total_format', async () => {
    calls = []; mockVram(22.0);
    const w = mount(TemplateModal, {
      attachTo: document.body,
      props: { open: true, id: '', values: {}, paramsMeta, vramTotalGb: 24 },
    });
    // 填入 m + c 触发 watch（9 键 + vramTotalGb）
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf');
    mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    const el = document.querySelector('.vram-indicator') as HTMLElement;
    expect(el.textContent).toContain('22.0');
    expect(el.textContent).toContain('24.0');
    expect(el.textContent).toContain('GB');
    void w;
  });

  it('color_green_when_free_gte_2gb', async () => {
    calls = []; mockVram(20.0); // 24 - 20 = 4 >= 2 → green
    mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta, vramTotalGb: 24 } });
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf');
    mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    const el = document.querySelector('.vram-indicator') as HTMLElement;
    expect(el.className).toContain('vram-indicator--green'); // --ok 绿（#16A34A）
  });

  it('color_orange_when_free_lt_2gb', async () => {
    calls = []; mockVram(22.5); // 24 - 22.5 = 1.5 → orange
    mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta, vramTotalGb: 24 } });
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf');
    mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    const el = document.querySelector('.vram-indicator') as HTMLElement;
    expect(el.className).toContain('vram-indicator--orange'); // --vram-orange（#F59E0B）
  });

  it('color_red_when_free_lt_1gb', async () => {
    calls = []; mockVram(23.5); // 24 - 23.5 = 0.5 → red
    mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta, vramTotalGb: 24 } });
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf');
    mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    const el = document.querySelector('.vram-indicator') as HTMLElement;
    expect(el.className).toContain('vram-indicator--red'); // --danger 红（#EF4444）
  });

  it('grey_dash_when_vram_total_unconfigured', async () => {
    calls = []; mockVram(20.0);
    mount(TemplateModal, { attachTo: document.body, props: { open: true, id: '', values: {}, paramsMeta, vramTotalGb: undefined } });
    const mIn = [...document.querySelectorAll('.flag-grid .row-cell input')][0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set;
    setter.call(mIn, 'D:/models/qwen.gguf');
    mIn.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    const el = document.querySelector('.vram-indicator') as HTMLElement;
    expect(el.textContent).toContain('--');
  });
});
```

（颜色档位断言用 class 名：happy-dom 对 scoped 样式的 getComputedStyle 级联不可靠，class 名契约由 CSS 规则兑现；实际颜色在任务 8 的 dev 运行中视觉验证。）

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run -- src/modules/TemplateModal.test.ts`
预期：FAIL，"vram-indicator not found" 或 prop 类型错误。

- [ ] **步骤 3：修改 TemplateModal.vue**

script 加：

```typescript
// prop：显卡显存总量（GB），由 TemplateModule 从 app_config 读入
const props = withDefaults(defineProps<{
  open: boolean;
  id: string;
  values: Record<string, string>;
  name?: string;
  paramsMeta: { params: Record<string, string>; required: string[]; params_options?: Record<string, string[]>; params_boolean?: string[]; params_file?: string[] };
  vramTotalGb?: number;
}>(), { name: '', vramTotalGb: undefined });

// VRAM 预测状态（规格 §6）：watch 9 参数键 + vramTotalGb，150ms 防抖 → invoke
import { computed, ref, watch } from 'vue';
const vramUsedGb = ref<number | null>(null);
const vramOk = ref<boolean>(true);
const vramReason = ref<string | null>(null);

const VRAM_KEYS = ['m', 'mmproj', 'ngl', 'c', 'ctk', 'ctv', 'b', 'ub', 'spec_draft_n_max'] as const;
let vramTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleVramEstimate(): void {
  if (vramTimer) clearTimeout(vramTimer);
  vramTimer = setTimeout(() => {
    const v = formValues.value;
    const args: Record<string, string> = {};
    for (const k of VRAM_KEYS) args[k] = (v[k] ?? '').trim();
    if ((v['m'] ?? '').trim().length === 0) { vramUsedGb.value = null; vramOk.value = false; return; }
    invoke<{ ok: true; usedGb: number } | { ok: false; reason: string }>('vram_estimate', args)
      .then((res) => {
        if (res.ok) { vramUsedGb.value = res.usedGb; vramOk.value = true; vramReason.value = null; }
        else { vramUsedGb.value = null; vramOk.value = false; vramReason.value = res.reason; }
      })
      .catch(() => { vramUsedGb.value = null; vramOk.value = false; vramReason.value = 'IPC 失败'; });
  }, 150);
}

// watch 9 参数键：任一变化 → 重新估算
watch(
  () => VRAM_KEYS.map((k) => (formValues.value[k] ?? '').trim()),
  () => { scheduleVramEstimate(); },
  { immediate: true }
);
// vramTotalGb 变化 → 同样重新估算（总量改变不影响 used，但需触发 re-render）
watch(() => props.vramTotalGb, () => { scheduleVramEstimate(); });

// 颜色档位：free = total - used
const vramFreeGb = computed(() => props.vramTotalGb !== undefined && vramUsedGb.value !== null ? props.vramTotalGb - vramUsedGb.value : null);
const vramTier = computed((): 'green' | 'orange' | 'red' | 'grey' => {
  if (props.vramTotalGb === undefined) return 'grey';
  if (vramFreeGb.value === null) return 'grey';
  if (vramFreeGb.value >= 2) return 'green';
  if (vramFreeGb.value >= 1) return 'orange';
  return 'red';
});
```

template：在 `<footer class="modal-actions">` 内加（居中）：

```html
<!-- VRAM 指示：底栏正中；未配置/失败 → grey -- -->
<div class="vram-indicator" :class="'vram-indicator--' + vramTier"
  :title="vramOk ? undefined : (props.vramTotalGb === undefined ? '请在卡片右上角配置显卡显存' : vramReason ?? undefined)">
  <span class="vram-used">{{ vramUsedGb !== null ? vramUsedGb.toFixed(1) : '--' }}</span>
  <span class="vram-sep"> / </span>
  <span class="vram-total">{{ props.vramTotalGb !== undefined ? props.vramTotalGb.toFixed(1) : '--' }}</span>
  <span class="vram-unit"> GB</span>
</div>
```

scoped style：

```css
.vram-indicator {
  position: absolute; left: 50%; transform: translateX(-50%);
  font-size: var(--fs-body); font-family: var(--font-mono);
  display: inline-flex; align-items: baseline; white-space: nowrap;
}
.vram-total { color: var(--accent-hover); } /* 蓝 */
.vram-indicator--green .vram-used { color: var(--ok); }
.vram-indicator--orange .vram-used { color: var(--vram-orange); }
.vram-indicator--red .vram-used { color: var(--danger); }
.vram-indicator--grey { color: var(--muted); }
.vram-indicator--grey .vram-used,
.vram-indicator--grey .vram-total { color: var(--muted); }
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run -- src/modules/TemplateModal.test.ts`
预期：PASS（原有 + 新增 6 个用例全绿）。

- [ ] **步骤 5：全量测试**

运行：`npm test`
预期：全部 PASS（无回归）。

- [ ] **步骤 6：Commit**

```bash
git add src/modules/TemplateModal.vue src/modules/TemplateModal.test.ts
git commit -m "feat: vram indicator in modal footer with dynamic color tiers"
```

---

### 任务 8：全量验证 + 构建

**文件：** 无新增

- [ ] **步骤 1：全量测试**

运行：`npm test`
预期：全部 PASS。

- [ ] **步骤 2：构建前端 + 主进程**

运行：`npm run build`
预期：dist/ 和 dist-main/ 生成，无 TS 错误。

- [ ] **步骤 3：dev 运行验证**

运行：`npm run dev`（后台）
预期：窗口打开；模板卡片右上角显示 VRAM 紫色按钮；点 [新建模板] → 填入 -m 模型路径 → 底栏显示 VRAM 指示；点 VRAM 按钮 → 小窗输入 24 → 保存 → 底栏变为 22.x / 24.0 GB。

- [ ] **步骤 4：Final commit（若 build 产物有变更）**

```bash
git add -A
git commit -m "build: vram estimate feature"
```
