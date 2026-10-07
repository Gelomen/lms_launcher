# 老用户配置静默迁移 · 设计文档

> 日期：2026-10-08 ｜ 状态：已批准（访谈定稿）｜ 实现计划：`docs/superpowers/plans/2026-10-08-legacy-config-migration.md`
>
> 本文**反转** `2026-10-06-configs-dir-and-fa-dropdown-design.md` 的 P4（「老用户迁移：不做」）。该文档其余决策（P1/P2/P3/P5/P6、S1-S6、打包链路）不变。旧文档已被「清理旧文档」提交删除，此处按编号引用仅为追溯。

## 1. 背景（均为代码事实）

| 事实 | 证据 |
|------|------|
| 三份 yaml 的读取路径统一由 `yamlPaths()` 构造，指向 `<dataDir>/configs/` | `src-main/main.ts:76-80` |
| 更新脚本把整包解压后**全量覆盖**安装目录，只覆盖、不删除 | `scripts/lms-launcher-update.ps1` 的 `Copy-Item … -Destination $InstallDir -Recurse -Force` |
| 因此老用户升级后，安装目录根仍留有 `lms_launcher.yaml`、`llama_launch_configs.yaml`、`llama_params.yaml` 三份旧文件，且不再被任何代码读取 | 同上；zip 只含 `configs/llama_params.yaml` |
| `configs/llama_params.yaml` 随包分发并被强制覆盖，是受控资产、唯一真相源 | `electron-builder.yml` 的 `extraFiles`；`scripts/lms-launcher-update.ps1:4-5` |
| 启动最早期的顺序是「兜底建 `configs/` → 读 `lms_launcher.yaml` 取语言」 | `src-main/main.ts:970-971` |
| `appConfigLoad` 是**白名单式**读取，`appConfigSave` 用 `dump(cfg)` 全量重写 | `src-main/config.ts:55-73` |
| 所有生产写入点都是 load → 改 → save，因此白名单内的字段能在增量保存中存活 | `src-main/config.ts:191/202/209`、`src-main/main.ts:245/445/950` |
| `yaml.stringify` 省略值为 `undefined` 的键，未迁移的用户 yaml 不会被写入空字段 | 实测：`stringify({llama_dir:'', configs_migrated: undefined})` → `llama_dir: ""` |
| 渲染端用内联结构类型读 `get_app_config`，不与主进程共享 `AppConfig` 类型 | `src/modules/DirModule.vue:26`、`src/modules/TemplateModule.vue:29` |

问题：2026-10-06 的路径收敛明确「不做迁移」，老用户升级后配置直接重置为空——llama 目录、全部模板、语言选择一并丢失，且根目录还留着三份看起来像生效配置的旧文件。

## 2. 目标与非目标

**目标**

- 老用户升级后，根目录的 `lms_launcher.yaml` 与 `llama_launch_configs.yaml` 自动出现在 `configs/` 下，内容不变，配置与模板零丢失。
- 整个过程**静默**：无日志、无提示、无新文案。
- 迁移只发生一次（按文件各自判定），失败的那份下次启动自动重试。
- 覆盖所有升级路径：应用内更新、用户手动下载新包解压覆盖、回滚旧版后再升级。

**非目标（明确不做）**

- 不迁移、不删除、不改名根目录的 `llama_params.yaml`（参数表是随包强制覆盖的受控资产）。
- 不做字段级合并、不做 mtime 比较、不猜「哪份更新」。
- 不处理 `downloads/`、`lms_launcher_update.log` 等根目录其他产物。
- 不在更新脚本里做迁移（应用侧一处即可覆盖全部路径）。
- 不改 `yamlPaths()`、不改打包配置、不改前端。
- 不新增 i18n 文案，不新增日志桶。

## 3. 决策记录

访谈（grill-me）逐项定稿，含中途反转入档（M6 先选「每次启动都检查」，后反转为「只跑一次 + 写标记」）。

| 编号 | 决策 | 结论 |
|------|------|------|
| M1 | 迁移位置 | **主进程启动时**：`app.whenReady()` 内、`mkdirSync(configDir())` 之后、`initI18n()` 之前。更新脚本不参与。理由：一处覆盖全部升级路径；`language` 就在 `lms_launcher.yaml` 里，必须先搬再读 |
| M2 | 触发条件 | 仅当 `configs/<name>` 不存在**且**根目录 `<name>` 是普通文件时才搬。两边都有 → 以 `configs/` 为准，根目录那份**不动**（不删、不改名、不覆盖） |
| M3 | 搬移手段 | `renameSync` 优先（同目录内原子）；抛错则 `copyFileSync` 兜底并**保留**根目录原件；两者都失败 → 本次放弃，下次启动重试 |
| M4 | 根目录 `llama_params.yaml` | **完全不动** |
| M5 | 代码落点 | 新建 `src-main/config-migrate.ts` + `src-main/config-migrate.test.ts`；`main.ts` 只加一行调用（`main.ts` 无测试覆盖，逻辑必须放在可测模块里） |
| M6 | 执行时机 | **只跑一次**，按文件各写各的标记；失败那份不写标记 → 下次只重试它。（反转记录：先前选定「每次启动都检查」，因副作用「用户删掉 `configs/` 里的配置会被根目录残留填回」而反转） |
| M7 | 标记载体 | `AppConfig.configs_migrated`，进 `appConfigLoad` 白名单。不加白名单则任何一次配置保存都会抹掉标记，「只跑一次」只是偶然成立而非保证 |
| M8 | 标记结构 | 映射形式（不是序列套单键映射）：`configs_migrated: { lms_launcher: true, llama_launch_configs: true }`。天然支持「只成功一份」的中间态 |
| M9 | 无事可做时 | **不写标记**：全新安装不创建只含内部字段的 `lms_launcher.yaml`。代价是每次启动两次 `statSync`（微秒级） |
| M10 | dev 模式 | 不分 `app.isPackaged`，dev 与打包态行为一致。dev 仓库根目录的残留由用户手动删除（见 §7） |
| M11 | 静默边界 | 不写日志、不弹提示、不新增 i18n 文案；`migrateLegacyConfigs` 对外**不抛异常**，任何失败都不阻断启动 |
| M12 | 测试策略 | 主路径用真实临时文件测；`rename`/`copy` 通过可注入的 deps 替换，以覆盖「copy 兜底」与「异常不外抛」两条契约（Windows 上无法用真实文件系统稳定触发 rename 失败） |
| M13 | 验收分工 | 单测全绿由实现会话负责；真机旧布局演练由用户在其现有安装目录上手工做 |

