# 设置弹窗「变更才落盘、才记日志」· 设计文档

> 日期：2026-10-08 ｜ 状态：待评审（访谈已定稿） ｜ 实现计划：[../plans/2026-10-08-settings-save-change-only.md](../plans/2026-10-08-settings-save-change-only.md)

## 1. 背景（以下均为代码事实）

用户报告：设置弹窗里什么都不改，点保存就在日志区留下一条 `[lms_launcher] 设置 · 已清空代理`；填好代理后再次打开、再次原样保存，又留下一条同样的 `已保存代理 http://127.0.0.1:10808`。

```
[lms_launcher] 设置 · 已清空代理            ← 空配置直接点保存（无变化）
[lms_launcher] 设置 · 已清空代理            ← 同上，第二次
[lms_launcher] 设置 · 已保存代理 http://127.0.0.1:10808   ← 填值后保存（有变化）
[lms_launcher] 设置 · 已保存代理 http://127.0.0.1:10808   ← 重开弹窗原样保存（无变化）
```

| # | 事实 | 证据 |
|---|---|---|
| F1 | `save_proxy` 处理器**无条件**记日志：`saveProxy()` 返回后直接按 `cfg.proxy` 有无拼 `proxySaved` / `proxyCleared` 并 `emitLog` | `src-main/main.ts:258-266` |
| F2 | `saveProxy()` **无条件**落盘：两条分支都以 `appConfigSave(p, cfg)` 收尾；`appConfigSave` 就是 `writeFileSync(path, dump(cfg))` 全量重写 | `src-main/config.ts:196-211`、`src-main/config.ts:71-73` |
| F3 | 弹窗每次挂载/打开都从配置回填输入框，`save()` 无条件 `invoke('save_proxy', host, port)` → 「原样点保存」= 把文件里的同一份值读回来再写回去 | `src/modules/SettingsModal.vue:37-43`、`:45-55`、`:75-90` |
| F4 | 语言路径同样无条件写 yaml：`set_language` 里 `appConfigLoad` → `appConfigSave(p, { ...cfg, language: lang })`，没有比较 | `src-main/main.ts:246-256` |
| F5 | 重复选同一语言确实会走到写盘：`Dropdown.pick` 不比较 `props.value` 就 emit；`onLangChange` 只校验值合法性、不比较当前语言；`setLang` 无条件 `invoke('set_language', l)` | `src/components/Dropdown.vue:28`、`src/modules/SettingsModal.vue:32-35`、`src/i18n.ts:24-27` |
| F6 | 运行期语言与 yaml 内容**可以不一致**：启动时 `yaml.language` 缺省 → 回落 `resolveSystemLang(app.getLocale())`。所以「与内存态比较」和「与文件比较」在缺键场景下结论不同 | `src-main/main.ts:90-94` |
| F7 | `appConfigLoad` 把 `proxy` 原样透传、不做归一；`ProxyConfig` 的 `host`/`port` 都是可选字段 → 手工编辑的 yaml 里可能出现 `proxy: {}`、只有 host、port 为字符串等畸形节 | `src-main/config.ts:63`、`src-main/config.ts:5` |
| F8 | `yaml` 库的 `stringify` **省略值为 `undefined` 的键**（实测 `stringify({llama_dir:'', proxy: undefined})` → `llama_dir: ""`），所以「`cfg.proxy = undefined` 后整节消失」是既有且可靠的机制 | 对 `node_modules/yaml` 的实测；`src-main/config.ts:201` 的注释即依赖此行为 |
| F9 | 校验有两份且互不替代：渲染端 `validate()` 挡「只填一半」与端口范围；主进程 `saveProxy` 另有一份端口校验并 throw | `src/modules/SettingsModal.vue:63-73`、`src-main/config.ts:205-207` |
| F10 | `main.ts` 没有任何单测：`vitest.config.ts` 只收 `src-main/**`、`src/**` 的 `*.test.ts`，而全仓无一处 import `./main`，也没有 electron mock 基建 → 「是否记日志」这一层无法直接断言 | `vitest.config.ts:8`、对 `./main` 的全仓引用扫描 |
| F11 | 现有 4 个 `saveProxy` 用例断言返回值就是 `AppConfig`（`cfg.proxy`）→ 改返回类型必须同步它们 | `src-main/config.test.ts:342-372` |
| F12 | 日志文案 key 中英齐备（`log.launcher.settings.{proxySaved,proxyCleared}`）→ 本次不动文案，只动「打不打」 | `src-main/i18n/dict.ts:173-174`、`:453-454` |
| F13 | `@saved` 与 `@close` 一样只关弹窗，没有别的副作用 → 去掉日志后，「弹窗关闭」就是保存的唯一确认 | `src/App.vue:384` |
| F14 | `appConfigLoad` 在「文件缺失」与「文件存在但内容为空」两条 fallback 下**原样返回模块级共享对象** `EMPTY_APP_CONFIG`，而 `saveProxy`/`saveLlamaDir` 随后 `cfg.proxy = …` 就地写脏 → 之后每次 fallback 都拿到被污染的值 | `src-main/config.ts:38`（原）、`:58`、`:68` |

