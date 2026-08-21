//! 参数值 → 命令行向量（纯函数，可单测）

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
    build_arg_vector(&exe.to_string_lossy().into_owned(), pf, entry)
}

/// 日志/列表用的 flag 形式摘要，如 "-m D:\\\\x.gguf --port 9931"
pub fn summarize(e: &ConfigEntry, pf: &ParamsFile) -> String {
    e.values.iter()
        .filter(|(_, v)| !v.trim().is_empty())
        .filter_map(|(k, v)| pf.params.get(k).map(|f| format!("{f} {}", quoted(v))))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{ConfigEntry, ParamsFile};
    use std::collections::BTreeMap;

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
        let e = entry(&[("m", r"D:\AI\Models\a gguf.q8.gguf"), ("port", "9931")]);
        let args = build_arg_vector(r"C:\x\llama-server.exe", &pf(), &e).unwrap();
        assert_eq!(args, vec![
            String::from(r"C:\x\llama-server.exe"),
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
        let e = entry(&[("m", r"D:\x\a gguf.q8.gguf"), ("port", "9931")]);
        assert_eq!(summarize(&e, &pf()), "-m \"D:\\x\\a gguf.q8.gguf\" --port 9931");
    }
}