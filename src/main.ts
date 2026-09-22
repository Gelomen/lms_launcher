import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { invoke } from './ipc'
import { applyLangLocal, type Lang } from './i18n'

// i18n（spec §3.3）：先向主进程取权威语言再挂载，避免默认中文闪烁。
async function boot(): Promise<void> {
  try {
    const lang = await invoke<Lang>('get_language')
    applyLangLocal(lang)
  } catch {
    // 主进程不可达（如纯 vite 预览）：保持默认 zh
  }
  createApp(App).mount('#app')
}

void boot()
