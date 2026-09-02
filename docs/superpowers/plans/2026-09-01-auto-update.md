# 自动更新(auto-update)实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 lms_launcher 实现「检查更新 → 下载 → update.exe 替换 → 重启」全流程自动更新，任何失败绝不影响现有可用版本。

**架构：** 同仓库双 Electron 产物——主应用(src-main)新增 check_update/download_update/run_update 三个 IPC；新增 src-update 无头 Electron 应用构建 update.exe（独立 appId），轮询 lms_launcher.exe 退出后从 zip 中仅取两个 exe 替换并 detached 启动新版。发布产物 = win-unpacked 内容 + update.exe 合并 zip。

**技术栈：** Electron 28、TypeScript、electron-builder(portable)、node-stream-zip、vitest、Node 全局 fetch。

**规格：** docs/superpowers/specs/2026-09-01-auto-update-design.md

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src-main/update-check.ts`（新建） | 纯函数：版本号解析/比较、GitHub latest release JSON 解析、API 常量 |
| `src-main/update-check.test.ts`（新建） | update-check 单元测试 |
| `src-main/updater-core.ts`（新建） | 纯核心（依赖可注入）：tasklist 解析、zip 条目过滤/校验、替换流程 runUpdate |
| `src-main/updater-core.test.ts`（新建） | updater-core 单元测试 |
| `src-main/main.ts`（修改） | 新增 3 个 IPC + 启动时回显 update.exe 日志 |
| `src-main/preload.ts`（修改） | 暴露 update-download-progress 事件订阅 |
| `src/ipc.ts`（修改） | 渲染端桥接 onUpdateDownloadProgress |
| `src-update/main.ts`（新建） | update.exe 无头主进程入口 |
| `tsconfig.update.json`（新建） | dist-update 编译配置（复用 updater-core） |
| `electron-builder-update.yml`（新建） | update.exe 构建配置（独立 appId/输出目录） |
| `scripts/with-update-main.js`（新建） | 临时切换 package.json main 后跑 electron-builder 并恢复 |
| `package.json`（修改） | build 脚本追加 update 编译 |
| `build.bat`（修改） | 追加 update.exe 构建步骤 |
| `scripts/package-zip.ps1`（新建） | 合并 win-unpacked + update.exe → 发布 zip |
| `src/App.vue`（修改） | 顶栏「有新版本!」按钮、两步确认、下载进度 |
| `src/style.css`（修改） | .update-pill 圆角紫底按钮样式 |
| `README.md`（修改） | 更新说明 + Electron 大版本需整包重装 |
| `.gitignore`（修改） | 追加 .temp-build/ |

---

### 任务 1：update-check 纯函数模块（TDD）

**文件：**
- 创建：`src-main/update-check.ts`
- 测试：`src-main/update-check.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src-main/update-check.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { compareVersions, parseVersion, parseLatestRelease } from './update-check';

describe('update-check.ts', () => {
  it('parseVersion_semver', () => {
    expect(parseVersion('0.1.0')).toEqual([0, 1, 0]);
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v0.1.0')).toBeNull();
    expect(parseVersion('0.1')).toBeNull();
    expect(parseVersion('0.1.0-beta')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });

  it('compareVersions_equal_or_invalid_returns_0', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('x', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0', 'bad')).toBe(0);
  });

  it('compareVersions_newer_is_1', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBe(1);
    expect(compareVersions('0.1.0', '0.1.1')).toBe(1);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(1);
  });

  it('compareVersions_older_is_-1', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(-1);
  });

  it('parseLatestRelease_valid_json_picks_win64_zip', () => {
    const json = {
      tag_name: 'v0.2.0',
      assets: [
        { name: 'other.zip', browser_download_url: 'https://x/other.zip' },
        { name: 'lms-launcher-0.2.0-win64.zip', browser_download_url: 'https://x/lms-launcher-0.2.0-win64.zip' },
      ],
    };
    expect(parseLatestRelease(json)).toEqual({
      tag: '0.2.0',
      zipUrl: 'https://x/lms-launcher-0.2.0-win64.zip',
    });
  });

  it('parseLatestRelease_tag_without_v_prefix_accepted', () => {
    const json = {
      tag_name: '0.2.0',
      assets: [{ name: 'a-win64.zip', browser_download_url: 'u' }],
    };
    expect(parseLatestRelease(json)).toEqual({ tag: '0.2.0', zipUrl: 'u' });
  });

  it('parseLatestRelease_bad_shapes_return_null', () => {
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease({})).toBeNull();
    expect(parseLatestRelease({ tag_name: 'not-a-version', assets: [] })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v0.2.0', assets: [] })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v0.2.0', assets: [{ name: 'no-win64.zip' }] })).toBeNull();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/update-check.test.ts`
预期：FAIL（Cannot find module ./update-check）

- [ ] **步骤 3：编写最少实现代码**

创建 `src-main/update-check.ts`：

```ts
// 自动更新（规格 2026-09-01-auto-update）：版本检查纯函数层。
// 数据源：GitHub Releases API（latest）；资产命名约定 lms-launcher-v{version}-win64.zip。
// 纯函数 + 常量导出 → 可单测；网络请求由 main.ts 的 IPC 负责。

export const RELEASE_API_URL =
  'https://api.github.com/repos/Gelomen/lms_launcher/releases/latest';

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG_RE = /^v?(\d+\.\d+\.\d+)$/;

export interface LatestReleaseInfo {
  tag: string;      // 已去 v 前缀的 semver
  zipUrl: string;   // 匹配 *-win64.zip 资产的 browser_download_url
}

