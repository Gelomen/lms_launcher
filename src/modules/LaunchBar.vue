<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { invoke, errMsg, isMissing } from '../ipc';
import Dropdown from '../components/Dropdown.vue';

// 模块 3 · 启动控制与状态（§4.3）：配置下拉 + 单一切换按钮——未运行 = 绿 [启动]，
// 运行中 = 红 [停止]（stopping 时红 + 「...」禁用），启动失败自动恢复绿 [启动]；:disabled = 置灰。
const props = defineProps<{
  state: { running: boolean; stopping: boolean; configId: string | null; starting?: boolean };
  configsReloadKey: number; // App bump（TemplateModule 保存/删除后）→ 重新 load()
}>();

const emit = defineEmits<{ (e: 'start', configId: string): void; (e: 'stop'): void }>();

type ConfigMap = Record<string, { desc?: string; values: Record<string, string> }>;
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
  } catch (e) {
    // MISSING / YAML 透传——MISSING 显示提示不崩溃；configs 视为空
    const msg = errMsg(e);
    missing.value = isMissing(msg);
    configs.value = null;
    selected.value = '';
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

// 配置下拉截断（2026-08-26 spec + 当日再收紧）：同模板行名机制、阈值 8——窄容器下 10 字仍换行撑高选项，减为 8；>8 字 → 前 8 字 + …(U+2026)；
// tooltip（.dd-tip 悬浮层 + trigger data-tooltip）显示完整名字。下拉面板仅截断不撑宽（max-height 116px）。
const TRUNC_AT = 8;
function full(id: string): string {
  const c = configs.value?.[id];
  return (c?.desc ?? '') || id;
}
function display(id: string): string {
  const n = full(id);
  return n.length > TRUNC_AT ? n.slice(0, TRUNC_AT) + '…' : n;
}
const options = computed<{
  value: string; label: string; tip?: string;
}[] | undefined>(() => configs.value
  ? Object.keys(configs.value).map((id): { value: string; label: string; tip?: string } => {
      const fullN = full(id);
      return { value: id, label: display(id), tip: fullN.length > TRUNC_AT ? fullN : undefined };
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
    <h2>启动控制</h2>
    <!-- 配置下拉 + 单一切换按钮同行排布（与「llama.cpp 安装目录」卡片一致：控件占满宽度、按钮贴右）：
         未运行 = 绿 [启动]；运行中 = 红 [停止]（stopping → 「...」禁用）；
         启动失败 / 进程退出 → state 回落 ready → 自动恢复绿 [启动] -->
    <div style="display: flex; gap: 8px;">
      <!-- 下拉 flex 拉伸（.dropdown--stretch 覆盖 width:100%）+ 状态按钮防压缩（.btn-noshrink），
           窄卡片下 [启动]/[停止] 不被挤成竖排单字 -->
      <Dropdown class="dropdown--stretch" :disabled="state.running"
                :value="selected"
                :options="options ?? []" :tip="triggerTip"
                :placeholder="missing || (configs !== null && Object.keys(configs).length === 0) ? '（目前没有模板配置）' : '选择配置…'"
                @update:value="(v: string) => { selected = v; }" />
      <button
        class="btn-noshrink"
        :class="state.running ? 'btn btn-danger' : 'btn btn-launch'"
        :disabled="state.running ? !canStop : !canStart"
        @click="onToggle"
      >{{ state.stopping ? '...' : (state.running ? '停止' : '启动') }}</button>
    </div>
  </section>
</template>
