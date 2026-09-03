# lms_launcher 更新代理设置 实施计划

> **致 AI 代理：** 必需子技能：使用 executing-plans（或 subagent-driven-development）逐任务实现本计划。每一步都要按 TDD 节奏执行（先写会失败的测试 → 运行确认失败 → 最小实现 → 运行确认通过 → 提交）。完成前先自检：规格覆盖完整、无占位符残留、类型一致。

## 目标

托盘右键菜单「检查更新」下方新增「设置」入口 → 打开与 TemplateModal 视觉统一的 SettingsModal（代理地址 + 端口两个输入框）→ 保存到 lms_launcher.yaml（proxy_host/proxy_port）→ check_update / download_update 在配置了代理时经 undici ProxyAgent 发起请求，未配置时行为零变化。

## 架构

- **主进程**：config.ts 扩展 AppConfig 与 saveProxy 纯函数；新增 update-http.ts（buildProxyUri + makeUpdateFetch）；main.ts 新增 save_proxy IPC、托盘「设置」项、更新流程换 fetch。
- **preload/ipc**：新增 onTraySettingsRequest 事件订阅，与 onTrayUpdateRequest 同构。
- **渲染进程**：新增 SettingsModal.vue 组件；App.vue 挂载 + 订阅 tray-settings-request。
- 依赖：pnpm add undici（Node 内置全局 fetch 无法传代理，undici 自带 ProxyAgent 与 fetch）。

## 技术栈

Electron 28.3.0 主进程（TS）+ Vue 3 渲染进程 + vitest + undici。

## 任务清单

## 任务 1：安装 undici 依赖

- [ ] 步骤 1：执行安装命令
  - 命令：pnpm add undici
  - 预期：package.json dependencies 出现 undici；pnpm-lock.yaml 更新
- [ ] 步骤 2：验证
  - 命令：node -e "console.log(require('undici').ProxyAgent ? 'ok' : 'no')"
  - 预期：输出 ok
- [ ] 步骤 3：提交
  - 命令：git add package.json pnpm-lock.yaml && git commit -m "chore(deps): add undici for update proxy support"

## 任务 2：AppConfig 扩展代理字段

- [ ] 步骤 1：写会失败的测试（修改 D:\AI\Workspace\lms_launcher\src-main\config.test.ts，文件末尾新增 describe 块）
  - 追加内容（沿用该文件现有 writeYaml / p 夹具约定，先读文件确认 helper 名与清理逻辑后复用）：
    import { appConfigLoad, appConfigSave } from './config';
    describe('proxy 字段兼容', () => {
      it('老 yaml 无 proxy 字段 → 两字段 undefined', () => {
        writeYaml('llama_dir: /x');
        const cfg = appConfigLoad(p);
        expect(cfg.proxy_host).toBeUndefined();
        expect(cfg.proxy_port).toBeUndefined();
        expect(cfg.llama_dir).toBe('/x');
      });
      it('save 后 proxy 字段持久化', () => {
        const cfg = { llama_dir: '/x', proxy_host: '127.0.0.1', proxy_port: 10808 };
        appConfigSave(p, cfg);
        const loaded = appConfigLoad(p);
        expect(loaded.proxy_host).toBe('127.0.0.1');
        expect(loaded.proxy_port).toBe(10808);
      });
    });
- [ ] 步骤 2：运行测试确认失败
  - 命令：npx vitest run src-main/config.test.ts
  - 预期：新 describe 失败（proxy_host 不存在于返回对象）
- [ ] 步骤 3：最小实现（修改 D:\AI\Workspace\lms_launcher\src-main\config.ts）
  - AppConfig 接口（L4 附近）改为：
    export interface AppConfig {
      llama_dir: string;
      vram_total_gb?: number;
      proxy_host?: string;
      proxy_port?: number;
    }
  - appConfigLoad（L41-50）返回对象补两行：
    proxy_host: parsed?.proxy_host,
    proxy_port: parsed?.proxy_port,
  - appConfigSave 无需改动（整个对象序列化）
