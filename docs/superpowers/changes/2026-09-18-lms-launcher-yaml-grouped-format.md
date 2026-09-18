# 变更:lms_launcher.yaml 配置格式分组重排——proxy / update 两节嵌套

日期:2026-09-18
状态:已实施(npm test 470 全绿;npm run build 通过)

## 背景与用户诉求

lms_launcher.yaml 顶层键扁平增长(llama_dir / proxy_host / proxy_port / vram_total_gb /
llama_update),用户要求重排为分组格式:

    llama_dir: D:\AI\llama-cpp
    vram_total_gb: 24
    proxy:
      host: 127.0.0.1
      port: 10808
    update:
      last_llama_type: Windows x64 (CUDA 13)

已确认的决策(grill):
1. vram_total_gb 保持顶层扁平(无相关项可归组)。
2. TS 内部 AppConfig 与 yaml 同形同步嵌套(不做 yaml 边界的 flat↔nested 适配),
   消费点全部跟着改。
3. 不做存量配置兼容/升级——用户明确无需考虑;旧格式 yaml 读后按缺省回落
   (appConfigLoad 本就宽松加载),首次写回即固化新格式。
4. llama_update.last_version_type 随重排改名 update.last_llama_type(用户指定),
   IPC 载荷 set/get_llama_update_config 的参数名同步改名。

## 方案

### src-main/config.ts(格式核心)
- 接口改形:
    export interface ProxyConfig { host?: string; port?: number; }
    export interface LlamaUpdateConfig { last_llama_type?: string; }
    export interface AppConfig {
      llama_dir: string;
      vram_total_gb?: number;
      proxy?: ProxyConfig;
      update?: LlamaUpdateConfig;
    }
- EMPTY_APP_CONFIG 移除旧默认 update 值(恒为 { llama_dir: '' })——首次保存不再
  写入用户从未选择的默认版本类型。
- appConfigLoad:直接取 parsed.proxy / parsed.update(嵌套同形,无转换)。
- saveProxy:清除 = cfg.proxy = undefined(整节消失);写入 = cfg.proxy = { host, port }。
- saveLlamaDir / save_vram_total:load→改→save 逻辑不变,注释措辞随新键更新。
- 新增 yaml 字面格式用例:dump 后文本含 "proxy:\n  host:" 与
  "update:\n  last_llama_type:"(防 stringify 层级回归)。

### src-main/update-http.ts
- buildProxyUri / makeUpdateFetch 签名改 Pick<AppConfig, 'proxy'>,
  读 cfg.proxy?.host / cfg.proxy?.port(校验规则不变:trim host、整数 1–65535)。

### src-main/main.ts
- save_proxy 日志 / check_llama_update / get_llama_release_options /
  download_llama_update 的代理拼接改读 cfg.proxy;日志文案不变。
- set_llama_update_config 参数改名 last_llama_type,写 cfg.update;
  get_llama_update_config 返回 cfg.update ?? {}。
- 增量保存注释(2026-09-14 修复记录)措辞随新键更新。

### 渲染端
- src/llama-update-client.ts:LlamaUpdateConfig 接口改名 last_llama_type;
  yaml 注释路径 llama_update.last_version_type → update.last_llama_type。
- src/modules/SettingsModal.vue:回填读 cfg?.proxy?.host / cfg?.proxy?.port。
- src/modules/UpdateModal.vue:last_version_type → last_llama_type
  (restoreLlamaLastVersionType 读取点 + 两处 setLlamaUpdateConfig 回写 + 注释)。
- src/App.test.ts / src/modules/UpdateModal.test.ts / SettingsModal.test.ts:
  mock 载荷与断言同步新形状(含 update.last_llama_type 改名)。

### 测试同步(主进程)
- config.test.ts:proxy 节用例嵌套化;新增 yaml 字面格式用例。
- update-http.test.ts:cfg 对象嵌套化。

## 测试
- npm test 全量(含新增 yaml 字面格式用例)。
- npm run build 通过。

## 验收
- [x] npm test 全绿(470,30 文件;新增 yaml 字面格式 2 例)
- [x] npm run build 通过
- [ ] 真机目检:save_proxy 后 yaml 呈现 proxy: 嵌套节;清空代理后整节消失

## 不做的事
- 不做旧格式 yaml 的读取兼容(用户明确豁免;appConfigLoad 宽松回落已足够)。
- 不改 IPC 通道名(set/get_llama_update_config、save_proxy 等保持不变),
  仅载荷字段形状变化。
- 不改 llama_params.yaml / llama_launch_configs.yaml(仅 lms_launcher.yaml)。
- README 仅描述 yaml 存在性、不含字段清单,无需改动。
