# 老用户配置静默迁移 · 设计文档

> 日期：2026-10-08 ｜ 状态：已批准（访谈定稿）｜ 实现计划：`docs/superpowers/plans/2026-10-08-legacy-config-migration.md`
>
> 本文**反转** `2026-10-06-configs-dir-and-fa-dropdown-design.md` 的 P4（「老用户迁移：不做」）。该文档其余决策（P1/P2/P3/P5/P6、S1-S6、打包链路）不变；旧文档已被「清理旧文档」提交删除，按编号引用仅为追溯。
>
> 同日早先版本（引入 `AppConfig.configs_migrated` 标记、「只跑一次」）**已删除并被本方案取代**，差异见 §3 末的反转记录。

## 1. 背景（均为代码事实）

| 事实 | 证据 |
|------|------|
| 三份 yaml 的读取路径统一由 `yamlPaths()` 构造，指向 `<dataDir>/configs/` | `src-main/main.ts:77-80` |
| 更新脚本把整包解压后**全量覆盖**安装目录，只覆盖、不删除 | `scripts/lms-launcher-update.ps1:161` 的 `Copy-Item … -Destination $InstallDir -Recurse -Force` |
| 因此老用户升级后，安装目录根仍留有 `lms_launcher.yaml`、`llama_launch_configs.yaml`、`llama_params.yaml` 三份旧文件，且不再被任何代码读取 | 同上；zip 只含 `configs/llama_params.yaml` |
| `configs/llama_params.yaml` 随包分发并被强制覆盖，是受控资产、唯一真相源 | `electron-builder.yml:22-23` 的 `extraFiles` |
| 启动最早期的顺序是「兜底建 `configs/` → 读 `lms_launcher.yaml` 取语言」 | `src-main/main.ts:968-971` |
| `appConfigLoad` 宽松：文件缺失或 yaml 坏 → 回落 `{llama_dir: ''}`，不抛 | `src-main/config.ts:55-70` |

问题：2026-10-06 的路径收敛明确「不做迁移」，老用户升级后配置直接重置为空——llama 目录、全部模板、语言选择一并丢失，且根目录还留着三份看起来像生效配置的旧文件。

## 2. 目标与非目标

**目标**

- 老用户升级后，根目录的 `lms_launcher.yaml` 与 `llama_launch_configs.yaml` 自动出现在 `configs/` 下，内容字节不变，配置与模板零丢失。
- 全程**静默**：无日志、无提示、无新文案、不抛异常。
- **无状态**：不引入任何标记字段或新配置文件，判据只有文件存在性。
- 覆盖所有升级路径：应用内更新、用户手动下载新包解压覆盖、回滚旧版后再升级。

**非目标（明确不做）**

- 不读、不搬、不删根目录的 `llama_params.yaml`——参数表由随包解压覆盖到 `configs/`，根残留留着无害。
- 不做字段级合并、不做 mtime 比较、不猜「哪份更新」。
- 两边都有同名文件时不删、不改名、不覆盖根目录那份。
- 不改 `config.ts`（`AppConfig`、`appConfigLoad` 白名单、`appConfigSave` 全部不动）、不改 `yamlPaths()`、不改打包配置、不改前端、不改 `.gitignore`。
- 不在更新脚本里做迁移（应用侧一处即可覆盖全部路径）。

## 3. 决策记录

访谈（grill-me）逐项定稿。