- [ ] 步骤 4：运行测试确认通过
  - 命令：npx vitest run src-main/config.test.ts
  - 预期：全部通过
- [ ] 步骤 5：提交
  - 命令：git add -A && git commit -m "feat(config): add proxy_host/proxy_port to AppConfig"

## 任务 3：update-http.ts 代理 HTTP 层

- [ ] 步骤 1：写会失败的测试（新建 D:\AI\Workspace\lms_launcher\src-main\update-http.test.ts）
  - 完整内容：
    import { describe, it, expect, vi } from 'vitest';
    const calls: any[] = [];
    vi.mock('undici', () => ({
      ProxyAgent: vi.fn().mockImplementation((o: any) => ({ uri: o.uri, __tag: 'agent' })),
      fetch: vi.fn().mockImplementation(async (url: any, init: any) => {
        calls.push({ url, init });
        return new Response('ok');
      }),
    }));
    import { buildProxyUri, makeUpdateFetch } from './update-http';
    import * as undici from 'undici';
    const mockFetch = undici.fetch as any;
    const MockProxyAgent = undici.ProxyAgent as any;

    describe('buildProxyUri', () => {
      it('host+port 有效 → http://host:port', () => {
        expect(buildProxyUri({ llama_dir: '', proxy_host: '127.0.0.1', proxy_port: 10808 }))
          .toBe('http://127.0.0.1:10808');
      });
      it('缺 host → null', () => {
        expect(buildProxyUri({ llama_dir: '', proxy_port: 10808 })).toBeNull();
      });
      it('缺 port → null', () => {
        expect(buildProxyUri({ llama_dir: '', proxy_host: '127.0.0.1' })).toBeNull();
      });
      it('port 超范围 → null', () => {
        expect(buildProxyUri({ llama_dir: '', proxy_host: 'h', proxy_port: 99999 })).toBeNull();
        expect(buildProxyUri({ llama_dir: '', proxy_host: 'h', proxy_port: 0 })).toBeNull();
      });
      it('host 前后空白 → trim 后使用', () => {
        expect(buildProxyUri({ llama_dir: '', proxy_host: ' h ', proxy_port: 1 })).toBe('http://h:1');
      });
    });

    describe('makeUpdateFetch', () => {
      it('无代理 → 返回全局 fetch 本体（零行为变化）', () => {
        const f = makeUpdateFetch({ llama_dir: '' });
        expect(f).toBe(fetch);
      });
      it('有代理 → 走 undici.fetch + ProxyAgent，保留原 init', async () => {
        calls.length = 0;
        const f = makeUpdateFetch({ llama_dir: '', proxy_host: '127.0.0.1', proxy_port: 10808 });
        const resp = await f('https://example.com', { headers: { a: 'b' }, redirect: 'follow' });
        expect(resp.status).toBe(200);
        expect(MockProxyAgent).toHaveBeenCalledWith({ uri: 'http://127.0.0.1:10808' });
        const c = calls[calls.length - 1];
        expect(c.url).toBe('https://example.com');
        expect(c.init.headers).toEqual({ a: 'b' });
        expect(c.init.redirect).toBe('follow');
        expect(c.init.dispatcher).toMatchObject({ __tag: 'agent' });
      });
    });
- [ ] 步骤 2：运行测试确认失败
  - 命令：npx vitest run src-main/update-http.test.ts
  - 预期：失败（./update-http 不存在）
