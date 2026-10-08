# 更新配置与显存保存「变更才落盘、才记日志」实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 `set_llama_update_config` 与 `save_vram_total` 只在真的改变 `lms_launcher.yaml` 时才写盘，前者还只在真的改变时才记日志。

**架构：** 沿用 2026-10-08 已交付并审过的模式：判定放在 `src-main/config.ts` 里「决定是否写盘」的那一层，新增 `saveLlamaUpdateConfig` / `saveVramTotal` 返回既有的 `ConfigSaveResult { cfg, changed }`；`src-main/main.ts` 的 IPC 处理器只按 `changed` 决定是否 `emitLog`，返回值契约不变。渲染端零改动。

**规格：** `docs/superpowers/specs/2026-10-09-llama-update-config-vram-save-change-only-design.md`（事实 F1–F11、目标 G1–G4、决策 D1–D8、真值表 U1–U7 / W1–W4、验收 V1–V5）

**技术栈：** TypeScript + Electron 主进程；测试 vitest（`npx vitest run`）；类型检查 `npx tsc -p tsconfig.main.json`。Windows，shell 为 PowerShell。

**提交约定：** 本机 `git config user.name/email` 是 `Agent <agent@dsh>`，**每次提交必须带 `--author="Gelomen <gelomenchen@gmail.com>"`**。提交信息用中文 conventional commits。

**既有基建（直接复用，不要重写）：** `src-main/test-utils.ts` 的 `tmpPath` / `rm` / `writeText`；`src-main/config.test.ts:367-368` 的 `pinMtime` / `mtime`（mtime 哨兵：把文件 mtime 钉到 1970，任何一次落盘都会把它推回 now，所以 `mtime(p) === 0` 能证明「真的没写」）。读文件字节用内联 `require('node:fs').readFileSync`，**不要在测试文件顶部新增 import**。

---

### 任务 1：`saveLlamaUpdateConfig`（更新配置变更才落盘）

**文件：**
- 修改：`src-main/config.ts`（在 `saveLanguage`（`:248-254`）之后插入新函数）
- 修改：`src-main/config.ts:1`（`import { t, type Lang } from './i18n';` 不需要改；本任务不新增 import）
- 修改：`src-main/main.ts:953-972`（`set_llama_update_config` 处理器）
- 修改：`src-main/main.ts:8`（`from './config'` 的导入列表补 `saveLlamaUpdateConfig`）
- 测试：`src-main/config.test.ts`（文件末尾追加 `describe('saveLlamaUpdateConfig')`；`:3` 的导入补 `saveLlamaUpdateConfig`）

- [ ] **步骤 1：编写失败的测试**

在 `src-main/config.test.ts` 末尾追加：

