# 老用户配置静默迁移 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让老用户升级后，安装目录根下的 `lms_launcher.yaml` 与 `llama_launch_configs.yaml` 在首次启动时自动出现在 `configs/` 下，全程无日志、无提示。

**架构：** 新增 `src-main/config-migrate.ts`，在 `app.whenReady()` 最早段（建 `configs/` 之后、`initI18n()` 之前）逐文件把根目录的两份用户 yaml 搬进 `configs/`：目标已存在则以 `configs/` 为准、什么都不做；搬移用 `renameSync`，失败退到 `copyFileSync` 并保留原件。每个文件搬成功后在 `configs/lms_launcher.yaml` 里写自己的标记（`AppConfig.configs_migrated`，进 `appConfigLoad` 白名单），因此只跑一次，失败那份下次只重试它。`main.ts` 只加一行调用。

**技术栈：** TypeScript、Electron 28、Vitest（node 环境）、YAML（`yaml` 包）。

**设计规格：** 每个决策的编号（M1-M13）与行为规格场景编号（§4-1…10）见 `docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md`。实现若与规格冲突，以规格为准并停下询问。

---

## 参考文档

- 设计规格：`docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md`
- 相关代码：`src-main/main.ts`（`dataDir` / `configDir` / `yamlPaths` / `whenReady`）、`src-main/config.ts`（`AppConfig` / `appConfigLoad` / `appConfigSave`）、`src-main/test-utils.ts`

## 文件结构

**创建**

| 文件 | 职责 |
|------|------|
| `src-main/config-migrate.ts` | 存量迁移的唯一实现：判定、搬移、写标记；对外不抛异常 |
| `src-main/config-migrate.test.ts` | 规格 §4 全部场景的可执行守卫（含注入 deps 覆盖兜底分支） |
| `docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md` | 设计规格（已完成） |
| `docs/superpowers/plans/2026-10-08-legacy-config-migration.md` | 本实现计划 |

**修改**

| 文件 | 改动 |
|------|------|
| `src-main/config.ts` | `AppConfig` 增可选字段 `configs_migrated`；`appConfigLoad` 白名单透传该字段 |
| `src-main/config.test.ts` | 新增一条「标记能往返且能在增量保存中存活」的用例（守 M7） |
| `src-main/main.ts` | 导入并在 `whenReady` 内调用 `migrateLegacyConfigs(dataDir(), configDir())`；修订 `configDir()` 上方注释 |
| `scripts/lms-launcher-update.ps1` | 修订头部注释：根目录遗留的两份用户 yaml 由应用首次启动时搬入 `configs/` |

**不动**

`.gitignore`、`electron-builder.yml`、`src/**`、`src-main/i18n/**`、`README.md`、`configs/llama_params.yaml`。

---

## 任务 1：`configs_migrated` 进 `AppConfig` 白名单

**文件：** 修改 `src-main/config.ts`、`src-main/config.test.ts`

- [ ] **步骤 1：写失败测试**

在 `src-main/config.test.ts` 的 `vram_total_gb_absent_in_legacy_yaml` 用例之后追加：

```ts
  // 存量迁移标记（2026-10-08 spec M7）：必须能往返，且能在任何增量保存路径中存活
  it('configs_migrated_round_trips_and_survives_incremental_saves', () => {
    const p = tmpPath('app_migrated.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', configs_migrated: { lms_launcher: true } });
    expect(appConfigLoad(p).configs_migrated).toEqual({ lms_launcher: true });
    saveLlamaDir(p, '/y'); // 所有生产写入点都是 load → 改 → save，白名单漏了就在这里暴露
    expect(appConfigLoad(p).configs_migrated).toEqual({ lms_launcher: true });
    expect(appConfigLoad(p).llama_dir).toBe('/y');
    rm(p);
  });

  it('configs_migrated_absent_when_never_written', () => {
    const p = tmpPath('app_migrated_absent.yaml');
    rm(p);
    writeText(p, 'llama_dir: d:\\n');
    expect(appConfigLoad(p).configs_migrated).toBeUndefined();
    rm(p);
  });
```

- [ ] **步骤 2：运行确认失败**

`npx vitest run src-main/config.test.ts` → 预期编译期报错（`configs_migrated` 不在 `AppConfig` 上）或用例失败。

- [ ] **步骤 3：实现**