- [ ] 步骤 3：最小实现（新建 D:\AI\Workspace\lms_launcher\src-main\update-http.ts）
  - 完整内容：
    import { ProxyAgent, fetch as undiciFetch } from 'undici';
    import type { AppConfig } from './config';

    /** 有效代理 → http://host:port；否则 null（未配置代理时行为与现状一致） */
    export function buildProxyUri(cfg: Pick<AppConfig, 'proxy_host' | 'proxy_port'>): string | null {
      const host = cfg.proxy_host?.trim();
      const port = cfg.proxy_port;
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
      return `http://${host}:${port}`;
    }

    /** 返回更新流程使用的 fetch：无代理 = 全局 fetch（零变化）；有代理 = undici ProxyAgent 隧道 */
    export function makeUpdateFetch(cfg: Pick<AppConfig, 'proxy_host' | 'proxy_port'>): typeof fetch {
      const uri = buildProxyUri(cfg);
      if (!uri) return fetch;
      const agent = new ProxyAgent({ uri });
      return (url: RequestInfo | URL, init?: RequestInit) =>
        undiciFetch(url as string, { ...init, dispatcher: agent } as any);
    }
- [ ] 步骤 4：运行测试确认通过
  - 命令：npx vitest run src-main/update-http.test.ts
  - 预期：全部通过
- [ ] 步骤 5：提交
  - 命令：git add -A && git commit -m "feat(update-http): buildProxyUri + makeUpdateFetch"

## 任务 4：saveProxy 校验纯函数

- [ ] 步骤 1：写会失败的测试（追加到 D:\AI\Workspace\lms_launcher\src-main\config.test.ts）
  - 追加内容：
    import { saveProxy } from './config';
    describe('saveProxy', () => {
      it('host+port 合法 → trim 后写回', () => {
        const cfg = saveProxy(p, '127.0.0.1 ', ' 10808 ');
        expect(cfg.proxy_host).toBe('127.0.0.1');
        expect(cfg.proxy_port).toBe(10808);
      });
      it('两参均空 → 清除代理字段', () => {
        appConfigSave(p, { llama_dir: '/x', proxy_host: 'h', proxy_port: 1 });
        const cfg = saveProxy(p, '  ', '');
        expect(cfg.proxy_host).toBeUndefined();
        expect(cfg.proxy_port).toBeUndefined();
      });
      it('host 非空 port 空 → throw 端口不能为空', () => {
        expect(() => saveProxy(p, '127.0.0.1', '')).toThrow('端口不能为空');
      });
      it('port 非法（0 / 99999 / abc）→ throw', () => {
        expect(() => saveProxy(p, 'h', '0')).toThrow('端口须为 1–65535');
        expect(() => saveProxy(p, 'h', '99999')).toThrow('端口须为 1–65535');
        expect(() => saveProxy(p, 'h', 'abc')).toThrow('端口须为 1–65535');
      });
    });
- [ ] 步骤 2：运行测试确认失败
  - 命令：npx vitest run src-main/config.test.ts
  - 预期：saveProxy describe 失败（函数不存在）
- [ ] 步骤 3：最小实现（修改 D:\AI\Workspace\lms_launcher\src-main\config.ts，追加导出；校验逻辑独立于 main.ts，保证可测）
  - 追加代码：
    /** 保存代理设置（端口走字符串，由主进程校验防注入）；两参均空 = 清除代理 */
    export function saveProxy(p: string, host: string, port: string): AppConfig {
      const cfg = appConfigLoad(p);
      const h = (host ?? '').trim();
      const ps = (port ?? '').trim();
      if (!h && !ps) {
        cfg.proxy_host = undefined;
        cfg.proxy_port = undefined;
        appConfigSave(p, cfg);
        return cfg;
      }
      if (!h || !ps) throw new Error('端口不能为空（或留空禁用代理）');
      const n = Number(ps);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('端口须为 1–65535 的数字');
      cfg.proxy_host = h;
      cfg.proxy_port = n;
      appConfigSave(p, cfg);
      return cfg;
    }
- [ ] 步骤 4：运行测试确认通过
  - 命令：npx vitest run src-main/config.test.ts
  - 预期：全部通过
- [ ] 步骤 5：提交
  - 命令：git add -A && git commit -m "feat(config): saveProxy with validation"

## 任务 5：main.ts 托盘「设置」项 + save_proxy IPC + 更新流程接入

