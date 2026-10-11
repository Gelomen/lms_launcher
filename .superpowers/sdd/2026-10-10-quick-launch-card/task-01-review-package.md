# 审查包 · 任务 1（nextCopyName）

BASE = 341319a（HEAD 未变：按 K5 实现者不提交，改动全部在工作区）

## git status --porcelain

```
M docs/superpowers/checks/2026-10-10-quick-launch-card/task-01-next-copy-name.md
 M src/modules/TemplateModule.vue
?? src/util/copy-name.test.ts
?? src/util/copy-name.ts
```

## git diff HEAD --stat（已跟踪文件）

```
.../task-01-next-copy-name.md                      | 59 +++++++++++++---------
 src/modules/TemplateModule.vue                     | 13 +----
 2 files changed, 35 insertions(+), 37 deletions(-)
```

## git diff HEAD -U10 -- src/（已跟踪文件）

```diff
diff --git a/src/modules/TemplateModule.vue b/src/modules/TemplateModule.vue
index 2bdef28..97ad6e6 100644
--- a/src/modules/TemplateModule.vue
+++ b/src/modules/TemplateModule.vue
@@ -1,19 +1,20 @@
 <script setup lang="ts">
 import { onMounted, ref } from 'vue';
 import { library, config } from '@fortawesome/fontawesome-svg-core';
 import { faPenToSquare, faCopy } from '@fortawesome/free-regular-svg-icons';
 import { faFileCirclePlus } from '@fortawesome/free-solid-svg-icons';
 import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
 import { invoke, errMsg, isMissing, isValidation } from '../ipc';
 import { t } from '../i18n';
 import { truncateByWidth, visualWidth } from '../util/truncate';
+import { nextCopyName } from '../util/copy-name';
 import TemplateModal from './TemplateModal.vue';
 import VramDialog from './VramDialog.vue';
 
 // FontAwesome：按需注册 pen-to-square regular 款（列表行「编辑」）+ file-circle-plus solid 款（新建模板按钮），tree-shakeable 用法；与 TemplateModal / Dropdown 同模式。
 config.autoGenerateCss = true;
 library.add(faPenToSquare, faCopy, faFileCirclePlus);
 const byPrefixAndName = { fat: { 'pen-to-square': faPenToSquare, copy: faCopy, 'file-circle-plus': faFileCirclePlus } };
 
 // 模块 2 · 启动参数模板管理（规格 §4.2）
 interface ParamMeta { params: Record<string, string>; required: string[]; params_options?: Record<string, string[]>; params_boolean?: string[]; params_file?: string[]; params_default?: Record<string, string> }
@@ -60,32 +61,20 @@ async function reload(): Promise<void> {
   }
   try {
     paramsMeta.value = await invoke<ParamMeta>('get_params');
   } catch (e) {
     const msg = errMsg(e);
     paramsMissing.value = isMissing(msg); // 参数表随包分发：MISSING 不再沿用空表（2026-10-06）
     if (!isMissing(msg) && !isValidation(msg)) error.value = msg; // 映射表本身坏了才报错
   }
 }
 
-// 复制命名（2026-08-30 spec-template-copy-button，方案 A：递增编号 + 占用检测）：
-// 候选 base - copy / base - copy 2 / …，取第一个不在现有 name 集合中的；
-// base 本身是复制品（- copy / - copy N 结尾）→ 剥后缀还原原始 base，防止滚成 "X - copy - copy"
-const COPY_SUFFIX = / - copy( \d+)?$/;
-function nextCopyName(base: string, taken: Set<string>): string {
-  const root = base.replace(COPY_SUFFIX, '');
-  for (let i = 1; ; i++) {
-    const cand = i === 1 ? `${root} - copy` : `${root} - copy ${i}`;
-    if (!taken.has(cand)) return cand;
-  }
-}
-
 // 复制：suggest_config_id 生成新 id → values 原样深拷贝 → name 加 - copy 后缀 → save_config 持久化；
 // 成功后本地重建 configs（字符串键保持插入序）把新条目插到源条目正后方 + emit('changed') 刷 LaunchBar；
 // 失败（VALIDATION/IO）→ error 区展示，列表不变
 const copying = ref(false);
 async function onCopy(id: string): Promise<void> {
   if (copying.value || !configs.value) return;
   const src = configs.value[id];
   if (!src) return;
   copying.value = true;
   error.value = null;
```

## 新增未跟踪文件全文：src/util/copy-name.ts（git diff 不显示未跟踪文件，故附全文）

```ts
 1: // 复制命名（2026-08-30 spec-template-copy-button，方案 A：递增编号 + 占用检测）：
 2: // 候选 base - copy / base - copy 2 / …，取第一个不在现有 name 集合中的；
 3: // base 本身是复制品（- copy / - copy N 结尾）→ 剥后缀还原原始 base，防止滚成 "X - copy - copy"
 4: // （2026-10-10 quick-launch-card 任务 1：从 src/modules/TemplateModule.vue 原样搬出，供模板卡与快捷启动卡共用，行为不变）
 5: const COPY_SUFFIX = / - copy( \d+)?$/;
 6: export function nextCopyName(base: string, taken: Set<string>): string {
 7:   const root = base.replace(COPY_SUFFIX, '');
 8:   for (let i = 1; ; i++) {
 9:     const cand = i === 1 ? `${root} - copy` : `${root} - copy ${i}`;
10:     if (!taken.has(cand)) return cand;
11:   }
12: }
```

## 新增未跟踪文件全文：src/util/copy-name.test.ts

```ts
 1: import { describe, expect, it } from 'vitest';
 2: import { nextCopyName } from './copy-name';
 3: 
 4: describe('nextCopyName', () => {
 5:   it('首次复制加 - copy 后缀', () => {
 6:     expect(nextCopyName('Qwen', new Set(['Qwen']))).toBe('Qwen - copy');
 7:   });
 8:   it('已占用时递增编号', () => {
 9:     expect(nextCopyName('Qwen', new Set(['Qwen', 'Qwen - copy']))).toBe('Qwen - copy 2');
10:   });
11:   it('源名本身是复制品时剥后缀重算', () => {
12:     expect(nextCopyName('Qwen - copy', new Set(['Qwen - copy']))).toBe('Qwen - copy 2');
13:     expect(nextCopyName('Qwen - copy 2', new Set(['Qwen - copy 2']))).toBe('Qwen - copy');
14:   });
15: });
```