```ts
describe('saveLlamaUpdateConfig', () => {
  const bytes = (p: string): string => require('node:fs').readFileSync(p, 'utf8');

  it('U1 文件无 update 节 + 有值 → changed=true 且写入该节', () => {
    const p = tmpPath('upd_u1.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'Windows x64 (CUDA 13)' });
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'Windows x64 (CUDA 13)' });
    expect(mtime(p)).not.toBe(0);
    rm(p);
  });

  it('U2 同值 → changed=false，文件与 mtime 都不动', () => {
    const p = tmpPath('upd_u2.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'A' } });
    pinMtime(p);
    const before = bytes(p);
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'A' });
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe(before);
    rm(p);
  });

  it('U3 不同值 → changed=true 且覆盖为新值', () => {
    const p = tmpPath('upd_u3.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'A' } });
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'B' });
    expect(r.changed).toBe(true);
    expect(r.cfg.update).toEqual({ last_llama_type: 'B' });
    expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'B' });
    rm(p);
  });

  it('U4 opts 不含该键 → changed=false 且不出现 update: {}（D4/F2）', () => {
    const p = tmpPath('upd_u4.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    const r = saveLlamaUpdateConfig(p, {});
    expect(r.changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).not.toContain('update');
    rm(p);
  });

  it('U5 有值 + 空串 → changed=true 且整个 update 节从文件消失（D5/F11）', () => {
    const p = tmpPath('upd_u5.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', update: { last_llama_type: 'A' } });
    const r = saveLlamaUpdateConfig(p, { last_llama_type: '' });
    expect(r.changed).toBe(true);
    expect(bytes(p)).not.toContain('update');
    expect(appConfigLoad(p).update).toBeUndefined();
    rm(p);
  });

  it('U6 文件已是 update: {} + 空串或无键 → changed=false 且垃圾节原样保留', () => {
    const p = tmpPath('upd_u6.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nupdate: {}\n');
    pinMtime(p);
    expect(saveLlamaUpdateConfig(p, { last_llama_type: '' }).changed).toBe(false);
    expect(saveLlamaUpdateConfig(p, {}).changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe('llama_dir: /x\nupdate: {}\n');
    rm(p);
  });

  it('U7 文件已是 update: {} + 有值 → changed=true 且写入该节', () => {
    const p = tmpPath('upd_u7.yaml');
    rm(p);
    writeText(p, 'llama_dir: /x\nupdate: {}\n');
    const r = saveLlamaUpdateConfig(p, { last_llama_type: 'A' });
    expect(r.changed).toBe(true);
    expect(appConfigLoad(p).update).toEqual({ last_llama_type: 'A' });
    rm(p);
  });

  it('变化分支不丢其它节（V2）', () => {
    const p = tmpPath('upd_keep.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', vram_total_gb: 24, proxy: { host: '127.0.0.1', port: 10808 }, language: 'zh' });
    expect(saveLlamaUpdateConfig(p, { last_llama_type: 'B' }).changed).toBe(true);
    const cfg = appConfigLoad(p);
    expect(cfg.llama_dir).toBe('/x');
    expect(cfg.vram_total_gb).toBe(24);
    expect(cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(cfg.language).toBe('zh');
    rm(p);
  });
});
```

同时在 `:3` 的导入里补上 `saveLlamaUpdateConfig`（放在 `saveLanguage` 之后）。

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/config.test.ts`
预期：FAIL，`ReferenceError: saveLlamaUpdateConfig is not defined`（或 vitest 报该具名导入不存在），且**只有**新增的 8 条红。记下这段输出作为 RED 证据。

- [ ] **步骤 3：编写实现**

在 `src-main/config.ts` 的 `saveLanguage`（`:254` 之后）插入：

```ts
/**
 * 保存 llama.cpp 更新配置（2026-10-09 llama-update-config-vram spec D1–D5）：与 yaml 里的
 * update.last_llama_type 比较，相同 → 完全不写（D2/D3）。
 * - opts 不含该键 = **不触碰**（D4，修 main.ts 旧代码 F2）：既不写也不删，文件里已有的
 *   update 节原样保留——缺键不是「清除」，绝不凭空造 update: {}，也绝不把既有节删掉。
 * - 空串 = 清除（D5）：要让整节消失必须把 cfg.update 置为 undefined——
 *   stringify({update:{}}) 会输出 update: {}，节不会自行消失（F11）。
 * 写入时整节覆盖为 { last_llama_type }：LlamaUpdateConfig 只有这一个字段（F4），
 * 展开旧节保留不了任何真实字段，只会把坏数据写回去（如手工编辑的 update: foo 被展开成 "0": f 字符键）。
 */
