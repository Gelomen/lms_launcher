# 任务 2：配置层 config.rs — 报告

## 状态

**DONE**

## TDD 证据

### 步骤 2（FAIL 真实发生）

只写 `#[cfg(test)]` mod tests（9 个测试），实现函数尚不存在：

```
error[E0425]: cannot find function `validate_param_key` in this scope
...
error: could not compile `lms_launch` (lib test) due to 32 previous errors; 1 warning emitted
```

EXIT 1 —— 编译失败符合预期（`app_config_load`/`params_load`/`save_config_entry`/`validate_*`/`default_params` 均未定义）。

### 步骤 4（9 PASS）

```
running 9 tests
test config::tests::config_id_rules ... ok
test config::tests::param_key_must_be_identifier ... ok
test config::tests::default_params_covers_run_bat_common ... ok
test config::tests::save_config_entry_rejects_invalid_id ... ok
test config::tests::configs_missing_reports_missing ... ok
test config::tests::bad_yaml_reports_yaml ... ok
test config::tests::app_config_defaults_when_missing ... ok
test config::tests::params_default_written_only_when_missing ... ok
test config::tests::save_and_delete_config_entry ... ok

test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

cargo test --offline EXIT 0。

## 提交列表

```
9088bea feat: 配置层——三个 yaml 的读写、校验与默认参数模板
```

（附：`00642e1` chore: SDD 账本——任务 1 审查 PASS，提交任务 1 审查者落在工作树的账本 PASS 记录，与本任务无关，仅为保持工作树干净。）

## 偏差 / 疑虑清单

1. **brief 测试代码的转义**：brief 中 `"C:llama-cpp"` 在 Rust 中是非法转义（`` 后接 `l` 不是合法 escape，cargo 报 `unknown character escape`），实现时改为 `"C:\\llama-cpp"`（文件里是 `C:\llama-cpp`，字符串字面量为 `C:llama-cpp`）。测试断言语义不变。其余逐字照 brief。
2. **步骤 1 的中间文件**：brief 预期"实现函数此时尚不存在，编译必失败"；为让 tests-only 版本可编译到 E0425（而不是缺 import），步骤 1 文件在 tests 模块内额外引入了 `BTreeMap`/`PathBuf`。最终文件由步骤 3 整体替换为 brief 的实现 + tests，最终版与 brief 完全一致（除偏差 1）。
3. **沙箱**：按既定策略，`cargo test --offline` 全部在沙箱内通过，未申请任何权限升级。
4. **环境副产物**：cargo test 写入了 `%TEMP%\lms_launch_test*` 临时 yaml（测试自身会清理用例文件）；无残留影响后续任务。

## 范围确认

仅改 `src-tauri/src/config.rs`（268 行）+`superpowers-sdd-progress.md` 账本。lib.rs 未动（`pub mod config;` 早已声明）。Cargo.toml 未动，无新依赖。
