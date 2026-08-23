# lms_launcher v1.1 规格：UI 修复 + 参数选项增强（v2，已含用户批注，待审核）

> **状态：** v5 草稿——已合入全部批注：开发阶段无兼容原则、params_file 声明驱动、「选择文件」按钮文案、boolean false 不写入 yaml、下拉占位项文案规则、滚动条美化、下拉菜单限高 3 行 + 滚动（#13）、下拉菜单风格一致 + 圆角（#13）。v5 新增：#14 五个调试/部署参数（n_cpu_moe / fit / fit_ctx / fit_target / metrics；metrics 声明为 boolean，用户已确认）。待终审。
> **范围仓库：** 主仓库 D:\AI\Workspace\lms_launcher，分支 master（v1 已由 lms-launch-v1 分支/worktree 合并回 master；基线提交 6ec7147）。
> **总原则（用户批注）：**
> - **开发阶段**：所有已生成的运行时内容（llama_launch_configs.yaml、llama_params.yaml 等）**不做兼容/升级处理**——新代码只按最新 schema 工作；首次创建的文件由 defaultParams 直接写完整新模板。
> - **一个计划**交付（约 8–10 个任务，两个批次：UI 修复批 + 参数选项批）。

---

## 一、需求总览

| # | 模块 | 类型 | 摘要 |
|---|------|------|------|
| 1 | 目录模块 | UI 修复 + 文案 | 「选择目录」按钮仅显示 …，hover title 完整说明（修两行错位） |
| 2 | 模板模块 | 交互 | 无模板时红色错误 → 深色普通文案「目前没有模板配置」 |
| 3 | 新建模板弹窗 | 交互 | 未点保存前不显示必填校验警告，点保存才校验并提示 |
| 4 | 新建模板弹窗 | UI | 去掉 -m 行标签的 * 号 |
| 5 | 新建模板弹窗 | 文案 | id 未填的红色提示只显示「必填」 |
| 6 | 启动控制模块 | 交互 | 无配置时不显示任何提示文字，由下拉菜单占位项体现 |
| 7 | 参数系统 | 新功能 | yaml 新增 **params_file** 段声明选文件参数（m / mmproj / chat_template_file）→ 这些行输入框旁加「选择文件」按钮 |
| 8 | 新建模板弹窗 | UI | flag-grid 标签列自适应，--chat-template-file 等完整显示 |
| 9+增强 | 参数系统 | 新功能 | **params_options** 下拉 + **params_boolean** true/false 下拉；补齐 spec_type / load_mode 可选值 |
| 10 | — | （并入 #7） | params_file 类型按钮文字 =「选择文件」；目录按钮 =「…」 |
| 11 | 新建模板弹窗 | UI | 修复右上角、右下角圆角缺失（与 #8 同根因） |
| 12 | 全局 | UI | 美化滚动条（当前浏览器默认样式太丑） |
| 13 | 全局下拉菜单 | UI + 新功能 | 所有下拉菜单最多显示 3 个选项；超过 3 项时出现滚动条，可手动滚动选择 |
| 14 | 参数系统 | 新功能 | params 新增五个参数：`n_cpu_moe: --n-cpu-moe`、`fit: --fit`、`fit_ctx: --fit-ctx`、`fit_target: --fit-target`、`metrics: --metrics`；其中 metrics 为无值调试 flag，声明进 **params_boolean**（用户已确认） |

---

## 二、现状代码定位（已核实，v1 计划实现完成态）

- **模块 1**：src/modules/DirModule.vue — flex 行 `input + button「选择目录…」`，按钮被挤换行错位。
- **模块 2**：src/modules/TemplateModule.vue — get_configs 抛 MISSING 时 `missing=true`，模板仍以 `class="error-text"`（红字）渲染完整错误串。
- **模块 3**：src/modules/LaunchBar.vue — 同上：MISSING 红字 + 「请检查 llama_launch_configs.yaml」；下拉占位项固定「选择配置…」。
- **弹窗**：src/modules/TemplateModal.vue
  - idError / emptyRequired 为 live computed，打开即出红框红字（图3、5）。
  - flag-label：`{{ row.flag }}<span v-if="row.required">*</span>`（图4 的 -m*）。
  - .flag-grid：`grid-template-columns: 130px 1fr`，label nowrap+ellipsis 截断（图7）；长内容横向撑破 card 导致圆角视觉失效（图9）。
- **主进程**：src-main/config.ts（ParamsFile={params,required}，paramsLoad 对已有 yaml 仅校验 key）、build.ts（空值整对跳过；无 options/boolean 概念）、main.ts（已有 open_dir_dialog）、preload.ts + src/ipc.ts 白名单。
- **滚动条**：style.css 未定义任何 ::-webkit-scrollbar，现用浏览器默认。

---

## 三、逐条规格

