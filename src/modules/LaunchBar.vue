<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faRocket, faStop } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg, isMissing } from '../ipc';
import { t } from '../i18n';
import { truncateByWidth, visualWidth } from '../util/truncate';
import Dropdown from '../components/Dropdown.vue';

// FontAwesome：按需注册 rocket（[启动] 按钮）/ stop（[停止] 按钮，实心——用户定停止按钮用实心图标）。
// rocket/stop 均为 solid（fas）；stopping 态仍显「...」禁用。
config.autoGenerateCss = true;
library.add(faRocket, faStop);
const byPrefixAndName = { fat: { rocket: faRocket }, fas: { stop: faStop } };

// 模块 3 · 启动控制与状态（§4.3）：配置下拉 + 单一切换按钮——未运行 = 绿 [启动]，
// 运行中 = 红 [停止]（stopping 时红 + 「...」禁用），启动失败自动恢复绿 [启动]；:disabled = 置灰。
const props = defineProps<{
  state: { running: boolean; stopping: boolean; configId: string | null; starting?: boolean };
  configsReloadKey: number; // App bump（TemplateModule 保存/删除后）→ 重新 load()
}>();

const emit = defineEmits<{ (e: 'start', configId: string): void; (e: 'stop'): void }>();

// 数据 key：desc → name（2026-09）；legacy desc 由 main configsLoad 归一
type ConfigMap = Record<string, { name?: string; values: Record<string, string> }>;
const configs = ref<ConfigMap | null>(null);
const missing = ref(false);
const selected = ref('');
const error = ref<string | null>(null);

async function load(): Promise<void> {
  try {
    const map = await invoke<ConfigMap>('get_configs');
    configs.value = map;
    missing.value = false;
    error.value = null;
    // running 时锁定运行中的配置 id；否则保留当前选中、无选中取第一个
    const ids = Object.keys(map);
    if (props.state.running && props.state.configId !== null && map[props.state.configId] !== undefined) {
      selected.value = props.state.configId;
    } else if (ids.includes(selected.value)) {
      // 保持选中（如模板模块保存后再次加载）
    } else if (ids.length > 0) {
      selected.value = ids[0];
    } else {
      selected.value = '';
    }
    pushTrayTooltip(selected.value);
  } catch (e) {
    // MISSING / YAML 透传——MISSING 显示提示不崩溃；configs 视为空
    const msg = errMsg(e);
    missing.value = isMissing(msg);
    configs.value = null;
    selected.value = '';
    pushTrayTooltip('');
  }
}

// [启动]（绿）：无运行进程 + 有选中配置 + start_server 不在途（starting）——单按钮期间防重复点击
const canStart = computed((): boolean => props.state.running === false && props.state.stopping === false && props.state.starting !== true && selected.value.length > 0);
// [停止]（红）：运行中可点；stopping 中显示「...」并禁用
const canStop = computed((): boolean => props.state.running && !props.state.stopping);

function onToggle(): void {
  if (props.state.running) emit('stop');
  else emit('start', selected.value);
}

onMounted(load);

