<script setup lang="ts">
// UpdateModal：检查更新弹窗（计划 task-2；规格 docs/superpowers/specs/2026-09-01-update-modal-design.md）
// 纯渲染层：七态状态机由外层（App）持有 → 本组件 props 驱动（open=false 不渲染）；
// 事件契约：action(index, kind) / close。关闭 × 只发 close（不中断下载——下载在主进程）。
// 视觉语言同 TemplateModal：全局 .modal-overlay 遮罩 + 320px 白底 12px 圆角卡片 +
// 32px 标题栏（标题居中，右上角 × 关闭 hover 红底白字）+ 内容区 padding 16px。

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date';
type Item = {
  name: string;
  phase: Phase;
  version?: string;
  pct?: number;
  errorText?: string;
};

const props = withDefaults(defineProps<{
  open: boolean;
  items: Item[];
}>(), { items: () => [] });

const emit = defineEmits<{
  (e: 'action', index: number, kind: string): void;
  (e: 'close'): void;
}>();

// 七态按钮映射：phase → 按钮文案 / 事件 kind / 是否禁用
// idle=检查更新 / checking=检查中...(禁用) / available=下载更新 / downloading=下载中 NN%(禁用)
// / ready=重启应用 / error=重试 / up-to-date=检查更新
const BUTTONS: Record<Phase, { label: (pct: number) => string; kind: string; disabled: boolean }> = {
  idle:         { label: () => '检查更新',       kind: 'check',    disabled: false },
  checking:     { label: () => '检查中...',      kind: 'check',    disabled: true },
  available:    { label: () => '下载更新',       kind: 'download', disabled: false },
  downloading:  { label: (p) => `下载中 ${Math.floor(p)}%`, kind: 'download', disabled: true },
  ready:        { label: () => '重启应用',       kind: 'restart',  disabled: false },
  error:        { label: () => '重试',           kind: 'retry',    disabled: false },
  'up-to-date': { label: () => '检查更新',       kind: 'check',    disabled: false },
};

function btnLabel(item: Item): string {
  const b = BUTTONS[item.phase];
  return b ? b.label(item.pct ?? 0) : '';
}

function btnDisabled(item: Item): boolean {
  const b = BUTTONS[item.phase];
  return b ? b.disabled : true;
}

// 中段渲染（12px）：available/ready → 新版号（--muted）；up-to-date → 灰字「已是最新版本 vX.Y.Z」；error → 红字错误原因
function middleKind(item: Item): string {
  switch (item.phase) {
    case 'available':
    case 'ready':
      return 'version';
    case 'up-to-date':
      return 'latest';
    case 'error':
      return 'error';
    default:
      return '';
  }
}

function middleText(item: Item): string {
  switch (middleKind(item)) {
    case 'version':
      return item.version ?? '';
    case 'latest':
      return `已是最新版本 ${item.version ?? ''}`;
    case 'error':
      return item.errorText ?? '';
    default:
      return '';
  }
}

function onAction(index: number, item: Item): void {
  const b = BUTTONS[item.phase];
  if (!b || b.disabled) return;
  emit('action', index, b.kind);
}

function onClose(): void {
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="modal-overlay update-modal">
      <div class="update-card">
        <!-- 32px 标题栏：标题「检查更新」居中；右上角 × 关闭（hover 红底白字，同 .modal-close） -->
        <div class="update-head">
          <span class="update-title">检查更新</span>
          <button type="button" class="update-close" aria-label="关闭弹窗" @click="onClose()">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <!-- 内容区 padding 16px；每行单行三段 flex：项目名（14px） | 中段（12px） | 动作按钮（.text-btn） -->
        <div class="update-body">
          <div v-for="(item, i) in props.items" :key="i" class="update-row">
            <span class="update-row__name">{{ item.name }}</span>
            <span
              v-if="middleKind(item) !== ''"
              class="update-row__middle"
              :class="
                middleKind(item) === 'version' ? 'update-row__version'
                : middleKind(item) === 'latest' ? 'update-row__latest'
                : 'update-row__error'
              "
            >{{ middleText(item) }}</span>
            <div class="update-row__action">
              <button type="button" class="text-btn" :disabled="btnDisabled(item)" @click="onAction(i, item)">
                {{ btnLabel(item) }}
              </button>
              <!-- downloading：按钮下方 4px 高紫色进度条（宽度 = pct%，行下方 4px 间距） -->
              <div v-if="item.phase === 'downloading'" class="update-progress">
                <div class="update-progress-bar" :style="{ width: (item.pct ?? 0) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 320px 白底 12px 圆角卡片（同 TemplateModal 卡片语言） */
.update-card {
  width: 320px;
  background: var(--card);
  border-radius: var(--radius-card);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04); /* 与 TemplateModal 全局 .card 卡片阴影一致 */
  overflow: hidden;
}

/* 32px 标题栏：标题居中；右上角 × 关闭（角形占满标题栏高，同 .modal-close） */
.update-head {
  position: relative;
  height: 32px;
  display: flex;
  align-items: center;
  background: var(--card);
  border-bottom: 1px solid var(--border);
}
.update-title {
  flex: 1;
  text-align: center;
  font-size: var(--fs-title);
  font-weight: 600;
}
.update-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 36px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--card);
  color: var(--muted);
  border: none;
  border-top-right-radius: var(--radius-card); /* 与卡片右上角圆角一致 */
  cursor: pointer;
}
.update-close:hover { background: var(--danger); color: #fff; } /* Windows 关闭键 hover：红底白字 */

/* 内容区 padding 16px；多行预留 8px 行间距（本期单行） */
.update-body {
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 每行单行三段 flex：项目名（左） | 中段（中，12px） | 动作按钮（右） */
.update-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.update-row__name {
  font-size: var(--fs-body);
  color: var(--text);
  flex: none;
}
.update-row__middle {
  flex: 1;
  font-size: var(--fs-label);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.update-row__version { color: var(--muted); }
.update-row__latest { color: var(--muted); }
.update-row__error { color: var(--danger); }
.update-row__action {
  flex: none;
  margin-left: auto; /* 动作按钮恒贴行右缘：中段不渲染（idle/checking/downloading）时不留白、不跳变 */
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* downloading：按钮下方 4px 高紫色进度条（轨道灰 + 填充紫 --primary，与按钮行留 4px 间距） */
.update-progress {
  width: 100%;
  height: 4px;
  margin-top: 4px;
  background: var(--disabled-bg);
  border-radius: 2px;
  overflow: hidden;
}
.update-progress-bar {
  height: 100%;
  background: var(--primary);
  transition: width 0.15s ease;
}
</style>
