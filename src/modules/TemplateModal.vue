<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faXmark, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { faFloppyDisk, faFolderOpen, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg } from '../ipc';
// truncate：选项行用（flag-form）；删除确认对话框的 name 同样按视觉宽度截断（truncDeleteName）
import { truncateByWidth, visualWidth } from '../util/truncate';

import Dropdown from '../components/Dropdown.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

// FontAwesome：按需注册 regular 款——floppy-disk（保存）/ folder-open（选择文件）/ trash-can（删除），
// xmark（关闭 ×）无 regular 款，保留 free-solid；均经 library.add 进入本地库
config.autoGenerateCss = true;
library.add(faFloppyDisk, faTrashCan, faXmark, faFolderOpen, faCircleInfo);
// byPrefixAndName：按「前缀 → { iconName: IconDefinition }」组织，模板侧 <FontAwesomeIcon :icon="byPrefixAndName.fat['floppy-disk']" /> 直接取图标定义
const byPrefixAndName = { fat: { 'floppy-disk': faFloppyDisk, xmark: faXmark, 'trash-can': faTrashCan, 'folder-open': faFolderOpen, 'circle-info': faCircleInfo } };

// 模板弹窗（新建 / 编辑共用，规格 §4.2）：
// flag-form 参数表单 + id 唯一性红框 + 必填(-m)红框不保存；其余空值不写入 yaml。
const props = withDefaults(defineProps<{
  open: boolean;
  id: string;
  values: Record<string, string>;
  // 数据 key：desc → name（2026-09）；local formDesc 状态仍用 desc 命名仅因历史，prop 契约为 name
  name?: string;
  paramsMeta: {
    params: Record<string, string>;
    required: string[];
    params_options?: Record<string, string[]>;
    params_boolean?: string[];
    params_file?: string[];
    params_default?: Record<string, string>; // 2026-09：新建模板自动填写的默认值（port/fit）
  };
  // 显卡显存总量（GB）：卡片右上角 VRAM 按钮持久化值；未配置 = undefined
  vramTotalGb?: number;
}>(), { name: '', vramTotalGb: undefined });

const emit = defineEmits<{ (e: 'saved'): void; (e: 'close'): void; (e: 'deleted', id: string): void }>();

const isEdit = computed(() => props.id.length > 0);

// ---------- 表单状态 ----------
// id 不再由用户填写：新建模式保存时向主进程请求唯一 id（yaml 安全：小写字母+数字）；
// 编辑模式显示只读 id（.id-view 静态文本），既无输入框也不可修改。
const formDesc = ref('');
const formValues = ref<Record<string, string>>({});
const saveError = ref<string | null>(null);
const saving = ref(false);
// #3：保存前不显示任何校验提示；只有「保存」点击过才 revealed。
// 打开（fill）重置为 false，点保存后置 true——保存失败不重置（下次点保存仍保留上次状态）。
const attemptedSave = ref(false);