- [ ] 步骤 1：托盘菜单（createTray，检查更新项 L86-93 之后、退出项 L94-102 之前插入）
  - 追加代码：
    const settingsItem = new MenuItem({
      label: '设置',
      click: () => {
        win.show();
        win.focus();
        win.webContents.send('tray-settings-request', {});
      },
    });
  - 将其加入 menu template 数组中「检查更新」项之后、「退出」项之前（与检查更新同款的 win 捕获方式）
- [ ] 步骤 2：save_proxy IPC（get_app_config handler L149 附近追加；p 的取法与 L149 同款局部变量）
  - 追加 import（与现有 import 合并）：saveProxy from './config'；makeUpdateFetch, buildProxyUri from './update-http'
  - 追加代码：
    ipcMain.handle('save_proxy', async (_e, host: string, port: string) => {
      const cfg = saveProxy(p, host, port);
      const on = cfg.proxy_host && cfg.proxy_port
        ? `已保存代理 http://${cfg.proxy_host}:${cfg.proxy_port}`
        : '已清空代理';
      emitLog(`[lms_launcher] 设置 · ${on}`, 'sys');
      return 'ok';
    });
- [ ] 步骤 3：check_update（L359-390）
  - fetch 前插入：
    const cfg = appConfigLoad(p);
    const fetchFn = makeUpdateFetch(cfg);
    const proxyNote = buildProxyUri(cfg) ? `（代理 ${buildProxyUri(cfg)}）` : '';
  - L364 的 fetch(RELEASE_API_URL, ...) 改为 fetchFn(RELEASE_API_URL, { signal, headers: { 'User-Agent': 'lms_launcher' } })
  - L369/374/385 三处「检查更新失败」日志字符串末尾拼接 proxyNote
- [ ] 步骤 4：download_update（L393-434）
  - L402 前插入同款三行（cfg / fetchFn / proxyNote）
  - L402 改为 fetchFn(pendingUpdate.zipUrl, { signal, redirect: 'follow' })
  - L429 失败日志拼接 proxyNote
  - 流式读 / 进度事件 / 超时 / 半成品清理逻辑一律不动
- [ ] 步骤 5：验证
  - 命令：npm run build && npx vitest run
  - 预期：build 成功；测试全绿
- [ ] 步骤 6：提交
  - 命令：git add -A && git commit -m "feat(main): tray settings item + proxied update fetch"

## 任务 6：preload + ipc 事件通道

- [ ] 步骤 1：修改 D:\AI\Workspace\lms_launcher\src-main\preload.ts（onTrayUpdateRequest L31-35 模式追加）
  - 追加代码：
    onTraySettingsRequest: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('tray-settings-request', listener);
      return () => ipcRenderer.removeListener('tray-settings-request', listener);
    },
- [ ] 步骤 2：修改 D:\AI\Workspace\lms_launcher\src\ipc.ts（L2-14 window.lms declare 块追加）
  - 追加声明：
    onTraySettingsRequest: (cb: () => void) => () => void;
- [ ] 步骤 3：验证
  - 命令：npx tsc -p tsconfig.main.json --noEmit && npm run build
  - 预期：类型检查与构建通过
- [ ] 步骤 4：提交
  - 命令：git add -A && git commit -m "feat(ipc): onTraySettingsRequest channel"

## 任务 7：SettingsModal.vue 组件

