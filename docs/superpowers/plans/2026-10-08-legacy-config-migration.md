# 老用户配置静默迁移 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让老用户升级后，安装目录根下的 `lms_launcher.yaml` 与 `llama_launch_configs.yaml` 在下次启动时自动出现在 `configs/` 下，全程无日志、无提示。

**架构：** 新增 `src-main/config-migrate.ts`，在 `app.whenReady()` 最早段（建 `configs/` 之后、`initI18n()` 之前）逐文件判定：`configs/` 下已有同名文件则以 `configs/` 为准、什么都不做；否则用 `renameSync` 把根目录那份搬过去，`rename` 失败退到 `copyFileSync` 并保留原件。**没有任何标记字段**——判据只有文件存在性，因此 `config.ts` 完全不改。`main.ts` 只加一行调用。

**技术栈：** TypeScript、Electron 28、Vitest（node 环境）。

**设计规格：** 每个决策的编号（S1-S9）与行为规格场景编号（§4-1…9）见 `docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md`。实现若与规格冲突，以规格为准并停下询问。

---

## 参考文档

- 设计规格：`docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md`
- 相关代码：`src-main/main.ts:69-88`（`dataDir` / `configDir` / `yamlPaths` / `initI18n`）、`src-main/main.ts:968-971`（`whenReady` 最早段）、`src-main/test-utils.ts`（`tmpPath` / `rm` / `writeText` / `mkDir` / `jp`）

## 文件结构

**创建**

| 文件 | 职责 |
|------|------|
| `src-main/config-migrate.ts` | 存量迁移的唯一实现：判定 + 搬移；无状态、对外不抛异常 |
| `src-main/config-migrate.test.ts` | 规格 §4 核心场景的可执行守卫（含注入 deps 覆盖兜底分支） |
| `docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md` | 设计规格（已完成） |
| `docs/superpowers/plans/2026-10-08-legacy-config-migration.md` | 本实现计划 |

**修改**

| 文件 | 改动 |
|------|------|
| `src-main/main.ts` | 导入并在 `whenReady` 内调用 `migrateLegacyConfigs(dataDir(), configDir())`；修订 `configDir()` 上方注释 |
| `scripts/lms-launcher-update.ps1` | 修订头部注释：根目录遗留的两份用户 yaml 由应用首次启动时搬入 `configs/` |

**不动**

`src-main/config.ts`（无字段、无白名单改动）、`.gitignore`、`electron-builder.yml`、`src/**`、`src-main/i18n/**`、`README.md`、`configs/llama_params.yaml`。

---

## 任务 1：`config-migrate.ts` 主路径

**文件：** 创建 `src-main/config-migrate.ts`、`src-main/config-migrate.test.ts`

- [ ] **步骤 1：写失败测试（搬移成功 / 冲突不动 / 无事可做 / 参数表不动）**

创建 `src-main/config-migrate.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { migrateLegacyConfigs } from './config-migrate';
import { tmpPath, rm, writeText, mkDir, jp } from './test-utils';

// 老用户存量迁移（2026-10-08）：行为规格见 docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md §4
const APP_YAML = 'lms_launcher.yaml';
const TPL_YAML = 'llama_launch_configs.yaml';
const PARAMS_YAML = 'llama_params.yaml';

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
  it('moves_both_legacy_files_byte_identical', () => { // §4-1
    const { root, cfg } = legacyRoot('mig_both');
    const appText = 'llama_dir: D:\\llama.cpp\nlanguage: zh\n';
    const tplText = 'tpl_a:\n  values:\n    m: x\n';
    writeText(jp(root, APP_YAML), appText);
    writeText(jp(root, TPL_YAML), tplText);
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(jp(root, APP_YAML))).toBe(false);
    expect(existsSync(jp(root, TPL_YAML))).toBe(false);
    expect(readFileSync(jp(cfg, APP_YAML), 'utf8')).toBe(appText); // 字节不变，不重排不改写
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe(tplText);
    rm(root);
  });

  it('existing_target_wins_and_nothing_is_touched', () => { // §4-2 / S2
    const { root, cfg } = legacyRoot('mig_conflict');
    writeText(jp(root, APP_YAML), 'llama_dir: OLD\n');
    writeText(jp(cfg, APP_YAML), 'llama_dir: NEW\n');
    writeText(jp(root, TPL_YAML), 'tpl_root:\n  values: {}\n');
    writeText(jp(cfg, TPL_YAML), 'tpl_cfg:\n  values: {}\n');
    migrateLegacyConfigs(root, cfg);
    expect(readFileSync(jp(root, APP_YAML), 'utf8')).toBe('llama_dir: OLD\n');
    expect(readFileSync(jp(cfg, APP_YAML), 'utf8')).toBe('llama_dir: NEW\n');
    expect(readFileSync(jp(root, TPL_YAML), 'utf8')).toBe('tpl_root:\n  values: {}\n');
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe('tpl_cfg:\n  values: {}\n');
    rm(root);
  });

  it('nothing_to_migrate_creates_no_files', () => { // §4-3
    const { root, cfg } = legacyRoot('mig_empty', false);
    expect(existsSync(cfg)).toBe(false);
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(cfg)).toBe(false); // 无东西可搬时连 configs/ 都不该新建
    rm(root);
  });

  it('root_llama_params_yaml_is_never_touched', () => { // §4-9 / S4
    const { root, cfg } = legacyRoot('mig_params');
    writeText(jp(root, PARAMS_YAML), 'params: {}\nrequired: []\n');
    writeText(jp(root, TPL_YAML), 'tpl_a:\n  values: {}\n');
    migrateLegacyConfigs(root, cfg);
    expect(existsSync(jp(root, PARAMS_YAML))).toBe(true);
    expect(existsSync(jp(cfg, PARAMS_YAML))).toBe(false);
    expect(existsSync(jp(cfg, TPL_YAML))).toBe(true); // 同一次调用里另两份照常
    rm(root);
  });
});
```

