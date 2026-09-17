# 变更：检查更新弹窗 llama.cpp「已是最新版本」态按钮随「所选版本 vs yaml 配置」切换（检查更新 / 切换版本）

日期：2026-09-18
状态：已实施（npm test 456 全绿；npm run build 通过）

## 背景与用户诉求

检查到「已是最新版本」且下方显示 Windows 版本下拉时，按钮恒为「下载更新」，
点击即下载所选变体并覆盖安装。用户要求按所选版本与 lms_launcher.yaml 的
llama_update.last_version_type 是否一致区分按钮：

- 一致 → 按钮「检查更新」（点击重查）
- 不一致 → 按钮「切换版本」（点击下载所选变体，覆盖安装）

## 方案

src/modules/UpdateModal.vue（仅 script，模板/主进程/IPC 契约不动）：

- 新增 llamaSelectedMatchesConfig()：所选版本与配置是否一致——
  - 有配置：选中项 label 与 last_version_type 精确匹配（与 applyLlamaDefaultSelection 同口径）
  - 无配置：以第一项为一致基准（默认选中即第一项，未切=一致、切走=不一致；
    无法判断真实安装变体，不诱导对第一项的完整下载覆盖——用户确认此口径）
  - 选项表为空：恒 true（按钮走「检查更新」兜底分支，该值不被消费）
- llamaBtnLabel()：up-to-date + 有选项 → 一致「检查更新」/ 不一致「切换版本」
  （替换 2026-09-18 早前的恒「下载更新」）
- onLlamaBtn()：up-to-date + 有选项 → 一致重发 checkLlamaUpdateInternal /
  不一致 downloadLlamaUpdateInternal（原 available 下载路径复用，成功后既有链路
  回写 last_version_type + 重查 → 选中项=配置 → 按钮自动落回「检查更新」，闭环一致）

不动：update-available / checking / downloading / error / stop-update 态渲染与行为；
中段「已是最新版本 …」文字；Dropdown 渲染条件；主进程检查/下载/安装链路。

## 测试（TDD：4 红 → 绿 → 全量）

- 更新既有契约注释与 2 个用例断言：up-to-date 有选项（无配置）→ 按钮「检查更新」；
  「切换变体后下载」用例先切下拉、断言按钮反应式切「切换版本」再点击。
- 新增 2 例：
  - up-to-date + 配置命中选中项 → 按钮「检查更新」，点击重发 check（check ×2）且不发起
    download_llama_update，重查落定后仍「检查更新」
  - up-to-date + 配置命中后切换变体 → 按钮「切换版本」，点击下载所选变体（所选项 URL）、
    不重发 check，成功后 set_llama_update_config 回写所选 label、重查落回「检查更新」
- 受新契约影响的既有回归用例同步更新（stop-update 用例不受影响——update-available 态文案不变；
  「默认选中：下载完成重查」用例点击前先断言「切换版本」，点击即下载）。
- 保留：up-to-date 无版本选项 → 不渲染下拉、按钮「检查更新」（回归守护不动）。

## 验收

- [x] npm test 通过（456，30 文件）
- [x] npm run build 通过
- [ ] 用户真机 npm run dev 目检：配置 CUDA 13 且已是最新 → 按钮「检查更新」；
      下拉切到 CPU → 按钮「切换版本」，点击后下载覆盖、完成回写配置并落回「检查更新」

## 不做的事

- 不改主进程检查/下载/安装逻辑与 IPC 契约
- 不改 update-available 态「下载更新」文案（可用更新即应提示下载，与配置无关）
- 不持久化「切换版本」中间态（下载成功后既有链路回写配置）