- [ ] 步骤 1：新建 D:\AI\Workspace\lms_launcher\src\modules\SettingsModal.vue
  - 完整内容（视觉与 TemplateModal 统一：全局 .modal-overlay 遮罩 + 32px 标题栏 + 右上角 × + 右下角紫色保存钮；卡片 320px 宽）：
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

    function validate(): string | null {
      const h = proxyHost.value.trim();
      const p = proxyPort.value.trim();
      if ((h && !p) || (!h && p)) return '端口不能为空（或留空禁用代理）';
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
- [ ] 步骤 2：验证组件可编译
  - 命令：npx vite build
  - 预期：构建通过
- [ ] 步骤 3：提交
  - 命令：git add -A && git commit -m "feat(settings): SettingsModal component"

## 任务 8：App.vue 接入 + 端到端测试

- [ ] 步骤 1：写会失败的测试（修改 D:\AI\Workspace\lms_launcher\src\App.test.ts）
  - 在现有 vi.mock('./ipc', ...) 工厂中追加 traySettingsHandlers 捕获数组（与 L21 trayUpdateHandlers 同款）及 mock 实现：onTraySettingsRequest: (cb) => { traySettingsHandlers.push(cb); return () => {} }
  - invoke mockImplementation 中补充：'get_app_config' 返回 { llama_dir: '/x', proxy_host: '127.0.0.1', proxy_port: 10808 }；'save_proxy' 返回 'ok'
  - 追加新测试（与现有 tray-update 测试同构）：
    it('tray-settings-request → 打开设置弹窗', async () => {
      mountApp();
      await flushPromises();
      expect(traySettingsHandlers.length).toBeGreaterThan(0);
      traySettingsHandlers[0]();
      await flushPromises();
      const title = document.querySelector('.modal-overlay .modal-title');
      expect(title?.textContent).toBe('设置');
    });
- [ ] 步骤 2：运行测试确认失败
  - 命令：npx vitest run src/App.test.ts
  - 预期：新测试失败（App 未订阅 / 未挂载 SettingsModal）
- [ ] 步骤 3：最小实现（修改 D:\AI\Workspace\lms_launcher\src\App.vue）
  - 新增 import SettingsModal from './modules/SettingsModal.vue';
  - 新增 const settingsOpen = ref(false);（L38-42 风格）
  - onMounted 的 unsubs 数组中追加：
    unsubs.push(onTraySettingsRequest(() => { settingsOpen.value = true; }));
  - 模板中 UpdateModal 挂载处（L323-324 旁）追加：
    <SettingsModal :open="settingsOpen" @close="settingsOpen = false" @saved="settingsOpen = false" />
- [ ] 步骤 4：运行测试确认通过
  - 命令：npx vitest run src/App.test.ts
  - 预期：全部通过
- [ ] 步骤 5：全量验证
  - 命令：npx vitest run && npm run build
  - 预期：测试全绿（≥ 基线 246 + 新增）；build 通过
- [ ] 步骤 6：提交
  - 命令：git add -A && git commit -m "feat(app): wire tray settings → SettingsModal"

## 任务 9：README 更新

- [ ] 步骤 1：修改 D:\AI\Workspace\lms_launcher\README.md「自动更新」章节（L90-95），在「Electron 大版本升级…」行之后追加：
  - 国内网络下 GitHub 下载缓慢/失败时：托盘右键「设置」（「检查更新」下方）填入 HTTP 代理地址与端口（如 v2rayN 的 127.0.0.1 / 10808）→ 保存；检查/下载更新即改走代理。两框任一留空 = 不使用代理（回退直连）。
- [ ] 步骤 2：提交
  - 命令：git add -A && git commit -m "docs(readme): proxy settings for updates"

## 自检清单（执行者完成后逐项核对）

- [ ] 规格 A-F 六节均有对应任务覆盖
- [ ] 全文搜索无 TODO / 待补 / 占位符
- [ ] npx vitest run 全绿
- [ ] npm run build 通过（vite + 两个 tsc）
- [ ] 老 yaml（无 proxy 字段）打开应用不报错
- [ ] 未配置代理时 check_update/download_update 行为与改动前一致（makeUpdateFetch 返回全局 fetch）

## 交接

计划已保存到 D:\AI\Workspace\lms_launcher\docs\superpowers\plans\2026-09-05-update-proxy-settings.md。两种执行方式：

1. **子代理驱动（推荐）** — 每个任务派发一个聚焦子代理执行，我在每个任务完成后审查，快速迭代。适合本计划的独立任务结构。
2. **内联执行** — 在当前会话中直接按执行计划技能逐批推进，设检查点供你审查。

你选哪种？（回复 1 或 2）