export function saveLlamaUpdateConfig(p: string, opts: { last_llama_type?: string }): ConfigSaveResult {
  const cfg = appConfigLoad(p);
  // 缺键或非字符串（IPC 参数是未类型化 JSON，null/数字都进得来）= 不触碰该节（D4）；空串是字符串，仍走下面的清除（D5）
  if (!opts || typeof opts.last_llama_type !== 'string') return { cfg, changed: false };
  const current = typeof cfg.update?.last_llama_type === 'string' && cfg.update.last_llama_type !== '' ? cfg.update.last_llama_type : undefined;
  const target = typeof opts.last_llama_type === 'string' && opts.last_llama_type !== '' ? opts.last_llama_type : undefined;
  if (current === target) return { cfg, changed: false };
  if (target === undefined) cfg.update = undefined;
  else cfg.update = { last_llama_type: target };
  appConfigSave(p, cfg);
  return { cfg, changed: true };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/config.test.ts`
预期：全部 PASS（原有用例数 + 8）。

- [ ] **步骤 5：接线 main.ts**

`src-main/main.ts:8` 的导入补 `saveLlamaUpdateConfig`。把 `set_llama_update_config` 处理器（`:953-972`）里的：

```ts
    const [cp] = yamlPaths();
    const cfg = appConfigLoad(cp);

    if (!cfg.update) cfg.update = {};
    if (opts.last_llama_type !== undefined) cfg.update.last_llama_type = opts.last_llama_type;

    appConfigSave(cp, cfg);
    emitLog('[lms_launcher] ' + t('log.llama.cfg.saved'), 'sys');
    return { success: true };
```

换成：

```ts
    const [cp] = yamlPaths();
    const { changed } = saveLlamaUpdateConfig(cp, opts);
    // 未变化不写盘也不记日志（spec D3/D8）；返回值契约不变（D7），渲染端无需改动
    if (changed) emitLog('[lms_launcher] ' + t('log.llama.cfg.saved'), 'sys');
    return { success: true };
```

`try/catch`、`log.llama.cfg.saveFail`、返回类型 `Promise<{ success: true } | { success: false; error: string }>` 全部保持不动。

- [ ] **步骤 6：类型检查**

运行：`npx tsc -p tsconfig.main.json`
预期：无输出（`$LASTEXITCODE` 为 0）。若报 `appConfigSave` 未使用之类，说明漏改了别处——不要删该导入，`main.ts:454`、`:968` 附近仍在用。

- [ ] **步骤 7：Commit**

```powershell
git add src-main/config.ts src-main/config.test.ts src-main/main.ts
git commit --author="Gelomen <gelomenchen@gmail.com>" -m "fix(config): 更新配置改为变更才落盘，重复安装同一变体不再记日志"
```

---

### 任务 2：`saveVramTotal`（显存总量变更才落盘）

**文件：**
- 修改：`src-main/config.ts`（在 `saveLlamaUpdateConfig` 之后插入）
- 修改：`src-main/main.ts:450-455`（`save_vram_total` 处理器）、`:8` 导入补 `saveVramTotal`
- 测试：`src-main/config.test.ts`（追加 `describe('saveVramTotal')`；`:3` 导入补 `saveVramTotal`）

- [ ] **步骤 1：编写失败的测试**

```ts
describe('saveVramTotal', () => {
  const bytes = (p: string): string => require('node:fs').readFileSync(p, 'utf8');

  it('W1 文件无该键 + 24 → changed=true 且写入', () => {
    const p = tmpPath('vram_w1.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    expect(saveVramTotal(p, 24).changed).toBe(true);
    expect(appConfigLoad(p).vram_total_gb).toBe(24);
    expect(mtime(p)).not.toBe(0);
    rm(p);
  });

  it('W2 同值 → changed=false，文件与 mtime 都不动', () => {
    const p = tmpPath('vram_w2.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', vram_total_gb: 24 });
    pinMtime(p);
    const before = bytes(p);
    expect(saveVramTotal(p, 24).changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe(before);
    rm(p);
  });

  it('W3 已有值 + 0/NaN/Infinity → changed=true 且该键从文件消失（D6）', () => {
    for (const gb of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = tmpPath('vram_w3.yaml');
      rm(p);
      appConfigSave(p, { llama_dir: '/x', vram_total_gb: 24 });
      expect(saveVramTotal(p, gb).changed).toBe(true);
      expect(bytes(p)).not.toContain('vram_total_gb');
      expect(appConfigLoad(p).vram_total_gb).toBeUndefined();
      rm(p);
    }
  });

  it('W4 文件无该键 + 0 → changed=false 且不写', () => {
    const p = tmpPath('vram_w4.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x' });
    pinMtime(p);
    const before = bytes(p);
    expect(saveVramTotal(p, 0).changed).toBe(false);
    expect(mtime(p)).toBe(0);
    expect(bytes(p)).toBe(before);
    rm(p);
  });

  it('变化分支不丢其它节（V2）', () => {
    const p = tmpPath('vram_keep.yaml');
    rm(p);
    appConfigSave(p, { llama_dir: '/x', proxy: { host: '127.0.0.1', port: 10808 }, language: 'en', update: { last_llama_type: 'A' } });
    expect(saveVramTotal(p, 16).changed).toBe(true);
    const cfg = appConfigLoad(p);
    expect(cfg.llama_dir).toBe('/x');
    expect(cfg.proxy).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(cfg.language).toBe('en');
    expect(cfg.update).toEqual({ last_llama_type: 'A' });
    rm(p);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src-main/config.test.ts`
预期：FAIL，`saveVramTotal` 未定义，只有新增的 5 条红。

- [ ] **步骤 3：编写实现**

在 `src-main/config.ts` 的 `saveLlamaUpdateConfig` 之后插入：

```ts
/**
 * 保存显存总量（2026-10-09 spec D6）：gb > 0 → 该值；否则视为未配置（键从文件消失，与 F7 同构）。
 * 与 yaml 现值相同 → 完全不写（D2/D3）。该路径没有日志，本函数只为「不产生无意义的改写」而存在。
 */
export function saveVramTotal(p: string, gb: number): ConfigSaveResult {
  const cfg = appConfigLoad(p);
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const target = ok(gb) ? gb : undefined;
  const current = ok(cfg.vram_total_gb) ? cfg.vram_total_gb : undefined;
  if (current === target) return { cfg, changed: false };
  cfg.vram_total_gb = target;
  appConfigSave(p, cfg);
  return { cfg, changed: true };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src-main/config.test.ts`
预期：全部 PASS。

- [ ] **步骤 5：接线 main.ts**

`src-main/main.ts:8` 的导入补 `saveVramTotal`。把 `save_vram_total` 处理器（`:450-455`）里的：

```ts
  const [p] = yamlPaths();
  const cfg = appConfigLoad(p);
  appConfigSave(p, { ...cfg, vram_total_gb: gb > 0 ? gb : undefined });
```

换成：

```ts
  const [p] = yamlPaths();
  saveVramTotal(p, gb);
```

处理器签名 `(_e, gb: number): void` 不变（无日志，无需门控）。

- [ ] **步骤 6：类型检查**

运行：`npx tsc -p tsconfig.main.json`
预期：无输出。

- [ ] **步骤 7：Commit**

```powershell
git add src-main/config.ts src-main/config.test.ts src-main/main.ts
git commit --author="Gelomen <gelomenchen@gmail.com>" -m "fix(config): 显存总量改为变更才落盘，重复保存同一值不再改写 yaml"
```

---

### 任务 3：全量验证与边界自检

- [ ] **步骤 1：全量测试**

```powershell
$env:TEMP="D:\AI\Workspace\lms_launcher\.temp\vitesttmp"; $env:TMP=$env:TEMP
npx vitest run
```
预期：`Test Files 39 passed (39)`、`Tests` 全绿、退出码 0。（默认系统 TEMP 下 vitest 偶发 Windows 文件锁 `EBUSY`，会少收一个测试文件；把 `TEMP`/`TMP` 指到仓库内 `.temp\vitesttmp` 即稳定。这是环境问题，与本改动无关。）

- [ ] **步骤 2：类型检查**

运行：`npx tsc -p tsconfig.main.json` → 预期无输出。

- [ ] **步骤 3：边界自检（V4）**

运行：`git diff --name-only <本计划第一个提交之前的 SHA>..HEAD`
预期：只含 `src-main/config.ts`、`src-main/config.test.ts`、`src-main/main.ts` 与 `docs/` 下的文档。若出现 `src-main/i18n/dict.ts`、`src/modules/UpdateModal.vue`、`src/modules/VramDialog.vue`、`src/llama-update-client.ts` → 越界，回退。

- [ ] **步骤 4：真机验收清单（V5，交给人工）**

1. 更新弹窗选一个变体 → 下载并安装 → 恰好一条 `llama.cpp · 更新配置已保存`，yaml 出现 `update: {last_llama_type: …}`。
2. 对同一变体再次下载并安装 → 仍有 `下载完成` 等日志，但不再出现第二条「更新配置已保存」，yaml mtime 不变。
3. 显存小窗重复保存同一个值 → mtime 不变。
4. 显存改成不同值 → 写入新值。

- [ ] **步骤 5：Commit 文档**

```powershell
git add docs/superpowers/plans
git commit --author="Gelomen <gelomenchen@gmail.com>" -m "docs(plans): 更新配置与显存保存「变更才落盘」的实现计划"
```

---

## 实现期修订（2026-10-09，任务 1 审查后）

- **计划代码有缺陷**：上面任务 1 步骤 3 的初版把「`opts` 缺键」与「空串」都归一成 `target = undefined`，于是「文件已有 `update.last_llama_type: 'A'` + `opts = {}`」被判为变化并把整个 `update` 节删除落盘——违反规格 §4.1 U4（「文件当前 = 任意 → 未变化、不写」）与 D4（「什么都不做」）。审查发现后已修：在归一之前先挡缺键（`if (opts.last_llama_type === undefined) return { cfg, changed: false };`），并补 U4b 用例（基线含有效值 + `opts = {}` → `changed=false`、mtime 不变、字节不变）。上面的代码块已同步为修正后的版本。
- **顺带修掉**：`cfg.update = { ...(cfg.update ?? {}), last_llama_type: target }` 在手工编辑的坏 yaml `update: foo`（标量）下会把字符串展开成字符键落盘（`"0": f` 等）。改为整节覆盖 `{ last_llama_type: target }`——`LlamaUpdateConfig` 只有一个字段（F4），展开保留不了任何真实字段。补了一条标量节用例。
- **V2 补齐**：U5 删除分支也逐项断言 `llama_dir` / `vram_total_gb` / `proxy` / `language` 保留（真值表末行说的是「任何分支」）。
- **复审后再修（74f7d0f）**：早返回只挡 `=== undefined`，于是 `{ last_llama_type: null }` 会删掉既有节而 `{}` 不碰——防御边界不自洽。已把类型判断并入早返回（`!opts || typeof opts.last_llama_type !== 'string'`，`opts` 为 `null` 也不再抛 TypeError），并补 U4c 用例（旧守卫下 RED `expected true to be false`）。规格 D4 与真值表 U4 已同步为「不是字符串 = 不触碰」，上面的代码块同步到最终版本。
- 已知可简化处（未改，属打磨）：早返回之后 `target` 表达式里的 `typeof opts.last_llama_type === 'string'` 半边不可能为假。

## 自检（写完后照规格复核）

- 规格覆盖度：U1–U7 → 任务 1 步骤 1；W1–W4 → 任务 2 步骤 1；V2（不丢其它节）→ 两个任务的「变化分支不丢其它节」用例；D4（不造 `update: {}`）→ U4；D5/F11（整节消失）→ U5/U6/U7；D7（返回值契约不变）→ 任务 1 步骤 5 与任务 2 步骤 5 明确保留签名；D8（日志门）→ 任务 1 步骤 5；V3 → 两个任务的类型检查步骤；V4 → 任务 3 步骤 3；V5 → 任务 3 步骤 4。无遗漏。
- 占位符扫描：无「待定/TODO/类似上文」。
- 类型一致性：`saveLlamaUpdateConfig(p: string, opts: { last_llama_type?: string }): ConfigSaveResult` 与 `saveVramTotal(p: string, gb: number): ConfigSaveResult` 在测试与实现中签名一致；`ConfigSaveResult` 复用既有定义，不新增类型。
- 与既有代码的冲突点：`main.ts` 的 `appConfigSave` 导入在 `:454`、`:968` 附近仍有使用，两个任务都不得删除该导入。