### #1 · 「选择目录」按钮（DirModule）

- 按钮文字改为 `…`（省略号，三个点），加 `title="选择 llama.cpp 安装目录"`。
- 按钮宽度固定足够容纳 … 且不换行；原输入框 + 按钮的 flex 布局保持，错位的根因（长文字被挤）随文字变短自然消失。

### #2 · 模板模块无模板文案（TemplateModule）

- get_configs MISSING（isMissing）：**不显示红色**，显示一行深色（label/正文字色）普通文案 **「目前没有模板配置」**；不再展示原始错误串。
- 非 MISSING 错误（IO/YAML/其他）仍红字 error-text 原文案。
- configs = {} 时保持现有「暂无配置」灰字不变。

### #3 · 弹窗保存后才校验（TemplateModal）

- 新增 `attemptedSave = ref(false)`：所有校验提示（id 红框/红字、必填项红框、「必填项未填写」汇总行）**仅当 attemptedSave=true 时渲染**。
- 点「保存」→ attemptedSave=true；保存失败不重置；关闭弹窗重置 false。
- 保存按钮 disabled 逻辑同样门控：打开时恒可用（仅 saving 态禁用）。

### #4 · 去掉 * 号（TemplateModal）

- flag-label 不再渲染 `<span>*</span>`；必填只由「保存后红框 + 汇总行」表达。required 数据仍读取，仅展示变化。

### #5 · id 提示文案（TemplateModal）

- idError 空值分支：「id 必填」→ **「必填」**。格式/超长/重复分支文案不变，同受 attemptedSave 门控。

### #6 · 启动控制无配置（LaunchBar）

- MISSING / configs 为空：**完全移除**该模块的提示文字（不显示任何红字或普通提示行）；下拉菜单占位项改为 **「（目前没有模板配置）」**。
- **下拉文案规则（批注）**：未选择时显示 **「选择配置…」**；选择后，所选 option 只显示**配置的 id 名字**（去掉现有「— desc」后缀）。有配置列表时的不可选占位项固定为「选择配置…」。
- 启动按钮保持 disabled。

### #7 · params_file 选文件按钮（yaml 声明驱动）

**A. yaml schema：**

```yaml
params_file:
  - m
  - mmproj
  - chat_template_file
```
（key 与 params 段 key 一致，下划线风格；用户原批注里 "chat-template-file"/"parmas_file" 为笔误，按此归一。）

**B. UI（TemplateModal）：** rows 中 `row.key ∈ paramsMeta.params_file` 的行，输入框右侧加 **「选择文件」** 按钮（固定宽度）。点击 → IPC **open_file_dialog(key)**：
- key ∈ {m, mmproj}：dialog.showOpenDialog，filters [{name:"Model files", extensions:["gguf"]}]
- 其余 params_file key（含 chat_template_file）：无过滤，任意文件
- 返回路径字符串回填 formValues；null 不动。

**C. 主进程/IPC：** main.ts 注册 `open_file_dialog(_e, key)`；preload + src/ipc.ts 白名单同步。get_params 返回结构带上 params_file 段（前端 ParamMeta 类型扩展）。

### #8 · flag-grid 标签列自适应（TemplateModal）

- `grid-template-columns: 130px 1fr` → **`auto 1fr`**；flag-label 去掉 overflow/ellipsis（保留 nowrap），长 label 完整可见。
- 宽 label（--chat-template-file ≈ 190px @12px mono）下输入列仍 ≥ 280px，不撑破 card。

### #9 · params_options + params_boolean（核心新功能）

**A. yaml schema（defaultParams 新建模板即写入；已有文件按最新解析、无兼容要求）：**