// 配置下拉截断（2026-08-26 spec-truncate-by-visual-width）：按视觉宽度预算 24——CJK=2 / 拉丁=1；
// 中文 ≤12 字全量渲染（grace=2 内到 13 字），英文/拉丁可到 24 字符再 + …(U+2026)；
// tooltip（.dd-tip 悬浮层 + trigger data-tooltip）显示完整名字。下拉面板仅截断不撑宽（max-height 116px）。
// 预算取 24 不是挑数字，是按现在的卡片列（--card-col-w 335 / ADR 0004）反推的算术，与旧值 16 同一套口径
// （「预算 + grace = 放得下全名的上限」、「预算 + … 本身 = 放得下截断串的上限」两条都成立，且都不越界）：
//   卡片内容宽 = 335 − .card 边框 2 − padding 32 = 301
//   状态按钮 = FA 图标 1.25em×16px=20 + .btn padding 28 + 边框 2 = 50（.btn-noshrink 定宽不缩）
//   trigger  = 301 − 排内 gap 8 − 50 = 243
//   label 可用 = 243 − 边框 2 − .btn padding 28 − 排内 gap 8 − .select-caret 15.75（1.25em×11px + padding-right 2） = 189px
//   1 个宽度单位 ≈ 7px：14px 字号下一个汉字 = 1em = 14px、拉丁实测 6.8~7.4px（GDI 量 Segoe UI 14px，
//     与截图里「abcdefg中文中文…」= 7 拉丁 + 4 汉字 + … 的 117px 逐字对得上）；「…」实测 10px ≈ 1.4 单位
//   → 全名放得下 = 189/7 ≈ 27.0 单位（预算 24 + grace 2 = 26 ✓；13 个汉字 = 182px ≤ 189px 确实铺得下）
//   → 前缀 + … 放得下 = (189−10)/7 ≈ 25.6 单位（24 + 1.4 = 25.4 ✓；取 26 就会越这条，截断串本身要 CSS 再裁一次）
// 旧值 16 是同一算法在旧卡片列 280（ADR 0004 之前 .grid 第一列）上的读数：label 可用 134px → (134−10)/7 ≈ 17.7 → 16。
// 卡片列 280→335 后这条预算没人重算（ADR 0004 的连带只写了「名字预算 30 不动」），于是 label 右半段白给
// （2026-10-26 用户截图：「abcdefg中文中文…」只占掉 117/189px）。截图按 1.5 倍 DPI 复量与上面算术逐条对上：
// trigger 外沿 244px、状态按钮 49px、label 起点 = trigger 左内边距 14px。再改宽度先重算这一串。
const BUDGET = 24;
function full(id: string): string {
  const c = configs.value?.[id];
  return (c?.name ?? '') || id;
}
function display(id: string): string {
  return truncateByWidth(full(id), BUDGET);
}
// 托盘 hover 提示同步（spec 2026-09-05-tray-tooltip-template）：选中完整名；无选择 → null → 主进程显示「暂无模板配置」
function pushTrayTooltip(id: string): void {
  void invoke('tray-tooltip-update', full(id) || null);
}
const options = computed<{
  value: string; label: string; tip?: string;
}[] | undefined>(() => configs.value
  ? Object.keys(configs.value).map((id): { value: string; label: string; tip?: string } => {
      const fullN = full(id);
      // 与 truncateByWidth grace=2 对齐：仅「手动截断」(width > BUDGET+2) 才带完整名 tooltip；grace 内全量渲染 → 无 …、无 tooltip
      return { value: id, label: display(id), tip: visualWidth(fullN) > BUDGET + 2 ? fullN : undefined };
    })
  : undefined);
// trigger tooltip：选中项长名携带完整名字（hover 即出，样式同「编辑」按钮）
const triggerTip = computed<string | undefined>(() => {
  if (!options.value) return undefined;
  const sel = options.value.find((o) => o.value === selected.value);
  return sel ? sel.tip : undefined;
});

// App bump configsReloadKey（TemplateModule 保存/删除配置后）→ 重新 load()，
// running 时锁定当前 configId 不受影响（load 内部已处理）
watch((): number => props.configsReloadKey, () => { void load(); });
// 无订阅 / 定时器；卸载无需清理。
</script>
<template>
  <section class="module module-launch">
    <h2>{{ t('launch.title') }}</h2>
    <!-- 配置下拉 + 单一切换按钮同行排布（与「llama.cpp 安装目录」卡片一致：控件占满宽度、按钮贴右）：
         未运行 = 绿 [启动]；运行中 = 红 [停止]（stopping → 「...」禁用）；
         启动失败 / 进程退出 → state 回落 ready → 自动恢复绿 [启动] -->
    <div style="display: flex; gap: 8px;">
      <!-- 下拉 flex 拉伸（.dropdown--stretch 覆盖 width:100%）+ 状态按钮防压缩（.btn-noshrink），
           窄卡片下 [启动]/[停止] 不被挤成竖排单字 -->
      <Dropdown class="dropdown--stretch" :disabled="state.running"
                :value="selected"
                :options="options ?? []" :tip="triggerTip"
                :placeholder="missing || (configs !== null && Object.keys(configs).length === 0) ? t('launch.placeholder.empty') : t('launch.placeholder.select')"
                @update:value="(v: string) => { selected = v; pushTrayTooltip(v); }" />
      <button
        class="btn-noshrink"
        :class="state.running ? 'btn btn-danger' : 'btn btn-launch'"
        :disabled="state.running ? !canStop : !canStart"
        @click="onToggle"
      ><template v-if="!state.running"><FontAwesomeIcon :icon="byPrefixAndName.fat['rocket']" style="font-size: 16px;" /></template>
         <span v-else-if="state.stopping">...</span>
         <FontAwesomeIcon v-else :icon="byPrefixAndName.fas['stop']" style="font-size: 14px;" />
      </button>
    </div>
  </section>
</template>