- [ ] **步骤 2：运行确认失败**

`npx vitest run src-main/config-migrate.test.ts` → 预期 `Cannot find module './config-migrate'`。

- [ ] **步骤 3：实现**

创建 `src-main/config-migrate.ts` 全文：

```ts
// 老用户存量迁移（2026-10-08）：把 <dataDir>/ 根下的两份用户 yaml 静默搬进 <dataDir>/configs/。
// 规格：docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md
// 契约：无状态、无标记、不写日志、不弹提示、不抛异常；判据只有文件存在性（S1）。
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 迁移清单：llama_params.yaml 不在列——它是随包解压覆盖的受控资产，根残留留着无害（S4）
const LEGACY_FILES = ['lms_launcher.yaml', 'llama_launch_configs.yaml'];

function isPlainFile(p: string): boolean {
  try { return statSync(p).isFile(); } catch { return false; }
}

export function migrateLegacyConfigs(rootDir: string, cfgDir: string): void {
  for (const name of LEGACY_FILES) {
    const from = join(rootDir, name);
    const to = join(cfgDir, name);
    if (!isPlainFile(from)) continue;  // 两处皆无，或同名是目录 → 跳过（§4-3、§4-7）
    if (existsSync(to)) continue;      // 以 configs/ 为准，根残留不动（§4-2、S2）
    try { mkdirSync(cfgDir, { recursive: true }); } catch { /* 建目录失败 → 下面必失败，静默放弃（§4-4） */ }
    try {
      renameSync(from, to);
    } catch { /* 搬不动 → 本次放弃，下次启动重试（S3） */ }
  }
}
```

- [ ] **步骤 4：运行确认通过**

`npx vitest run src-main/config-migrate.test.ts` → 4 条全绿。

- [ ] **步骤 5：提交**

`git add src-main/config-migrate.ts src-main/config-migrate.test.ts && git commit -m "feat(config): 根目录两份用户 yaml 静默迁移到 configs 目录"`

---

## 任务 2：`copy` 兜底（注入 deps）

**文件：** 修改 `src-main/config-migrate.ts`、`src-main/config-migrate.test.ts`

- [ ] **步骤 1：补失败测试（§4-5 + §4-4）**

在 `src-main/config-migrate.test.ts` 顶部 import 改为：

```ts
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
```

在 `describe` 末尾追加：

```ts
  it('rename_failure_falls_back_to_copy_and_keeps_original', () => { // §4-5 / S3；顺带覆盖 §4-4（configs/ 不存在）
    const { root, cfg } = legacyRoot('mig_copy', false);
    const tplText = 'tpl_a:\n  values: {}\n';
    writeText(jp(root, TPL_YAML), tplText);
    migrateLegacyConfigs(root, cfg, {
      move: () => { throw new Error('EBUSY'); },
      copy: copyFileSync,
    });
    expect(existsSync(jp(root, TPL_YAML))).toBe(true); // 兜底保留原件（S3）
    expect(readFileSync(jp(cfg, TPL_YAML), 'utf8')).toBe(tplText);
    rm(root);
  });

  it('both_moves_fail_is_silent', () => { // §4-6 / S6
    const { root, cfg } = legacyRoot('mig_fail');
    writeText(jp(root, TPL_YAML), 'tpl_a:\n  values: {}\n');
    migrateLegacyConfigs(root, cfg, {
      move: () => { throw new Error('EPERM'); },
      copy: () => { throw new Error('EPERM'); },
    });
    expect(existsSync(jp(root, TPL_YAML))).toBe(true); // 原件留在原位，下次启动重试
    expect(existsSync(jp(cfg, TPL_YAML))).toBe(false);
    rm(root);
  });
```

- [ ] **步骤 2：运行确认失败**

`npx vitest run src-main/config-migrate.test.ts` → 新增两条失败：`Expected one or more arguments to 'migrateLegacyConfigs'`（调用点多了第三个实参）或断言不符。