## 2. 目标与非目标

**目标**

- G1 设置弹窗点保存时，**只有本次真的修改了 `lms_launcher.yaml` 才记对应日志**；无变化则日志区一行都不加。
- G2 无变化时**不落盘**：文件内容与 mtime 都不动（不做「写一份一样的」这种空操作）。
- G3 语言路径同样不再无意义落盘（F4/F5）。
- G4 判定逻辑落在可测模块（`config.ts`），由 `config.test.ts` 完整覆盖——F10 决定了判定不能留在 `main.ts` 里。

**非目标**

- 不改日志文案与 i18n key（F12），不改 `key-coverage` 等既有守护。
- 不改渲染端校验（F9 的两份校验保持原样）。
- 不改弹窗交互：保存后仍照常 `emit('saved')` 关弹窗（F13），不加「未做修改」提示。
- 不给 `main.ts` 新建 electron 测试基建。
- 不改 `saveLlamaDir`（安装目录卡片无日志，且它由校验通过自动触发，不在本次诉求内）。

## 3. 决策记录

| # | 议题 | 结论 | 理由 / 代价 |
|---|---|---|---|
| H1 | 「确实修改了」用什么口径 | **语义比较**：把输入与文件现值都归一化后比较，只有语义不同才算修改 | 端口写成 `010808` 与文件里的 `10808` 语义相同 → 未修改。文本 diff 会被无关字段与格式波动牵连 |
| H2 | 判定基线是什么 | **`lms_launcher.yaml` 的当前内容**，不是内存态（语言不用 `getLang()`） | 与「确实修改了 yaml」的字面诉求一致；F6 说明内存态与文件可以不同，用内存态会漏掉「文件缺键」这一类真实变化 |
| H3 | 判定为未修改时是否落盘 | **完全不写**：跳过 `writeFileSync`，文件与 mtime 都不动 | 「无变化」与「写一份相同内容」对用户不可区分，但 mtime 变化会污染备份/同步；`010808` 也不会被改写 |
| H4 | 无变化时的交互 | **只去掉日志，其余不变**：仍 `emit('saved')` 关弹窗，不加提示 | 关闭本身就是保存成功的确认（F13）；加提示要新增文案与布局，收益不抵成本 |
| H5 | 适用范围 | 代理 + 语言两处；`saveLlamaDir` 不动 | 用户明确要顺带让语言切换不再无意义落盘；安装目录路径无日志、不在诉求内 |
| H6 | 「文件里没有该配置」怎么算 | **有值 → 缺键 = 变化**（要写）；**无值 → 缺键 = 未变化**（不动文件） | 语言：yaml 无 `language` 键、弹窗里选了值 → 变化，写入 `language: zh`。代理：yaml 无 `proxy` 节、输入框也空 → 两者都表示「直连」，未变化——这正是用户报的那条重复 `已清空代理` |
| H7 | 清空已有代理怎么算 | **算变化**：写盘（节消失，F8）并打 `已清空代理` | 文件确实被修改了；用户样本里多余的只是「重复清空」那几条 |
| H8 | 畸形节（`proxy: {}`、只有 host、port 为字符串） | **归一后等价即未变化**：`host`/`port` 任一缺失或非法 → 视为「无 proxy」，与无节、与空输入三者等价 | 规则单一，不出现「用户没填任何东西却收到一条清空日志」。代价：`proxy: {}` 这类垃圾节不会被自动清理（只在真变化时被覆盖） |
| H9 | 判定放哪一层 | `saveProxy` 返回 `{ cfg, changed }`，新增 `saveLanguage` 同样返回 `{ cfg, changed }`；`main.ts` 只按 `changed` 决定是否 `emitLog` | 决定是否写盘的那一层同时报告是否写了——单一真源，判定与写盘不会漂移；且判定在可测模块里（F10） |
| H10 | 语言未变化时 `applyLang` 与重建托盘 | **照旧执行，只跳过写盘** | 幂等、成本极低；若运行期语言与文件不一致（外部改过 yaml），界面仍会被纠正 |
| H11 | F14 的共享对象污染（实现期发现，2026-10-08 控制者裁定） | **改根因**：删掉 `EMPTY_APP_CONFIG` 单例，改为每次新建的 `emptyAppConfig()` 工厂，两条 fallback 都用它；并为 `appConfigLoad` 的契约本身补守护测试 | 旧代码无条件落盘，脏值看不见；本设计把 `appConfigLoad` 的结果当判定基线（H2），污染就会变成真实缺陷——yaml 缺失时用户填的代理若等于脏值会被判「未变化」而永不落盘。用测试先建文件来绕开只会把缺陷藏回去。代价：多一处改动，但全仓只有那 3 处引用 |

