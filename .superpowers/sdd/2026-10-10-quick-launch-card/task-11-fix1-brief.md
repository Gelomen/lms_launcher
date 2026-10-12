# 任务 11 · 定向修复轮 1（唯一一处：`stopping` 占位符改半角三点，索引 K30）

背景：任务 11 我已验收通过（复跑 G1 10 passed / G2 25 passed / tsc exit 0；我的四处变异计数与你完全一致：① 1 红 E5、② 1 红 E4、③ 1 红 E6、④ 2 红 E2+E3；还原 SHA `0a0739585295`）。只剩一处字符口径，口径已定并**文档先行**（commit `92cb87b`，索引 K30 + 任务 11 表 A4/E4 已更正）。

## 要改的（只有两处文件、三处字符）

1. `src/modules/QuickLaunch.vue:161`：`<span v-else-if="stateOf(id).stopping">…</span>` 里的 U+2026 → **半角三点 `...`**（与既有 `src/modules/LaunchBar.vue:129` 逐字一致）。
2. `src/modules/QuickLaunch.vue:157` 注释里的「…」→ 半角三点（别留 U+2026）。
3. `src/modules/QuickLaunch.test.ts` 里 E4 用例中断该占位符字符的断言 → 半角三点。

**注意别误伤**：`:73-77`、`:93` 断的是**截断省略号**（`truncateByWidth` 产生的 U+2026），那些**保持 U+2026 不动**——只有 `stopping` 的占位符改半角。

其余一字不改（`dict.ts` 已改的那行、其它文件、样式、类名 `module-quick` 都不动）。不 `git add`、不 commit（K5）。不派子代理。

## 门（跑完把命令与真实输出追加到 check 表 J 段，并在报告新增一节「定向修复轮 1」）

- `npx vitest run src/modules/QuickLaunch.test.ts src/util/copy-name.test.ts` → 仍 `10 passed`（E4 仍红→绿要在报告里说明：先改断言看到红，再改实现变绿）
- `npm test` → 仍 `46 files / 782 passed`，无减少
- `npx tsc -p tsconfig.main.json --noEmit` → exit 0
- 变异自检一处：把 `stopping` 分支的半角三点改回 U+2026 → E4 必须红；还原后报 `QuickLaunch.vue` 的 SHA-256/12（改前 `0a0739585295`，改后请给出新值并确认稳定）。

回传给我（简短）：状态一行 + 三条门真实计数 + 变异红几条 + 改后 SHA。