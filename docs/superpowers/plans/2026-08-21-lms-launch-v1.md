# lms_launch v1 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 run.bat 改造成 Tauri 2 + Vue 3 的单 exe 图形化工具 lms_launch（v1 = llama-server 模块）。

**架构：** Rust 后端三层——config（三个 yaml 的 serde_yaml 读写与校验）、build（参数 → 命令行向量纯函数）、process（spawn / stop / 状态轮询 + stdout/stderr 管道流）；Vue 3 前端四区块（安装目录、模板管理、启动栏、日志面板）+ 浅色设计语言纯 CSS；单进程单服务，窗口关闭驻留托盘。

**技术栈：** Tauri 2.x（tray-icon、plugin-dialog）、Rust（serde / serde_yaml）、Vue 3 + Vite 6 + TypeScript、npm。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src-tauri/src/config.rs` | 三个数据文件的路径、加载/保存、校验规则、默认参数模板（Rust 单测） |
| `src-tauri/src/build.rs` | 参数值 → 命令行向量（引号处理、空值跳过、必填/未知 key 校验）、启动摘要（Rust 单测） |
| `src-tauri/src/process.rs` | ProcessState：launch / take_pipes / stop_graceful / drain_exit（Rust 单测） |
| `src-tauri/src/lib.rs` | 模块声明、AppState、`run()`（tauri Builder + setup：加载配置、托盘、窗口关闭转托盘）、所有 `#[tauri::command]` |
| `src/App.vue` | 布局壳：四区块装配、进程状态轮询、日志行累积、事件监听 |
| `src/style.css` | 设计语言（规格 §4.5）：颜色/圆角/按钮/输入框/日志区 |
| `src/components/DirModule.vue` | 模块 1：llama.cpp 目录 + 校验显示 |
| `src/components/TemplateModule.vue` | 模块 2 主区：配置列表 + 新建/编辑/删除入口 |
| `src/components/TemplateModal.vue` | 模板弹窗：flag 表单、前端校验（红框）、保存/取消 |
| `src/components/LaunchBar.vue` | 模块 3：启动/停止按钮 + 配置下拉 |
| `src/components/LogPanel.vue` | 模块 4：只读日志、关键字着色、自动滚动暂停 |
| `index.html` / `vite.config.js` / `package.json` | 前端工程 |

**数据文件**（运行期位于 exe 同目录，`exe_dir()` 定义；代码里路径一律 `exe_dir().join(name)`）：

| 文件 | 用途 |
|---|---|
| `lms_launch.yaml` | 应用设置（llama_dir） |
| `llama_params.yaml` | 参数模板（key → flag + required），首次运行自动写入默认（run.bat 全量 COMMON） |
| `llama_launch_configs.yaml` | 用户配置集（顶层 key = 配置 id） |

**Rust 错误约定：** 所有自定义错误 = `"分类: 描述"`，分类 ∈ {IO, YAML, MISSING, VALIDATION, STATE, PROC}。前端按 `startsWith("MISSING:")` / `"VALIDATION:"` 判定特定状态（区分展示）。Rust 侧永远再做一遍校验（前端校验只为即时红框体验）。

**验证方式约定：** Rust 层全部 TDD（cargo test，先写失败测试再实现）；前端层每个任务以 `npx tauri dev` 手动验证清单收尾（前端无单测基建——YAGNI；后端核心逻辑已有单测覆盖）。

---

### 任务 1：工程骨架（Tauri + Vue + 工具链）

**文件：**
- 修改/创建：`package.json`、`vite.config.js`、`index.html`、`src/main.ts`、`src/App.vue`、`src/style.css`（占位，任务 6 重写）
- 创建：`src-tauri/Cargo.toml`、`src-tauri/build.rs`、`src-tauri/src/{main.rs,lib.rs,config.rs,build.rs,process.rs}`（后三个本任务为占位）、`src-tauri/tauri.conf.json`、项目根 `.gitignore` 追加

- [ ] **步骤 1：安装 Rust 工具链**

运行：

```powershell
winget install Rustlang.Rustup
# 重开终端让 PATH 生效，然后：
cargo --version
```

预期：`cargo 1.8x` 正常输出。winget 失败则改用 https://rustup.rs 官方安装脚本。

- [ ] **步骤 2：建前端工程（Vite 6 + Vue 3，手动创建不用交互式脚手架）**

项目根 `package.json`：

```json
{
  "name": "lms-launch",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": {
    "@tauri-apps/api": "^2.5.0",
    "@tauri-apps/plugin-dialog": "^2.0.1",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.5.0",
    "@vitejs/plugin-vue": "^5.2.3",
    "typescript": "^5.8.3",
    "vite": "^6.3.5"
  }
}
```

`vite.config.js`：

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: { port: 1420 },
  clearScreen: false,
})
```

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>lms_launch</title></head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`：

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

`src/App.vue`（占位壳，任务 6 重写布局，任务 9 接线）：

```vue
<script setup lang="ts"></script>
<template>
  <main class="layout"><h1>lms_launch 骨架</h1></main>
</template>
```

`src/style.css`（占位，任务 6 写入设计语言）：

```css
body { font-family: "Segoe UI", system-ui, sans-serif; }
.layout { padding: 16px; }
```

运行：

```powershell
npm install
```

预期：无 ERESOLVE，node_modules 生成。

- [ ] **步骤 3：建 Tauri 后端骨架**

`src-tauri/Cargo.toml`：

```toml
[package]
name = "lms_launch"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_yaml = "0.9"

[profile.release]
strip = true
```

`src-tauri/build.rs`：

```rust
fn main() { tauri_build::build() }
```

`src-tauri/src/lib.rs`：

```rust
pub mod config;
pub mod process;

pub fn exe_dir() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("src-tauri"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::DialogPlugin::init())
        .run()
}
```

（config/process 本任务先给可编译的占位；build 模块任务 3 加入。）

`src-tauri/src/config.rs` 占位：

```rust
// 任务 2 实现
```

`src-tauri/src/process.rs` 占位：

```rust
// 任务 4 实现
```

`src-tauri/src/main.rs`：

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lms_launch::run()
}
```

`src-tauri/tauri.conf.json`：

```json
{
  "productName": "lms_launch",
  "version": "0.1.0",
  "identifier": "com.lms.launch",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "windows": [
      {
        "title": "lms_launch",
        "width": 980,
        "height": 720,
        "minWidth": 760,
        "minHeight": 540
      }
    ]
  }
}
```

项目根 `.gitignore` 追加：

```gitignore
dist/
node_modules/
src-tauri/target/
```

- [ ] **步骤 4：验证骨架可跑**

运行（worktree 根目录，两个终端）：

```powershell
npm run dev
```
```powershell
npx tauri dev
```

预期：WebView 窗口弹出显示「lms_launch 骨架」；前端 console 无报错；Rust 编译通过。若报 MSVC 链接错误（C++ 工作负载缺失），安装 VS Build Tools 后重试。

- [ ] **步骤 5：Commit**

```bash
git add package.json vite.config.js index.html src src-tauri .gitignore
git commit -m "feat: Tauri 2 + Vue 3 工程骨架"
```

### 任务 2：配置层 config.rs（TDD）

**文件：**
- 重写：`src-tauri/src/config.rs`
- 修改：`src-tauri/src/lib.rs`（`pub mod build;` 不动；无需新声明——config 已声明）

- [ ] **步骤 1：编写失败的单元测试**

把以下内容作为 `#[cfg(test)] mod tests` 写入 config.rs 底部（实现函数此时尚不存在，编译必失败）：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("lms_launch_test");
        std::fs::create_dir_all(&dir).ok();
        dir.join(name)
    }

    #[test]
    fn app_config_defaults_when_missing() {
        let p = tmp("app1.yaml");
        if p.exists() { std::fs::remove_file(&p).ok(); }
        let c = app_config_load(&p);
        assert_eq!(c.llama_dir, "");
        app_config_save(&p, &AppConfig { llama_dir: "C:\llama-cpp".into() }).unwrap();
        let c2 = app_config_load(&p);
        assert_eq!(c2.llama_dir, "C:\llama-cpp");
    }

    #[test]
    fn params_default_written_only_when_missing() {
        let p = tmp("params1.yaml");
        if p.exists() { std::fs::remove_file(&p).ok(); }
        let pf = params_load(&p).unwrap();
        assert_eq!(pf.params.get("m").unwrap(), "-m");
        assert_eq!(pf.required, vec!["m".to_string()]);
        // 已存在时 reload 不得被默认覆盖
        std::fs::write(&p, "params:\n  zz: \"--zz\"\nrequired: []\n").unwrap();
        let pf2 = params_load(&p).unwrap();
        assert_eq!(pf2.params.get("zz").unwrap(), "--zz");
        assert_eq!(pf2.required.len(), 0);
    }

    #[test]
    fn configs_missing_reports_missing() {
        let p = tmp("cfg_missing.yaml");
        if p.exists() { std::fs::remove_file(&p).ok(); }
        let e = configs_load(&p).unwrap_err();
        assert!(e.starts_with("MISSING:"));
    }

    #[test]
    fn save_and_delete_config_entry() {
        let p = tmp("cfg2.yaml");
        if p.exists() { std::fs::remove_file(&p).ok(); }
        let mut vals = BTreeMap::new();
        vals.insert("m".into(), String::from("x.gguf"));
        vals.insert("port".into(), " 9931 ".into());
        save_config_entry(&p, "c1", Some("日常".into()), &vals).unwrap();
        let m = configs_load(&p).unwrap();
        assert_eq!(m.get("c1").unwrap().values.get("m").unwrap(), "x.gguf");
        assert_eq!(m.get("c1").unwrap().values.get("port").unwrap(), "9931"); // 首尾空格被去除
        delete_config_entry(&p, "c1").unwrap();
        let m2 = configs_load(&p).unwrap();
        assert!(m2.is_empty());
        let e = delete_config_entry(&p, "c1").unwrap_err();
        assert!(e.starts_with("VALIDATION:"));
    }

    #[test]
    fn save_config_entry_rejects_invalid_id() {
        let p = tmp("cfg3.yaml");
        let mut vals = BTreeMap::new();
        vals.insert("m".into(), "x.gguf".into());
        let e = save_config_entry(&p, "Bad Id", None, &vals).unwrap_err();
        assert!(e.starts_with("VALIDATION:"));
    }

    #[test]
    fn bad_yaml_reports_yaml() {
        let p = tmp("bad.yaml");
        std::fs::write(&p, "a: [unclosed\n").unwrap();
        let e = configs_load(&p).unwrap_err();
        assert!(e.starts_with("YAML:"));
    }

    #[test]
    fn param_key_must_be_identifier() {
        assert_eq!(validate_param_key("m"), Ok(()));
        let msg = "VALIDATION: 参数 key 只能是小写字母开头、仅小写字母和数字";
        assert_eq!(validate_param_key("-m"), Err(msg.to_string()));
        assert_eq!(validate_param_key("a b"), Err(msg.to_string()));
        assert_eq!(validate_param_key("A"), Err(msg.to_string()));
    }

    #[test]
    fn config_id_rules() {
        assert_eq!(validate_config_id("abc"), Ok(()));
        assert_eq!(validate_config_id("a1b2"), Ok(()));
        let msg = "VALIDATION: id 须为小写字母开头的字母数字串（不含空格/大写），最长 32 位";
        assert_eq!(validate_config_id(""), Err(msg.to_string()));
        assert_eq!(validate_config_id("Ab"), Err(msg.to_string()));
        assert_eq!(validate_config_id("a b"), Err(msg.to_string()));
        assert_eq!(validate_config_id("1abc"), Err(msg.to_string()));
    }

    #[test]
    fn default_params_covers_run_bat_common() {
        let pf = default_params();
        for k in ["m","mmproj","spec_type","ngl","fa","load_mode","np","c","b","ub","t","tb","ctk","ctv","jinja","chat_template_file","reasoning_format","reasoning_effort","spec_draft_n_max","temp","top_p","top_k","min_p","presence_penalty","repeat_penalty","port"] {
            assert!(pf.params.contains_key(k), "default_params 缺 {k}");
        }
        assert_eq!(pf.required, vec!["m".to_string()]);
    }
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd src-tauri && cargo test`
预期：FAIL —— `app_config_load` / `params_load` / `save_config_entry` 等未定义（编译错误）。

- [ ] **步骤 3：实现 config.rs（整体替换占位）**

```rust
//! 数据文件读写与校验：lms_launch.yaml / llama_params.yaml / llama_launch_configs.yaml

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

