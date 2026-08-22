<script setup lang="ts">
// 模块组件任务 7/8 实现——先用占位组件占位：
import DirModule from './modules/DirModule.vue';
import TemplateModule from './modules/TemplateModule.vue';
import LaunchBar from './modules/LaunchBar.vue';
import LogPanel from './modules/LogPanel.vue';
</script>
<template>
  <main class="layout">
    <h1 class="app-title">lms_launch</h1>
    <section class="grid">
      <div class="card"><DirModule /></div>
      <div class="card"><TemplateModule /></div>
      <div class="card"><LaunchBar /></div>
    </section>
    <section class="log-area">
      <LogPanel />
    </section>
  </main>
</template>