```yaml
params:                      # 在 v1 的 26 项上增加 7 行（reasoning*2 + n_cpu_moe/fit/fit_ctx/fit_target/metrics，#14）：
  ...
  reasoning: --reasoning
  reasoning_preserve: --reasoning-preserve
  n_cpu_moe: --n-cpu-moe
  fit: --fit
  fit_ctx: --fit-ctx
  fit_target: --fit-target
  metrics: --metrics
params_options:
  spec_type: [none, draft-mtp, draft-simple, draft-eagle3, draft-dflash, draft-dspark, ngram-cache, ngram-simple, ngram-map-k, ngram-map-k4v, ngram-mod]
  load_mode: [none, auto, mmap, mlock, mmap+mlock, dio]
  reasoning: [auto, on, off]
  reasoning_format: [none, hide, deepseek]
  reasoning_effort: [none, low, medium, high, xhigh, max]
params_boolean:
  - jinja
  - reasoning_preserve
  - metrics            # #14：无值调试 flag（Prometheus），true 只拼 --metrics
params_file:
  - m
  - mmproj
  - chat_template_file
```
- spec_type / load_mode 可选值已按上游 llama.cpp（master tools/server/README.md「-lm, --load-mode」+ docs/speculative.md「--spec-type TYPE」完整枚举）核实并补齐：spec_type 补 draft-simple/draft-eagle3/draft-dflash/draft-dspark/ngram-cache/ngram-simple/ngram-map-k/ngram-map-k4v/ngram-mod 共 9 项；load_mode 补 **dio**。
- reasoning* 三项上游无对应 flag，为用户自建环境参数——按用户列表原样收录，不做校验。
- **#14（v5）**：params key 总数 = v1 的 26 + v1.1 新增 7（reasoning / reasoning_preserve / n_cpu_moe / fit / fit_ctx / fit_target / metrics）= **33**。前四个按普通文本参数处理；**metrics 是 run.bat 里的无值调试 flag**（`--metrics` 单独出现，Prometheus 数据监控），经用户确认声明进 params_boolean——复用 #9C 既有 boolean 规则（弹窗 false|true 下拉默认 false；build.ts true 只拼 `--metrics`、false/空不拼），零新增拼装逻辑。fit 三件套为 llama-server 自动填充显存的调试参数：`--fit on --fit-ctx 128000 --fit-target 1024`（不设置 -c 时自动填充，要求上下文至少 fit-ctx、填充后显存预留 fit-target MB）。

**B. config.ts：**
- `ParamsFile` = { params, required, params_options?, params_boolean?, params_file? }（字段名与 yaml 一致）。
- defaultParams()：params 加 reasoning / reasoning_preserve 与 n_cpu_moe / fit / fit_ctx / fit_target / metrics（#14，共 +7）；params_boolean 为 `[jinja, reasoning_preserve, metrics]`；返回完整三段（options/boolean/file），首次创建即写完整模板。
- paramsLoad：解析已有文件，新段缺失按空处理（运行时容错即可，无迁移/回写逻辑）。

**C. build.ts（命令拼装）：**
- **boolean key**：value === 'true' → 只 push flag（无值对）；value === 'false' 或空 → 整对跳过。其他字面量按普通参数（flag+值）兜底，不新增 VALIDATION。
- **options key**：与普通文本参数同规则（非空即 flag+值）。取值由 UI 下拉收敛，**不做 VALIDATION 拒绝**（第一轮决策点已就此关闭：因无手输入口，拒绝逻辑无意义）。
- summarize：boolean true → 只输出 flag；false/空 → 跳过（与 buildArgVector 一致，避免预览出现「--jinja false」噪声）。
- **既有 6 测试语义不变**；新增测试 ≥4：jinja=true 无值对、jinja=false 跳过、options 透传、boolean 兜底字面量。

**D. 弹窗 UI（TemplateModal）——rows 三分支：**
1. `key ∈ params_boolean` → **下拉**，选项 `false | true`，**默认选 false**。与文本参数最大的区别：**true 才写入 yaml（'true'），选 false / 空值则不写入**（沿用现有「空值不写入」逻辑；build.ts 端 value==='true' 时只拼 flag、不拼值对）。
2. `key ∈ params_options` → **下拉**，选项 = yaml 列表，**默认选首个选项**（无「未设置」占位项）。编辑时按已存值回填；已存值不在列表内 → 回落到首个选项（开发阶段不做兼容）。false/空语义不适用——options 行总有一个非空值写入。
3. 其余 → 文本输入框（现状，含 params_file 行的「选择文件」按钮）。

- required（m）红框规则不变（m 是文本输入行）。

**E. IPC 面：** get_params 返回结构自然扩大；前端 ParamMeta 类型扩展为 { params, required, params_options?, params_boolean?, params_file? }。新增命令仅 open_file_dialog（#7）。

### #10 · （并入 #1/#7，见上）
- 目录按钮 =「…」+title；params_file 行按钮 =「选择文件」。无第三种选择器按钮。

### #11 · 弹窗圆角（TemplateModal）

- 根因与 #8 同源（内容横向撑破）。#8 列宽修复后，modal-box 四角 --radius-card 12px 应全部正常；兜底：modal-box 加 `overflow-x: hidden` 防护。
- 验收：dev 窗口目检 + --chat-template-file 长 label 场景确认四角圆角完好。

### #12 · 滚动条美化（style.css）

- 全局自定义 webkit 滚动条（弹窗 modal-box 与 LogPanel 为主要可滚区域）：
  - `::-webkit-scrollbar` 宽度 10px；track 透明/浅灰（沿用 Solarized 面板底色变量）；thumb 圆角，颜色取 border 色附近（hover 加深）。
  - Firefox：`scrollbar-width: thin; scrollbar-color` 对齐同一配色。
- 不加新依赖；不引入第三方滚动条库。

### #13 · 下拉菜单限高 + 滚动（全局）