// ---------- 数据模型 ----------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AppConfig {
    /// llama.cpp 安装目录（含 llama-server.exe）；空 = 未配置
    pub llama_dir: String,
}

/// 参数模板：key → 命令行 flag 映射 + 必填列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParamsFile {
    pub params: BTreeMap<String, String>,
    #[serde(default)]
    pub required: Vec<String>,
}

/// 一个用户配置（llama_launch_configs.yaml 的一个顶层 key）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConfigEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    #[serde(default)]
    pub values: BTreeMap<String, String>,
}

type ConfigsMap = BTreeMap<String, ConfigEntry>;

// ---------- 加载 / 保存 ----------

pub fn app_config_load(path: &PathBuf) -> AppConfig {
    match std::fs::read_to_string(path) {
        Ok(s) if s.trim().is_empty() => AppConfig::default(),
        Ok(s) => serde_yaml::from_str(&s).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn app_config_save(path: &PathBuf, cfg: &AppConfig) -> Result<(), String> {
    let s = serde_yaml::to_string(cfg).map_err(|e| format!("YAML: 序列化失败: {e}"))?;
    std::fs::write(path, s).map_err(|e| format!("IO: 写入 lms_launch.yaml 失败: {e}"))
}

/// 加载参数模板；文件不存在时写入默认模板（run.bat 全量 COMMON + 动态参数）并返回
pub fn params_load(path: &PathBuf) -> Result<ParamsFile, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => {
            let pf: ParamsFile = serde_yaml::from_str(&s)
                .map_err(|e| format!("YAML: 解析 llama_params.yaml 失败: {e}"))?;
            for (k, f) in &pf.params {
                validate_param_key(k).map_err(|e| format!("{e}: key \"{k}\" → flag \"{f}\""))?;
            }
            Ok(pf)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let pf = default_params();
            let s = serde_yaml::to_string(&pf).map_err(|e| format!("YAML: 序列化失败: {e}"))?;
            std::fs::write(path, s).map_err(|e| format!("IO: 写入默认 llama_params.yaml 失败: {e}"))?;
            Ok(pf)
        }
        Err(e) => Err(format!("IO: 读取 llama_params.yaml 失败: {e}")),
    }
}

pub fn configs_load(path: &PathBuf) -> Result<ConfigsMap, String> {
    match std::fs::read_to_string(path) {
        Ok(s) if s.trim().is_empty() => Ok(ConfigsMap::new()),
        Ok(s) => serde_yaml::from_str(&s).map_err(|e| format!("YAML: 解析 llama_launch_configs.yaml 失败: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err("MISSING: llama_launch_configs.yaml 不存在（新建第一个模板后自动生成）".into())
        }
        Err(e) => Err(format!("IO: 读取 llama_launch_configs.yaml 失败: {e}")),
    }
}

/// 保存单个配置（读-改-写；值为纯空白 = 不写入该字段）
pub fn save_config_entry(path: &PathBuf, id: &str, desc: Option<String>, values: &BTreeMap<String, String>) -> Result<(), String> {
    validate_config_id(id)?;
    let mut map = match configs_load(path) {
        Ok(m) => m,
        Err(_) => ConfigsMap::new(), // 首次保存：文件不存在，视为空集合
    };
    let clean: BTreeMap<String, String> = values
        .iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .map(|(k, v)| (k.clone(), v.trim().to_string()))
        .collect();
    map.insert(id.to_string(), ConfigEntry { desc, values: clean });
    configs_save(path, &map)
}

pub fn delete_config_entry(path: &PathBuf, id: &str) -> Result<(), String> {
    let mut map = configs_load(path)?;
    map.remove(id).ok_or_else(|| format!("VALIDATION: 配置 \"{id}\" 不存在"))?;
    configs_save(path, &map)
}

fn configs_save(path: &PathBuf, map: &ConfigsMap) -> Result<(), String> {
    let s = serde_yaml::to_string(map).map_err(|e| format!("YAML: 序列化失败: {e}"))?;
    std::fs::write(path, s).map_err(|e| format!("IO: 写入 llama_launch_configs.yaml 失败: {e}"))
}

// ---------- 校验 ----------

/// id：小写字母开头、仅小写字母和数字、≤32 位
pub fn validate_config_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 32
        && id.starts_with(|c: char| c.is_ascii_lowercase())
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    if ok { Ok(()) } else { Err("VALIDATION: id 须为小写字母开头的字母数字串（不含空格/大写），最长 32 位".into()) }
}

/// 参数 key：小写字母开头、仅小写字母和数字（防 flag 误混入 key 位）
pub fn validate_param_key(key: &str) -> Result<(), String> {
    let ok = !key.is_empty()
        && key.starts_with(|c: char| c.is_ascii_lowercase())
        && key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    if ok { Ok(()) } else { Err("VALIDATION: 参数 key 只能是小写字母开头、仅小写字母和数字".into()) }
}

