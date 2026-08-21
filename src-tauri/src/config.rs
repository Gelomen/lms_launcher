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

pub type ConfigsMap = BTreeMap<String, ConfigEntry>;

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
        app_config_save(&p, &AppConfig { llama_dir: "C:\\llama-cpp".into() }).unwrap();
        let c2 = app_config_load(&p);
        assert_eq!(c2.llama_dir, "C:\\llama-cpp");
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