## 4. 行为规格

`rootDir = dataDir()`，`cfgDir = configDir()`；对 `F ∈ {lms_launcher.yaml, llama_launch_configs.yaml}` 逐个独立处理：

| # | 前置 | 结果 |
|---|------|------|
| 1 | 根有 `F`，`configs/F` 无 | 搬到 `configs/F`（内容字节一致），根文件消失；`configs_migrated[对应键] = true` 写入 `configs/lms_launcher.yaml` |
| 2 | 根有 `F`，`configs/F` 也有 | 什么都不做；**不写标记**（以 `configs/` 为准，根残留不动） |
| 3 | 两处都无 `F` | 什么都不做；不创建任何文件、不写标记 |
| 4 | 根有 `F`，`configs/` 目录不存在 | 先 `mkdirSync(cfgDir, {recursive:true})` 再搬 |
| 5 | `renameSync` 抛错（被占用等） | `copyFileSync` 兜底：`configs/F` 就位、根原件保留；写标记 |
| 6 | `rename` 与 `copy` 都抛错 | 不抛异常、不写标记；另一份照常处理 |
| 7 | 根目录 `F` 位置是目录而非文件 | 跳过（`statSync().isFile()` 判定），不在 `configs/` 下产生任何东西 |
| 8 | 标记写盘失败 | 不影响已搬好的文件；下次启动重跑，因目标已存在 → 命中场景 2，无副作用 |
| 9 | 已带完整标记的老用户 | 两次 `statSync` 后直接返回（标记只用于跳过，不参与任何业务判断） |
| 10 | 根目录 `llama_params.yaml` | 任何场景下都不读、不搬、不删 |

搬移**不校验** yaml 内容合法性：坏 yaml 照搬，读取层已有各自的宽松/报错语义（`appConfigLoad` 回落默认、`configsLoad` 抛 `YAML:`），迁移层不越权。

## 5. 数据契约

`configs/lms_launcher.yaml` 新增可选字段：

```yaml
llama_dir: D:\llama.cpp
language: zh
configs_migrated:
  lms_launcher: true
  llama_launch_configs: true
```

```ts
export interface MigratedFlags {
  lms_launcher?: boolean;
  llama_launch_configs?: boolean;
}
export interface AppConfig {
  /* …既有字段不变… */
  configs_migrated?: MigratedFlags;
}
```

- **谁写**：只有 `config-migrate.ts`。**谁读**：只有 `config-migrate.ts`（判断是否已迁移）。业务代码不读它。
- **为何进白名单**：`appConfigSave` 全量重写，未列入 `appConfigLoad` 白名单的字段会在下一次配置保存时被抹掉。
- **用户删掉这个字段或整个文件**：下次启动重新尝试迁移；因目标已存在，命中场景 2，无副作用。
- **前端**：`get_app_config` 会把它透传给渲染端，但渲染端用内联结构类型只取 `llama_dir` / `vram_total_gb`，无影响。

## 6. 顺序约束（实现必须遵守）

1. `mkdirSync(configDir(), {recursive:true})`（既有兜底）→ 2. `migrateLegacyConfigs(dataDir(), configDir())` → 3. `initI18n()` → 4. `configsBackfillDefaults`。

迁移若排在 `initI18n()` 之后：语言、`llama_dir`、模板全部读不到（`appConfigLoad` 缺失即回落默认），且随后任何一次设置保存都会在 `configs/` 下新建一份空配置，把老配置永久孤立。

## 7. 交接给用户的手动事项（不在本次实现范围）

- dev 仓库根目录若残留 `lms_launcher.yaml` / `llama_launch_configs.yaml` / `llama_params.yaml`，由用户手动删除；dev 下后续一律在 `configs/` 里生成。
- `.gitignore` 当前只有 `configs/lms_launcher.yaml`、`configs/llama_launch_configs.yaml` 两条（第 19-20 行），根路径无对应规则；是否补规则由用户决定。
- 真机旧布局验收由用户在其现有安装目录上手工做（升级一次，确认配置与模板仍在）。