/// 默认参数模板 = run.bat 的 COMMON + 动态参数全集；BTreeMap 按 key 字母序输出（flag 顺序对 llama-server 无影响）
pub fn default_params() -> ParamsFile {
    let items: Vec<(&str, &str)> = vec![
        ("m", "-m"),
        ("mmproj", "--mmproj"),
        ("spec_type", "--spec-type"),
        ("ngl", "-ngl"),
        ("fa", "-fa"),
        ("load_mode", "--load-mode"),
        ("np", "-np"),
        ("c", "-c"),
        ("b", "-b"),
        ("ub", "-ub"),
        ("t", "-t"),
        ("tb", "-tb"),
        ("ctk", "-ctk"),
        ("ctv", "-ctv"),
        ("jinja", "--jinja"),
        ("chat_template_file", "--chat-template-file"),
        ("reasoning_format", "--reasoning-format"),
        ("reasoning_effort", "--reasoning-effort"),
        ("spec_draft_n_max", "--spec-draft-n-max"),
        ("temp", "--temp"),
        ("top_p", "--top-p"),
        ("top_k", "--top-k"),
        ("min_p", "--min-p"),
        ("presence_penalty", "--presence_penalty"),
        ("repeat_penalty", "--repeat_penalty"),
        ("port", "--port"),
    ];
    let params = items.into_iter().map(|(k, f)| (k.to_string(), f.to_string())).collect();
    ParamsFile { params, required: vec!["m".to_string()] }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd src-tauri && cargo test`
预期：9 个测试全 PASS。

- [ ] **步骤 5：Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat: 配置层——三个 yaml 的读写、校验与默认参数模板"
```

### 任务 3：命令行拼装 build.rs（TDD）

**文件：**
- 创建：`src-tauri/src/build.rs`
- 修改：`src-tauri/src/lib.rs`（加 `pub mod build;`）
- 测试：同文件内联

- [ ] **步骤 1：编写失败的单元测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{ConfigEntry, ParamsFile};

    fn pf() -> ParamsFile {
        let mut params = BTreeMap::new();
        params.insert("m".into(), "-m".into());
        params.insert("mmproj".into(), "--mmproj".into());
        params.insert("port".into(), "--port".into());
        ParamsFile { params, required: vec!["m".into()] }
    }

    fn entry(pairs: &[(&str, &str)]) -> ConfigEntry {
        ConfigEntry { desc: None, values: pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect() }
    }

    #[test]
    fn quotes_path_values_only_when_needed() {
        let e = entry(&[("m", "D:\AI\Models\a gguf.q8.gguf"), ("port", "9931")]);
        let args = build_arg_vector("C:\x\llama-server.exe", &pf(), &e).unwrap();
        assert_eq!(args, vec![
            String::from("C:\x\llama-server.exe"),
            String::from("-m"),
            String::from("\"D:\\AI\\Models\\a gguf.q8.gguf\""),
            String::from("--port"),
            String::from("9931"),
        ]);
    }

    #[test]
    fn empty_values_are_skipped_whole_pair() {
        let e = entry(&[("port", "  "), ("m", "x.gguf")]);
        let args = build_arg_vector("llama-server.exe", &pf(), &e).unwrap();
        assert_eq!(args, vec![String::from("llama-server.exe"), String::from("-m"), String::from("x.gguf")]);
    }

    #[test]
    fn required_empty_rejected_with_flag_name() {
        let e = entry(&[("m", "   ")]);
        let err = build_arg_vector("llama-server.exe", &pf(), &e).unwrap_err();
        assert!(err.starts_with("VALIDATION:"));
        assert!(err.contains("\"-m\""));
    }

    #[test]
    fn unknown_keys_rejected() {
        let e = entry(&[("m", "x.gguf"), ("zzz", "1")]);
        let err = build_arg_vector("llama-server.exe", &pf(), &e).unwrap_err();
        assert!(err.starts_with("VALIDATION:"));
        assert!(err.contains("zzz"));
    }

    #[test]
    fn prepare_launch_requires_exe_and_config() {
        let mut configs = BTreeMap::new();
        configs.insert("c1".into(), entry(&[("m", "x.gguf")]));
        // exe 不存在
        let dir = std::env::temp_dir().join("lms_launch_test_nodir");
        let err = prepare_launch(&dir, &pf(), &configs, "c1").unwrap_err();
        assert!(err.starts_with("MISSING:"));
        // 配置不存在
        std::fs::create_dir_all(&dir).ok();
        std::fs::write(dir.join("llama-server.exe"), b"stub").unwrap();
        let err = prepare_launch(&dir, &pf(), &configs, "nope").unwrap_err();
        assert!(err.starts_with("MISSING:"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn summarize_uses_flag_form() {
        let e = entry(&[("m", "D:\x\a gguf.q8.gguf"), ("port", "9931")]);
        assert_eq!(summarize(&e, &pf()), "-m \"D:\\x\\a gguf.q8.gguf\" --port 9931");
    }
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd src-tauri && cargo test`
预期：FAIL —— `build.rs` / `build_arg_vector` 未定义。

- [ ] **步骤 3：实现 build.rs**

```rust
//! 参数值 → 命令行向量（纯函数，可单测）

use std::collections::BTreeMap;
use std::path::Path;

use crate::config::{ConfigEntry, ParamsFile, ConfigsMap, validate_config_id};

/// Windows 路径规则：含空格或引号即整体加引号
fn quoted(v: &str) -> String {
    if v.contains(' ') || v.contains('"') { format!("\"{v}\"") } else { v.to_string() }
}

/// 拼完整命令行向量 [exe, flag1, val1, ...]；空值参数整组跳过；必填空 / 未知 key → VALIDATION
pub fn build_arg_vector(exe: &str, pf: &ParamsFile, entry: &ConfigEntry) -> Result<Vec<String>, String> {
    for key in &pf.required {
        let v = entry.values.get(key).map(|s| s.trim()).unwrap_or_default();
        if v.is_empty() {
            return Err(format!("VALIDATION: 必填参数 \"{}\" 未填写", pf.params.get(key).unwrap_or(key)));
        }
    }
    let mut out = vec![exe.to_string()];
    for (k, v) in &entry.values {
        if v.trim().is_empty() { continue; }
        let flag = pf.params
            .get(k)
            .ok_or_else(|| format!("VALIDATION: 参数 \"{k}\" 不在 llama_params.yaml 的映射表里"))?;
        out.push(flag.clone());
        out.push(quoted(v));
    }
    Ok(out)
}

/// 启动前完整校验：exe 存在 + 配置存在 + 拼装成功；返回完整向量
pub fn prepare_launch(dir: &Path, pf: &ParamsFile, configs: &ConfigsMap, id: &str) -> Result<Vec<String>, String> {
    validate_config_id(id)?;
    let exe = dir.join("llama-server.exe");
    if !exe.exists() {
        return Err(format!("MISSING: llama-server.exe 不存在（目录：{}）", dir.display()));
    }
    let entry = configs.get(id).ok_or_else(|| format!("MISSING: 配置 \"{id}\" 不存在"))?;
    build_arg_vector(&exe.to_string_lossy().into_string(), pf, entry)
}

/// 日志/列表用的 flag 形式摘要，如 "-m D:\\x.gguf --port 9931"
pub fn summarize(e: &ConfigEntry, pf: &ParamsFile) -> String {
    e.values.iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .filter_map(|(k, v)| pf.params.get(k).map(|f| format!("{f} {}", quoted(v))))
        .collect::<Vec<_>>()
        .join(" ")
}
```

`src-tauri/src/lib.rs` 加 `pub mod build;`。

- [ ] **步骤 4：运行测试验证通过**

运行：`cd src-tauri && cargo test`
预期：全 PASS（含任务 2，共 14+ 个测试）。

- [ ] **步骤 5：Commit**

```bash
git add src-tauri/src/build.rs src-tauri/src/lib.rs
git commit -m "feat: 参数 → 命令行向量拼装（引号/空值跳过/必填校验）"
```

### 任务 4：进程管理 process.rs（TDD）

**文件：**
- 重写：`src-tauri/src/process.rs`
- 测试：同文件内联

- [ ] **步骤 1：编写失败的单元测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const SLEEP_CMD: [&str; 2] = ["-Command", "Start-Sleep -Seconds 60"];

    #[test]
    fn launch_stop_lifecycle() {
        let mut ps = ProcessState::new();
        assert!(ps.launch("powershell", &SLEEP_CMD.iter().map(|s| s.to_string()).collect::<Vec<_>>(), None).is_ok());
        assert!(ps.is_running());
        assert!(ps.stop_graceful(3).is_ok());
        let code = ps.drain_exit();
        assert_eq!(code, Some(0)); // 被 kill 的进程退出码非负（TerminateProcess → 0）
        assert_eq!(ps.state, ProcState::Ready);
    }

    #[test]
    fn double_launch_rejected() {
        let mut ps = ProcessState::new();
        let _ = ps.launch("powershell", &SLEEP_CMD.iter().map(|s| s.to_string()).collect::<Vec<_>>(), None);
        let e = ps.launch("powershell", &[], None).unwrap_err();
        assert!(e.starts_with("STATE:"));
        let _ = ps.stop_graceful(3);
        let _ = ps.drain_exit();
    }

    #[test]
    fn stop_without_process_is_noop() {
        let mut ps = ProcessState::new();
        assert!(ps.stop_graceful(0).is_ok());
        assert_eq!(ps.state, ProcState::Ready);
    }

    #[test]
    fn drain_exit_reports_quick_child() {
        // 立即退出的进程（powershell echo）：drain_exit 拿到退出码
        let mut ps = ProcessState::new();
        let _ = ps.launch("powershell", &["-Command".into(), "Write-Output hi".into()], None);
        let code = ps.drain_exit();
        assert_eq!(code, Some(0));
        assert_eq!(ps.state, ProcState::Ready);
    }
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd src-tauri && cargo test`
预期：FAIL —— `ProcessState` / `ProcState` / `drain_exit` 未定义。

- [ ] **步骤 3：实现 process.rs（整体替换占位）**

```rust
//! 进程生命周期：launch（隐藏窗口、双管道）/ stop（kill → 3s → taskkill /T /F）/ 状态

use std::process::{Child, Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, PartialEq)]
pub enum ProcState {
    Ready,
    Running { config_id: Option<String> },
    Stopping,
}

pub struct ProcessState {
    pub state: ProcState,
    child: Option<Child>,
    exit_code: Option<i32>,
}

impl Default for ProcessState {
    fn default() -> Self { Self::new() }
}

impl ProcessState {
    pub fn new() -> Self { Self { state: ProcState::Ready, child: None, exit_code: None } }

    pub fn is_running(&self) -> bool { matches!(self.state, ProcState::Running { .. }) }

    /// 启动子进程（隐藏窗口、双管道）；Running 时拒绝二次启动
    pub fn launch(&mut self, exe: &str, args: &[String], config_id: Option<String>) -> Result<(), String> {
        if self.is_running() || self.state == ProcState::Stopping {
            return Err("STATE: 已有进程在运行".into());
        }
        let mut cmd = Command::new(exe);
        cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        self.child = Some(cmd.spawn().map_err(|e| format!("PROC: 启动失败: {e}"))?);
        self.state = ProcState::Running { config_id };
        Ok(())
    }

    /// 取走双管道给读取线程（必须 Running）
    pub fn take_pipes(&mut self) -> Result<(std::process::ChildStdout, std::process::ChildStderr), String> {
        let c = self.child.as_mut().ok_or("STATE: 无子进程")?;
        let so = c.stdout.take().ok_or("STATE: stdout 管道已取走")?;
        let se = c.stderr.take().ok_or("STATE: stderr 管道已取走")?;
        Ok((so, se))
    }

    /// 停止：直接 kill；timeout_secs 内未退出则 taskkill /T /F 杀整棵进程树
    pub fn stop_graceful(&mut self, timeout_secs: u64) -> Result<(), String> {
        let Some(child) = self.child.as_mut() else {
            self.state = ProcState::Ready;
            return Ok(());
        };
        if !self.is_running() && self.state != ProcState::Stopping {
            // 进程已自行退出但 exit 未 drain：直接取退出码
            self.exit_code = child.try_wait().ok().flatten().map(|s| s.code().unwrap_or(-1));
            self.child = None;
            self.state = ProcState::Ready;
            return Ok(());
        }
        self.state = ProcState::Stopping;
        let pid = child.id();
        let _ = child.kill();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) => {}
                Err(_) => break,
            }
            if std::time::Instant::now() >= deadline { break; }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        if child.try_wait().map(|s| s.is_none()).unwrap_or(false) {
            // 3s 后仍存活：杀整棵进程树
            #[cfg(windows)]
            let _ = Command::new("taskkill")
                .args(["/T", "/F", "-PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            let _ = child.wait();
        }
        self.child = None;
        self.state = ProcState::Ready;
        Ok(())
    }

    /// 非阻塞取子进程退出码（Running/未退出 → None；已 drain 过一次 → 再次 None）
    pub fn drain_exit(&mut self) -> Option<i32> {
        let Some(child) = self.child.as_ref() else { return self.exit_code.take(); };
        match child.try_wait() {
            Ok(Some(st)) => {
                let code = st.code().unwrap_or(-1);
                self.child = None;
                self.state = ProcState::Ready;
                Some(code)
            }
            _ => self.exit_code.take(),
        }
    }
}

/// 读取管道一行（阻塞，在专用线程中调用）；EOF → None
pub fn read_stream_line(stream: &std::process::ChildStdout) -> Result<Option<String>, std::io::Error> {
    use std::io::BufRead;
    let mut reader = stream.locked();
    let mut buf = String::new();
    let n = reader.read_line(&mut buf)?;
    if n == 0 { return Ok(None); }
    Ok(Some(buf.trim_end_matches(['\n', '\r']).to_string()))
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd src-tauri && cargo test`
预期：全 PASS（共 17+ 个测试；powershell 用例约 2–5s）。

- [ ] **步骤 5：Commit**

```bash
git add src-tauri/src/process.rs
git commit -m "feat: 进程管理——launch/take_pipes/stop_graceful/drain_exit"
```

### 任务 5：后端命令接线（AppState + 全部 #[tauri::command] + 日志事件）

**文件：**
- 修改：`src-tauri/src/lib.rs`、`src-tauri/src/process.rs`（加 ProcState 辅助方法）、`src-tauri/Cargo.toml`（加 `serde_json`）
- 创建：`src-tauri/capabilities/default.json`

本任务不写托盘与窗口关闭（任务 9）。前端仍为骨架页，验证用临时 probe 按钮。

- [ ] **步骤 1：Cargo.toml 加依赖**

`[dependencies]` 段追加 `serde_json = "1"`（emit 事件用）。

- [ ] **步骤 2：capabilities/default.json（前端 IPC 权限）**

```json
{
  "$schema": "../gen/schemas/schema.json",
  "identifier": "main-capability",
  "description": "主窗口权限",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default"
  ]
}
```

- [ ] **步骤 3：给 process.rs 加辅助方法（取 Running 的 config_id）**

```rust
impl ProcState {
    /// Running 时取 config_id，其它状态 None
    pub fn running_config_id(&self) -> Option<String> {
        match self {
            ProcState::Running { config_id } => config_id.clone(),
            _ => None,
        }
    }
}
```

- [ ] **步骤 4：重写 lib.rs（AppState、11 个命令、日志事件）**

```rust
pub mod config;
pub mod build;
pub mod process;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// 全局状态：进程管理器（Mutex 包一层，Arc 供日志读取线程共享）
pub struct AppState {
    pub ps: Arc<Mutex<process::ProcessState>>,
}

pub fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("src-tauri"))
}

fn yaml_paths() -> (PathBuf, PathBuf, PathBuf) {
    let d = exe_dir();
    (d.join("lms_launch.yaml"), d.join("llama_params.yaml"), d.join("llama_launch_configs.yaml"))
}

#[derive(serde::Serialize, Clone)]
pub struct StateView {
    pub running: bool,
    pub stopping: bool,
    pub config_id: Option<String>,
}

// ---------- 配置类命令 ----------

#[tauri::command]
fn get_app_config() -> config::AppConfig {
    config::app_config_load(&yaml_paths().0)
}

#[tauri::command]
fn save_llama_dir(dir: String) -> Result<(), String> {
    config::app_config_save(&yaml_paths().0, &config::AppConfig { llama_dir: dir.trim().to_string() })
}

/// 校验目录下是否有 llama-server.exe
#[tauri::command]
fn validate_dir(dir: String) -> bool {
    PathBuf::from(dir).join("llama-server.exe").exists()
}

#[tauri::command]
fn get_params() -> Result<config::ParamsFile, String> {
    config::params_load(&yaml_paths().1)
}

#[tauri::command]
fn get_configs() -> Result<config::ConfigsMap, String> {
    config::configs_load(&yaml_paths().2)
}

#[tauri::command]
fn save_config(id: String, desc: Option<String>, values: std::collections::BTreeMap<String, String>) -> Result<(), String> {
    config::save_config_entry(&yaml_paths().2, &id, desc, &values)
}

#[tauri::command]
fn delete_config(id: String) -> Result<(), String> {
    config::delete_config_entry(&yaml_paths().2, &id)
}

// ---------- 进程类命令 ----------

#[tauri::command]
fn get_state(state: tauri::State<AppState>) -> StateView {
    let ps = state.ps.lock().unwrap();
    StateView {
        running: ps.is_running(),
        stopping: ps.state == process::ProcState::Stopping,
        config_id: ps.state.running_config_id(),
    }
}

/// 启动：读配置 → prepare_launch → launch → 取管道 → 日志读取线程
#[tauri::command]
fn start_server(app: tauri::AppHandle, state: tauri::State<AppState>, config_id: Option<String>) -> Result<String, String> {
    use tauri::Emitter;
    let pf = config::params_load(&yaml_paths().1)?;
    let configs = config::configs_load(&yaml_paths().2)
        .map_err(|e| {
            if e.starts_with("MISSING:") { "MISSING: 尚无启动配置，请先在模板管理里新建".into() }
            else { e }
        })?;
    let app_cfg = config::app_config_load(&yaml_paths().0);
    if app_cfg.llama_dir.trim().is_empty() {
        return Err("VALIDATION: 未配置 llama.cpp 目录".into());
    }
    let id = config_id.ok_or("VALIDATION: 未选择启动配置")?;
    let args = build::prepare_launch(&PathBuf::from(&app_cfg.llama_dir), &pf, &configs, &id)?;
    let summary = build::summarize(&configs[&id], &pf);
    let (out, err) = {
        let mut ps = state.ps.lock().unwrap();
        ps.launch(&args[0], &args[1..], Some(id))?;
        ps.take_pipes()?
    };
    app.emit_all("log-line", serde_json::json!({"line": format!("[lms_launch] 启动配置 · {summary}", ""), "stream": "sys"}))
        .ok();
    let ps_share = state.ps.clone();
    let h = app.clone();
    std::thread::spawn(move || {
        while let Ok(Some(l)) = process::read_stream_line(&out) {
            h.emit_all("log-line", serde_json::json!({"line": l, "stream": "out"})).ok();
        }
        while let Ok(Some(l)) = process::read_stream_line(&err) {
            h.emit_all("log-line", serde_json::json!({"line": l, "stream": "err"})).ok();
        }
        // stdout/stderr 都 EOF → 进程已退出：取退出码并通知前端（崩溃/被杀路径）
        let code = ps_share.lock().unwrap().drain_exit();
        if let Some(code) = code {
            h.emit_all("process-exit", serde_json::json!({"code"})).ok();
        }
    });
    Ok(summary)
}

/// 停止：kill → 3s → taskkill /T
#[tauri::command]
fn stop_server(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    use tauri::Emitter;
    state.ps.lock().unwrap().stop_graceful(3)?;
    app.emit_all("log-line", serde_json::json!({"line": "[lms_launch] 停止指令已发送".to_string(), "stream": "sys"}))
        .ok();
    Ok(())
}

/// 退出应用（托盘「退出」确认后调用）：先停服务再 exit
#[tauri::command]
fn exit_app(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    state.ps.lock().unwrap().stop_graceful(3)?;
    app.exit(0);
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::DialogPlugin::init())
        .setup(|app| {
            let ps = Arc::new(Mutex::new(process::ProcessState::new()));
            app.manage(AppState { ps });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_config, save_llama_dir, validate_dir,
            get_params, get_configs, save_config, delete_config,
            get_state, start_server, stop_server, exit_app
        ])
        .run()
}
```

（`start_server` 启动行：先 `let line = format!("[lms_launch] 启动配置 {id} · {summary}");`，json 的 line 值用该变量。）

- [ ] **步骤 5：验证——cargo test + dev 窗口 IPC**

运行：

```powershell
cd src-tauri
cargo test
```
预期：全 PASS（17+）。

worktree 根目录把 `src/App.vue` 临时改为：

```vue
<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
async function probe() {
  console.log('app_config =', await invoke('get_app_config'))
  console.log('params =', await invoke('get_params'))
  console.log('configs =', await invoke('get_configs').catch((e: any) => String(e)))
}
</script>
<template>
  <main class="layout"><h1>lms_launch 骨架</h1><button @click="probe">probe</button></main>
</template>
```

运行 `npx tauri dev`，点击按钮。预期 console：
`app_config = {llama_dir: ""}`；`params = {params: {m: "-m", ...}, required: ["m"]}`（src-tauri/ 下自动生成 llama_params.yaml）；`configs = "MISSING: llama_launch_configs.yaml 不存在（新建第一个模板后自动生成）"`。

- [ ] **步骤 6：Commit**

```bash
git add src-tauri src/App.vue
git commit -m "feat: 后端命令接线——11 个 tauri command + 日志/退出事件"
```

### 任务 6：设计语言 style.css + 布局壳（四卡片 + 组件占位）

**文件：**
- 重写：`src/style.css`、`src/App.vue`
- 创建占位：`src/components/DirModule.vue`、`src/components/TemplateModule.vue`、`src/components/TemplateModal.vue`、`src/components/LaunchBar.vue`、`src/components/LogPanel.vue`

- [ ] **步骤 1：style.css（按规格 §4.5 整体实现）**

```css
/* lms_launch 设计语言：浅色干净主题（规格 §4.5） */
:root {
  --bg: #F6F7F8;
  --card: #FFFFFF;
  --border: #E2E5E9;
  --border-input: #D0D7DE;
  --text: #24292F;
  --muted: #7A8194;
  --blue: #3B82F6;
  --blue-dark: #2563EB;
  --red: #EF4444;
  --disabled-bg: #E5E7EB;
  --disabled-fg: #9CA3AF;
  /* 日志着色（Solarized Light，规格 §4.4） */
  --log-dark: #3B4252;
  --log-err: #D63E0A;
  --log-warn: #B27500;
  --log-ok: #557C1F;
  --log-dim: #7A8194;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 14px;
}

/* 布局：上区三卡片 + 下区日志（占主窗口约一半高） */
.layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100vh;
}
.top-area { display: flex; flex-direction: column; gap: 12px; }
.log-card { flex: 1; min-height: 30%; display: flex; flex-direction: column; }

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.card h2 { font-size: 16px; margin: 0 0 12px; font-weight: 600; }

.row { display: flex; gap: 8px; align-items: center; }
.spacer { flex: 1; }

/* 按钮：圆角矩形 8px、高 36px、内边距 12px 20px */
.btn {
  height: 36px;
  padding: 12px 20px;
  border-radius: 8px;
  border: 1px solid var(--border-input);
  background: var(--card);
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
}
.btn:hover { border-color: var(--muted); }
.btn-primary { background: var(--blue); border-color: var(--blue); color: #fff; }
.btn-primary:hover { background: var(--blue-dark); border-color: var(--blue-dark); }
.btn-danger { background: var(--red); border-color: var(--red); color: #fff; }
.btn:disabled {
  background: var(--disabled-bg);
  border-color: var(--disabled-bg);
  color: var(--disabled-fg);
  cursor: not-allowed;
}

/* 输入框/下拉：白底、1px #D0D7DE、圆角 8px、高 32px；focus 蓝边框 + 柔和 ring */
input, select {
  height: 32px;
  border: 1px solid var(--border-input);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 14px;
  background: #fff;
  color: var(--text);
}
input:focus, select:focus {
  outline: none;
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.22);
}

/* 报错态：红边框 + 下方 12px 红字 */
.input-err { border-color: var(--red) !important; box-shadow: none !important; }
.err-msg { color: var(--red); font-size: 12px; margin: 4px 0 0; min-height: 12px; }

/* 校验辅助小字 */
.hint-ok { color: var(--log-ok); font-size: 12px; margin: 4px 0 0; }
.hint-err { color: var(--log-err); font-size: 12px; margin: 4px 0 0; }
.hint-dim { color: var(--muted); font-size: 12px; margin: 4px 0 0; }

/* 配置列表 */
.cfg-list { display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow: auto; }
.cfg-row {
  display: flex; align-items: baseline; gap: 8px;
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;
  cursor: default;
}
.cfg-row.selected { border-color: var(--blue); }
.cfg-row .id { font-weight: 600; }
.cfg-row .desc { color: var(--muted); font-size: 12px; }
.cfg-row .summary { font-size: 12px; color: var(--muted); font-family: Consolas, monospace; }

/* 日志区：白底 + ANSI 关键字着色（规格 §4.4），等宽 13px */
.log-body {
  flex: 1;
  overflow: auto;
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 13px;
  color: var(--log-dark);
  white-space: pre-wrap;
  word-break: break-all;
}
.log-line { display: block; }
.log-line.err { color: var(--log-err); }
.log-line.warn { color: var(--log-warn); }
.log-line.ok { color: var(--log-ok); }
.log-line.dim { color: var(--log-dim); }

/* 模板弹窗 */
.modal-mask {
  position: fixed; inset: 0;
  background: rgba(36, 41, 47, 0.35);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 8vh;
}
.modal {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  width: 560px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
}
.modal .fields {
  overflow: auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}
.field { display: flex; flex-direction: column; }
.field label {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
  font-family: Consolas, monospace;
}
.field input { width: 100%; }
.modal-footer { margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end; }

/* 确认框（删除配置 / 托盘退出复用） */
.confirm-mask {
  position: fixed; inset: 0;
  background: rgba(36, 41, 47, 0.35);
  display: flex; align-items: center; justify-content: center;
}
.confirm-box {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  width: 360px;
}
.confirm-box .btns { margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end; }
```

- [ ] **步骤 2：App.vue 布局壳 + 状态提升**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import DirModule from './components/DirModule.vue'
import TemplateModule from './components/TemplateModule.vue'
import LaunchBar from './components/LaunchBar.vue'
import LogPanel from './components/LogPanel.vue'

interface ParamsFile { params: Record<string, string>; required: string[] }
interface ConfigEntry { desc?: string; values: Record<string, string> }
type Configs = Record<string, ConfigEntry>

const params = ref<ParamsFile | null>(null)
const configs = ref<Configs | null>(null)
const configsError = ref('')
const dirOk = ref(false) // DirModule 校验结果 → LaunchBar 禁用态

async function refreshConfigs() {
  configsError.value = ''
  try {
    configs.value = (await invoke('get_configs')) as Configs
  } catch (e: any) {
    configsError.value = String(e)
    if (configsError.value.startsWith('MISSING:')) configs.value = {}
  }
}

async function refreshParams() {
  configsError.value = ''
  try { params.value = (await invoke('get_params')) as ParamsFile }
  catch (e: any) { configsError.value = String(e) }
}

onMounted(async () => {
  await refreshParams()
  await refreshConfigs()
})
</script>
<template>
  <div class="layout">
    <div class="top-area">
      <DirModule @validated="dirOk = $event" />
      <div class="row">
        <TemplateModule :params="params" :configs="configs" :configs-error="configsError" @refresh="refreshConfigs" @selected="id => selectedId = id" />
        <LaunchBar :dir-ok="dirOk" :selected-id="selectedId" />
      </div>
    </div>
    <LogPanel />
  </div>
</template>
<script lang="ts">
// selectedId 由模板 emit，给 LaunchBar 用
</script>
```

（`selectedId`：在 `<script setup>` 顶部加 `const selectedId = ref('')`，模板里 `@selected="selectedId = $event"`。）

- [ ] **步骤 3：四个组件占位**

`DirModule.vue`：

```vue
<script setup lang="ts"></script>
<template>
  <div class="card"><h2>llama.cpp 安装目录</h2><p class="hint-dim">任务 7 实现</p></div>
</template>
```

`TemplateModule.vue`：

```vue
<script setup lang="ts"></script>
<template>
  <div class="card" style="flex:1"><h2>启动参数模板</h2><p class="hint-dim">任务 7 实现</p></div>
</template>
```

`LaunchBar.vue`：

```vue
<script setup lang="ts"></script>
<template>
  <div class="card" style="width:220px"><h2>启动控制</h2><p class="hint-dim">任务 8 实现</p></div>
</template>
```

`LogPanel.vue`：

```vue
<script setup lang="ts"></script>
<template>
  <div class="card log-card"><h2>日志</h2><p class="hint-dim">任务 8 实现</p></div>
</template>
```

`TemplateModal.vue`（空占位）：

```vue
<script setup lang="ts"></script>
<template></template>
```

- [ ] **步骤 4：验证**

运行 `npx tauri dev`：预期浅灰底 + 白卡片圆角布局（上区：目录卡整行，模板卡+启动卡并排；下区日志卡约占一半高）；标题 16px 粗体；卡片圆角 12px、间距 12px。

- [ ] **步骤 5：Commit**

```bash
git add src
git commit -m "feat: 设计语言 style.css + 四区块布局壳"
```

### 任务 7：模块 1 + 模块 2（DirModule / TemplateModule / TemplateModal）

**文件：**
- 重写：`src/components/DirModule.vue`、`src/components/TemplateModule.vue`、`src/components/TemplateModal.vue`
- 修改：`src/App.vue`（selectedId、refresh 接线）

- [ ] **步骤 1：DirModule.vue（目录 + 校验 + 保存）**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

const emit = defineEmits<{ (e: 'validated', ok: boolean): void }>()

const dir = ref('')
const hasExe = ref<boolean | null>(null)

async function validate() {
  hasExe.value = null
  if (!dir.value.trim()) return
  try { hasExe.value = await invoke('validate_dir', { dir: dir.value }) }
  catch { hasExe.value = false }
  emit('validated', hasExe.value === true)
}

async function pick() {
  const p = await open({ directory: true, multiple: false, title: '选择 llama.cpp 目录' })
  if (typeof p === 'string' && p) {
    dir.value = p
    await validate()
    await save()
  }
}

async function save() {
  if (!dir.value.trim()) return
  try { await invoke('save_llama_dir', { dir: dir.value }) }
  catch (e: any) { alert(String(e)) }
}

onMounted(async () => {
  try {
    const c = (await invoke('get_app_config')) as { llama_dir: string }
    dir.value = c.llama_dir
    await validate()
  } catch { /* 首次无配置 */ }
})
</script>
<template>
  <div class="card">
    <h2>llama.cpp 安装目录</h2>
    <div class="row">
      <input v-model="dir" placeholder="…\llama-cpp-bundled" style="flex:1" @change="validate" />
      <button class="btn" @click="pick">浏览</button>
      <button class="btn btn-primary" @click="save" :disabled="!dir">保存</button>
    </div>
    <p v-if="hasExe === true" class="hint-ok">✓ 已找到 llama-server.exe</p>
    <p v-else-if="hasExe === false" class="hint-err">✗ 该目录下未找到 llama-server.exe，启动将被禁用</p>
    <p v-else-if="!dir" class="hint-dim">选择包含 llama-server.exe 的目录（保存到 lms_launch.yaml）</p>
  </div>
</template>
```

- [ ] **步骤 2：TemplateModal.vue（flag 表单 + 前端校验红框 + 保存）**

```vue
<script setup lang="ts">
import { ref, reactive } from 'vue'
import { invoke } from '@tauri-apps/api/core'

interface ParamsFile { params: Record<string, string>; required: string[] }
interface ConfigEntry { desc?: string; values: Record<string, string> }

const props = defineProps<{
  params: ParamsFile | null
  existing: ConfigEntry | undefined
  existingId: string | null
  allIds: string[]
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const keys = Object.keys(props.params?.params || {})
const form: Record<string, string> = reactive({
  __id: props.existingId ?? '',
  desc: props.existing?.desc ?? '',
})
for (const k of keys) form[k] = props.existing?.values?.[k] ?? ''

const errs: Record<string, string> = reactive({})

function checkId(): boolean {
  const v = form.__id
  if (!/^[a-z][a-z0-9]*$/.test(v)) {
    errs.id = 'id 须为小写字母开头，仅小写字母和数字，无空格'
    return false
  }
  if (props.allIds.includes(v) && v !== props.existingId) {
    errs.id = 'id 已存在，请换一个'
    return false
  }
  delete errs.id
  return true
}

function save() {
  let ok = checkId()
  // 必填项（params.required）为空 → 对应 flag 输入框红（提示用 flag 形式）
  for (const key of props.params?.required || []) {
    if (!(form[key] ?? '').trim()) {
      const flag = props.params ? props.params[key] : key
      errs[key] = '必填参数 ' + flag + ' 未填写'
      ok = false
    } else {
      delete errs[key]
    }
  }
  if (!ok) return
  const values: Record<string, string> = {}
  for (const k of keys) {
    if ((form[k] ?? '').trim()) values[k] = form[k].trim()
  }
  invoke('save_config', { id: form.__id, desc: form.desc.trim() || null, values })
    .then(() => emit('saved'))
    .catch((e: any) => {
      const msg = String(e)
      if (msg.indexOf('VALIDATION:') >= 0) {
        // Rust 侧同样校验：把错误定位到具体输入框
        let matched = false
        for (const k of keys) {
          const flag = props.params ? props.params[k] : k
          if (msg.indexOf('"' + flag + '"') >= 0 || msg.indexOf('"' + k + '"') >= 0) {
            errs[k] = msg
            matched = true
            break
          }
        }
        if (!matched && msg.indexOf('id') >= 0) errs.id = msg
        else if (!matched) alert(msg)
      } else alert(msg)
    })
}

defineExpose({ save })
</script>
<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <h2>{{ existing ? '编辑配置' : '新建配置' }}</h2>
      <div class="fields">
        <div class="field">
          <label>id</label>
          <input :value="form.__id" :class="{ 'input-err': errs.id }"
                 :disabled="existing ? true : undefined"
                 @input="form.__id = ($event.target as HTMLInputElement).value" />
          <p class="err-msg">{{ errs.id }}</p>
        </div>
        <div class="field">
          <label>desc（描述）</label>
          <input v-model="form.desc" placeholder="如：qwen27b 日常推理" />
        </div>
        <div v-for="k in keys" :key="k" class="field">
          <label>
            {{ params && params.params[k] }}
            <span v-if="(params && params.required) || [].includes ? (params.required || []).includes(k) : false" class="hint-err">*</span>
          </label>
          <input :value="form[k]" :class="{ 'input-err': errs[k] }"
                 @input="form[k] = ($event.target as HTMLInputElement).value" />
          <p class="err-msg">{{ errs[k] }}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>
```

（必填星号判断：script 里 `const reqKeys: string[] = props.params?.required ?? []`，模板 label 上用 `v-if="reqKeys.includes(k)"`。）

- [ ] **步骤 3：TemplateModule.vue（配置列表 + 新建/编辑/删除 + 选中下发）**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import TemplateModal from './TemplateModal.vue'

interface ParamsFile { params: Record<string, string>; required: string[] }
interface ConfigEntry { desc?: string; values: Record<string, string> }
type Configs = Record<string, ConfigEntry>

const props = defineProps<{ params: ParamsFile | null; configs: Configs | null; configsError: string }>()
const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'selected', id: string): void
}>()

const selected = ref('')
const modalOpen = ref(false)
const editingId = ref<string | null>(null)

function onPick(id: string) {
  selected.value = id
  emit('selected', id)
}

function summaryOf(id: string): string {
  const e = props.configs?.[id]
  if (!e || !props.params) return ''
  return Object.entries(e.values)
    .map(([k, v]) => (props.params ? props.params[k] : k) + ' ' + v)
    .join('  ')
}

function createNew() { editingId.value = null; modalOpen.value = true }
function startEdit(id: string) { editingId.value = id; modalOpen.value = true }

async function confirmDelete(id: string) {
  if (!confirm('确定删除配置 ' + id + '？')) return
  try {
    await invoke('delete_config', { id })
    if (selected.value === id) { selected.value = ''; emit('selected', '') }
    emit('refresh')
  } catch (e: any) { alert(String(e)) }
}
</script>
<template>
  <div class="card" style="flex:1">
    <h2>启动参数模板</h2>
    <p v-if="configsError && !configsError.startsWith('MISSING:')" class="hint-err">{{ configsError }}</p>
    <div v-if="!configs || Object.keys(configs).length === 0" class="hint-dim">
      尚无配置 —— 点「新建」保存第一套启动参数
    </div>
    <div v-else class="cfg-list">
      <div
        v-for="(e, id) in configs"
        :key="id"
        class="cfg-row"
        :class="{ selected: selected === id }"
        @click="onPick(String(id))"
      >
        <span class="id">{{ id }}</span>
        <span class="desc">{{ e.desc }}</span>
        <span class="spacer"></span>
        <span class="summary">{{ summaryOf(String(id)) }}</span>
        <button class="btn" style="height:24px;padding:2px 10px" @click.stop="startEdit(String(id))">编辑</button>
        <button class="btn" style="height:24px;padding:2px 10px" @click.stop="confirmDelete(String(id))">删除</button>
      </div>
    </div>
    <button class="btn" style="margin-top:8px" @click="createNew">新建</button>

    <div v-if="modalOpen" class="modal-mask" @click.self="modalOpen = false">
      <TemplateModal
        :params="props.params"
        :existing="editingId && props.configs ? props.configs[editingId] : undefined"
        :existing-id="editingId"
        :all-ids="Object.keys(props.configs || {})"
        @close="modalOpen = false; editingId = null"
        @saved="modalOpen = false; editingId = null; $emit('refresh')"
      />
    </div>
  </div>
</template>
```

（TemplateModal 自带 modal-mask，TemplateModule 不需要再套一层——执行时删掉上面外层 `<div class="modal-mask">` 包裹，直接 `<TemplateModal ... />`。）

- [ ] **步骤 4：App.vue 接线 selectedId**

在 `<script setup>` 加 `const selectedId = ref('')`；模板里 `@selected="selectedId = $event"`（Task 6 已留位）。LaunchBar 暂时占位不消费。

- [ ] **步骤 5：验证（npx tauri dev 手动清单）**

- [ ] 模块 1：输入一个不含 llama-server.exe 的路径 → 红字「未找到」；选真实目录 → 绿字 ✓；关闭应用重开（dev 模式：重跑 tauri dev）→ 目录仍显示（已存 lms_launch.yaml）
- [ ] 模块 2 校验：id 输「Bad Id」→ id 框红 + 提示；输重复 id → 红「已存在」；`-m:` 输入框留空点保存 → `-m:` 框红 + 「必填参数 "-m" 未填写」
- [ ] 新建 c1（m = 某 gguf 路径、ngl=999、port=9931）→ 列表出现 c1，摘要为 flag 形式；dev 数据目录（src-tauri/）下生成 llama_launch_configs.yaml，内容与界面一致
- [ ] 编辑 c1：改 desc、清空 ngl → 保存后 yaml 里 ngl 消失（空值不写入）；id 输入框 disabled 且值不变
- [ ] 删除 c1 → confirm 弹「确定删除配置 c1？」→ 确认后 yaml 里 c1 消失；再次删除会报 VALIDATION 提示
- [ ] 损坏测试：手工把 llama_launch_configs.yaml 改成 `a: [unclosed` → 重开应用 → 列表区显示 YAML 错误（hint-err），不崩溃

- [ ] **步骤 6：Commit**

```bash
git add src
git commit -m "feat: 模块 1 安装目录 + 模块 2 模板管理（flag 表单/校验/红框）"
```

### 任务 8：模块 3 启动控制（LaunchBar）+ 模块 4 日志区（LogPanel）+ App 接线

**文件：**
- 重写：`src/components/LaunchBar.vue`、`src/components/LogPanel.vue`
- 修改：`src/App.vue`（进程状态轮询、日志行累积、process-exit 监听、启动/停止调用）

**App.vue 最终版**（本任务起替换 Task 6 版本）：

~~~vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import DirModule from './components/DirModule.vue'
import TemplateModule from './components/TemplateModule.vue'
import LaunchBar from './components/LaunchBar.vue'
import LogPanel from './components/LogPanel.vue'

interface ParamsFile { params: Record<string, string>; required: string[] }
interface ConfigEntry { desc?: string; values: Record<string, string> }
type Configs = Record<string, ConfigEntry>

const params = ref<ParamsFile | null>(null)
const configs = ref<Configs | null>(null)
const configsError = ref('')
const dirOk = ref(false)
const selectedId = ref('')

// 进程状态（1s 轮询 + 事件即时刷新）
const running = ref(false)
const stopping = ref(false)
const runningConfig = ref<string | null>(null)

// 日志行累积（上限 5000 行防内存膨胀）
const logLines = ref<string[]>([])
function pushLine(line: string) {
  logLines.value.push(line)
  if (logLines.value.length > 5000) logLines.value.splice(0, logLines.value.length - 5000)
}

let unlistenLog: UnlistenFn | null = null
let unlistenExit: UnlistenFn | null = null
let pollTimer: number | null = null

async function refreshState() {
  try {
    const s = (await invoke('get_state')) as { running: boolean; stopping: boolean; config_id: string | null }
    running.value = s.running
    stopping.value = s.stopping
    runningConfig.value = s.config_id
  } catch { /* dev 期后端未就绪 */ }
}

async function start() {
  try {
    const summary = await invoke('start_server', { configId: selectedId.value || null })
    pushLine('[lms_launch] 启动：' + summary)
    refreshState()
  } catch (e: any) {
    const msg = String(e)
    if (msg.indexOf('VALIDATION:') >= 0 || msg.indexOf('MISSING:') >= 0) pushLine('[lms_launch] ' + msg)
    else alert(msg)
  }
}

async function stop() {
  try {
    await invoke('stop_server')
    refreshState()
  } catch (e: any) { alert(String(e)) }
}

async function refreshConfigs() {
  try { configs.value = (await invoke('get_configs')) as Configs; configsError.value = '' }
  catch (e: any) { configsError.value = String(e); if (String(e).startsWith('MISSING:')) configs.value = {} }
}

async function refreshParams() {
  try { params.value = (await invoke('get_params')) as ParamsFile }
  catch (e: any) { configsError.value = String(e) }
}

onMounted(async () => {
  unlistenLog = await listen('log-line', (ev) => pushLine((ev.payload as { line: string }).line))
  unlistenExit = await listen('process-exit', (ev) => {
    const code = (ev.payload as { code: number }).code
    pushLine('[lms_launch] llama-server 已退出（exit code ' + code + '，' + new Date().toLocaleTimeString() + '）')
    refreshState()
  })
  pollTimer = window.setInterval(() => refreshState(), 1000)
  await refreshState()
  await refreshParams()
  await refreshConfigs()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  unlistenLog?.()
  unlistenExit?.()
})
</script>
<template>
  <div class="layout">
    <div class="top-area">
      <DirModule @validated="dirOk = $event" />
      <div class="row">
        <TemplateModule
          :params="params"
          :configs="configs"
          :configs-error="configsError"
          @refresh="refreshConfigs"
          @selected="(id: string) => (selectedId = id)"
        />
        <LaunchBar
          :running="running"
          :stopping="stopping"
          :dir-ok="dirOk"
          :running-config="runningConfig"
          @start="start"
          @stop="stop"
        />
      </div>
    </div>
    <LogPanel :lines="logLines" />
  </div>
</template>
~~~

（`invoke('start_server', { configId })`：Tauri 2 命令参数自动 camelCase → Rust `config_id`。若 IPC 报参数名错误，对照 Rust 侧参数名调整。）

- [ ] **步骤 1：LaunchBar.vue**

~~~vue
<script setup lang="ts">
const props = defineProps<{
  running: boolean
  stopping: boolean
  dirOk: boolean
  runningConfig: string | null
}>()
const emit = defineEmits<{ (e: 'start'): void; (e: 'stop'): void }>()
</script>
<template>
  <div class="card" style="width:220px">
    <h2>启动控制</h2>
    <div class="row">
      <!-- 运行中 = 红底「停止」；空闲 = 白底蓝框「启动」；目录未过校验 = 禁用（规格 §4.5） -->
      <button v-if="running" class="btn btn-danger" @click="$emit('stop')">
        {{ stopping ? '停止中…' : '停止 ' + (runningConfig || '') }}
      </button>
      <button
        v-else
        class="btn"
        style="border-color: var(--blue); color: var(--blue)"
        :disabled="!dirOk"
        @click="$emit('start')"
      >
        启动
      </button>
    </div>
    <p v-if="!running && !dirOk" class="hint-dim">目录校验未通过，启动禁用</p>
    <p v-if="running" class="hint-ok">运行中（配置：{{ runningConfig }}）</p>
  </div>
</template>
~~~

- [ ] **步骤 2：LogPanel.vue（只读 + 关键字着色 + 自动滚动暂停）**

~~~vue
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps<{ lines: string[] }>()

// 自动滚动：用户向上滚 → 暂停；滚回最底部（<8px）→ 恢复
const bodyRef = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

function classify(line: string): string {
  const l = line.toLowerCase()
  if (/(^|[^a-z])(error|err|failed|failure|exception|traceback|fatal|refused|denied)|不存在|失败/.test(l)) return 'err'
  if (/(^|[^a-z])(warn|warning|deprecated)|警告/.test(l)) return 'warn'
  if (/(server ready|listening|ready|started|success)/.test(l) || /已启动|运行中/.test(line)) return 'ok'
  if (/^\[lms_launch\]/.test(line)) return 'dim' // 本工具自己的行（启动/退出标记）
  return ''
}

const rendered = computed(() => props.lines.map((l) => ({
  cls: classify(l),
  text: l,
})))

watch(() => props.lines.length, () => {
  if (!autoScroll.value) return
  nextTick(() => {
    const el = bodyRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

function onScroll() {
  const el = bodyRef.value
  if (!el) return
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 8
}
</script>
<template>
  <div class="card log-card">
    <h2>日志 <span class="hint-dim" style="font-weight:400">（白底 ANSI 着色 · 向上滚动暂停自动跟随）</span></h2>
    <div class="log-body" ref="bodyRef" @scroll="onScroll">
      <span v-for="(r, i) in rendered" :key="i" class="log-line" :class="r.cls">{{ r.text }}</span>
    </div>
  </div>
</template>
~~~

（不加时间戳列，保持「原文显示、可选中复制」最纯粹——规格 §4.4 要求不改写原文；着色仍按关键字表。）

- [ ] **步骤 3：验证（npx tauri dev 手动清单）**

**前置：** 真实 llama.cpp 目录与模型（用户环境：D:\AI\llama\llama-cpp-bundled + Models\ 下 gguf）；GPU 加载验证不了时用「m 指向不存在文件」覆盖崩溃路径。

- [ ] 启动：选配置 c1 → 点「启动」→ 日志区出现 `[lms_launch] 启动：-m … --port …`；按钮立即变红底「停止 c1」
- [ ] llama-server stdout/stderr 实时进日志区；错误行红、ready 行绿（目视）
- [ ] 点「停止」→ ≤3s 按钮回白底蓝框「启动」；日志区出现 `[lms_launch] 停止指令已发送`
- [ ] 日志快速增长时向上滚 → 暂停跟随；拉回底部 <8px → 恢复
- [ ] 崩溃路径：m 指向不存在文件启动 → stderr 原文进日志（红）→ `[lms_launch] llama-server 已退出（exit code N…）`；按钮 ≤1s 回「启动」
- [ ] 目录改到无 exe 的路径 → 「启动」灰化禁用
- [ ] 日志可选中（Ctrl+C 复制无报错）

- [ ] **步骤 4：Commit**

~~~bash
git add src
git commit -m "feat: 模块 3 启动控制 + 模块 4 日志区（着色/自动滚动/状态轮询）"
~~~

### 任务 9：托盘驻留 + 窗口关闭行为 + 退出确认

**文件：**
- 修改：`src-tauri/src/lib.rs`（setup 加 tray + 窗口关闭转隐藏）、`src/App.vue`（tray-exit-request 监听 + 确认框）

- [ ] **步骤 1：lib.rs setup 里加托盘 + 窗口关闭转隐藏**

在 `run()` 的 `.setup()` 闭包里（AppState manage 之后）追加：

~~~rust
use tauri::{Manager, WindowEvent};
use tauri::tray::TrayIconBuilder;

let window = app.get_window("main").unwrap();
window.on_window_event(|event| match event {
    // 点 ×：隐藏窗口而非退出；真正退出走托盘「退出」
    WindowEvent::CloseRequested { api, .. } => {
        api.prevent_close();
        let _ = window.hide();
    }
    _ => {}
});

// 托盘菜单：打开 lms_launch / 退出
let open_item = tauri::MenuItem::new(&app, "打开 lms_launch", true)?;
let exit_item = tauri::MenuItem::new(&app, "退出", true)?;
let menu = tauri::Menu::new(&app).add_items(&[&open_item, &exit_item])?;
let tray = TrayIconBuilder::new("lms_tray").menu(&menu).show_menu_on_left_click(false).build(&app)?;
app.manage(tray);

// 菜单动作（事件回调里用 app.emit_all 通知前端）
tray.on_menu_event(|app, event| {
    match event.id().0.as_str() {
        "打开 lms_launch" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus(true);
            }
        }
        "退出" => {
            app.emit_all("tray-exit-request", serde_json::json!({})).ok();
        }
        _ => {}
    }
});
~~~

（Tauri 2 的 `Menu::new`/`add_items`/`on_menu_event` 以本机 tauri 2.x 实际签名为准；emit 用 `Emitter` trait。行为不变：点 × 隐藏、托盘两菜单项。）

- [ ] **步骤 2：App.vue 监听 tray-exit-request（确认框 → exit_app）**

在 App.vue `<script setup>` 加：

~~~ts
let unlistenTrayExit: UnlistenFn | null = null
const trayExitAsk = ref(false)

// onMounted 里追加：
unlistenTrayExit = await listen('tray-exit-request', async () => {
  const s = (await invoke('get_state')) as { running: boolean }
  if (s.running) { trayExitAsk.value = true }          // 服务在跑 → 确认框
  else { try { await invoke('exit_app') } catch { /* 已退出 */ } }
})
// onUnmounted 里追加：unlistenTrayExit?.()
~~~

模板加（复用 Task 6 的 confirm-mask CSS）：

~~~vue
<div v-if="trayExitAsk" class="confirm-mask">
  <div class="confirm-box">
    <h2>llama-server 正在运行</h2>
    <p>退出 lms_launch 将同时停止 llama-server，确认退出？</p>
    <div class="btns">
      <button class="btn" @click="trayExitAsk = false">取消</button>
      <button class="btn btn-danger" @click="async () => { trayExitAsk = false; try { await invoke('exit_app') } catch {} }">退出并停止服务</button>
    </div>
  </div>
</div>
~~~

- [ ] **步骤 3：验证（npx tauri dev 手动清单）**

- [ ] 主窗口点 × → 窗口消失；托盘出现图标（默认 Tauri 图标可接受）
- [ ] 托盘「打开 lms_launch」→ 窗口恢复并获焦
- [ ] 无服务运行时：托盘「退出」→ 直接退出，无确认框
- [ ] 有服务运行时：托盘「退出」→ 确认框「退出将同时停止 llama-server」→ 确认后 llama-server 进程消失（任务管理器核对）且应用退出；选「取消」→ 服务继续跑
- [ ] **核心验收**：窗口关闭状态下，9931 端口仍可访问（另开 PowerShell：`curl http://127.0.0.1:9931/v1/models` 有响应）

- [ ] **步骤 4：Commit**

~~~bash
git add src src-tauri
git commit -m "feat: 托盘驻留 + 窗口关闭转隐藏 + 退出确认"
~~~

### 任务 10：最终验收 + release 构建 + 收尾

- [ ] **步骤 1：全量 Rust 测试**

运行：

~~~powershell
cd src-tauri
cargo test
~~~
预期：19 个测试全 PASS（config 9 + build 6 + process 4）。

- [ ] **步骤 2：端到端验收清单（release 构建前，npx tauri dev）**

- [ ] 首启：数据目录自动生成 llama_params.yaml（26 参数默认模板）；界面正常
- [ ] 模块 1：选真实目录 → ✓；存盘后重启应用仍显示
- [ ] 模块 2：新建 c1/c2、编辑改 desc、删除 c2；三种红框校验全部复现
- [ ] 启动 c1 → 日志实时着色 → 停止 → 按钮回弹；崩溃路径退出码进日志
- [ ] 托盘：关窗驻留 / 恢复 / 退出确认（两分支）
- [ ] 日志区：暂停/恢复跟随；可选中复制

- [ ] **步骤 3：release 构建（单 exe 产物验证）**

运行（worktree 根目录）：

~~~powershell
npm run build
npx tauri build
~~~

预期：`src-tauri/target/release/lms_launch.exe`（约 5–8 MB）。把该 exe 复制到干净目录（如 `C:\lms_test`）双击运行：

- [ ] 窗口正常弹出、无 WebView2 报错
- [ ] 数据文件落在 **exe 同目录**（不再是 src-tauri/）
- [ ] release 下抽查关键路径：启动 + 停止 + 关窗驻留 + 托盘退出确认

- [ ] **步骤 4：README**

worktree 根 `README.md`（新建）：

~~~markdown
# lms_launch

llama-server 图形化启动器（Tauri 2 + Vue 3）。详见 docs/lms_launch-analysis.md。

## 开发

~~~powershell
winget install Rustlang.Rustup
npm install
npx tauri dev
~~~

## 构建

~~~powershell
npm run build
npx tauri build
~~~

产物：src-tauri/target/release/lms_launch.exe（单文件，放任意目录即可用；数据文件与 exe 同目录）。

## 数据文件

| 文件 | 说明 |
|---|---|
| lms_launch.yaml | 应用设置（llama.cpp 目录） |
| llama_params.yaml | 参数模板（key → flag），手动维护；丢失会自动重建 |
| llama_launch_configs.yaml | 用户配置集，工具读写 |

## 注意

- 首次运行 Windows SmartScreen 可能提示「未知发布者」→ 更多信息 → 仍要运行。
- 托盘「退出」会先停 llama-server。
~~~

（README 里的内层 code fence：执行时直接写三反引号即可，本计划为转义用了 ~~~。）

- [ ] **步骤 5：Commit + 收尾**

~~~bash
git add README.md
git commit -m "docs: README 与构建/分发说明"
~~~

执行 `finishing-a-development-branch` 技能流程：把 `lms-launch-v1` 分支合并回 master（merge commit），在 master 上复跑 `cargo test` 确认 PASS，清理 worktree（`git worktree remove .worktrees/lms-launch-v1`）。

---

## 自检记录

**规格覆盖度：** §4.1 → 任务 7 DirModule；§4.2 → 任务 7 TemplateModule/Modal + 任务 2 configs_*；§4.3 → 任务 8 LaunchBar + 任务 5 start/stop/get_state；§4.4 日志区（着色表逐项）→ 任务 8 LogPanel；§4.5 设计语言 → 任务 6 style.css 逐项对照；§4.6 托盘 → 任务 9；§5 数据流 → 任务 3 拼装 + 任务 5 start 流 + 任务 8 状态轮询；§6 错误处理 8 场景 → 任务 2（YAML/MISSING/VALIDATION）+ 任务 3（prepare_launch）+ 任务 8（启动即退出/崩溃）+ 任务 9（退出确认）；§7 v1 边界 → 任务 1–10 全在范围内，无扩展模块代码。**无遗漏。**

**占位符扫描：** 无「TODO/待定」；所有步骤含完整代码或精确手动验证项。

**类型一致性：** ConfigEntry{desc,values} / ParamsFile{params,required} / ProcessState.state:ProcState 在任务 2→3→5→8 间一致；命令参数 camelCase（configId ↔ config_id）在任务 5/8 已对齐；事件名 `log-line` / `process-exit` / `tray-exit-request` 两侧一致。