# 配置目录收敛与 -fa 下拉化 · 设计文档

> 日期：2026-10-06 ｜ 状态：已批准（访谈定稿）｜ 实现计划：`docs/superpowers/plans/2026-10-06-configs-dir-and-fa-dropdown.md`

## 1. 背景

现状（均为代码事实）：

| 事实 | 证据 |
|------|------|
| 三份 yaml 位于 `<dataDir>` 根目录 | `src-main/main.ts:74-77` 的 `yamlPaths()` |
| 参数表由代码内置生成，仅在文件缺失时写盘 | `paramsLoad` → `defaultParams()`（`src-main/config.ts:76-90`、`184-219`） |
| 参数表已存在时只校验、不更新 | 同上；老用户永远拿不到新增 flag |
| `-fa` 是普通文本参数，弹窗渲染为输入框 | `llama_params.yaml` 的 `params.fa`；`TemplateModal.vue` 的 `rows` 按类型推导 |
| llama-server 的 `-fa` 接受 on/off/auto | 实测 `llama-server.exe --help`：`-fa, --flash-attn [on\|off\|auto]`（默认 auto） |
| 弹窗完全由参数表驱动渲染 | `get_params` → `paramsLoad` → `TemplateModal.vue` 的 `rows` |
| 老版本会在根目录留下运行时生成的 `llama_params.yaml` | `dist-release/win-unpacked/llama_params.yaml` 的时间戳比同目录 exe 晚 1 分钟 |

由此有两个问题：

1. **加一个 flag 要改两处**：代码里的 `defaultParams()` 与用户目录里的 `llama_params.yaml`，且后者永不更新。
2. **`-fa` 允许自由文本**：用户可写入 llama-server 不认识的值，启动即失败。

## 2. 目标与非目标

**目标**

- 三份 yaml 统一收纳到 `<dataDir>/configs/`，所有读写路径随之迁移。
- `configs/llama_params.yaml` 成为仓库受控资产与**唯一真相源**：新增 flag 只改这一个文件。
- 该文件随打包分发到 `win-unpacked/configs/`，随 release zip 覆盖安装目录中的同名文件，用户解压即完成参数表升级。
- `-fa` 改为下拉，选项 `auto / on / off`。

**非目标（明确不做）**

- 不做任何老配置迁移、兼容或提示；根目录遗留文件不搬、不改名、不删除、不打日志。
- 不处理发布包卫生（由「全量清理 → build.bat → 直接打 zip、不运行」的人工流程保证）。
- 不改 `tplModal.tip.fa` 文案，不做下拉选项的中文化。
- 不修「模板存 `fa: true` 且不打开弹窗直接启动 → 拼出 `-fa true`」这一既有问题（归一化只在弹窗回显层生效）。
- 不为 `-fa` 在 `buildArgVector` 里开特例。

## 3. 决策记录

访谈（grill-me）逐项定稿，含中途反转入档。

### 3.1 配置目录

| 编号 | 决策 | 结论 |
|------|------|------|
| P1 | 路径 | 三份 yaml 统一放入 `<dataDir>/configs/`；改动集中在 `yamlPaths()` 一处，25+ 调用点零改动 |
| P2 | 目录兜底 | 启动早期 `mkdirSync(configDir(), { recursive: true })` |
| P3 | 文件角色 | `configs/llama_params.yaml` = 仓库受控资产 + 唯一真相源；另两份 = 运行时用户数据 |
| P4 | 老用户迁移 | **不做**（反转为「当做全新处理」）。根目录遗留文件不搬、不改名、不删除、不打日志；老用户升级后配置重置为空 |
| P5 | `.gitignore` | 移除根路径三条旧规则，改为 `configs/lms_launcher.yaml` 与 `configs/llama_launch_configs.yaml` 两条；`configs/llama_params.yaml` 进版本管理 |
| P6 | 发布包卫生 | 不处理 |

### 3.2 参数表与 `-fa`

| 编号 | 决策 | 结论 |
|------|------|------|
| S1 | `defaultParams()` | **彻底删除**；`paramsLoad` 缺文件抛 `MISSING`。代码中不再有第二份参数表 |
| S2 | `fa` 选项 | 进 `params_options`，顺序 `auto / on / off`；新建与编辑默认 `auto`，保存写 `fa: auto`；已存合法值（含 `off`）原样保留 |
| S3 | 存量值归一 | 仅在弹窗回显层（`fill()`）归一，不写回 yaml |
| S4 | 命令行 | 统一带值 `-fa auto` / `-fa on` / `-fa off`；`buildArgVector` 与 `summarize` 零改动 |
| S5 | 文案 | `tplModal.tip.fa` 中英文案不动；下拉 label 保持英文小写 |
| S6 | 安全网 | 参数表缺失时前端**显式报错并禁用新建/编辑**，避免存出没有 `-m` 的坏模板 |

### 3.3 打包链路

