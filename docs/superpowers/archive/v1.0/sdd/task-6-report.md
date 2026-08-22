# 任务 6 报告：style.css + App.vue 布局骨架（§4.5 设计语言）

## 状态
DONE

## 提交
- SHA: 0a5431269a1fcea3a157e41b4ae6ac3c8b3ddc55
- 标题: feat: 设计语言样式层 + 四模块网格骨架（§4.5）
- 基线: c413152（干净）；变更 7 files, +173/-4

## 实现内容

1. **src/style.css 整体重写**（原 2 行 → 123 行）：
   - :root CSS 变量，全部 §4.5 设计参数逐项落地（见自审表）；
   - reset（box-sizing / body 字体 14px / 底色 #F6F7F8）；
   - 布局骨架：`.layout`（flex 列、100vh）、`.grid`（三卡片等宽网格、间距 12px）、`.log-area`（flex:1 1 50% ≈ 半高）；
   - `.card`（白底 #FFFFFF、圆角 12px、边框 1px #E2E5E9、内边距 16px、极浅阴影）；
   - `.btn/.btn-primary/.btn-danger`（圆角 8px、主按钮高 36px 蓝底 #3B82F6 白字 hover 加深、次要白底边框 #D0D7DE）；
   - §4.3 状态按钮三态类：`.btn-launch`（空闲白底蓝框）/ `.running`（红底 #EF4444 白字「停止」）/ :disabled 灰化 #E5E7EB——任务 8 直接切 class；
   - `.input/.select`（高 32px、focus 蓝边框 + 柔和蓝 ring）；报错态 `.error` 红框 + `.error-text` 12px 红字；
   - `.log-panel/.log-view`（§4.4：白底细边框卡片式、等宽 Cascadia Code/Consolas 13px、user-select 可选不可编辑）+ Solarized Light 五档着色类 ln-err/#D63E0A、ln-warn/#B27500、ln-ok/#557C1F、ln-dim/#7A8194。
   - 说明：style.css 由 Vite 直接处理（不是 CSS Modules），全部类名为全局裸名，App.vue/模块无需 scoped。

2. **src/App.vue**：按简报模板——标题 h1.app-title + 上区三卡片（DirModule / TemplateModule / LaunchBar，各包在 .card div 中）+ 下区 `.log-area > LogPanel`。script setup 导入四个占位模块。

3. **src/modules/ 四个占位组件**（新建）：
   - DirModule.vue：`<section class="module module-dir"><h2>llama.cpp 安装目录</h2>…占位…</section>`
   - TemplateModule.vue / LaunchBar.vue：同构占位；
   - LogPanel.vue：`.log-panel > h3 + .log-view`（任务 7/8 填入内容即可撑高滚动）。
   - 均 \<script setup lang="ts">\ 空 setup + 单 <section>，无逻辑。

4. **src/ipc.ts 追加 errMsg**：
    ~~~ts
    export function errMsg(err: unknown): string {
      return err instanceof Error ? err.message : String(err);
    }
    ~~~
   其余内容（invoke/onLogLine/onProcessExit/onTrayExitRequest/isMissing/isValidation）一字未动（git diff 确认 +5 行纯追加）。

## 验证输出

### npm run build（vite + tsc main）
~~~
✓ 16 modules transformed.
dist/index.html              0.30 kB │ gzip: 0.23 kB
dist/assets/index-C2NJFGNY.css   3.05 kB │ gzip: 1.11 kB
dist/assets/index-ChqXwebZ.js   62.73 kB │ gzip: 24.99 kB
✓ built in 318ms
~~~
（首次构建有一次 esbuild CSS 警告：style.css 行首误用 // 注释 → 已改 /* */，重建后警告消失。）

### npx tsc -p tsconfig.main.json --noEmit
退出码 0、无输出（主进程回归确认——本任务未动 src-main/）。

## 修改文件清单
| 文件 | 变更 |
|---|---|
| src/style.css | 重写（2 → 123 行） |
| src/App.vue | 重写（骨架 → 四模块网格 + 标题） |
| src/modules/DirModule.vue | 新建占位 |
| src/modules/TemplateModule.vue | 新建占位 |
| src/modules/LaunchBar.vue | 新建占位 |
| src/modules/LogPanel.vue | 新建占位 |
| src/ipc.ts | +5 行（errMsg 追加） |

未触碰：src-main/、package.json、vite.config.js。范围纪律保持。

## 自审（对照 §4.5 逐项）

| §4.5 条目 | 落实 |
|---|---|
| 布局 = LM Studio 式：上区三卡片 + 下区日志约半高 | .grid 三列 + .log-area flex:1 1 50% ✓ |
| 页面底色 #F6F7F8 | --bg ✓ |
| 卡片白底 #FFFFFF / 圆角 12px / 边框 1px #E2E5E9 / 无或极浅阴影 / 内边距 16px / 间距 12px | .card + --radius-card/--card-pad/--card-gap ✓（阴影用 0.04 透明度极浅）|
| 主按钮：圆角 8px、高 36px、蓝 #3B82F6 白字、hover 加深一档 | .btn-primary + --accent-hover #2563EB ✓ |
| 次要按钮：白底、边框 1px #D0D7DE、深灰字 | .btn ✓ |
| 状态按钮：空闲=白底蓝框「启动」/运行中=红底 #EF4444 白字「停止」/禁用灰 #E5E7EB | .btn-launch(.running)/:disabled ✓（按钮文字切换属任务 8） |
| 输入框/下拉：白底、边框 1px #D0D7DE、圆角 8px、高 32px；focus=蓝边框+柔和蓝 ring | .input/.select focus ✓ |
| 报错态：红框 #EF4444 + 下方 12px 红色说明 | .error/.error-text ✓ |
| 字号：标题 16 / 正文·输入 14 / 标签·辅助 12；字体 Segoe UI 跟随系统 | --fs-title/body/label + body font ✓ |
| （§4.4 附赠）日志白底细边框不深块、等宽 Cascadia Code/Consolas 13px、只读可选可复制、五档 Solarized Light 着色 | .log-panel/.log-view + ln-* ✓（行为层任务 7/8） |

额外核对：简报骨架变量与 §4.5 冲突处以 §4.5 原文为准（如 #E2E5E9/#D0D7DE/#3B82F6/#EF4444 vs 简报 #E5E7EB/#2563EB），简报注释也要求"按规格原文展开"。errMsg 签名与任务 5 审查约定一致（err instanceof Error → .message）。

## 疑虑

1. **上区三卡片等宽假设**：§4.1–4.3 未给列宽比例，骨架采用 1:1:1；任务 7/8 若某模块明显需要更宽（如模板列表），可在 .grid 上加 grid-template-columns 覆盖，不影响本骨架。
2. **CSS 作用域**：style.css 是全局裸类名（Vite 非 CSS Modules）。若任务 7/8 给占位组件加 scoped 样式，需确认 :deep 或沿用全局类——占位组件当前未用 scoped。
3. **.card h2/h3 标题字号 16px**：卡片模块标题按 §4.5「标题 16px」统一处理；若某模块内需要更小的次级标题，可另加 .label（12px）已有。
4. **errMsg 已就位但尚无调用方**（任务 7/8 的 catch 将统一走它），当前 build 无 TS 未使用告警（非 strict 检查项），风险为零。
