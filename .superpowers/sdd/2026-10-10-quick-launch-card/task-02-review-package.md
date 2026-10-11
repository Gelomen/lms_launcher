# 审查包 · 任务 2（suggestConfigId 支持前缀）

BASE = e97f79c（HEAD 未变：按 K5 实现者不提交，改动全部在工作区；本任务无新增未跟踪源码文件）

## git status --porcelain

```
M docs/superpowers/checks/2026-10-10-quick-launch-card/task-02-suggest-config-id-prefix.md
 M src-main/config.test.ts
 M src-main/config.ts
```

## git diff HEAD --stat

```
.../task-02-suggest-config-id-prefix.md            | 63 +++++++++++++---------
 src-main/config.test.ts                            |  9 ++++
 src-main/config.ts                                 |  4 +-
 3 files changed, 49 insertions(+), 27 deletions(-)
```

## git diff HEAD -U15 -- src-main

```diff
diff --git a/src-main/config.test.ts b/src-main/config.test.ts
index 2e077fe..2d9765f 100644
--- a/src-main/config.test.ts
+++ b/src-main/config.test.ts
@@ -133,30 +133,39 @@ describe('config.ts', () => {
   });
 
   it('suggest_config_id_is_unique_and_yaml_safe', () => {
     // id 将作为 yaml key 保存：必须符合 validateConfigId（小写字母开头 [a-z0-9] ≤32），且与现有条目不重名
     const existing = ['tplabc1', 'qwen'];
     const id = suggestConfigId(existing);
     expect(id).not.toBe('tplabc1');
     expect(id).not.toBe('qwen');
     expect(validateConfigId(id)).toBe(true);
     // 连取 50 个也不碰撞（随机尾巴）
     const batch: string[] = [];
     for (let i = 0; i < 50; i++) batch.push(suggestConfigId([...batch]));
     expect(new Set(batch).size).toBe(50);
   });
 
+  it('suggestConfigId 支持自定义前缀且仍满足 id 契约', () => {
+    const id = suggestConfigId([], 'ql');
+    expect(id.startsWith('ql')).toBe(true);
+    expect(validateConfigId(id)).toBe(true);
+  });
+  it('suggestConfigId 默认前缀仍是 tpl', () => {
+    expect(suggestConfigId([]).startsWith('tpl')).toBe(true);
+  });
+
   it('config_id_rules', () => {
     expect(validateConfigId('abc')).toBe(true);
     expect(validateConfigId('a1b2')).toBe(true);
     expect(validateConfigId('')).toBe(false);
     expect(validateConfigId('Ab')).toBe(false);
     expect(validateConfigId('a b')).toBe(false);
     expect(validateConfigId('1abc')).toBe(false);
   });
 
   it('repo_params_covers_run_bat_common', () => {
     const pf = repoParams();
     const keys = ['m','mmproj','spec_type','ngl','fa','load_mode','np','c','b','ub','t','tb','ctk','ctv','jinja','chat_template_file','reasoning_format','reasoning_effort','spec_draft_n_max','md','temp','top_p','top_k','min_p','presence_penalty','repeat_penalty','port','alias'];
     for (const k of keys) expect(pf.params[k], k).toBeDefined();
     expect(pf.required).toEqual(['m']);
   });
diff --git a/src-main/config.ts b/src-main/config.ts
index d63d2aa..213b8e6 100644
--- a/src-main/config.ts
+++ b/src-main/config.ts
@@ -102,34 +102,34 @@ export function configsLoad(path: string): ConfigsMap {
   for (const [id, e] of Object.entries(map)) out[id] = normalizeEntry(e);
   return out;
 }
 
 // 现有条目 id 列表：文件缺失（首个模板尚未创建）→ []；空文件 → []。
 // suggest 需要它做防重——不能直接用 configsLoad，其 MISSING 异常是给「加载配置」语义的，不该挡在保存前
 export function existingConfigIds(path: string): string[] {
   if (!existsSync(path)) return [];
   const s = readFileSync(path, 'utf8');
   if (s.trim().length === 0) return [];
   return Object.keys(configsLoad(path));
 }
 
 // suggest：自动生成唯一配置 id——保存后写入 yaml key，故必须符合 validateConfigId（小写字母开头、[a-z0-9]、≤32）且与现有条目不重名。
 // 碰撞概率低（时间戳+随机尾巴），但渲染端可能连续两次秒级保存同一时间戳 → 循环重试直至唯一
-export function suggestConfigId(existing: string[]): string {
+export function suggestConfigId(existing: string[], prefix = 'tpl'): string {
   const rand = (): string => Math.floor(Math.random() * 10000).toString(16).padStart(4, '0');
   for (let i = 0; i < 100; i++) {
-    const candidate = 'tpl' + Date.now().toString(36) + rand();
+    const candidate = prefix + Date.now().toString(36) + rand();
     if (validateConfigId(candidate) && !existing.includes(candidate)) return candidate;
   }
   throw new Error('VALIDATION: ' + t('err.config.idGen'));
 }
 
 // save：坏 id → VALIDATION；值 trim 后空串丢弃；文件不存在则首次创建。
 // defaults（2026-09 params_default）：被保存条目缺失的默认值自动补入（用户已设值不覆盖）
 export function saveConfigEntry(path: string, id: string, name: string | undefined, values: Record<string, string>, defaults?: ParamsFile): void {
   if (!validateConfigId(id)) throw new Error('VALIDATION: ' + t('err.config.idFormat'));
   let map: ConfigsMap = {};
   if (existsSync(path)) map = configsLoad(path); // legacy desc → name 归一（任意一次保存后即固化）
   const clean: Record<string, string> = {};
   for (const [k, v] of Object.entries(values)) {
     const t = v.trim();
     if (t.length > 0) clean[k] = t;
```