| 编号 | 决策 | 结论 |
|------|------|------|
| B1 | `extraFiles` | 增 `from: configs/llama_params.yaml` → `to: configs/llama_params.yaml` |
| B2 | 更新脚本注释 | 修订 `scripts/lms-launcher-update.ps1` 第 4 行的「zip 不含 yaml」表述 |

## 4. 架构

### 4.1 路径解析

```text
dataDir()                     打包后 = exe 所在目录；dev = 项目根目录
└── configs/                  三份 yaml 的唯一落点
    ├── lms_launcher.yaml        运行时用户数据（gitignore）
    ├── llama_launch_configs.yaml 运行时用户数据（gitignore）
    └── llama_params.yaml        仓库受控资产（进版本管理 + 随包分发）
```

`yamlPaths()` 是唯一构造路径的函数，返回 `[app, params, templates]` 三个**完整路径**，因此调用点全部无需改动。

### 4.2 配置驱动链路

`configs/llama_params.yaml` → `paramsLoad()` → IPC `get_params` → `TemplateModal.vue` 的 `rows`。

`rows` 由参数表的四个区块推导，前端不含任何参数清单：

| 区块 | 渲染形态 |
|------|----------|
| `params` | 行的集合（key → flag） |
| `params_options` | 下拉（Dropdown），默认选中该键的**首项** |
| `params_boolean` | true/false 下拉，`false` 不写入 yaml |
| `params_file` | 输入框右侧追加「选择文件」按钮 |
| `params_default` | 新建模板自动预填的默认值 |

### 4.3 打包与升级链路

```text
electron-builder extraFiles → dist-release/win-unpacked/configs/llama_params.yaml
        ↓ scripts/package-zip.ps1（全量拷贝 win-unpacked）
release zip（内含 configs/llama_params.yaml）
        ↓ 用户解压覆盖        或        lms-launcher-update.ps1 的 Copy-Item -Recurse -Force（合并式）
安装目录/configs/llama_params.yaml（参数表升级完成，用户数据不受影响）
```

## 5. 行为规格

### 5.1 参数表缺失

`paramsLoad` 在文件不存在时抛 `MISSING: <err.config.paramsMissing>`，不再创建文件。

- 主进程：`get_params`、`save_config`、`start_server` 均随之失败并原样透传错误。
- 模板卡片：显示专用错误文案 `tpl.paramsMissing`，并禁用「新建」「编辑」按钮。
- **不禁用「复制」**：复制不经弹窗、值是既有合法值的拷贝，不产生新的坏模板风险。

### 5.2 `-fa` 取值归一（仅回显层）

对存量模板中的 `fa` 值，按序判定，返回枚举中的规范值：

| 输入（trim + 小写后） | 输出 |
|----------------------|------|
| `auto` / `on` / `off`（大小写不敏感） | 枚举中的规范小写值 |
| `true` / `1` / `yes` | `on` |
| `false` / `0` / `no` | `off` |
| 其他任意值 | 首项 `auto` |

归一结果**不写回 yaml**，仅影响弹窗回显；用户点保存后才以规范值落盘。

### 5.3 命令行

三个取值一律带值拼接：`-fa auto`、`-fa on`、`-fa off`。`buildArgVector` 的既有分支（boolean 特判 + `flag, quoted(value)`）无需改动。

### 5.4 老用户

升级后 `configs/` 中不存在用户数据文件，表现为：llama 目录未配置、无模板、语言回落系统语言、代理与 VRAM 未设置。根目录旧文件原样保留但不被读取。

## 6. 风险与取舍

| 风险 | 影响 | 处理 |
|------|------|------|
| 删除 `defaultParams()` 后缺文件即不可用 | 漏打包或用户误删 → 模板功能不可用 | 5.1 的显式报错 + 禁用，避免静默写出坏模板 |
| 老用户配置重置 | 需重新配置 | 已确认接受（P4） |
| 归一化只在回显层 | 未打开弹窗直接启动仍可能发出 `-fa true` | 已确认接受（属既有问题，不恶化） |
| 仓库根遗留的旧 `llama_params.yaml` | 成为无人读取的死文件 | 实施时从工作区删除 |
| 便携单文件 exe 每次解压到临时目录 | 运行期写入丢失 | 只读使用，无影响 |

## 7. 验收标准

1. `npm test` 全绿，`npm run build`（vite + tsc）通过。
2. 仓库存在 `configs/llama_params.yaml`，其 `params_options.fa` 为 `[auto, on, off]`。
3. 代码中不存在 `defaultParams`；`paramsLoad` 对缺失文件抛 `MISSING`。
4. 新建模板时 `-fa` 渲染为下拉且默认 `auto`；保存后 yaml 中 `fa: auto`。
5. 编辑模式：`fa: off` 回显 `off`；`fa: ON` 回显 `on`；`fa: false` 回显 `off`；`fa: <垃圾值>` 回显 `auto`。
6. 删除 `configs/llama_params.yaml` 后启动：模板卡片显示错误文案，「新建」「编辑」按钮禁用，「复制」仍可用。
7. `npx electron-builder --config electron-builder.yml --win portable` 后，`dist-release/win-unpacked/configs/llama_params.yaml` 存在。
