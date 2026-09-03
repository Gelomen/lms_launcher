<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { invoke, errMsg } from '../ipc';
// FontAwesome：与 TemplateModal 同款注册方式（xmark 关闭 / floppy-disk 保存）
import { library, config } from '@fortawesome/fontawesome-svg-core';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { faFloppyDisk } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
config.autoGenerateCss = true;
library.add(faFloppyDisk, faXmark);
const byPrefixAndName = { fat: { 'floppy-disk': faFloppyDisk, xmark: faXmark } };

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const proxyHost = ref('');
const proxyPort = ref('');
const saveError = ref('');
const saving = ref(false);

onMounted(async () => {
  try {
    const cfg: any = await invoke('get_app_config');
    proxyHost.value = cfg?.proxy_host ?? '';
    proxyPort.value = cfg?.proxy_port != null ? String(cfg.proxy_port) : '';
  } catch { /* 回填失败静默 */ }
});

watch(() => props.open, (v) => { if (v) saveError.value = ''; });

// 代理地址格式白名单：IPv4（a.b.c.d）或主机名（字母数字点连字符，每段不以连字符起头）。
// 拒绝带 scheme（http://evil）、带端口（host:80，端口应另填）、带空格/路径等畸形输入，
// 否则这些会拼进 ProxyAgent uri 才在「检查更新」时报 invalid URL（延迟 UX）。
const PROXY_HOST_RE = /^(?:\d{1,3}\.){3}\d{1,3}$|^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

function validate(): string | null {
  const h = proxyHost.value.trim();
  const p = proxyPort.value.trim();
  if ((h && !p) || (!h && p)) return '端口不能为空（或留空禁用代理）';
  if (h && !PROXY_HOST_RE.test(h)) return '代理地址须为 IPv4 或主机名（不含端口、协议、空格）';
  if (p) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return '端口须为 1–65535 的数字';
  }
  return null;
}

async function save() {
  const err = validate();
  if (err) { saveError.value = err; return; }
  saving.value = true;
  saveError.value = '';
  try {
    await invoke('save_proxy', proxyHost.value, proxyPort.value);
    emit('saved');
  } catch (e) {
    saveError.value = errMsg(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <!-- 与 TemplateModal/UpdateModal 同款：Teleport 到 body（全局遮罩） -->
  <Teleport to="body">
  <div v-if="open" class="modal-overlay">
    <div class="modal-box card">
      <div class="modal-head">
        <div class="modal-title">设置</div>
        <button type="button" class="modal-close" aria-label="关闭弹窗" @click="emit('close')">
          <FontAwesomeIcon :icon="byPrefixAndName.fat['xmark']" />
        </button>
      </div>
      <div class="modal-body">
        <p v-if="saveError" class="error-text">{{ saveError }}</p>
        <div class="form-row">
          <label class="label" for="proxy-host">代理地址</label>
          <input id="proxy-host" v-model="proxyHost" class="input" type="text" placeholder="127.0.0.1" />
        </div>
        <div class="form-row">
          <label class="label" for="proxy-port">端口</label>
          <input id="proxy-port" v-model="proxyPort" class="input" type="text" inputmode="numeric" placeholder="10808" />
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-save" :disabled="saving" aria-label="保存" @click="save">
          <FontAwesomeIcon :icon="byPrefixAndName.fat['floppy-disk']" style="font-size: 18px;" />
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.modal-box {
  width: 90%;
  max-width: 320px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: hidden;
}
.modal-head {
  position: sticky; top: 0; flex: none;
  display: flex; align-items: center;
  height: 32px; padding: 0 16px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
}
.modal-title { flex: 1; text-align: center; font-size: var(--fs-title); font-weight: 600; }
.modal-close {
  position: absolute; top: 0; right: 0;
  width: 36px; height: 100%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--card); color: var(--muted);
  border: none; border-top-right-radius: var(--radius-card);
  font-size: 16px; line-height: 1; cursor: pointer;
}
.modal-close:hover { background: var(--danger); color: #fff; }
.modal-body { flex: 1; overflow-y: auto; padding: 16px; }
.modal-box.card { padding: 0; }
.form-row { display: flex; flex-direction: column; gap: 4px; }
.form-row + .form-row { margin-top: 12px; }
.modal-actions {
  flex: none; position: relative;
  display: flex; justify-content: flex-end; align-items: center;
  height: 32px; padding: 0 16px;
  border-top: 1px solid var(--border);
}
.modal-save {
  position: absolute; right: 0; bottom: 0;
  width: 36px; height: 100%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--primary); color: #fff;
  border: none; border-bottom-right-radius: var(--radius-card);
  cursor: pointer;
}
.modal-save:hover { background: var(--primary-hover); }
.modal-save:disabled, .modal-save[disabled='true'] {
  background: var(--disabled-bg); color: var(--muted); cursor: not-allowed;
}
</style>