| 编号 | 决策 | 结论 |
|------|------|------|
| S1 | 触发判据 | **纯文件存在性**：`configs/<F>` 不存在 **且** 根目录 `<F>` 是普通文件 → 搬。除此之外没有任何状态；`config.ts` 一行都不改 |
| S2 | 两边都有 | 以 `configs/` 为准，根目录那份**不动**（不删、不改名、不覆盖） |
| S3 | 搬移手段 | `renameSync` 优先（同目录内原子）；抛错则 `copyFileSync` 兜底并**保留**根目录原件；两者都失败 → 本次放弃，下次启动重试 |
| S4 | 根目录 `llama_params.yaml` | **完全不动**，任何场景下不读不搬不删 |
| S5 | 代码落点 | 新建 `src-main/config-migrate.ts` + `src-main/config-migrate.test.ts`；`main.ts` 只加一行调用（`main.ts` 无测试覆盖，逻辑必须放在可测模块里） |
| S6 | 可见性 | 不写日志、不弹提示、不新增 i18n 文案；`migrateLegacyConfigs` 对外**不抛异常**，任何失败都不阻断启动 |
| S7 | 测试策略 | 6 条：两份都搬成功、目标已存在则不动、两处皆无不创建文件、`llama_params.yaml` 永不动、`rename` 失败走 `copy` 兜底（夹具不带 `configs/`，顺带覆盖 §4-4）、两种手段都失败时静默。`rename`/`copy` 通过可注入 deps 替换（Windows 上无法用真实文件系统稳定触发 rename 失败）。§4-7（同名目录占位）不单列测试，由 `isPlainFile` 保证 |
| S8 | 文档 | 删除旧 spec/plan，同名重写（仅这两份文档互相引用，无外部断链） |
| S9 | 迁移位置与时序 | **主进程启动时**：`app.whenReady()` 内、`mkdirSync(configDir())` 之后、`initI18n()` 之前。dev 与打包态行为一致（不分 `app.isPackaged`）。更新脚本不参与 |

**反转记录（相对同日早先版本）**：`configs_migrated` 标记、「只跑一次」、`AppConfig` 白名单改动、`config.ts` 的两条测试**全部作废**。代价是：若用户主动删掉 `configs/` 里的某份配置，而根目录仍有该份残留（只会由 S3 的 copy 兜底留下），下次启动会被旧内容填回。接受——这条路径要求先发生一次 rename 失败，概率极低，换来的是零状态与零 schema 变更。

## 4. 行为规格

`rootDir = dataDir()`，`cfgDir = configDir()`；对 `F ∈ {lms_launcher.yaml, llama_launch_configs.yaml}` 逐个**独立**处理（一份失败不影响另一份）：

| # | 前置 | 结果 |
|---|------|------|
| 1 | 根有 `F`，`configs/F` 无 | 搬到 `configs/F`（内容字节一致），根文件消失 |
| 2 | 根有 `F`，`configs/F` 也有 | 什么都不做，两份文件都不动 |
| 3 | 两处都无 `F` | 什么都不做；不创建任何文件（含 `configs/` 目录本身）
| 4 | 根有 `F`，`configs/` 目录不存在 | 先 `mkdirSync(cfgDir, {recursive:true})` 再搬 |
| 5 | `renameSync` 抛错（被占用等） | `copyFileSync` 兜底：`configs/F` 就位、**根原件保留** |
| 6 | `rename` 与 `copy` 都抛错 | 不抛异常、不留半成品；另一份照常处理 |
| 7 | 根目录 `F` 位置是目录而非文件 | 跳过（`statSync().isFile()` 判定），不在 `configs/` 下产生任何东西 |
| 8 | 每次启动都执行（无标记） | 无副作用：只有场景 1 会动手，其余全是 `stat`/`exists` 只读判定（微秒级） |
| 9 | 根目录 `llama_params.yaml` | 任何场景下都不读、不搬、不删 |

搬移**不校验** yaml 内容合法性：坏 yaml 照搬，读取层已有各自的宽松/报错语义（`appConfigLoad` 回落默认、`configsLoad` 抛 `YAML:`），迁移层不越权。

## 5. 数据契约

**无新增字段、无新增文件。** `AppConfig`、`appConfigLoad` 白名单、`appConfigSave`、以及 `get_app_config` 的返回结构全部不变。

## 6. 顺序约束（实现必须遵守）

1. `mkdirSync(configDir(), {recursive:true})`（既有兜底）→ 2. `migrateLegacyConfigs(dataDir(), configDir())` → 3. `initI18n()` → 4. `configsBackfillDefaults`。

迁移若排在 `initI18n()` 之后：语言、`llama_dir`、模板全部读不到（`appConfigLoad` 缺失即回落默认），且随后任何一次设置保存都会在 `configs/` 下新建一份空配置，把老配置永久孤立。

## 7. 交接给用户的手动事项（不在本次实现范围）

- dev 仓库根目录当前**没有**残留的用户 yaml（已核实），无需清理；若日后出现，由用户手动删除。`.gitignore` 本次不补根路径规则。
- 真机旧布局验收由用户在其现有安装目录上手工做（升级一次，确认配置与模板仍在）。