`src-main/config.ts` 在 `AppConfig` 之前新增类型，并在接口末尾加字段：

```ts
// 存量迁移标记（2026-10-08）：见 docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md §5。
// 只有 config-migrate.ts 读写它；业务代码不得据此做任何判断。
export interface MigratedFlags {
  lms_launcher?: boolean;
  llama_launch_configs?: boolean;
}
```

```ts
export interface AppConfig {
  llama_dir: string;
  vram_total_gb?: number;
  proxy?: ProxyConfig;
  update?: LlamaUpdateConfig;
  /** i18n（spec §3.4）：用户选择的语言；缺省 = 跟随系统。 */
  language?: 'zh' | 'en';
  /** 存量迁移标记（2026-10-08）：缺字段 = 未迁移，下次启动重试对应文件。 */
  configs_migrated?: MigratedFlags;
}
```

`appConfigLoad` 的返回对象末尾加一行（白名单，否则下一次保存即被 `appConfigSave` 抹掉）：

```ts
      language: parsed?.language,
      configs_migrated: parsed?.configs_migrated,
```

- [ ] **步骤 4：运行确认通过**

`npx vitest run src-main/config.test.ts` → 全绿。未设置该字段的用户 yaml 不会被写入空键（`yaml.stringify` 省略 `undefined`，已实测）。

- [ ] **步骤 5：提交**

`git add src-main/config.ts src-main/config.test.ts && git commit -m "feat(config): AppConfig 增加存量迁移标记字段"`

---

## 任务 2：`config-migrate.ts` 主路径

**文件：** 创建 `src-main/config-migrate.ts`、`src-main/config-migrate.test.ts`

- [ ] **步骤 1：写失败测试（主路径 + 冲突 + 空目录 + 参数表不动）**

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { migrateLegacyConfigs } from './config-migrate';
import { appConfigLoad } from './config';
import { tmpPath, rm, writeText, mkDir, jp } from './test-utils';

// 老用户存量迁移（2026-10-08）：行为规格见 docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md §4
const APP_YAML = 'lms_launcher.yaml';
const TPL_YAML = 'llama_launch_configs.yaml';

/** 旧布局夹具：root = <dataDir>；withCfgDir=false 时连 configs/ 都不存在（§4-4） */
function legacyRoot(name: string, withCfgDir = true): { root: string; cfg: string } {
  const root = tmpPath(name);
  rm(root);
  mkDir(root);
  const cfg = jp(root, 'configs');
  if (withCfgDir) mkDir(cfg);
  return { root, cfg };
}

