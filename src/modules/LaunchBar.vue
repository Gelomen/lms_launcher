<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { invoke, errMsg, isMissing } from '../ipc';
import Dropdown from '../components/Dropdown.vue';

// 模块 3 · 启动控制与状态（§4.3）：配置下拉 + 三态按钮（.btn-launch 空闲 / .running / :disabled）。
const props = defineProps<{
  state: { running: boolean; stopping: boolean; configId: string | null };
  statusText: string;
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

const canStart = computed((): boolean => !props.state.running && !props.state.stopping && selected.value.length > 0);

function onStart(): void { emit('start', selected.value); }
function onStop(): void { emit('stop'); }

onMounted(load);

// App bump configsReloadKey（TemplateModule 保存/删除配置后）→ 重新 load()，
// running 时锁定当前 configId 不受影响（load 内部已处理）
watch((): number => props.configsReloadKey, () => { void load(); });
// 无订阅 / 定时器；卸载无需清理。
</script>
<template>
  <section class="module module-launch">
    <h2 style="margin: 0; line-height: var(--h-control);">启动控制</h2>
    <label class="label">配置</label>
    <Dropdown :disabled="state.running"
              :value="selected"
              :options="configs ? Object.keys(configs).map((id) => ({ value: id, label: id })) : []"
              :placeholder="missing || (configs !== null && Object.keys(configs).length === 0) ? '（目前没有模板配置）' : '选择配置…'"
              @update:value="(v: string) => { selected = v; }" />
    <div style="display: flex; gap: 8px; align-items: center; margin-top: 8px;">
      <button class="btn btn-launch" :class="{ running: state.running }" :disabled="!canStart" @click="onStart">启动</button>
      <button class="btn btn-danger" :disabled="!state.running || state.stopping" @click="onStop">{{ state.stopping ? '停止中…' : '停止' }}</button>
    </div>
    <p class="label" style="margin-top: 8px;">{{ statusText }}</p>
  </section>
</template>