## 4. 行为规格

### 4.1 代理（`save_proxy`）

「文件」= `lms_launcher.yaml` 里 `proxy` 节的**归一化**语义；「输入」= 本次提交的 host/port 归一化后的目标状态。

| # | 文件当前 | 本次输入 | 判定 | 落盘 | 日志 |
|---|---|---|---|---|---|
| P1 | 无 `proxy` 节 | 空 / 空 | 未变化 | 不写（mtime 不变） | 无 |
| P2 | `proxy: {}` 或只有 host、port 非法 | 空 / 空 | 未变化（H8） | 不写 | 无 |
| P3 | 无 `proxy` 节 | `127.0.0.1` / `10808` | **变化** | 写入该节 | `设置 · 已保存代理 http://127.0.0.1:10808` |
| P4 | `proxy: {host: 127.0.0.1, port: 10808}` | `127.0.0.1` / `10808` | 未变化 | 不写 | 无 |
| P5 | 同上 | `127.0.0.1` / `010808`（或带首尾空格） | 未变化（H1 归一） | 不写，文件仍为 `10808` | 无 |
| P6 | 同上 | `127.0.0.1` / `7890` | **变化** | 覆盖为新值 | `设置 · 已保存代理 http://127.0.0.1:7890` |
| P7 | `proxy: {host: 127.0.0.1, port: 10808}` | 空 / 空 | **变化** | 整节消失（F8） | `设置 · 已清空代理` |
| P8 | 任意 | 只填一半 / 端口越界 | 校验失败，**不进入判定** | 不写 | 无（渲染端红字，F9） |

### 4.2 语言（`set_language`）

| # | 文件当前 | 本次选择 | 判定 | 落盘 | 其他副作用 |
|---|---|---|---|---|---|
| L1 | 无 `language` 键（运行期语言来自系统 locale） | 与运行期相同的语言 | **变化**（H2/H6：文件缺键而弹窗有值） | 写入 `language: <lang>` | `applyLang` + 重建托盘照旧 |
| L2 | `language: zh` | `zh` | 未变化 | 不写（mtime 不变） | `applyLang` + 重建托盘照旧（H10） |
| L3 | `language: zh` | `en` | **变化** | 写入 `language: en` | `applyLang` + 重建托盘照旧 |
| L4 | 任意 | 非 `zh`/`en` | IPC 边界防御直接 return（既有行为不变） | 不写 | 无 |

语言路径**始终没有日志**（本次不新增）。

## 5. 契约

### 5.1 `src-main/config.ts`

