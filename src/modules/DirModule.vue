<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { invoke, errMsg } from '../ipc';

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
    if (picked !== null) dir.value = picked;
    status.value = null;
    error.value = null;
  } catch (e) {
    error.value = errMsg(e);
  }
}

// 「校验」：validate_dir(dir) —— 主进程检查 <dir>\llama-server.exe 是否存在；
// 通过后 save_llama_dir 写入 lms_launcher.yaml（下次启动自动读取）
async function validate(): Promise<void> {
  error.value = null;
  if (dir.value.trim().length === 0) { status.value = null; return; }
  try {
    const ok = await invoke<boolean>('validate_dir', dir.value.trim());
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
    <h2>llama.cpp 安装目录</h2>
    <p v-if="error" class="error-text">{{ error }}</p>
    <div style="display: flex; gap: 8px;">
      <input class="input" v-model="dir" :placeholder="'C:' + String.fromCharCode(92) + 'llama.cpp' + String.fromCharCode(92) + 'build-cpu-avx2'" @change="status = null" />
      <button class="btn btn-secondary" @click="pickDir">选择目录…</button>
    </div>
    <button class="btn btn-secondary" style="margin-top: 8px;" @click="validate">校验</button>
    <p v-if="status?.ok" class="ok-text">✓ {{ status.msg }}（已保存）</p>
    <p v-else-if="status && !status.ok" class="error-text">✗ {{ status.msg }}</p>
    <p v-if="saving" class="label">保存中…</p>
  </section>
</template>
