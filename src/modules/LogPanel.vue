<script setup lang="ts">
import { computed, ref } from 'vue';
import LogTabView from './LogTabView.vue';
import { LOG_TABS, type LogTabId } from './log-tabs';

// 标签条 + 激活切换；行数据由 App 分桶后按 tab 下发，视图状态全在 LogTabView 实例内。
const props = defineProps<{ buckets: Record<LogTabId, Array<{ line: string; stream: 'sys' | 'out' | 'err' }>> }>();

// 默认激活第一个 tab（LMS Launcher）——用户指定顺序的第 1 位。
const active = ref<LogTabId>(LOG_TABS[0].id);
// 激活页签在注册表中的下标——用于给「激活页签左侧」的页签打 pre 类（顶部横线起点用）。
const activeIdx = computed(() => LOG_TABS.findIndex((x) => x.id === active.value));
</script>
<template>
  <section class="log-panel">
    <nav class="tab-bar" role="tablist">
      <button v-for="t in LOG_TABS" :key="t.id" type="button" role="tab"
        class="log-tab" :class="{ active: t.id === active, pre: LOG_TABS.indexOf(t) < activeIdx }"
        :aria-selected="t.id === active ? 'true' : 'false'" @click="active = t.id">{{ t.label }}</button>
    </nav>
    <LogTabView v-for="t in LOG_TABS" :key="t.id" v-show="t.id === active"
      :id="t.id" :lines="buckets[t.id]" />
  </section>
</template>