```ts
/** 保存结果：changed = 本次是否真的修改了 yaml；false 表示未落盘，调用方据此不记日志。 */
export interface ConfigSaveResult { cfg: AppConfig; changed: boolean; }

/** 归一化：host/port 任一缺失或非法 → undefined（= 直连）。文件侧与输入侧共用同一函数（H8）。 */
function normalizeProxy(p: ProxyConfig | undefined): ProxyConfig | undefined;

/** 变更才落盘：先校验（throw 契约不变），再与文件现值归一比较；相同则不写文件、changed=false。 */
export function saveProxy(p: string, host: string, port: string): ConfigSaveResult;

/** 与文件里的 language 比较（不用 getLang，H2）：相同则不写文件、changed=false。 */
export function saveLanguage(p: string, lang: Lang): ConfigSaveResult;

/** fallback 用的空配置：每次新建，绝不共享（F14/H11）。 */
function emptyAppConfig(): AppConfig;
```

- `saveProxy` 的 throw 契约逐字保持：只填一半 → `err.config.proxyPortEmpty`；端口非 1–65535 整数 → `settings.proxy.err.port`（F9）。校验在判定**之前**。
- `changed: true` 时返回的 `cfg.proxy` 就是刚落盘的目标值 → `main.ts` 现有的「按 `cfg.proxy` 拼 `proxySaved`/`proxyCleared`」逻辑不动，只加 `changed` 门。
- `changed: false` 时返回的 `cfg` 是文件原样（可能含畸形节），调用方不得据此记日志。

### 5.2 `src-main/main.ts`

| 调用点 | 改动 |
|---|---|
| `save_proxy`（`:258-266`） | `const { cfg, changed } = saveProxy(...)`；`if (changed) { …emitLog… }`，日志文案与 `emitLog('[lms_launcher] …', 'sys')` 形式不变 |
| `set_language`（`:246-256`） | `appConfigLoad` + `appConfigSave(p, { ...cfg, language: lang })` 两行换成 `saveLanguage(p, lang)`；`applyLang` 与重建托盘/tooltip 保持无条件执行（H10） |

渲染端（`SettingsModal.vue`、`i18n.ts`、`App.vue`）**零改动**。

## 6. 验收

- V1 新增用例在改动**之前**即失败：至少「同值再保存 → `changed === false` 且 mtime 不变」「无 `proxy` 节 + 空输入 → `changed === false`」「`language` 同值 → `changed === false`」三条为红——证明它们有牙。mtime 用 `utimesSync(p, 1970, 1970)` 做哨兵，避免时间戳粒度造成假绿。
- V2 改动之后 `npx vitest run` 全绿；`config.test.ts:342-372` 的 4 个既有用例改为解构 `{ cfg }` 后语义不变（F11），`language_round_trips_and_survives_incremental_saves`（`:218-228`）与「增量保存不丢其他节」（`:383+`）仍绿——证明 `changed` 门没有把该写的挡掉。
- V3 `npx tsc -p tsconfig.main.json` 无错。
- V4 `git diff` 中不出现 `dict.ts`、`SettingsModal.vue`、`i18n.ts`、`App.vue`（非目标边界）。
- V5 真机（`npm run dev`）：
  1. 清空 `configs/lms_launcher.yaml` 里的 `proxy` 节 → 打开设置直接保存 → 日志区**无新行**，文件未被改写（mtime 不变）。
  2. 填 `127.0.0.1` / `10808` 保存 → 恰好一条 `设置 · 已保存代理 http://127.0.0.1:10808`。
  3. 重开设置原样保存 → **无新行**；把端口改成 `010808` 保存 → 仍**无新行**，文件里仍是 `10808`。
  4. 清空两个输入框保存 → 恰好一条 `设置 · 已清空代理`，`proxy` 节从文件消失。
  5. 语言下拉重复选当前语言 → 文件 mtime 不变、托盘菜单正常；切到另一语言 → yaml 出现 `language: en` 且托盘菜单变英文。
- V6（H11 的守护）存在一条针对 `appConfigLoad` 契约本身的用例：「文件缺失」与「文件存在但内容为空」两条 fallback 下，第一次返回对象就地写脏后，第二次读取仍须是干净的 `{ llama_dir: '' }`。把 `emptyAppConfig()` 退回原共享单例时，这条用例必须红——证明它守的是契约而不是某个副作用。
