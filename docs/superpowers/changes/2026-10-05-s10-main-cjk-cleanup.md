# S10 收尾：main.ts 剩余 2 处中文接入词典 + 零硬编码守护 PENDING 归零

**日期：** 2026-10-05
**分支：** `master`
**性质：** 小改动（单分片收尾；零新增词条、无跨进程契约、无新状态机、无新依赖）
**关联：** S10 分片（主进程日志与错误 i18n）；守护用例 `src-main/i18n/no-hardcoded.test.ts`

---

## 1. 背景

三件事叠加，使仓库在 `b7ca398` 上处于「文档说已归零、代码没归零、守护用例红灯」的状态：

1. **真实缺口**：`src-main/main.ts` 仍有 2 处硬编码中文，且 S10 已按契约备好对应的**双语 key 却从未调用**（死 key）：
   - `main.ts:884` 占用错误文案 ↔ `err.llama.busy`（`dict.ts:234` zh / `dict.ts:509` en）；
   - `main.ts:903` 旧 CUDA DLL 清理日志 ↔ `log.llama.dll.cleaned`（`dict.ts:212` zh / `dict.ts:487` en）。
   两处均为 **2026-09-16 / 09-18 的旧提交**遗留；`git blame` 显示紧邻行都已在 S10 转换，唯这两行漏改。
2. **S10 声明失真**：S10 完成提交 `c6d5232` 中 `PENDING` 仍含 `src-main/main.ts`，分片文档却写「PENDING 归零」。
3. **守护用例回归**：提交 `6a1d692`（S11）重写第一个断言时丢掉 `!PENDING.has(f)` 跳过（并删掉文件末尾换行）→ 上述遗漏由「已知未清理」变为硬断言红灯（`npm test` = 583 通过 / 1 失败）。

**用户可见影响（英文界面）：** 弹窗红字与「LMS 启动器」日志区仍会出现中文。

---

## 2. 改动

| 文件 | 改动 |
|---|---|
| `src-main/main.ts:884` | 硬编码 → `t('err.llama.busy', { names })` |
| `src-main/main.ts:903` | 硬编码 → `emitLog('[lms_launcher] ' + t('log.llama.dll.cleaned', { list: stale.deleted.join(', ') }), 'sys')` |
| `src-main/i18n/no-hardcoded.test.ts` | 删除 `PENDING` 集合与第二条用例；第一个断言改名「全部目标文件(词典除外)…」并对全部目标无条件硬断言；恢复文件末尾换行；顶部注释更新为「归零后终局」 |
| `src-main/i18n/dict.test.ts` | 新增 1 条用例，逐字锁定上述两条 key 的 zh/en 值 |

**零改动：** `src-main/i18n/dict.ts`（词条早已存在，不新增）、`src/**`、`scripts/**`、`package.json`。

---

## 3. 决策

| # | 问题 | 决定 |
|---|---|---|
| Q1 | 是否修 | **修**：词典 key 已具备 → 是 S10 未收尾，而非新需求；不修则英文界面持续出现中文 + 2 个死 key |
| Q2 | 列表分隔符 | 保持 `join(', ')` → 中文日志与改造前**逐字一致**（zh 零回归）；不改用 `common.listSep`（那会引入 zh 文案变更） |
| Q3 | `PENDING` 机制终局 | **删除**（而非「恢复跳过」）——清空后机制恒为 no-op、第二条用例空跑；删除后守护为无白名单的全量硬断言，即 S10 验收写的终局 |

---

## 4. 验证（实测）

| 检查 | 命令 | 结果 |
|---|---|---|
| 守护用例 | `npx vitest run src-main/i18n/no-hardcoded.test.ts` | **2 passed**（改前 2 passed / 1 failed） |
| 词典用例 | `npx vitest run src-main/i18n/dict.test.ts` | **9 passed**（含新增 1 条） |
| 全量测试 | `npm test` | **35 文件 / 584 用例全绿**（改前 583 通过 + 1 失败；净 0：−1 条 PENDING 用例 + 1 条词典锁定用例） |
| 类型检查 | `npx tsc -p tsconfig.main.json` | exit 0 |
| 构建 | `npm run build` | `vite build` + `tsc` 均通过 |
| 中文零回归 | `dict.test.ts` 新增用例逐字断言 | zh 值与改造前的硬编码字符串完全一致 |

**人工验收（可选，用户执行）：** 英文界面下触发一次「文件被占用」安装失败或旧 CUDA DLL 清理，确认弹窗红字/日志行显示英文。

---

## 5. 遗留

- `src-main/main.ts` 含汉字的字符串字面量扫描结果 = **0**（全仓 `src-main/**` + `src/App.vue` 均已归零）。
- S10 分片卡（`2026-09-22-i18n-slices.md`）已随 `b7ca398`「清理旧文档」删除；本记录使「PENDING 归零」这一声明在代码层真实成立。
- 无新增待办。
