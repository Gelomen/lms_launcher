<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faFolderOpen } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { invoke, errMsg } from '../ipc';

// 2026-08-31：校验出 ✓/✗ 结果后向 App 通报（App 写「目录校验」sys 行进 LMS Launcher 日志区）
const emit = defineEmits<{ (e: 'validated', r: { ok: boolean; dir: string }): void }>();

// FontAwesome：按需注册 folder-open regular 款（选择目录按钮原「…」三点），tree-shakeable 用法；与 TemplateModal / Dropdown 同模式。
config.autoGenerateCss = true;
library.add(faFolderOpen);
const byPrefixAndName = { fat: { 'folder-open': faFolderOpen } };

// 模块 1 · llama.cpp 安装目录（规格 §4.1）
const dir = ref('');
const status = ref<{ ok: boolean; msg: string } | null>(null);
const error = ref<string | null>(null);
const saving = ref(false);

async function load(): Promise<void> {
  try {
    const cfg = await invoke<{ llama_dir: string }>('get_app_config');
    dir.value = cfg.llama_dir;
  } catch (e) {
    error.value = errMsg(e); // config 层 IO / YAML 错误
  }
}

async function pickDir(): Promise<void> {
  try {
    const picked = await invoke<string | null>('open_dir_dialog');
    if (picked !== null) {
      dir.value = picked;
      // 选择目录后自动触发校验（原「校验」按钮已移除，功能保留）
      await validate();
      return;
    }
    status.value = null;
    error.value = null;
  } catch (e) {
    error.value = errMsg(e);
  }
}

// 校验：validate_dir(dir) —— 主进程检查 <dir>\llama-server.exe 是否存在；
// 目录选择确定后自动触发（不再是按钮）；
// 通过后 save_llama_dir 写入 lms_launcher.yaml（下次启动自动读取）
async function validate(): Promise<void> {
  error.value = null;
  if (dir.value.trim().length === 0) { status.value = null; return; }
  try {
    const ok = await invoke<boolean>('validate_dir', dir.value.trim());
    emit('validated', { ok, dir: dir.value.trim() }); // 日志区记录校验结果（成功/失败均发）
    if (ok) {
      status.value = { ok: true, msg: 'llama-server.exe 已找到' };
      saving.value = true;
      try {
        await invoke('save_llama_dir', dir.value.trim());
      } catch (e) {
        error.value = errMsg(e);
      } finally { saving.value = false; }
    } else {
      status.value = { ok: false, msg: '未找到 llama-server.exe' };
    }
  } catch (e) {
    // validate_dir 契约上不抛 MISSING/VALIDATION —— 未知异常转字符串展示（不崩溃）
    error.value = errMsg(e);
  }
}

onMounted(load);
</script>
<template>
  <section class="module module-dir">
    <h2 style="display: flex; align-items: center; gap: 6px;">
      <svg width="16" height="16" viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; fill: currentColor;" aria-hidden="true">
        <path d="M600 392L504.249 558L504.137 557.929C487.252 584.069 458.193 600 426.864 600H120L240 392H600Z"></path>
        <path d="M240 392H0L199.602 46.0254C216.032 17.5463 246.411 3.25756e-05 279.29 0H466.154L240 392Z"></path>
      </svg>
      llama.cpp 安装目录
    </h2>
    <p v-if="error" class="error-text">{{ error }}</p>
    <div style="display: flex; gap: 8px;">
      <input class="input" v-model="dir" @change="status = null" />
      <!-- 与「启动控制」状态按钮同款保护：flex-shrink:0 防止窄卡片下被 input(width:100%) 挤压 ——
           宽度固定 = [启动]/[停止] 的盒子（2 CJK 字 + padding + 边框），两个按钮尺寸一致 -->
      <button class="btn btn-secondary btn-dirpick btn-noshrink tip-up" data-tooltip="选择 llama.cpp 安装目录" aria-label="选择 llama.cpp 安装目录" @click="pickDir">
        <FontAwesomeIcon :icon="byPrefixAndName.fat['folder-open']" style="font-size: 16px;" />
      </button>
    </div>
    <!-- 下方恒定槽位：预留校验结果行（单行，与「保存中…」共用；避免校验前后卡片高度抖动） -->
    <div class="dir-status">
      <p v-if="status?.ok" class="ok-text">✓ {{ status.msg }}</p>
      <p v-else-if="status && !status.ok" class="error-text">✗ {{ status.msg }}</p>
      <p v-else-if="saving" class="label">保存中…</p>
    </div>
  </section>
</template>
