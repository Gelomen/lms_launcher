<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { faFloppyDisk, faFolderOpen, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg } from '../ipc';
import { truncateByWidth, visualWidth } from '../util/truncate';

import Dropdown from '../components/Dropdown.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

// FontAwesome：按需注册 regular 款——floppy-disk（保存）/ folder-open（选择文件）/ trash-can（删除），
// xmark（关闭 ×）无 regular 款，保留 free-solid；均经 library.add 进入本地库
config.autoGenerateCss = true;
library.add(faFloppyDisk, faTrashCan, faXmark, faFolderOpen);
// byPrefixAndName：按「前缀 → { iconName: IconDefinition }」组织，模板侧 <FontAwesomeIcon :icon="byPrefixAndName.fat['floppy-disk']" /> 直接取图标定义
const byPrefixAndName = { fat: { 'floppy-disk': faFloppyDisk, xmark: faXmark, 'trash-can': faTrashCan, 'folder-open': faFolderOpen } };

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
  };
}>(), { name: '' });

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
async function doDelete(): Promise<void> {
  try {
    await invoke('delete_config', props.id);
    emit('deleted', props.id);
    confirmDeleteOpen.value = false; // 成功关窗
  } catch (e) {
    saveError.value = errMsg(e); // VALIDATION / IO / MISSING 前缀原样展示（失败保持开，回表单区看报错）
  }
}

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
              <label class="label flag-label">{{ row.flag }}</label>
              <!-- boolean / options → #13 共享 Dropdown 组件；text → input（params_file 行右侧加「选择文件」按钮） -->
              <div class="row-cell" v-if="row.type === 'text'">
                <input
                  class="input"
                  :class="{ error: attemptedSave && requiredError(row) }"
                  :value="formValues[row.key]"
                  @input="(ev: Event) => { formValues[row.key] = (ev.target as HTMLInputElement).value; }"
                />
                <button v-if="fileKeys.includes(row.key)" class="btn btn-secondary file-btn" title="选择文件" aria-label="选择文件"
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

        <!-- 底部按钮区固定不滚动：取消功能已挪到标题栏 [x]，仅保留 删除 + 保存 -->
        <footer class="modal-actions">
          <!-- [删除]：参考 [保存] 角形按钮——左下角形，上下占满底部栏全高、左缘贴卡片左缘（.modal-actions padding:0 16px 让位于绝对定位）；
               文字「删除」（2026-08）→ FontAwesome trash-can 图标 + a11y label（仅编辑模式渲染，行为不变） -->
          <button v-if="isEdit" class="btn-delete" aria-label="删除" @click="onDelete">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['trash-can']" />
          </button>
          <!-- 软盘图标 = 保存（2026-08-27 角形按钮；2026-09：手写 SVG → FontAwesome floppy-disk） -->
          <button class="modal-save" :disabled="saving" aria-label="保存" @click="save">
            <FontAwesomeIcon :icon="byPrefixAndName.fat['floppy-disk']" style="font-size: 18px;" />
          </button>
        </footer>
      </div>
    </div>
    <!-- 删除二次确认（方案 B：tone=danger 红色；[确认]才 delete_config，失败回 saveError 区） -->
    <ConfirmDialog :open="confirmDeleteOpen" title="删除模板"
      :message="'删除配置「' + props.id + '」？将从 llama_launch_configs.yaml 移除。'"
      tone="danger" @confirm="doDelete" @close="() => (confirmDeleteOpen = false)" />
  </Teleport>
</template>

<style scoped>
/* §4.2 模板弹窗遮罩——style.css 无此语义类，故组件内自给（不污染全局） */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
/* 弹窗卡片 = flex 纵向三段：标题栏 / 表单区（滚动）/ 按钮栏，各自固定不随滚动 */
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
   右下圆角随卡片 12px 走形避免白角穿帮；颜色 = 主色蓝（.btn-primary 语义），hover 加深一档。 */
.modal-save {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 36px;
  height: 100%;          /* 上下占满底部栏边缘 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: #fff;
  border: none;
  border-bottom-right-radius: var(--radius-card);
  cursor: pointer;
}
.modal-save:hover { background: var(--accent-hover); }
.modal-save:disabled, .modal-save[disabled='true'] {
  background: var(--disabled-bg);
  color: var(--muted);
  cursor: not-allowed;
}
</style>