- [ ] **步骤 3：实现兜底**

`src-main/config-migrate.ts` 的 import 与函数签名改为（其余行不变）：

```ts
import { copyFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
```

```ts
// 可注入的文件系统动作：Windows 上无法用真实文件系统稳定触发 rename 失败，兜底分支只能靠注入测（S7）
type MoveDeps = { move: (from: string, to: string) => void; copy: (from: string, to: string) => void };
const REAL_DEPS: MoveDeps = { move: renameSync, copy: copyFileSync };

export function migrateLegacyConfigs(rootDir: string, cfgDir: string, deps: MoveDeps = REAL_DEPS): void {
```

循环体内的 `try { renameSync(from, to); } catch { … }` 整段替换为：

```ts
    try {
      deps.move(from, to);
    } catch {
      try { deps.copy(from, to); } catch { /* 两种手段都失败 → 本次放弃，下次启动重试（§4-6） */ }
    }
```

- [ ] **步骤 4：运行确认通过**

`npx vitest run src-main/config-migrate.test.ts` → 6 条全绿。若某条与实现不符，按规格 §4 判定哪一侧错，不要改规格迁就实现。

- [ ] **步骤 5：提交**

`git add src-main/config-migrate.ts src-main/config-migrate.test.ts && git commit -m "feat(config): 迁移 rename 失败时退到 copy 兜底并保留原件"`

---

## 任务 3：`main.ts` 接线

**文件：** 修改 `src-main/main.ts`（第 8 行 import 段、第 74-76 行注释、第 968-971 行 `whenReady`）

- [ ] **步骤 1：加 import**

在 `src-main/main.ts:8` 的 `import { … } from './config';` 之后加一行：

```ts
import { migrateLegacyConfigs } from './config-migrate';
```

- [ ] **步骤 2：修订 `configDir()` 上方注释（现第 74-75 行）**

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

## 任务 4：更新脚本注释同步

**文件：** 修改 `scripts/lms-launcher-update.ps1`（仅注释，无逻辑改动）

- [ ] **步骤 1：修订头部第 4-5 行**

```powershell
#       校验关键条目 → 全量覆盖 installDir（2026-10-06 起 zip 内含 configs/llama_params.yaml，
#       解压即完成参数表升级；configs/ 下另两份 yaml 与 downloads 不进 zip，用户数据不受影响。
#       覆盖只写不删，故 2026-10-06 之前版本遗留在 installDir 根的两份用户 yaml 由新版应用
#       首次启动时静默搬入 configs/ —— 本脚本不做任何配置迁移）→
```

- [ ] **步骤 2：语法自检**

`pwsh -NoProfile -Command "$tok=$null;$err2=$null;[void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path scripts/lms-launcher-update.ps1),[ref]$tok,[ref]$err2);$err2.Count"` → 输出 `0`（无解析错误）。需在完整语言模式下运行（`$ExecutionContext.SessionState.LanguageMode` 为 `FullLanguage`）。

- [ ] **步骤 3：提交**

`git add scripts/lms-launcher-update.ps1 && git commit -m "docs(scripts): 说明根目录遗留配置由应用启动时迁移"`

---

## 任务 5：全量验证与交接

- [ ] **步骤 1：全量测试**

`npm test` → 全部用例通过（含既有 `config.test.ts`、`i18n`、前端各模块）。若有失败，修到绿，不得跳过或改断言。

- [ ] **步骤 2：确认无越界改动**

`git status --short` 与 `git diff --stat` 只应包含本计划「文件结构」列出的文件；`src-main/config.ts`、`.gitignore`、`electron-builder.yml`、`src/**`、`configs/**` 必须无改动。

- [ ] **步骤 3：交用户手工验收（不由代理执行）**

告知用户：在其现有安装目录（根目录有 `lms_launcher.yaml` / `llama_launch_configs.yaml` 的那种）启动新版一次，确认根两份文件消失、`configs/` 下出现同名文件、模板列表与语言选择仍在；再启动一次，确认没有任何变化。根目录 `llama_params.yaml` 会一直留着，属预期（S4）。

---

## 验收标准（全部满足才算完成）

- [ ] `npm test` 全绿，新增 6 条用例覆盖规格 §4 的场景 1、2、3、4、5、6、9。
- [ ] 迁移代码路径上没有任何 `emitLog`、`t()` 新文案、`dialog` 调用。
- [ ] `migrateLegacyConfigs` 的调用点位于 `initI18n()` 之前。
- [ ] 根目录 `llama_params.yaml` 在任何测试与真实场景下都不被读、搬、删。
- [ ] `src-main/config.ts` 无改动：不存在 `configs_migrated` 或任何新字段。
- [ ] 无状态可核查：`src-main/config-migrate.ts` 不 import `./config`、不读写任何标记文件；幂等由 §4-2/§4-3 两条测试覆盖（第二次调用必然命中其中之一）。