- **适用对象**：启动器内所有 `<select>`——LaunchBar 的配置下拉、TemplateModal 里 options/boolean 参数的下拉行（含未来新增的下拉，规则通用）。
- **规格**：select 视觉高度最多显示约 **3 行选项**（item 高 ≈ 28px + 上下 padding，max-height ≈ 116–120px 量级，实现时用 `max-height` 常量或 `calc`）；选项 >3 个时下拉弹层内部滚动（OS/native select dropdown 本身可滚——Chromium 下 native dropdown 支持滚动；若用自定义下拉组件则加 overflow-y: auto + #12 美化滚动条）。
- **实现选型（YAGNI）**：维持现有原生 `<select>`（LaunchBar 已在用）。Electron/Chromium 下 `<select>` 弹层由 OS 渲染，本身支持滚轮/方向键翻页；若弹层过高遮挡，加 `max-height` 类控制行内下拉高度。实现任务里先在 dev 窗口目检 native select 的多项滚动行为（spec_type 11 项）：若 OS 下拉原生满足「可见 3 行 + 可滚动」则不加自定义组件；不满足则用轻量自定义下拉（绝对定位 ul，overflow-y auto，点击外部关闭），并复用 #12 的滚动条样式。
- **风格一致性（批注）**：所有下拉菜单必须与整体设计语言一致——**保持圆角**：select 本体沿用现有 radius-btn（8px）不破坏；若实现自定义下拉弹层，弹层面板按卡片风格做——白底（var(--card)）、1px 边框（var(--border)）、圆角同 radius-btn、内边距与现有模块同量级；option hover 底色用 #F6F7F8（与 btn:hover 一致），选中项高亮用 accent 色；阴影沿用轻量层级（如 0 4px 12px rgba(16,24,40,.12)）。
- **验收**：spec_type（11 项）/ load_mode（6 项）下拉展开后，可视区约 3 行、可滚动到底部选中 dio；配置下拉 ≥3 项时同理。

---

## 四、测试与验收策略

**主进程（Vitest TDD，红→绿）：**
- config.test：params 新段解析；新段缺失 → {} / []；defaultParams 含新 params key 与三段；既有用例不回归。
- build.test：≥4 个新用例（见 #9C）；既有 6 用例全绿。
- 全套件 `npx vitest run` 必须全绿后提交。

**前端（沿用 v1 dev 手动验收清单，不引入组件测试框架）：**
1. 全新态：模板模块深色「目前没有模板配置」；启动控制无任何提示行、下拉占位「（目前没有模板配置）」——无红字。
2. 弹窗打开即时无红框/红字；空表单点保存 → id 下「必填」+ -m 红框 + 汇总行。
3. spec_type / load_mode / reasoning* 为下拉且默认首个选项；jinja / reasoning_preserve / **metrics** 为 false|true 下拉默认 false；保存后 yaml：boolean true 写入 'true'、false 不写入，options 写入所选值；build 出 --jinja / --metrics（true）/不拼（false）。n_cpu_moe / fit / fit_ctx / fit_target 为普通文本输入行（#14），填值后按 flag+值拼装。
4. m / mmproj「选择文件」按钮出 gguf 过滤对话框；chat_template_file 任意文件；选定回填。
5. flag-grid 全部标签完整可见；弹窗四角圆角完好；滚动条为定制样式。
7. spec_type（11 项）/ load_mode（6 项）下拉展开后可视区约 3 行、可滚动选到末尾项；配置下拉 ≥3 项时同样行为。
6. 「选择目录」按钮仅 …，hover 显 title。

**发布：** 重新 electron-builder portable；确认 exe 内置 llama_params.yaml 为最新三段模板（验收一并检查）。

---

## 五、涉及文件清单

| 文件 | 动作 |
|------|------|
| src/modules/DirModule.vue | 修改（#1） |
| src/modules/TemplateModule.vue | 修改（#2） |
| src/modules/LaunchBar.vue | 修改（#6） |
| src/modules/TemplateModal.vue | 修改（#3/#4/#5/#7B/#8/#9D/#11） |
| src/style.css | 修改（#12 滚动条；modal 相关 class 微调） |
| src/ipc.ts、src-main/preload.ts、src-main/main.ts | 修改（open_file_dialog + get_params 面） |
| src-main/config.ts + config.test.ts | 修改/新增测试（ParamsFile 新段 + defaultParams） |
| src-main/build.ts + build.test.ts | 修改/新增测试（boolean/options 拼装） |
| dist-release 内置 llama_params.yaml | 随重新打包更新为最新模板 |

---

## 六、遗留说明（非决策点，仅记录）

- spec_type / load_mode 的完整枚举来自上游 master；用户当前编译版若只认部分值（如仅 none/draft-mtp），多余下拉项不影响启动器本身（拼装无强校验），按所选值透传即可。
- reasoning* 三项为用户自建环境参数，按原列表收录。