function fill(): void {
  attemptedSave.value = false; // 打开弹窗重置（步骤 1）
  formDesc.value = props.name ?? '';
  const opts = props.paramsMeta.params_options ?? {};
  const bools: string[] = props.paramsMeta.params_boolean ?? [];
  const init: Record<string, string> = {};
  for (const row of rows.value) {
    if (row.type === 'boolean') init[row.key] = 'false';            // §#9D：boolean 恒默认 false（'false' 不写入 yaml）
    else if (row.type === 'options') init[row.key] = row.opts[0];   // options 恒默认首个选项（无未设置占位）
    else init[row.key] = '';
  }
  // params_default（2026-09）：自动填写默认值（port/fit）——覆盖类型基线默认；
  // 编辑模式下已有存值在下方循环覆盖之（用户值优先）
  const defs = props.paramsMeta.params_default ?? {};
  for (const k of Object.keys(defs)) {
    if (init[k] === undefined) continue; // key 不在 params 表（开发阶段无兼容）
    const t = defs[k].trim();
    if (t.length > 0) init[k] = t;
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

// 参数 label 的 hover tooltip 两行内容：第一行 = llama.cpp 官方长 flag（全称），第二行 = 一句中文说明。
// flag 来自 D:\AI\llama-cpp\llama-server.exe --help（2026-09 核对）。未收录的 key 不弹 tooltip。
const PARAM_TIPS: Record<string, string> = {
  m: '-m, --model\n模型文件（gguf）',
  mmproj: '-mm, --mmproj\n视觉投影文件（mmproj gguf）',
  image_min_tokens: '--image-min-tokens\n每张图片消耗的 token 数（下限）',
  alias: '-a, --alias\n模型服务别名',
  ngl: '-ngl, --gpu-layers\n放到 GPU 的层数（N/auto/all）',
  fa: '-fa, --flash-attn\nFlash Attention 开关（on/off/auto）',
  n_cpu_moe: '-ncmoe, --n-cpu-moe\nMoE 专家权重保留在 CPU 的前 N 层',
  load_mode: '-lm, --load-mode\n模型加载模式（auto/mmap/mlock/dio 等）',
  np: '-np, --parallel\n并发请求数（slots）',
  c: '-c, --context-size\n上下文长度（ctx 大小）',
  b: '-b, --batch-size\n批处理大小（batch）',
  ub: '-ub, --ubatch-size\n物理最大批大小（ubatch）',
  t: '-t, --threads\nCPU 线程数',
  tb: '-tb, --threads-batch\n批处理和提示词处理的线程数',
  ctk: '-ctk, --cache-type-k\nKV 缓存 K 部分的量化类型',
  ctv: '-ctv, --cache-type-v\nKV 缓存 V 部分的量化类型',
  spec_type: '--spec-type\n投机解码类型（none/draft-mtp/draft-dflash/draft-dspark）',
  spec_draft_n_max: '--spec-draft-n-max\n投机解码一次最多生成的 token 数（默认 3）',
  md: '-md, --spec-draft-model\n投机解码草稿模型文件（gguf）',
  ngld: '-ngld, --spec-draft-ngl\n草稿模型放到 GPU 的层数',
  temp: '--temp\n采样温度',
  top_p: '--top-p\nnucleus sampling 的 p 值',
  top_k: '--top-k\n候选 token 数上限',
  min_p: '--min-p\n最小概率阈值',
  presence_penalty: '--presence_penalty\n出现惩罚',
  repeat_penalty: '--repeat_penalty\n重复惩罚',
  jinja: '--jinja\n是否用 jinja 解析模板（true/false）',
  chat_template_file: '--chat-template-file\n自定义 jinja 模板文件',
  reasoning: '-rea, --reasoning\n推理/思考模式开关（on/off/auto）',
  reasoning_format: '--reasoning-format\n推理输出的格式（none/hide/deepseek）',
  reasoning_effort: '--reasoning-effort\n推理强度档位（none~max）',
  reasoning_preserve: '--reasoning-preserve\n保留历史推理块（true/false）',
  port: '--port\n服务监听端口',
  metrics: '--metrics\n开启 Prometheus 指标（true/false）',
  fit: '-fit, --fit\n自动调整未设置参数以适配显存（on/off）',
  fit_ctx: '-fitc, --fit-ctx\n--fit 可设置的最小 ctx 大小',
  fit_target: '-fitt, --fit-target\n--fit 的目标显存（MiB0,MiB1,...）',
};
type RowType = 'text' | 'options' | 'boolean';
type Row = { key: string; flag: string; required: boolean; type: RowType; opts: string[]; tip: string };
const rows = computed((): Row[] => {
  const opts = props.paramsMeta.params_options ?? {};
  const bools: string[] = props.paramsMeta.params_boolean ?? [];
  const files: string[] = props.paramsMeta.params_file ?? [];
  const out: Row[] = [];
  for (const [k, flag] of Object.entries(props.paramsMeta.params)) {
    let type: RowType = 'text';
    if (bools.includes(k)) type = 'boolean';
    else if (opts[k] !== undefined) type = 'options';
    out.push({ key: k, flag, required: props.paramsMeta.required.includes(k), type, opts: opts[k] ?? [], tip: PARAM_TIPS[k] ?? '' });
  }
  return out;
});
const fileKeys = computed((): string[] => props.paramsMeta.params_file ?? []);

// 打开（含从新建切到另一个编辑目标）时重置表单——须在 rows/fileKeys 声明之后注册，immediate 首跑才能读到行定义
watch(() => props.open, (open) => { if (open) fill(); }, { immediate: true });

function requiredError(row: Row): boolean {
  return props.paramsMeta.required.includes(row.key) && (formValues.value[row.key] ?? '').trim().length === 0;
}
async function pickFile(key: string): Promise<void> {
  const picked = await invoke<string | null>('open_file_dialog', key);
  if (picked !== null) formValues.value[key] = picked; // null（取消）不动
}

// 选项截断（2026-08-26 spec-truncate-by-visual-width，与启动控制下拉同机制）：按视觉宽度预算 16——CJK=2 / 拉丁=1；
// 中文 ≤8 字不截断（与旧 TRUNC_AT=8 契约一致），英文可显示约 15~16 字符再 + …(U+2026)；
// tooltip（.dd-tip 悬浮层）显示完整值；value 仍是原始长串，保存契约不变。短选项无省略号/tooltip。
const BUDGET = 16;
function truncOpt(o: string): { label: string; tip?: string } {
  // grace=2：width ≤ BUDGET+2 → 全量渲染、不手动 +…（交 CSS）；超出才手动截断 + 完整值 tooltip
  const full = o ?? '';
  if (visualWidth(full) <= BUDGET + 2) return { label: full };
  return { label: truncateByWidth(full, BUDGET), tip: full };
}
// options 行的 Dropdown 选项表：截断 label + 完整值 tooltip；trigger tooltip = 当前选中项的 tip。
const optionRows = computed<Record<string, Array<{ value: string; label: string; tip?: string }>>>(() => {
  const opts = props.paramsMeta.params_options ?? {};
  const out: Record<string, Array<{ value: string; label: string; tip?: string }>> = {};
  for (const [k, v] of Object.entries(opts)) out[k] = (v ?? []).map((o) => ({ ...truncOpt(o), value: o }));
  return out;
});
function triggerTip(k: string): string | undefined {
  const rows = optionRows.value[k];
  if (!rows) return undefined;
  const cur = formValues.value[k];
  return (rows.find((r) => r.value === cur) ?? null)?.tip;
}

// 必填项（required 列表）留空 → 红框 + 不保存
const emptyRequired = computed((): string[] => {
  const bad: string[] = [];
  for (const k of props.paramsMeta.required) {
    if ((formValues.value[k] ?? '').trim().length === 0) bad.push(k);
  }
  return bad;
});

// desc（名字，2026-09 label 由「描述」改名；数据 key 仍为 desc）必填——新建 / 编辑均要求非空
const descError = computed((): string | null => {
  return (formDesc.value ?? '').trim().length === 0 ? '必填' : null;
});
// ---------- 保存 ----------
async function save(): Promise<void> {
  attemptedSave.value = true; // 保存失败不重置；关闭经 fill() 重置（步骤 1）
  saveError.value = null;
  // 必填项校验失败 → 保存被拒（计划 task-4 步骤 4「保存被拒」）；红框与「必填项未填写」文案由模板 attemptedSave 门控展示
  if (descError.value !== null || emptyRequired.value.length > 0) return;
  // id：新建 → 向主进程请求唯一 id（yaml 安全）；编辑 → 沿用 props.id，不重新生成
  let id: string;
  try {
    id = isEdit.value ? props.id : await invoke<string>('suggest_config_id');
  } catch (e) {
    saveError.value = errMsg(e); // VALIDATION 等错误原样展示（suggest_config_id 失败）
    return;
  }
  // 空值（含编辑时清掉的字段）→ 不写入，保持 yaml 干净；#9D：boolean false 也不写入，yaml 只保留 true flags
  const boolKeys: string[] = props.paramsMeta.params_boolean ?? [];
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(formValues.value)) {
    if ((v ?? '').trim().length === 0) continue;
    if (boolKeys.includes(k) && v.trim() === 'false') continue; // #9D：boolean false 不写入 yaml
    values[k] = v.trim();
  }
  saving.value = true;
  try {
    await invoke('save_config', id, formDesc.value.trim() === '' ? null : formDesc.value.trim(), values);
    emit('saved');
  } catch (e) {
    saveError.value = errMsg(e); // VALIDATION（id 规则 / 必填）与 IO 错误原样展示
  } finally {
    saving.value = false;
  }
}

// 删除（规格 2026-08-24 挪入弹窗；2026-08-27 二次确认主题化）：仅编辑模式渲染；
// [删除] → ConfirmDialog(danger)，点[确认]才 doDelete()；失败进 saveError 区展示，不关窗。
const confirmDeleteOpen = ref(false); // 删除二次确认对话框开关
function onDelete(): void {
  confirmDeleteOpen.value = true; // 弹主题化对话框（tone=danger）
}

// 删除确认文案：配置名与 options 行同一截断口径（truncOpt）——BUDGET=16（视觉宽，CJK=2/拉丁=1）
// + grace=2：中文 ≤8 字不截、英文 ~15-16 字再 + …(U+2026)；超出才手动截断 + 完整值 tooltip。
const NAME_BUDGET = 16; // 与 options BUDGET 一致
function truncDeleteName(n: string): string {
  const full = n ?? '';
  if (visualWidth(full) <= NAME_BUDGET + 2) return full; // grace：只超 1~2 不手动 +…（交 CSS ellipsis）
  return truncateByWidth(full, NAME_BUDGET);
}
const deleteMsgName = computed(() => truncDeleteName(props.name ?? ''));
// message：截断后 + …；仅截断时传完整文案 tip（ConfirmDialog hover title 显示）
const deleteFullMsg = '确定删除配置「' + (props.name || '') + '」吗？'; // 静态拼接（props.name 编辑模式不变，无需 computed）
const deleteShortMsg = () => '确定删除配置「' + deleteMsgName.value + '」吗？';
async function doDelete(): Promise<void> {
  try {
    await invoke('delete_config', props.id);
    emit('deleted', props.id);
    confirmDeleteOpen.value = false; // 成功关窗
  } catch (e) {
    saveError.value = errMsg(e); // VALIDATION / IO / MISSING 前缀原样展示（失败保持开，回表单区看报错）
  }
}

// ---------- 底栏 VRAM 指示（规格 2026-08-29-vram-estimate-design §6）----------
// watch 12 个显存参数键 + vramTotalGb,150ms 防抖 → invoke('vram_estimate')；
// 显示「used / total GB」:total 恒蓝;used 按余量 ≥2GB 绿 / ≥1GB 橙 / <1GB 红;
// 未配置总量或估算失败 → 灰 --,tooltip 给原因。
const vramUsedGb = ref<number | null>(null);
const vramOk = ref(true);
const vramReason = ref<string | null>(null);
const VRAM_KEYS = ['m', 'mmproj', 'ngl', 'c', 'ctk', 'ctv', 'b', 'ub', 'spec_type', 'spec_draft_n_max', 'md', 'ngld'] as const;
let vramTimer: ReturnType<typeof setTimeout> | null = null;
// -m 是否已填（决定指示是否计算/显示：未填 → 整块 --，不估算）
const vramHasModel = computed((): boolean => (formValues.value['m'] ?? '').trim().length > 0);

function scheduleVramEstimate(): void {
  if (vramTimer) clearTimeout(vramTimer);
  vramTimer = setTimeout(() => {
    const v = formValues.value;
    const m = (v['m'] ?? '').trim();
    if (m.length === 0) { vramUsedGb.value = null; vramOk.value = true; vramReason.value = null; return; } // 无模型 → 不估算,指示随 vramTotal 决定
    const args: Record<string, string> = {};
    for (const k of VRAM_KEYS) args[k] = (v[k] ?? '').trim();
    invoke<{ ok: true; usedGb: number } | { ok: false; reason: string }>('vram_estimate', args)
      .then((res) => {
        if (res.ok) { vramUsedGb.value = res.usedGb; vramOk.value = true; vramReason.value = null; vramParts.value = (res as { parts?: Record<string, number> }).parts ?? null; }
        else { vramUsedGb.value = null; vramOk.value = false; vramReason.value = res.reason; vramParts.value = null; }
      })
      .catch(() => { vramUsedGb.value = null; vramOk.value = false; vramReason.value = 'IPC 调用失败'; vramParts.value = null; });
  }, 150);
}

// 12 参数键任一变化 → 重估
watch(
  () => VRAM_KEYS.map((k) => (formValues.value[k] ?? '').trim()),
  () => { scheduleVramEstimate(); },
  { immediate: true }
);
watch(() => props.vramTotalGb, () => { scheduleVramEstimate(); });

const vramFreeGb = computed(() =>
  props.vramTotalGb !== undefined && vramUsedGb.value !== null
    ? props.vramTotalGb - vramUsedGb.value
    : null
);
const vramTier = computed((): 'green' | 'orange' | 'red' | 'grey' => {
  if (!vramHasModel.value) return 'grey'; // 未填 -m：不计算，整块 --
  if (props.vramTotalGb === undefined) return 'grey';
  if (vramFreeGb.value === null) return 'grey';
  if (vramFreeGb.value >= 2) return 'green';
  if (vramFreeGb.value >= 1) return 'orange';
  return 'red';
});

// ---------- VRAM 明细悬停弹窗（规格 2026-08-30-vram-breakdown-tooltip-design §3）----------
// .vram-info（circle-info span，纯 hover）→ .vram-tip 浮层：估算成功 = 5 数据项（0 项隐藏）
// + 末行「GPU 固定开销约 2GB」；降级档 = 单行原因文案。
const vramParts = ref<Record<string, number> | null>(null);
// 浮层定位：图标 rect 坐标 + 顶部放不下（top < 150px ≈ 6 行高）翻转到图标下方
const vramTip = ref<{ x: number; y: number; flip: boolean } | null>(null);
// ---------- flag label hover tooltip（position:fixed，挂 label 上方，.modal-body overflow-y:auto 不裁剪）----------
// 宽度随文字自由伸缩（CSS 无 min-width）：fixed 定位下 shrink-to-fit 基于内容，不受 label 窄栏约束。
const flagTip = ref<{ text: string; x: number; y: number; above: boolean } | null>(null);
function onFlagEnter(e: MouseEvent, tip: string): void {
  if (!tip) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // 挂 label 右上角：tooltip 底边贴 label 顶边上沿 - 6px（不盖右侧选项框）；
  // 顶部空间不足（首行被滚到视口上缘）时回落到垂直居中，不出窗。
  const H = 48; // ≈ 两行 tooltip 高（2×1.5 行高 + padding）
  const fitsAbove = r.top - 6 - H >= 8;
  const y = fitsAbove ? r.top - 6 : r.top + r.height / 2;
  // 水平：左缘对齐 label 左缘（宽度随文字伸缩，无需估算右移）
  flagTip.value = { text: tip, x: r.left, y, above: fitsAbove };
}
function onFlagLeave(): void { flagTip.value = null; }
function onInfoEnter(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  vramTip.value = { x: r.left + r.width / 2, y: r.top, flip: r.top < 150 };
}
// 明细行：非 null = 逐项列出（0 项隐藏，fixed 恒显末行）；null = 降级单行（breakdownFallback）
const breakdown = computed((): Array<{ label: string; gb: number; note?: boolean }> | null => {
  const p = vramParts.value;
  if (!vramHasModel.value || vramUsedGb.value === null || p === null) return null;
  if (props.vramTotalGb === undefined) return null; // 未配置显卡显存 → 降级单行（用户定稿文案）
  const rows: Array<{ label: string; gb: number }> = [
    { label: '模型文件（-m）', gb: p.model ?? 0 },
    { label: '视觉投影（--mmproj）', gb: p.mmproj ?? 0 },
    { label: 'KV 缓存（-c/-ctk/-ctv/-ngl）', gb: p.kv ?? 0 },
    { label: 'batch 缓冲（-b/-ub）', gb: p.batch ?? 0 },
    { label: 'draft 缓存（--spec-type + --spec-draft-n-max）', gb: p.draft ?? 0 },
    { label: 'draft 模型（-md）', gb: p.draftModel ?? 0 },
  ].filter((r) => r.gb > 0); // 0 项隐藏（fixed 除外，恒显）
  rows.push({ label: 'GPU 固定开销约 2GB', gb: p.fixed ?? 0, note: true }); // 末行说明性文案（用户定稿，不拼数值）
  return rows;
});
const breakdownFallback = computed((): string => {
  if (!vramHasModel.value) return '填写模型文件（-m）后自动估算';
  if (props.vramTotalGb === undefined) return '未配置显卡显存，点击 VRAM 按钮设置';
  if (vramUsedGb.value === null) return (vramOk.value ? '填写模型文件后自动估算' : (vramReason ?? '估算失败'));
  return '估算中…'; // usedGb 在手但 parts 缺失（不应发生：主进程恒返回 parts）
});

function close(): void { emit('close'); }
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay">
      <div class="card modal-box">
        <!-- 标题栏：固定不滚动（sticky），文字居中，[x] 关闭按钮贴最右 -->
        <header class="modal-head">
          <span class="modal-title">{{ isEdit ? '编辑模板' : '新建模板' }}</span>
          <!-- [x] 关闭按钮：文字 ×（2026-08）→ FontAwesome xmark 图标（.modal-close font-size:16px 经 FA 继承定尺寸） -->
          <button type="button" class="modal-close" aria-label="关闭弹窗" @click="close">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['xmark']" />
          </button>
        </header>
        <!-- 表单区：独立滚动容器，标题栏外 -->
        <div class="modal-body">
          <p v-if="saveError" class="error-text">{{ saveError }}</p>

          <!-- id 全自动：新建 = 完全静默（保存时由主进程生成唯一 yaml-safe id）；编辑 = 只读单行展示「id: xxx」（.id-view 静态文本，无输入框、不可修改） -->
          <p v-if="isEdit" class="id-view">id: {{ props.id }}</p>

          <!-- 字段 label「描述」→「名字」（2026-09）；数据契约不变，yaml key 仍为 desc -->
          <label class="label" style="display: block; margin-top: 8px;">名字</label>
          <input class="input" :class="{ error: attemptedSave && descError !== null }" v-model="formDesc" placeholder="如：qwen27b 日常推理" />
          <p v-if="attemptedSave && descError" class="error-text">{{ descError }}</p>

          <div class="flag-grid">
            <template v-for="row in rows" :key="row.key">
              <label class="label flag-label" :data-tooltip="row.tip"
                   @mouseenter="(e: MouseEvent) => onFlagEnter(e, row.tip)" @mouseleave="onFlagLeave">{{ row.flag }}</label>
              <!-- boolean / options → #13 共享 Dropdown 组件；text → input（params_file 行右侧加「选择文件」按钮） -->
              <div class="row-cell" v-if="row.type === 'text'">
                <input
                  class="input"
                  :class="{ error: attemptedSave && requiredError(row) }"
                  :value="formValues[row.key]"
                  @input="(ev: Event) => { formValues[row.key] = (ev.target as HTMLInputElement).value; }"
                />
                <button v-if="fileKeys.includes(row.key)" class="btn btn-secondary file-btn tip-up" data-tooltip="选择文件" aria-label="选择文件"
                  @click="pickFile(row.key)"><FontAwesomeIcon :icon="byPrefixAndName.fat['folder-open']" style="font-size: 14px;" /></button>
              </div>
              <div v-else-if="row.type === 'boolean'" class="dropdown">
                <Dropdown :value="formValues[row.key]"
                          :options="[{ value: 'false', label: 'false' }, { value: 'true', label: 'true' }]"
                          @update:value="(v: string) => { formValues[row.key] = v; }" />
              </div>
              <div v-else class="dropdown">
                <!-- options 选项 >8 字截断为前 8 字+…（truncOpt），hover tooltip=完整值；value 仍为原始串 -->
                <Dropdown :value="formValues[row.key]"
                          :options="optionRows[row.key] ?? []"
                          :tip="triggerTip(row.key)"
                          @update:value="(v: string) => { formValues[row.key] = v; }" />
              </div>
            </template>
          </div>

          <p v-if="attemptedSave && emptyRequired.length > 0" class="error-text">必填项未填写：{{ emptyRequired.map((k) => props.paramsMeta.params[k]).join('、') }}</p>
        </div>

        <!-- 底部按钮区固定不滚动：取消功能已挪到标题栏 [x]，仅保留 删除 + 保存；
             正中 = VRAM 指示（used / total GB，按余量变色，规格 §6） -->
        <footer class="modal-actions">
          <!-- [删除]：参考 [保存] 角形按钮——左下角形，上下占满底部栏全高、左缘贴卡片左缘（.modal-actions padding:0 16px 让位于绝对定位）；
               文字「删除」（2026-08）→ FontAwesome trash-can 图标 + a11y label（仅编辑模式渲染，行为不变） -->
          <button v-if="isEdit" class="btn-delete" aria-label="删除" @click="onDelete">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['trash-can']" />
          </button>
          <!-- 软盘图标 = 保存（2026-08-27 角形按钮；2026-09：手写 SVG → FontAwesome floppy-disk） -->
          <!-- VRAM 指示：底栏正中；used 按 vramTier 上色,total 恒蓝;grey 档整块灰 -->
          <!-- hover 明细 = ⓘ 图标的 .vram-tip 浮层（原生 :title tooltip 已删，避免双浮层叠加） -->
          <div class="vram-indicator" :class="'vram-indicator--' + vramTier">
            <!-- 未填 -m → 不计算，used 显示 --；total 照常显示已配置的显卡显存总量（如 -- / 24 GB） -->
            <span class="vram-used">{{ vramHasModel && vramUsedGb !== null ? vramUsedGb.toFixed(1) : '--' }}</span>
            <span class="vram-sep"> / </span>
            <span class="vram-total">{{ props.vramTotalGb !== undefined ? props.vramTotalGb.toFixed(1) : '--' }}</span>
            <!-- &nbsp;：flex item 内容的首空格会被 CSS 折叠（24.0 与 GB 贴死），用不换行空格兜底 -->
            <span class="vram-unit">&nbsp;GB</span>
            <span class="vram-info" aria-label="显存估算明细" @mouseenter="onInfoEnter" @mouseleave="vramTip = null">
              <FontAwesomeIcon :icon="byPrefixAndName.fat['circle-info']" />
            </span>
          </div>
          <button class="modal-save" :disabled="saving" aria-label="保存" @click="save">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['floppy-disk']" style="font-size: 18px;" />
          </button>
        </footer>
      </div>
    </div>
    <!-- 删除二次确认（方案 B：tone=danger 红色；[确认]才 delete_config，失败回 saveError 区） -->
    <!-- 文案（2026-08-27 优化）：引用配置名字（name prop，即 desc 字段），而非 id；
         超长名截断 + …（视觉宽度预算 8），hover title=完整值 -->
    <!-- VRAM 明细浮层：position:fixed 浮于视口（同 .tpl-tip 方案，避开底栏/卡片裁剪）；
         默认图标上方居中，顶部放不下时 .vram-tip--down 翻转到下方（vramTip.y + 24px） -->
    <div v-if="vramTip" class="vram-tip" :class="{ 'vram-tip--down': vramTip.flip }"
      :style="{ left: vramTip.x + 'px', top: (vramTip.flip ? vramTip.y + 24 : vramTip.y) + 'px' }">
      <!-- 顶部提示行（主题紫）：预测仅供参考，明细/降级两种形态都显示 -->
      <div class="vram-tip__title">显存占用预测，仅供参考</div>
      <template v-if="breakdown">
        <div v-for="row in breakdown" :key="row.label" class="vram-tip__row">
          <template v-if="row.note">{{ row.label }}</template>
          <template v-else>{{ row.label }} {{ row.gb.toFixed(1) }} GB</template>
        </div>
      </template>
      <div v-else class="vram-tip__row">{{ breakdownFallback }}</div>
    </div>
    <!-- flag label hover tooltip：position:fixed 浮于视口（.modal-body overflow-y:auto 不裁剪，同 .vram-tip/.dd-tip 方案）；
         默认挂 label 右侧垂直居中，右侧放不下视口时 .flag-tip--flip 翻到左缘内侧 -->
    <div v-if="flagTip" class="flag-tip" :class="{ 'flag-tip--down': !flagTip.above }"
      :style="{ left: flagTip.x + 'px', top: flagTip.y + 'px' }">{{ flagTip.text }}</div>
    <ConfirmDialog :open="confirmDeleteOpen" title="删除模板"
      :message="deleteShortMsg()" :tip="visualWidth(props.name || '') > NAME_BUDGET + 2 ? deleteFullMsg : undefined"
      tone="danger" @confirm="doDelete" @close="() => (confirmDeleteOpen = false)" />
  </Teleport>
</template>

<style scoped>
/* 弹窗卡片 = flex 纵向三段：标题栏 / 表单区（滚动）/ 按钮栏，各自固定不随滚动 */
/* .modal-overlay 遮罩已抽至全局 style.css（与 VramDialog 共用） */
.modal-box {
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;               /* #11 兜底：内容不得横向撑破卡片 */
  overflow-y: hidden;               /* 滚动交给 .modal-body，外层不再滚动 */
}
/* 标题栏：sticky 顶部固定；文字水平居中，[x] 绝对定位贴最右 */
.modal-head {
  position: sticky;
  top: 0;
  flex: none;
  display: flex;
  align-items: center;
  height: 32px;              /* 48 → 32：顶部栏高减 1/3 */
  padding: 0 16px;
  background: var(--card);          /* 白底盖住滚动内容（.card 圆角下顶部留白不穿帮） */
  border-bottom: 1px solid var(--border);
}
.modal-title {
  flex: 1;
  text-align: center;                /* 标题文字在标题栏居中 */
  font-size: var(--fs-title);
  font-weight: 600;
}
/* [x] 关闭按钮：参考应用窗口（Windows 标题栏）关闭键样式——右上角角形：
   上下占满标题栏全高、右缘贴卡片右缘（不再 inset/悬浮小方块）；
   右上圆角随卡片 12px 走形避免白角穿帮；hover = 系统关闭键红底白字。 */
.modal-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 36px;
  height: 100%;           /* 上下占满标题栏边缘 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--card);
  color: var(--muted);
  border: none;
  border-top-right-radius: var(--radius-card); /* 与卡片右上角圆角一致 */
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.modal-close:hover { background: var(--danger); color: #fff; } /* Windows 关闭键 hover：红底白字 */
/* 表单区：唯一的滚动容器 */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
/* .card 自带 16px padding，三段布局下交给各段自管 */
.modal-box.card { padding: 0; }
/* 表单区顶部留白由 .modal-body padding 承担；首个字段不再需要额外上距 */
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
/* id 展示行：编辑 = 只读文本（等宽字体 + 弱化色，明示不可编辑）；新建模式完全不显示 */
.id-view {
  font-family: var(--font-mono);
  font-size: var(--fs-label);
  color: var(--muted);
  margin: 0;
}
.row-cell { display: flex; gap: 8px; min-width: 0; }
.row-cell .input { flex: 1; }
.file-btn {
    /* 与「启动控制」[启动](rocket) 按钮同尺寸：.btn 基础盒（padding 0 14px + --h-control 高）+ 居中图标；不再用旧的 width:72px/padding 0 6px */
    flex-shrink: 0; height: var(--h-control); display: inline-flex; align-items: center; justify-content: center;
    padding: 0 14px; font-size: var(--fs-label);
  }
/* 按钮栏固定底部：删除（编辑模式）+ 保存 */
/* 底部栏高 = 顶部栏（.modal-head height:32px + 分隔线）：显式 32px（box-sizing:border-box），
   不再靠内容撑起——新建模式栏内唯一按钮 .modal-save 是绝对定位，无流内内容时旧值塌成细缝 */
.modal-actions {
  flex: none;
  position: relative;          /* .modal-save 绝对定位的包含块（同 .modal-head） */
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  border-top: 1px solid var(--border);
}
/* [删除]：与 [保存]/[×] 同一角形语言——左下角形，上下占满底部栏全高、左缘贴卡片左缘；
   左下圆角随卡片 12px 走形避免白角穿帮；危险操作语义 = 关闭键红底（默认卡片色，hover 红底白字） */
.btn-delete {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 36px;
  height: 100%;          /* 上下占满底部栏边缘（同 .modal-save） */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--card);
  color: var(--muted);
  border: none;
  border-bottom-left-radius: var(--radius-card); /* 与卡片左下角圆角一致 */
  cursor: pointer;
}
.btn-delete:hover { background: var(--danger); color: #fff; }
/* [保存] 软盘按钮：同 [×] 的角形语言——右下角形，上下占满底部栏全高、右缘贴卡片右缘；
   右下圆角随卡片 12px 走形避免白角穿帮；颜色 = 紫（--primary，与 VRAM 按钮/启动按钮统一），hover 加深一档。 */
.modal-save {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 36px;
  height: 100%;          /* 上下占满底部栏边缘 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: #fff;
  border: none;
  border-bottom-right-radius: var(--radius-card);
  cursor: pointer;
}
.modal-save:hover { background: var(--primary-hover); }
.modal-save:disabled, .modal-save[disabled='true'] {
  background: var(--disabled-bg);
  color: var(--muted);
  cursor: not-allowed;
}
/* VRAM 指示（规格 2026-08-29-vram-estimate-design §6）：底栏正中（.modal-actions 已 position:relative）；
   total 恒蓝（--accent-hover）；used 按 vramTier 上色；grey 档整块灰 + -- 占位。
   top:50% + translateY(-50%)：绝对定位未设 top 时落在静态位置（底栏内容区顶部），文字会偏上；补垂直居中 */
.vram-indicator {
  position: absolute; top: 50%; left: 50%;
  transform: translateX(-50%) translateY(-50%);
  display: inline-flex; align-items: baseline; white-space: nowrap;
  font-family: var(--font-mono); font-size: var(--fs-body);
}
.vram-used { color: var(--text); }
.vram-total { color: var(--primary); }                 /* 显卡显存总量恒紫（2026-08-29 主题紫统一） */
.vram-sep, .vram-unit { color: var(--muted); }
.vram-indicator--green .vram-used { color: var(--ok); }
.vram-indicator--orange .vram-used { color: var(--vram-orange); }
.vram-indicator--red .vram-used { color: var(--danger); }
.vram-indicator--grey .vram-used,
.vram-indicator--grey .vram-total,
.vram-indicator--grey .vram-sep,
.vram-indicator--grey .vram-unit { color: var(--muted); }
/* VRAM 明细悬停弹窗（规格 2026-08-30-vram-breakdown-tooltip-design §3.1/§3.2）：
   与「编辑」按钮 tooltip 同视觉语言（深灰底白字/12px/圆角 6px/z-30），多行列表自绘浮层；
   position:fixed 浮于视口，避开 .modal-box overflow 裁剪（同 .tpl-tip / .dd-tip 方案）。 */
.vram-info {
  margin-left: 4px;
  display: inline-flex; align-items: center;
  align-self: center;       /* .vram-indicator 基线对齐：span 无文字基线（内容只有 svg）时基线落底边 → 图标偏高；改垂直居中 */
  color: var(--muted);
  font-size: 13px; line-height: 1;
  cursor: default;          /* 纯 hover 提示，非可点击 */
}
.vram-tip {
  position: fixed;
  transform: translateX(-50%) translateY(-100%); /* 默认：图标上方居中 */
  background: #374151; color: #fff;
  font-size: var(--fs-label); line-height: 1.6;
  white-space: nowrap;
  padding: 6px 10px; border-radius: 6px;
  z-index: 30;
  pointer-events: none;
}
/* 顶部放不下：翻转到图标下方（去掉 translateY(-100%)） */
.vram-tip--down { transform: translateX(-50%); }
.vram-tip__row + .vram-tip__row { margin-top: 2px; }
/* 顶部提示行：主题紫（--primary），与下方明细行留 4px 间距 */
.vram-tip__title { color: var(--primary); margin-bottom: 4px; }
.vram-tip__title + .vram-tip__row { margin-top: 0; }
</style>
