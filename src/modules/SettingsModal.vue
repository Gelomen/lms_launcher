<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { invoke, errMsg } from '../ipc';
import Dropdown from '../components/Dropdown.vue';
import { currentLang, setLang, t, type Lang } from '../i18n';
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
// 校验类报错存 key（如 settings.proxy.err.partial），渲染端 t() 即时重译——切换语言后同一条错误自动变为新语言（spec §3.5 仅指已落定的日志/错误文本不回改，渲染端实时报错属即时重译）。
const validateError = ref('');
// 主进程透传的 IO 错误文本（errMsg）不是词典 key，保持原样透传（非译边界）。
const ioError = ref('');
const saving = ref(false);

// 语言选项：语言名用自名（中文 / English），不随当前语言翻译（spec §6.3）。
const langOptions = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];
// 语言切换即时生效：setLang 本地立即切换 + 通知主进程持久化/重建托盘，无保存按钮。
function onLangChange(v: string): void {
  if (v !== 'zh' && v !== 'en') return;
  setLang(v as Lang);
}

onMounted(async () => {
  try {
    const cfg: any = await invoke('get_app_config');
    proxyHost.value = cfg?.proxy?.host ?? '';
    proxyPort.value = cfg?.proxy?.port != null ? String(cfg.proxy.port) : '';
  } catch { /* 回填失败静默 */ }
});

watch(() => props.open, (v) => { if (v) { validateError.value = ''; ioError.value = ''; } });

// 代理地址格式白名单：IPv4（a.b.c.d）或主机名（字母数字点连字符，每段不以连字符起头）。
// 拒绝带 scheme（http://evil）、带端口（host:80，端口应另填）、带空格/路径等畸形输入，
// 否则这些会拼进 ProxyAgent uri 才在「检查更新」时报 invalid URL（延迟 UX）。
const PROXY_HOST_RE = /^(?:\d{1,3}\.){3}\d{1,3}$|^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

// 校验类错误返回词典 key（存 key 不存译文，渲染端 t() 随语言即时重译，见 validateError 注释）。
function validate(): string | null {
  const h = proxyHost.value.trim();
  const p = proxyPort.value.trim();
  if ((h && !p) || (!h && p)) return 'settings.proxy.err.partial';
  if (h && !PROXY_HOST_RE.test(h)) return 'settings.proxy.err.host';
  if (p) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return 'settings.proxy.err.port';
  }
  return null;
}

async function save() {
  // 保存开始：先清两类报错（校验失败/IO 失败互斥，至多显示一行）
  validateError.value = '';
  ioError.value = '';
  const err = validate();
  if (err) { validateError.value = err; return; }
  saving.value = true;
  try {
    await invoke('save_proxy', proxyHost.value, proxyPort.value);
    emit('saved');
  } catch (e) {
    ioError.value = errMsg(e);
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
        <div class="modal-title">{{ t('settings.title') }}</div>
        <button type="button" class="modal-close" :aria-label="t('settings.close')" @click="emit('close')">
          <FontAwesomeIcon :icon="byPrefixAndName.fat['xmark']" />
        </button>
      </div>
      <div class="modal-body">
        <!-- 语言切换（spec §6.3）：即时生效无保存按钮；选项自名（中文 / English）不随语言翻译 -->
        <div class="form-row">
          <!-- 标签刻意恒定为 Language（语言行是不随语言变的锚点，与下拉选项自名 中文/English 一致），使任意母语用户都能定位 -->
          <label class="label">Language</label>
          <Dropdown :value="currentLang" :options="langOptions" @update:value="onLangChange" />
        </div>
        <!-- 代理地址 + 端口同行：host 弹性伸缩，port 固定 5 位数字宽度（2026-09-07 UI 微调） -->
        <div class="proxy-row">
          <div class="form-row host-row">
            <label class="label" for="proxy-host">{{ t('settings.proxy.host') }}</label>
            <input id="proxy-host" v-model="proxyHost" class="input" type="text" placeholder="127.0.0.1" />
          </div>
          <div class="form-row port-row">
            <label class="label" for="proxy-port">{{ t('settings.proxy.port') }}</label>
            <input id="proxy-port" v-model="proxyPort" class="input" type="text" inputmode="numeric" maxlength="5" placeholder="10808" />
          </div>
        </div>
        <!-- 校验报错存 key 由 t() 即时重译；IO 报错（主进程 errMsg）非译边界原样透传。
             位置：代理输入行下方、保存行上方（2026-09-22 人工验收指定，「中文布局冻结」对该位置解除）。 -->
        <p v-if="validateError" class="error-text">{{ t(validateError) }}</p>
        <p v-else-if="ioError" class="error-text">{{ ioError }}</p>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-save" :disabled="saving" :aria-label="t('settings.save')" @click="save">
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
.form-row + .proxy-row { margin-top: 12px; } /* 语言行（.form-row）→ proxy-row 间距：+.form-row 不跨类名匹配，单独补一条 */
.proxy-row .form-row + .form-row { margin-top: 0; } /* 同行布局：取消兄弟列的纵向间距（原 12px 会把端口列顶低错位） */
/* 代理地址 + 端口同行：弹性/定宽放在列（.form-row）上；输入框保持 .input 固有高度 var(--h-control)，两列等高。
   注意不能在 input 上用 flex:1——.form-row 是 column flex，flex-basis:0% 会沿列方向把 host 框的高度拉高，造成两框不等高。 */
.proxy-row { display: flex; gap: 12px; align-items: flex-start; }
/* 报错行下移到代理输入行下方后，与上方输入框的间距：全局 .error-text margin-top 4px 偏紧，
   本组件 scoped 内补 8px（勿改 style.css 全局，避免影响其他弹窗）。 */
.modal-body .error-text { margin-top: 8px; }
.proxy-row .form-row { min-width: 0; }
.host-row { flex: 1; }
.port-row { flex: none; width: 92px; } /* 5 位数字 + padding */
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