describe('config-migrate.ts', () => {

  it('moves_both_legacy_files_and_marks_each', () => { // §4-1
    const { root, cfg } = legacyRoot('mig_both');
    writeText(jp(root, APP_YAML), 'llama_dir: D:\\llama.cpp
language: zh
');
    writeText(jp(root, TPL_YAML), 'tpl_a:
  values:
    m: x
');
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(jp(root, APP_YAML))).toBe(false);
    expect(existsSync(jp(root, TPL_YAML))).toBe(false);
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe('tpl_a:
  values:
    m: x
');
    const moved = appConfigLoad(jp(cfg, APP_YAML));
    expect(moved.llama_dir).toBe('D:\\llama.cpp');
    expect(moved.language).toBe('zh'); // 标记写入不得丢掉既有字段
    expect(moved.configs_migrated).toEqual({ lms_launcher: true, llama_launch_configs: true });
    rm(root);
  });

  it('existing_target_wins_and_nothing_is_touched', () => { // §4-2 / M2
    const { root, cfg } = legacyRoot('mig_conflict');
    writeText(jp(root, APP_YAML), 'llama_dir: OLD
');
    writeText(jp(cfg, APP_YAML), 'llama_dir: NEW
');
    writeText(jp(root, TPL_YAML), 'tpl_root:
  values: {}
');
    writeText(jp(cfg, TPL_YAML), 'tpl_cfg:
  values: {}
');
    migrateLegacyConfigs(root, cfg);
    expect(readFileSync(jp(root, APP_YAML), 'utf8')).toBe('llama_dir: OLD
');
    expect(readFileSync(jp(cfg, APP_YAML), 'utf8')).toBe('llama_dir: NEW
');
    expect(readFileSync(jp(root, TPL_YAML), 'utf8')).toBe('tpl_root:
  values: {}
');
    expect(appConfigLoad(jp(cfg, APP_YAML)).configs_migrated).toBeUndefined(); // 没搬东西就不写标记（M9）
    rm(root);
  });

  it('nothing_to_migrate_creates_no_files', () => { // §4-3 / M9
    const { root, cfg } = legacyRoot('mig_empty');
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(jp(cfg, APP_YAML))).toBe(false);
    expect(existsSync(jp(cfg, TPL_YAML))).toBe(false);
    rm(root);
  });

  it('root_llama_params_yaml_is_never_touched', () => { // §4-10 / M4
    const { root, cfg } = legacyRoot('mig_params');
    writeText(jp(root, 'llama_params.yaml'), 'params: {}
required: []
');
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(jp(root, 'llama_params.yaml'))).toBe(true);
    expect(existsSync(jp(cfg, 'llama_params.yaml'))).toBe(false);
    rm(root);
  });

  it('creates_configs_dir_when_missing', () => { // §4-4
    const { root, cfg } = legacyRoot('mig_nodir', false);
    expect(existsSync(cfg)).toBe(false);
    writeText(jp(root, TPL_YAML), 'tpl_a:
  values: {}
');
    migrateLegacyConfigs(root, cfg);
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe('tpl_a:
  values: {}
');
    // 只为承载标记而新建 app config：规格 §5 已声明该行为
    expect(appConfigLoad(jp(cfg, APP_YAML)).configs_migrated).toEqual({ llama_launch_configs: true });
    rm(root);
  });
});
```

- [ ] **步骤 2：运行确认失败**

`npx vitest run src-main/config-migrate.test.ts` → 预期 `Cannot find module './config-migrate'`。

- [ ] **步骤 3：实现**

`src-main/config-migrate.ts` 全文：

```ts
// 老用户存量迁移（2026-10-08）：把 <dataDir>/ 根下的两份用户 yaml 静默搬进 <dataDir>/configs/。
// 规格：docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md
// 契约：不写日志、不弹提示、不抛异常；逐文件独立，失败那份下次启动只重试它。
import { copyFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { appConfigLoad, appConfigSave } from './config';
import type { MigratedFlags } from './config';

// 可注入的文件系统动作：Windows 上无法用真实文件系统稳定触发 rename 失败，兜底分支只能靠注入测（M12）
type MoveDeps = { move: (from: string, to: string) => void; copy: (from: string, to: string) => void };
const REAL_DEPS: MoveDeps = { move: renameSync, copy: copyFileSync };

// 迁移清单：name = 文件名，key = configs_migrated 里的标记键（M8）。llama_params.yaml 不在列（M4）
const LEGACY_FILES: { name: string; key: keyof MigratedFlags }[] = [
  { name: 'lms_launcher.yaml', key: 'lms_launcher' },
  { name: 'llama_launch_configs.yaml', key: 'llama_launch_configs' },
];

function isPlainFile(p: string): boolean {
  try { return statSync(p).isFile(); } catch { return false; }
}

// 标记写在 configs/lms_launcher.yaml。appConfigLoad 宽松不抛，这里只防 appConfigSave 写盘失败（§4-8）
function markMigrated(appCfgPath: string, key: keyof MigratedFlags): void {
  try {
    const cfg = appConfigLoad(appCfgPath);
    const flags: MigratedFlags = { ...cfg.configs_migrated };
    flags[key] = true;
    appConfigSave(appCfgPath, { ...cfg, configs_migrated: flags });
  } catch { /* 标记写不进去 → 下次启动重跑；因目标已存在，重跑是 no-op */ }
}

export function migrateLegacyConfigs(rootDir: string, cfgDir: string, deps: MoveDeps = REAL_DEPS): void {
  const appCfgPath = join(cfgDir, 'lms_launcher.yaml');
  for (const f of LEGACY_FILES) {
    const from = join(rootDir, f.name);
    const to = join(cfgDir, f.name);
    if (!isPlainFile(from)) continue;              // 不存在，或同名是目录 → 跳过（§4-3/§4-7）
    if (existsSync(to)) continue;                 // 以 configs/ 为准，根目录残留不动（M2）
    try { mkdirSync(cfgDir, { recursive: true }); } catch { /* 建目录失败 → 下面搬移必失败，走失败分支 */ }
    try {
      deps.move(from, to);
    } catch {
      try { deps.copy(from, to); } catch { continue; } // 两种手段都失败 → 本次放弃，不写标记（M6）
    }
    if (!isPlainFile(to)) continue;
    markMigrated(appCfgPath, f.key);
  }
}
```

- [ ] **步骤 4：运行确认通过**

`npx vitest run src-main/config-migrate.test.ts` → 全绿。

- [ ] **步骤 5：提交**

`git add src-main/config-migrate.ts src-main/config-migrate.test.ts && git commit -m "feat(config): 根目录两份用户 yaml 静默迁移到 configs 目录"`

---

## 任务 3：兜底与部分失败（注入 deps）

**文件：** 修改 `src-main/config-migrate.test.ts`

- [ ] **步骤 1：补三条用例**

在 `describe` 末尾追加（顶部 import 补 `copyFileSync`、`renameSync`）：

```ts
  it('rename_failure_falls_back_to_copy_and_keeps_original', () => { // §4-5 / M3
    const { root, cfg } = legacyRoot('mig_copy');
    writeText(jp(root, TPL_YAML), 'tpl_a:
  values: {}
');
    migrateLegacyConfigs(root, cfg, {
      move: () => { throw new Error('EBUSY'); },
      copy: copyFileSync,
    });
    expect(existsSync(jp(root, TPL_YAML))).toBe(true); // 兜底保留原件
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe('tpl_a:
  values: {}
');
    expect(appConfigLoad(jp(cfg, APP_YAML)).configs_migrated).toEqual({ llama_launch_configs: true });
    rm(root);
  });

  it('both_moves_fail_is_silent_and_other_file_still_migrates', () => { // §4-6 / M6「各写各的」
    const { root, cfg } = legacyRoot('mig_partial');
    writeText(jp(root, APP_YAML), 'llama_dir: OLD
');
    writeText(jp(root, TPL_YAML), 'tpl_a:
  values: {}
');
    migrateLegacyConfigs(root, cfg, {
      move: (from: string, to: string) => { if (from.endsWith(APP_YAML)) throw new Error('EPERM'); renameSync(from, to); },
      copy: () => { throw new Error('EPERM'); },
    });
    expect(existsSync(jp(root, APP_YAML))).toBe(true);   // 失败那份留在原位，下次重试
    expect(readFileSync(jp(root, APP_YAML), 'utf8')).toBe('llama_dir: OLD
');
    expect(existsSync(jp(cfg, TPL_YAML))).toBe(true);    // 另一份照常
    expect(appConfigLoad(jp(cfg, APP_YAML)).configs_migrated).toEqual({ llama_launch_configs: true });
    rm(root);
  });

  it('directory_at_legacy_path_is_skipped', () => { // §4-7
    const { root, cfg } = legacyRoot('mig_isdir');
    mkDir(jp(root, APP_YAML));
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(jp(cfg, APP_YAML))).toBe(false);
    expect(appConfigLoad(jp(cfg, APP_YAML)).configs_migrated).toBeUndefined();
    rm(root);
  });

  it('second_run_is_a_noop', () => { // §4-9
    const { root, cfg } = legacyRoot('mig_twice');
    writeText(jp(root, APP_YAML), 'llama_dir: D:\\llama.cpp
');
    writeText(jp(root, TPL_YAML), 'tpl_a:
  values: {}
');
    migrateLegacyConfigs(root, cfg);
    const app1 = readFileSync(jp(cfg, APP_YAML), 'utf8');
    const tpl1 = readFileSync(jp(cfg, TPL_YAML), 'utf8');
    migrateLegacyConfigs(root, cfg);
    expect(readFileSync(jp(cfg, APP_YAML), 'utf8')).toBe(app1);
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe(tpl1);
    rm(root);
  });
```

- [ ] **步骤 2：运行**

`npx vitest run src-main/config-migrate.test.ts` → 全绿。若某条与实现不符，按规格 §4 判定哪一侧错，不要改规格迁就实现。

- [ ] **步骤 3：提交**

`git add src-main/config-migrate.test.ts && git commit -m "test(config): 覆盖迁移兜底与部分失败不写标记"`

---

## 任务 4：`main.ts` 接线

**文件：** 修改 `src-main/main.ts`

- [ ] **步骤 1：加 import**

在 `import { … } from './config';` 之后加一行：

```ts
import { migrateLegacyConfigs } from './config-migrate';
```

- [ ] **步骤 2：修订 `configDir()` 上方注释（第 74-76 行）**

```ts
// 配置目录（2026-10-06）：三份 yaml 统一收纳在 <dataDir>/configs/ 下。
// llama_params.yaml 随包分发（electron-builder extraFiles），另两份为运行时用户数据。
// 老用户升级时根目录遗留的两份用户 yaml 由 config-migrate.ts 在 whenReady 最早段静默搬入（2026-10-08）。
```

- [ ] **步骤 3：在 `whenReady` 内插入调用（现第 970-971 行之间）**

```ts
  // configs/ 兜底（2026-10-06）：随包已带该目录；用户误删后在此补建，否则后续保存会 ENOENT
  try { mkdirSync(configDir(), { recursive: true }); } catch { /* 建目录失败由后续读写报错暴露 */ }
  // 老用户存量迁移（2026-10-08）：根目录两份用户 yaml 静默搬进 configs/，无日志无提示、不抛异常。
  // 顺序硬要求：必须在 initI18n() 之前——language 就在 lms_launcher.yaml 里（spec §6）。
  migrateLegacyConfigs(dataDir(), configDir());
  initI18n(); // i18n（spec §3.3）：主进程为语言权威，whenReady 最先解析（须在托盘/日志文案使用前）
```

- [ ] **步骤 4：类型检查**

`npx tsc -p tsconfig.main.json --noEmit` → 无错误。

- [ ] **步骤 5：提交**

`git add src-main/main.ts && git commit -m "feat(main): 启动最早段执行老用户配置迁移"`

---

## 任务 5：更新脚本注释同步

**文件：** 修改 `scripts/lms-launcher-update.ps1`（仅注释，无逻辑改动）

- [ ] **步骤 1：修订头部第 4-6 行**

```powershell
#       校验关键条目 → 全量覆盖 installDir（2026-10-06 起 zip 内含 configs/llama_params.yaml，
#       解压即完成参数表升级；configs/ 下另两份 yaml 与 downloads 不进 zip，用户数据不受影响。
#       覆盖只写不删，故 2026-10-06 之前版本遗留在 installDir 根的两份用户 yaml 由新版应用
#       首次启动时静默搬入 configs/ —— 本脚本不做任何配置迁移）→
```

- [ ] **步骤 2：语法自检**

`powershell -NoProfile -Command "[void][System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw scripts/lms-launcher-update.ps1), [ref]$null)"` → 无解析错误。

- [ ] **步骤 3：提交**

`git add scripts/lms-launcher-update.ps1 && git commit -m "docs(scripts): 说明根目录遗留配置由应用启动时迁移"`

---

## 任务 6：全量验证与交接

- [ ] **步骤 1：全量测试**

`npm test` → 全部用例通过（含既有 `config.test.ts`、`i18n`、前端各模块）。若有失败，修到绿，不得跳过或改断言。

- [ ] **步骤 2：确认无越界改动**

`git status --short` 与 `git diff --stat` 只应包含本计划「文件结构」列出的文件；`.gitignore`、`electron-builder.yml`、`src/**`、`configs/**` 必须无改动。

- [ ] **步骤 3：交用户手工验收（不由代理执行）**

告知用户以下两件事，等其确认：

1. **真机旧布局验收**：在其现有安装目录（有根目录 `lms_launcher.yaml` / `llama_launch_configs.yaml` 的那种）启动新版一次，确认：根两份文件消失、`configs/` 下出现同名文件、模板列表与语言选择仍在、`configs/lms_launcher.yaml` 里出现 `configs_migrated` 两行；再启动一次，确认没有任何变化。
2. **dev 仓库根目录清理**（用户自己处理，见规格 §7）：手动删除 dev 根目录残留的 yaml；是否给 `.gitignore` 补根路径规则由用户决定。

---

## 验收标准（全部满足才算完成）

- [ ] `npm test` 全绿，新增用例覆盖规格 §4 的场景 1-3、5-7、9-10。
- [ ] 迁移代码路径上没有任何 `emitLog`、`t()` 新文案、`dialog` 调用。
- [ ] `migrateLegacyConfigs` 的调用点位于 `initI18n()` 之前。
- [ ] 根目录 `llama_params.yaml` 在任何测试与真实场景下都不被读、搬、删。
- [ ] 未迁移用户的 `configs/lms_launcher.yaml` 中不出现 `configs_migrated` 空键。