// 严格 semver（无 v 前缀、无预发布后缀）→ [maj,min,pat]；不合规则 null
export function parseVersion(s: string): [number, number, number] | null {
  const m = s.match(VERSION_RE);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

// -1 = latest 更低 / 0 = 相等或任一侧解析失败 / 1 = latest 更新
// 只有 1 才视为「有新版」（失败保守 → 不弹更新）
export function compareVersions(cur: string, latest: string): -1 | 0 | 1 {
  const a = parseVersion(cur);
  const b = parseVersion(latest);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

// 解析 GitHub releases/latest 响应 → LatestReleaseInfo；tag 非 semver 或无 win64 zip 资产 → null
export function parseLatestRelease(json: unknown): LatestReleaseInfo | null {
  if (typeof json !== 'object' || json === null) return null;
  const r = json as Record<string, unknown>;
  const tagName = typeof r.tag_name === 'string' ? r.tag_name : '';
  const m = tagName.match(TAG_RE);
  if (!m) return null;
  const assets = Array.isArray(r.assets) ? r.assets : [];
  const zip = assets.find((a) => {
    const o = a as Record<string, unknown>;
    return (
      typeof o?.name === 'string' &&
      o.name.endsWith('-win64.zip') &&
      typeof o.browser_download_url === 'string'
    );
  });
  if (!zip) return null;
  const z = zip as Record<string, unknown>;
  return { tag: m[1], zipUrl: z.browser_download_url as string };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/update-check.test.ts`
预期：PASS（6 tests）

- [ ] **步骤 5：Commit**

```bash
git add src-main/update-check.ts src-main/update-check.test.ts
git commit -m "feat: 新增 update-check 版本比较与 release 解析纯函数"
```


---

### 任务 2：updater-core 替换流程核心（TDD）

**文件：**
- 创建：`src-main/updater-core.ts`
- 测试：`src-main/updater-core.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src-main/updater-core.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  parseTasklistIsRunning,
  filterZipEntries,
  validateRelease,
  runUpdate,
  type CopyOps,
} from './updater-core';

describe('updater-core.ts', () => {
  it('parseTasklist_is_running', () => {
    expect(parseTasklistIsRunning('INFO: No tasks are running that match the specified criteria.', 'update.exe')).toBe(false);
    expect(parseTasklistIsRunning('"lms_launcher.exe","1234","Console","1","1,024 K"', 'lms_launcher.exe')).toBe(true);
    expect(parseTasklistIsRunning('"update.exe","4321","Console","1","512 K"', 'update.exe')).toBe(true);
    expect(parseTasklistIsRunning('"something-else.exe","1","Console","1","1 K"', 'update.exe')).toBe(false);
    expect(parseTasklistIsRunning('', 'update.exe')).toBe(false);
    expect(parseTasklistIsRunning('IMAGE Name      PID', 'update.exe')).toBe(false);
  });

  it('filterZipEntries_and_validate', () => {
    const f = filterZipEntries(['lms_launcher.exe', 'resources/app.asar', 'update.exe']);
    expect(f.mainExe).toBe('lms_launcher.exe');
    expect(f.updateExe).toBe('update.exe');
    expect(validateRelease(f).ok).toBe(true);

    const nested = filterZipEntries(['dir/lms_launcher.exe']);
    expect(nested.mainExe).toBe('dir/lms_launcher.exe');

    const noMain = filterZipEntries(['resources/app.asar']);
    expect(noMain.mainExe).toBeNull();
    const v = validateRelease(noMain);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('lms_launcher.exe');
  });

  function makeOps(): CopyOps & { copies: string[]; spawned: string[]; rmCalls: string[] } {
    const calls = { copies: [] as string[], spawned: [] as string[], rmCalls: [] as string[] };
    return {
      ...calls,
      copy: (_s, d) => calls.copies.push(d),
      rm: (p) => calls.rmCalls.push(p),
      mkDir: () => {},
      exists: () => true,
      spawnDetached: (exe) => calls.spawned.push(exe),
      log: () => {},
    };
  }

  it('runUpdate_success_flow_replaces_and_launches', async () => {
    const ops = makeOps();
    const out = await runUpdate({
      zipPath: 'D:\\app\\lms-launcher-update.zip',
      installDir: 'D:\\app',
      listEntries: async () => ['lms_launcher.exe', 'update.exe'],
      extractEntry: async () => {},
      ops,
      pollDelayMs: 1,
      maxPolls: 5,
      checkRunning: () => false, // 进程已退出
    });
    expect(out.ok).toBe(true);
    expect(out.code).toBe(0);
    expect(out.filesChanged).toBe(true);
    expect(out.launchedNewVersion).toBe(true);
    expect(ops.copies).toEqual(['D:\\app\\lms_launcher.exe', 'D:\\app\\update.exe']);
    expect(ops.spawned).toEqual(['D:\\app\\lms_launcher.exe']);
  });

  it('runUpdate_timeout_process_still_running_changes_nothing', async () => {
    const ops = makeOps();
    const out = await runUpdate({
      zipPath: 'D:\\app\\lms-launcher-update.zip',
      installDir: 'D:\\app',
      listEntries: async () => ['lms_launcher.exe'],
      extractEntry: async () => {},
      ops,
      pollDelayMs: 1,
      maxPolls: 3,
      checkRunning: () => true, // 一直「在运行」
    });
    expect(out.ok).toBe(false);
    expect(out.filesChanged).toBe(false);
    expect(out.error).toContain('未退出');
    expect(ops.copies).toEqual([]);
    expect(ops.spawned).toEqual([]);
  });

  it('runUpdate_missing_main_exe_aborts', async () => {
    const ops = makeOps();
    const out = await runUpdate({
      zipPath: 'D:\\app\\lms-launcher-update.zip',
      installDir: 'D:\\app',
      listEntries: async () => ['resources/app.asar'],
      extractEntry: async () => {},
      ops,
      pollDelayMs: 1,
      checkRunning: () => false,
    });
    expect(out.ok).toBe(false);
    expect(out.filesChanged).toBe(false);
    expect(out.error).toContain('lms_launcher.exe');
  });

  it('runUpdate_update_exe_locked_skips_with_warn_still_ok', async () => {
    const ops = makeOps();
    const logs: string[] = [];
    const lockedOps: CopyOps = {
      ...ops,
      log: (m) => logs.push(m),
      copy: (s, d) => {
        if (d.endsWith('update.exe')) throw new Error('EBUSY: resource busy');
        ops.copy(s, d);
      },
    };
    const out = await runUpdate({
      zipPath: 'D:\\app\\lms-launcher-update.zip',
      installDir: 'D:\\app',
      listEntries: async () => ['lms_launcher.exe', 'update.exe'],
      extractEntry: async () => {},
      ops: lockedOps,
      pollDelayMs: 1,
      checkRunning: () => false,
    });
    expect(out.ok).toBe(true); // 主 exe 已替换成功
    expect(ops.copies).toEqual(['D:\\app\\lms_launcher.exe']);
    expect(logs.some((l) => l.includes('update.exe 自身被锁定'))).toBe(true);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/updater-core.test.ts`
预期：FAIL（Cannot find module ./updater-core）

- [ ] **步骤 3：编写最少实现代码**

创建 `src-main/updater-core.ts`：

```ts
// 自动更新（规格 2026-09-01-auto-update）：update.exe 替换流程核心。
// 设计原则：依赖全部可注入（tasklist/解压）→ 可单测；
// 任何失败路径都不允许改动安装目录已有文件（旧版本完好）。
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const MAIN_EXE_NAME = 'lms_launcher.exe';
export const UPDATE_EXE_NAME = 'update.exe';

// ---------- tasklist 进程检测 ----------

// 纯解析：tasklist csv 输出中是否出现目标 exe 进程行
export function parseTasklistIsRunning(raw: string, exeName: string): boolean {
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^INFO/i.test(t)) continue;
    if (t.toUpperCase().startsWith('IMAGE NAME')) continue;
    if (t.includes(exeName)) return true;
  }
  return false;
}

// 查询进程是否存在；检测本身失败（spawn 错/超时）→ 保守返回 true（不动文件）
export function isProcessRunning(exeName: string, run = spawnSync): boolean {
  try {
    const r = run('tasklist', ['/fi', 'IMAGENAME eq ' + exeName, '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    if (r.error) return true;
    return parseTasklistIsRunning((r.stdout || '') + (r.stderr || ''), exeName);
  } catch {
    return true;
  }
}

// ---------- zip 条目过滤 / 校验 ----------

export interface ZipEntryFilter {
  mainExe: string | null;   // zip 内 lms_launcher.exe 的条目路径（相对，/ 分隔）
  updateExe: string | null; // zip 内 update.exe 的条目路径
}

// 从 zip 条目列表里挑出两个目标 exe（发布 zip 根目录即文件，但容忍子目录）
export function filterZipEntries(entries: string[]): ZipEntryFilter {
  let mainExe: string | null = null;
  let updateExe: string | null = null;
  for (const e of entries) {
    const norm = e.replace(/\\/g, '/');
    const base = norm.split('/').pop() || '';
    if (!mainExe && base === MAIN_EXE_NAME) mainExe = norm;
    if (!updateExe && base === UPDATE_EXE_NAME) updateExe = norm;
  }
  return { mainExe, updateExe };
}

export function validateRelease(f: ZipEntryFilter): { ok: boolean; reason: string | null } {
  if (!f.mainExe) return { ok: false, reason: '更新包缺少 ' + MAIN_EXE_NAME + '，放弃更新' };
  return { ok: true, reason: null };
}

// ---------- 替换流程（依赖注入） ----------

export interface CopyOps {
  copy: (src: string, dest: string) => void; // 目标被锁时抛错
  rm: (p: string) => void;
  mkDir: (p: string) => void;
  exists: (p: string) => boolean;
  spawnDetached: (exe: string) => void;
  log: (msg: string) => void;
}

export interface UpdateOutcome {
  ok: boolean;
  code: number;              // 进程退出码（0 = 成功）
  filesChanged: boolean;     // 是否改过安装目录文件
  launchedNewVersion: boolean;
  error: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runUpdate(opts: {
  zipPath: string;
  installDir: string;
  listEntries: (zip: string) => Promise<string[]>;
  extractEntry: (zip: string, entry: string, destDir: string) => Promise<void>;
  ops: CopyOps;
  pollDelayMs?: number;    // 默认 1000
  maxPolls?: number;       // 默认 60
  checkRunning?: (exe: string) => boolean; // 默认 isProcessRunning
}): Promise<UpdateOutcome> {
  const { zipPath, installDir, listEntries, extractEntry, ops } = opts;
  const pollDelay = opts.pollDelayMs ?? 1000;
  const maxPolls = opts.maxPolls ?? 60;
  const check = opts.checkRunning ?? isProcessRunning;
  const tmpDir = join(installDir, '__update_tmp');
  const outcome: UpdateOutcome = {
    ok: false, code: 1, filesChanged: false, launchedNewVersion: false, error: null,
  };

  const cleanupTmp = (): void => {
    try { if (ops.exists(tmpDir)) ops.rm(tmpDir); } catch { /* 残留临时目录不阻断退出 */ }
  };
  const fail = (msg: string): UpdateOutcome => {
    ops.log('[ERROR] ' + msg);
    outcome.error = msg;
    cleanupTmp();
    return outcome;
  };

  try {
    // 1. 前置校验：zip 必须存在
    if (!ops.exists(zipPath)) return fail('更新包不存在：' + zipPath);

    // 2. 轮询等待 lms_launcher.exe 退出（1s × 60；每 10 次记一条日志）
    ops.log('[INFO] 等待 ' + MAIN_EXE_NAME + ' 退出...');
    let exited = false;
    for (let i = 0; i < maxPolls; i++) {
      if (!check(MAIN_EXE_NAME)) { exited = true; break; }
      if (i % 10 === 9) {
        ops.log('[INFO] 等待 ' + MAIN_EXE_NAME + ' 退出（已 ' + ((i + 1) * pollDelay) / 1000 + ' 秒）');
      }
      await sleep(pollDelay);
    }
    if (!exited) {
      return fail(maxPolls * (pollDelay / 1000) + ' 秒内进程未退出，放弃更新（旧版本未改动）');
    }
    ops.log('[INFO] 检测到进程已退出，开始替换');

    // 3. 解包到临时目录，仅取两个 exe（node-stream-zip 保持相对路径结构）
    const f = filterZipEntries(await listEntries(zipPath));
    const v = validateRelease(f);
    if (!v.ok) return fail(v.reason ?? '更新包校验失败');
    ops.mkDir(tmpDir);
    const newMain = join(tmpDir, f.mainExe!);
    await extractEntry(zipPath, f.mainExe!, tmpDir);
    const newUpdate = f.updateExe ? join(tmpDir, f.updateExe) : null;
    if (f.updateExe) await extractEntry(zipPath, f.updateExe, tmpDir);

    // 4. 替换 lms_launcher.exe（主 exe 失败 → 抛错进 catch，update.exe 未动）
    ops.copy(newMain, join(installDir, MAIN_EXE_NAME));
    outcome.filesChanged = true;

    // 5. update.exe 自身运行中被锁 → 跳过并 WARN（幂等：旧版下轮继续服务）
    if (f.updateExe && newUpdate) {
      try {
        ops.copy(newUpdate, join(installDir, UPDATE_EXE_NAME));
      } catch {
        ops.log('[WARN] update.exe 自身被锁定，跳过替换（沿用旧版）');
      }
    }

    // 6. detached 启动新版 → 清理临时目录 → 成功退出
    ops.log('[INFO] 替换完成，正在启动新版');
    ops.spawnDetached(join(installDir, MAIN_EXE_NAME));
    outcome.launchedNewVersion = true;
    cleanupTmp();
    outcome.ok = true;
    outcome.code = 0;
  } catch (e) {
    outcome.error = e instanceof Error ? e.message : String(e);
    ops.log('[ERROR] 更新异常：' + outcome.error);
    cleanupTmp();
  }
  return outcome;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/updater-core.test.ts`
预期：PASS（4 tests）

- [ ] **步骤 5：Commit**

```bash
git add src-main/updater-core.ts src-main/updater-core.test.ts
git commit -m "feat: 新增 updater-core 更新器替换流程核心（依赖注入可测）"
```


---

### 任务 3：主进程 IPC（check/download/run + 日志回显）

**文件：**
- 修改：`src-main/main.ts`

- [ ] **步骤 1：新增 import 与模块状态**

在 `src-main/main.ts` 顶部 import 区（现有 `import { checkLlamaInstall, installCheckMessage } from './llama-check';` 之后）追加：

```ts
import { spawn } from 'node:child_process';
import { compareVersions, parseLatestRelease, RELEASE_API_URL, type LatestReleaseInfo } from './update-check';
```

并把现有 `node:fs` import 行（第 2 行）改为合并新增的 readFileSync/unlinkSync：

```ts
import { existsSync, statSync, openSync, readSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
```

在 `const ps = new ProcessState();` 之后追加：

```ts
// 自动更新：check_update 成功后暂存 latest 信息，download_update 据此下载（内存态，重启即失）
let pendingUpdate: LatestReleaseInfo | null = null;
```

- [ ] **步骤 2：实现三个 IPC handler**

在 `ipcMain.handle('get_version', ...)` 之后、`// ---------- app lifecycle ----------` 之前插入：

```ts
// ---------- 自动更新（规格 2026-09-01-auto-update） ----------
// check_update：GitHub latest → semver 比较 → 有新版才 available（开发模式/失败一律 false）
ipcMain.handle('check_update', async (): Promise<{ available: boolean; version?: string }> => {
  if (!app.isPackaged) return { available: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(RELEASE_API_URL, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'lms_launcher' },
    });
    if (!res.ok) {
      emitLog('[更新] 检查失败：HTTP ' + res.status, 'sys');
      return { available: false };
    }
    const info = parseLatestRelease(await res.json());
    if (!info) {
      emitLog('[更新] 检查失败：无法解析 release 信息', 'sys');
      return { available: false };
    }
    if (compareVersions(app.getVersion(), info.tag) < 1) return { available: false };
    pendingUpdate = info;
    return { available: true, version: info.tag };
  } catch (e) {
    emitLog('[更新] 检查失败：' + (e instanceof Error ? e.message : String(e)), 'sys');
    return { available: false };
  } finally {
    clearTimeout(timer);
  }
});
// download_update：流式下载 pendingUpdate.zipUrl → exe 目录 lms-launcher-update.zip
// 进度经 update-download-progress 事件推渲染端；失败删半成品并报错（可重试）
ipcMain.handle('download_update', async (): Promise<
  { ok: true; zipPath: string; size: number } | { ok: false; reason: string }
> => {
  if (!pendingUpdate) return { ok: false, reason: '尚无更新任务（请先检查更新）' };
  const zipPath = join(dataDir(), 'lms-launcher-update.zip');
  emitLog('[更新] 开始下载：' + pendingUpdate.zipUrl, 'sys');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 600000); // 10 分钟超时
  try {
    const res = await fetch(pendingUpdate.zipUrl, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const total = parseInt(res.headers.get('content-length') ?? '0', 10) || null;
    const { createWriteStream } = await import('node:fs');
    const out = createWriteStream(zipPath);
    let received = 0;
    let lastPct = -1;
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(Buffer.from(value))) await new Promise<void>((r) => out.once('drain', () => r()));
      received += value.length;
      const pct = total ? Math.floor((received * 100) / total) : 0;
      if (pct !== lastPct) {
        lastPct = pct;
        mainWin()?.webContents.send('update-download-progress', { pct });
      }
    }
    out.end();
    await new Promise<void>((r) => out.on('finish', () => r()));
    const size = statSync(zipPath).size;
    emitLog('[更新] 下载完成 ' + (size / 1024 / 1024).toFixed(1) + 'MB', 'sys');
    return { ok: true, zipPath, size };
  } catch (e) {
    try { if (existsSync(zipPath)) unlinkSync(zipPath); } catch { /* 残留半成品不阻断报错 */ }
    const msg = e instanceof Error ? e.message : String(e);
    emitLog('[更新] 下载失败：' + msg, 'sys');
    return { ok: false, reason: msg };
  } finally {
    clearTimeout(timer);
  }
});
// run_update：detached 启动 update.exe [zipPath, installDir] → 复用 exit_app 真退出
// Windows 父子进程天然不联动（无 Job Object）：exe 退出后 update.exe 继续等、替换、拉起新版
ipcMain.handle('run_update', async (): Promise<void> => {
  const installDir = dataDir();
  const zipPath = join(installDir, 'lms-launcher-update.zip');
  const upd = join(installDir, 'update.exe');
  if (!existsSync(upd) || !existsSync(zipPath)) {
    throw new Error('更新文件缺失（update.exe / lms-launcher-update.zip）');
  }
  emitLog('[更新] 已启动更新器，应用即将退出', 'sys');
  const child = spawn(upd, [zipPath, installDir], {
    cwd: installDir,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  await ps.stopGraceful(3);
  app.exit(0);
});
// update.exe 日志回显（规格 §E）：启动时读 lms_launcher_update.log → 逐行 [更新器] 前缀
// 进 LMS Launcher 日志区 → 删除（一次性）。与 detectLlamaInstall 同机制处理渲染端未就绪——
// 页面加载完前 send 的消息即发即弃，故延迟到 did-finish-load
function replayUpdateLog(): void {
  const logPath = join(dataDir(), 'lms_launcher_update.log');
  if (!existsSync(logPath)) return;
  let content: string;
  try {
    content = readFileSync(logPath, 'utf8');
  } catch {
    return;
  }
  try { unlinkSync(logPath); } catch { /* 删除失败不影响回显 */ }
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const sendAll = (): void => {
    for (const l of lines) emitLog('[更新器] ' + l, 'sys');
  };
  const win = mainWin();
  if (!win || !win.webContents.isLoading()) { sendAll(); return; }
  win.webContents.once('did-finish-load', sendAll);
}
```

- [ ] **步骤 3：whenReady 挂接**

在 `app.whenReady().then(() => {` 内的 `detectLlamaInstall();` 之后追加一行：

```ts
  replayUpdateLog();
```

- [ ] **步骤 4：托盘菜单新增「检查更新」选项**

在 `createTray()` 的菜单模板中，'退出' 项上方插入「检查更新」项。与现有 '退出' 项同款唤回模式：窗口可能藏在托盘里，确认对话框开在渲染端窗口内，须先 show+focus 再发消息：

```ts
    { label: '检查更新', click: () => {
      const win = mainWin();
      if (win) {
        // 先唤回窗口（关闭=隐藏到托盘），渲染端收到 tray-update-request 后走顶栏同款检查流程
        win.show(); win.focus();
        win.webContents.send('tray-update-request', {});
      }
    } },
    { label: '退出', click: () => { /* 现有退出项，保持原样 */ } },
```

（实际代码为在现有数组字面量中、'退出' 项前插入上述对象，'退出' 项本体不变。）

- [ ] **步骤 5：编译 + 全量测试验证**

运行：`npx tsc -p tsconfig.main.json && npx vitest run`
预期：编译 0 错误；全部测试 PASS

- [ ] **步骤 6：Commit**

```bash
git add src-main/main.ts
git commit -m "feat: 主进程新增 check_update/download_update/run_update IPC、更新器日志回显与托盘检查更新菜单"
```

---

### 任务 4：preload 与渲染端 IPC 桥接

**文件：**
- 修改：`src-main/preload.ts`
- 修改：`src/ipc.ts`

- [ ] **步骤 1：preload 暴露进度事件订阅**

在 `src-main/preload.ts` 的 `onWinMaxChanged` 条目之后追加：

```ts
  onUpdateDownloadProgress: (cb: (e: { pct: number }) => void) => {
    const listener = (_e: unknown, payload: { pct: number }) => cb(payload);
    ipcRenderer.on('update-download-progress', listener);
    return () => ipcRenderer.removeListener('update-download-progress', listener);
  },
  // 托盘「检查更新」：主进程唤回窗口后通知渲染端执行与顶栏按钮相同的检查流程
  onTrayUpdateRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('tray-update-request', listener);
    return () => ipcRenderer.removeListener('tray-update-request', listener);
  },
```

- [ ] **步骤 2：ipc.ts 声明与封装**

在 `src/ipc.ts` 的 `interface Window { lms: { ... } }` 声明中 `onWinMaxChanged` 行之后追加：

```ts
      onUpdateDownloadProgress: (cb: (e: { pct: number }) => void) => () => void;
      onTrayUpdateRequest: (cb: () => void) => () => void;
```

在文件末尾 `onWinMaxChanged` 导出函数之后追加：

```ts
export function onUpdateDownloadProgress(cb: (e: { pct: number }) => void): () => void {
  return window.lms.onUpdateDownloadProgress(cb);
}

export function onTrayUpdateRequest(cb: () => void): () => void {
  return window.lms.onTrayUpdateRequest(cb);
}
```

- [ ] **步骤 3：编译验证**

运行：`npx tsc -p tsconfig.main.json && npx vitest run`
预期：编译 0 错误；全部测试 PASS

- [ ] **步骤 4：Commit**

```bash
git add src-main/preload.ts src/ipc.ts
git commit -m "feat: preload/ipc 桥接 update-download-progress 下载进度事件"
```


---

### 任务 5：update.exe 工程化（构建链）

**文件：**
- 创建：`src-update/main.ts`
- 创建：`tsconfig.update.json`
- 创建：`electron-builder-update.yml`
- 创建：`scripts/with-update-main.js`
- 修改：`package.json`
- 修改：`build.bat`

- [ ] **步骤 1：安装解压依赖**

运行：`npm install node-stream-zip`
预期：package.json dependencies 新增 "node-stream-zip"

- [ ] **步骤 2：tsconfig.update.json**

创建 `tsconfig.update.json`（rootDir 含两个源目录 → 产物 dist-update/src-update/ 与 dist-update/src-main/）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-update",
    "rootDir": ".",
    "types": ["node"],
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src-update/**/*.ts", "src-main/updater-core.ts"],
  "exclude": ["**/*.test.ts", "src-main/test-utils.ts"]
}
```

- [ ] **步骤 3：src-update/main.ts**

创建 `src-update/main.ts`（无窗口/无托盘/无单实例锁；appId 由 electron-builder-update.yml 独立指定）：

```ts
// update.exe —— 无头 Electron 更新器（规格 2026-09-01-auto-update §D）。
// 用法：update.exe <zipPath> <installDir>
// 流程：轮询 lms_launcher.exe 退出(1s×60) → 解包两 exe → 替换 → detached 启动新版。
// 日志：追加写 installDir\lms_launcher_update.log，主应用下次启动回显并删除。
import { app } from 'electron';
import { join } from 'node:path';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { nodeStreamZip } from 'node-stream-zip';
import { runUpdate } from '../src-main/updater-core';

let logFile = '';
function log(msg: string): void {
  const line = new Date().toISOString() + ' ' + msg;
  try {
    if (logFile) appendFileSync(logFile, line + '\n');
  } catch { /* 日志写失败不阻断更新流程 */ }
}

app.whenReady().then(async () => {
  const [, , zipPath, installDir] = process.argv;
  if (!zipPath || !installDir) {
    log('[ERROR] 缺少参数（用法：update.exe <zipPath> <installDir>）');
    process.exit(1);
  }
  logFile = join(installDir, 'lms_launcher_update.log');
  log('[INFO] update.exe 启动 v' + app.getVersion() + ' · zip=' + zipPath + ' · dir=' + installDir);

  const outcome = await runUpdate({
    zipPath,
    installDir,
    listEntries: async (zip) => {
      const z = await nodeStreamZip.async.open(zip);
      const names: string[] = [];
      for (let i = 0; i < z.entries_count; i++) {
        const e = z.entries()[i];
        if (!e.isDirectory) names.push(e.name);
      }
      z.close();
      return names;
    },
    extractEntry: (zip, entry, destDir) => nodeStreamZip.async.extract(zip, [entry], destDir),
    ops: {
      copy: (s, d) => copyFileSync(s, d),
      rm: (p) => rmSync(p, { force: true, recursive: true }),
      mkDir: (p) => mkdirSync(p, { recursive: true }),
      exists: (p) => existsSync(p),
      spawnDetached: (exe) => {
        // 新版启动：detached 解耦（update.exe 随后即退出，不会带走新进程）
        const c = spawn(exe, [], { cwd: join(exe, '..'), detached: true, stdio: 'ignore' });
        c.unref();
      },
      log,
    },
  });
  if (!outcome.ok) log('[ERROR] 更新失败：' + (outcome.error ?? '未知'));
  process.exit(outcome.code);
});
```

- [ ] **步骤 4：编译验证**

运行：`npx tsc -p tsconfig.update.json`
预期：0 错误；生成 dist-update/src-update/main.js 与 dist-update/src-main/updater-core.js


- [ ] **步骤 5：with-update-main.js 构建脚本**

package.json 的 main 固定指向主应用入口，update.exe 需要临时换入口再打包（electron-builder 只认项目根 package.json）。创建 `scripts/with-update-main.js`（finally 保证恢复，构建失败也不留脏文件）：

```js
// 临时切换 package.json 的 main 为 update.exe 入口 → 运行给定命令（cmd /c 转发）→ 恢复原文件
// 用法：node scripts\with-update-main.js npx electron-builder --config electron-builder-update.yml --win portable
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'package.json');
const original = fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(original);
pkg.main = 'dist-update/src-update/main.js';
fs.writeFileSync(file, JSON.stringify(pkg, null, 2));

let code = 1;
try {
  const r = spawnSync('cmd', ['/c', ...process.argv.slice(2)], { stdio: 'inherit' });
  code = r.status ?? 1;
} finally {
  fs.writeFileSync(file, original);
}
process.exit(code);
```

- [ ] **步骤 6：electron-builder-update.yml**

创建 `electron-builder-update.yml`（artifactName 含 electron-builder 的 ${version} 占位符，原样保留）：

```yaml
appId: com.lms.launcher.updater
productName: update
directories:
  output: dist-release-update
files:
  - dist-update/**
  - package.json
asar: true
electronDist: node_modules/electron/dist
win:
  target: portable
portable:
  artifactName: "update-${version}.exe"
```

- [ ] **步骤 7：package.json build 脚本**

修改 `package.json` 的 build 脚本为：

```json
"build": "vite build && tsc -p tsconfig.main.json && tsc -p tsconfig.update.json",
```

- [ ] **步骤 8：build.bat**

将 `build.bat` 内容替换为：

```bat
@echo off

npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.update.json && npm run build && npx electron-builder --config electron-builder.yml --win portable && node scripts\with-update-main.js npx electron-builder --config electron-builder-update.yml --win portable
```

- [ ] **步骤 9：本地构建 update.exe 验证**

运行：`node scripts\with-update-main.js npx electron-builder --config electron-builder-update.yml --win portable`
预期：exit 0；dist-release-update 下生成 update-0.1.0.exe；package.json 的 main 恢复为 dist-main/main.js（`git diff package.json` 验证）

- [ ] **步骤 10：Commit**

```bash
git add package.json package-lock.json tsconfig.update.json electron-builder-update.yml scripts/with-update-main.js build.bat src-update/main.ts
git commit -m "feat: 新增 update.exe 无头更新器工程与构建链"
```

---

### 任务 6：渲染端 UI（按钮 + 两步确认 + 进度）

**文件：**
- 修改：`src/App.vue`
- 修改：`src/style.css`

- [ ] **步骤 1：App.vue 状态与事件**

在 `src/App.vue` 的 `const version = ref('');` 行之后追加：

```ts
// 自动更新（规格 2026-09-01-auto-update §F）：顶栏「有新版本!」按钮态机
type UpdatePhase = 'idle' | 'available' | 'downloading';
const updateState = ref<{ phase: UpdatePhase; version: string; pct: number }>({
  phase: 'idle', version: '', pct: 0,
});
const updateConfirm = ref(false);        // 第一次确认：下载并更新
const updateRestartConfirm = ref(false); // 第二次确认：退出应用开始更新
```

在 `src/App.vue` 顶部 import 行（现有 './ipc' import）末尾补一个导入：

```ts
import { invoke, errMsg, isMissing, isValidation, onLogLine, onProcessExit, onTrayExitRequest, onWinMaxChanged, onUpdateDownloadProgress, onTrayUpdateRequest } from './ipc';
```

在 onMounted 内版本号获取 try/catch 块之后追加：

```ts
  // 启动时静默检查更新：available → 顶栏显示「有新版本!」按钮；失败静默（主进程已写日志）
  try {
    const r = await invoke<{ available: boolean; version?: string }>('check_update');
    if (r.available) {
      updateState.value = { phase: 'available', version: r.version ?? '', pct: 0 };
      appendSys('检查更新 · 发现新版本 v' + (r.version ?? ''));
    }
  } catch { /* 检查失败不阻塞启动 */ }
  // 下载进度事件 → 按钮变「下载中 NN%」
  unsubs.push(onUpdateDownloadProgress((e) => {
    updateState.value = { ...updateState.value, phase: 'downloading', pct: e.pct };
  }));
  // 托盘「检查更新」→ 与顶栏按钮同一入口（含 re-check 与第一次确认框）
  unsubs.push(onTrayUpdateRequest(() => { void onUpdateButton(); }));
```

在文件末尾（onExitConfirmed 函数之后）追加 handler：

```ts
// ---------- 自动更新（规格 2026-09-01-auto-update §F） ----------
// 按钮点击 → re-check → 有新版弹第一次确认
async function onUpdateButton(): Promise<void> {
  try {
    const r = await invoke<{ available: boolean; version?: string }>('check_update');
    if (!r.available) {
      updateState.value = { phase: 'idle', version: '', pct: 0 };
      appendSys('检查更新 · 当前已是最新版本');
      return;
    }
    updateState.value = { phase: 'available', version: r.version ?? '', pct: 0 };
    updateConfirm.value = true;
  } catch {
    updateState.value = { phase: 'idle', version: '', pct: 0 };
  }
}

// 第一次确认 → 下载（进度事件驱动按钮文案）
async function startDownload(): Promise<void> {
  updateState.value = { ...updateState.value, phase: 'downloading', pct: 0 };
  appendSys('开始下载新版本…');
  const r = await invoke<{ ok: boolean; reason?: string }>('download_update');
  if (r.ok) {
    updateRestartConfirm.value = true;
  } else {
    updateState.value = { ...updateState.value, phase: 'available', pct: 0 };
    appendSys('更新下载失败 · ' + (r.reason ?? '未知错误'));
  }
}

// 第一次确认对话框 @confirm
function onDownloadConfirmed(): void {
  updateConfirm.value = false;
  void startDownload();
}

// 第二次确认对话框 @confirm → run_update（主进程 spawn update.exe + 真退出）
function onRestartConfirmed(): void {
  invoke('run_update').finally(() => { updateRestartConfirm.value = false; });
}
```

- [ ] **步骤 2：App.vue 模板**

在模板 winbar__brand 区块，`<span v-if="version" class="winbar__version">v{{ version }}</span>` 之后追加：

```html
        <!-- 自动更新（2026-09-01）：有新版本 → 圆角紫底按钮；下载中 → 进度态禁用 -->
        <button
          v-if="updateState.phase === 'available'"
          type="button"
          class="update-pill"
          :title="'发现新版本 v' + updateState.version + '，点击检查并安装'"
          @click="onUpdateButton">有新版本!</button>
        <button
          v-else-if="updateState.phase === 'downloading'"
          type="button"
          class="update-pill update-pill--busy"
          disabled>下载中 {{ updateState.pct }}%</button>
```

在模板末尾（退出 ConfirmDialog 之后、`</main>` 之前）追加两个对话框：

```html
    <!-- 自动更新：第一次确认（下载并更新） -->
    <ConfirmDialog :open="updateConfirm" title="发现新版本"
      :message="'发现新版本 v' + updateState.version + '，是否下载并安装？'"
      tone="primary"
      @confirm="onDownloadConfirmed" @close="() => (updateConfirm = false)" />
    <!-- 自动更新：第二次确认（退出并开始更新） -->
    <ConfirmDialog :open="updateRestartConfirm" title="开始更新"
      message="应用将立即退出，更新完成后自动重新启动新版。继续？"
      tone="primary"
      @confirm="onRestartConfirmed" @close="() => (updateRestartConfirm = false)" />
```

- [ ] **步骤 3：style.css 按钮样式**

在 `src/style.css` 末尾（.winbtn--close:hover 规则之后）追加：

```css
/* ---- 自动更新按钮（规格 2026-09-01-auto-update §F）：pill 圆角、紫底白字(#8B5CF6)、版本号右侧 ---- */
.update-pill {
  margin-left: 8px;
  height: 20px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font-size: var(--fs-label);
  cursor: pointer;
  white-space: nowrap;
  -webkit-app-region: no-drag; /* winbar 整条为拖动区：按钮恢复可点击 */
}
.update-pill:hover { background: #7C3AED; }
.update-pill--busy { background: #C4B5FD; color: #fff; cursor: default; }
```

- [ ] **步骤 4：构建 + 测试验证**

运行：`npm run build && npx vitest run`
预期：vite 构建成功、tsc 0 错误、全部测试 PASS

- [ ] **步骤 5：Commit**

```bash
git add src/App.vue src/style.css
git commit -m "feat: 顶栏新增有新版本按钮与两步确认更新交互"
```

---

### 任务 7：发布脚本与文档

**文件：**
- 创建：`scripts/package-zip.ps1`
- 修改：`.gitignore`
- 修改：`README.md`

- [ ] **步骤 1：.gitignore**

在 `.gitignore` 末尾追加一行：

```
.temp-build/
```

- [ ] **步骤 2：package-zip.ps1**

创建 `scripts/package-zip.ps1`（合并 win-unpacked + update.exe → 发布 zip，脚本化现手动流程）。脚本名中的版本占位说明：输出 zip 命名为 lms-launcher-v{version}-win64.zip，其中 {version} 由脚本参数 -Version 动态生成（缺省读 package.json 的 version）：

```powershell
# 发布打包：dist-release\win-unpacked + update.exe → lms-launcher-v<version>-win64.zip
# 用法：pwsh -File scripts\package-zip.ps1 [-Version 0.2.0]（缺省读 package.json 的 version）
param([string]$Version = ((Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json).version))

$repo      = Split-Path -Parent $PSScriptRoot
$mainDir   = Join-Path $repo 'dist-release\win-unpacked'
$upDir     = Join-Path $repo 'dist-release-update'
$upExe     = Get-ChildItem $upDir -Filter 'update-*.exe' | Select-Object -First 1
$stage     = Join-Path $repo ('.temp-build\release-v' + $Version)
$outZip    = Join-Path $repo ('lms-launcher-v' + $Version + '-win64.zip')

if (-not (Test-Path $mainDir)) { throw ('未找到 ' + $mainDir + '（先跑 build.bat）') }
if (-not $upExe) { throw ('未在 ' + $upDir + ' 找到 update-*.exe（先跑 build.bat）') }

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $mainDir '*') $stage -Recurse -Force
Copy-Item $upExe.FullName $stage -Force

if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $outZip

Remove-Item $stage -Recurse -Force
Write-Host ('已生成: ' + $outZip)
```

- [ ] **步骤 3：README.md 更新说明**

在 `README.md` 文末追加：

```markdown
## 自动更新

- 应用启动时静默检查 GitHub Releases；发现新版本时顶栏版本号右侧显示「有新版本!」按钮。
- 点击按钮 → 确认 → 下载（显示进度）→ 确认后应用退出，由 update.exe 替换文件并自动重启新版。
- **update.exe 必须与 lms_launcher.exe 同目录**（发布 zip 已包含）。
- Electron 大版本升级（运行时更新）无法通过本机制完成，需下载整包 zip 手动解压重装（用户数据 yaml 不受影响）。
```

- [ ] **步骤 4：Commit**

```bash
git add .gitignore scripts/package-zip.ps1 README.md
git commit -m "chore: 发布打包脚本与自动更新说明文档"
```

---

### 任务 8：全量验证

- [ ] **步骤 1：全量测试 + 构建**

运行：`npm run build && npx vitest run`
预期：vite 成功；tsc(main) 0 错误；tsc(update) 0 错误；全部单测 PASS

运行：`node scripts\with-update-main.js npx electron-builder --config electron-builder-update.yml --win portable`
预期：exit 0；dist-release-update/update-0.1.0.exe 存在；git status 下 package.json 无变更

- [ ] **步骤 2：模拟发布验收（端到端，需手动配合）**

前置：把 package.json 的 version 临时改为 0.1.1（仅本地验证，勿推），执行 build.bat 全流程，跑 package-zip.ps1，把 zip 内容手动发布（或本地模拟 GitHub latest release）：

1. **升级主流程**：在 0.1.0 安装目录（含新构建的 update.exe）启动 lms_launcher.exe → 顶栏出现「有新版本!」→ 点击 → 两次确认 → 按钮变「下载中 NN%」→ 100% → 应用退出 → update.exe 替换 → 新版自动启动 → 顶栏 v0.1.1，日志区出现 [更新器] 开头的回显行
2. **断网**：断网启动 → 无按钮 + 日志区「[lms_launcher] [更新] 检查失败:…」
3. **杀 update.exe**：更新流程中任务管理器杀掉 update.exe → lms_launcher.exe 旧版本文件完好可再次启动
4. **点 × 只隐藏**：更新确认前点 × → 窗口隐藏但 update.exe 未被启动（run_update 前不 spawn）——符合预期，无异常
5. **托盘检查更新**：隐藏到托盘后右键托盘图标 → 点击「检查更新」→ 窗口自动唤回并弹出与新版本相同的确认框（或已是最新的日志行）——与顶栏按钮行为一致

- [ ] **步骤 3：恢复版本号为 0.1.0（如临时改过）**

```bash
git add package.json
git commit -m "chore: 验证后恢复版本号 0.1.0"
```

- [ ] **步骤 4：最终 Commit（如步骤 1-3 产生了未提交变更）**

```bash
git add -A
git commit -m "chore: 自动更新功能实现完成（spec 2026-09-01-auto-update）"
```