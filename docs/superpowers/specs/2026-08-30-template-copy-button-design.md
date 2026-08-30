# 参数模板列表「复制」按钮设计

日期：2026-08-30
状态：已批准（方案 A：递增编号命名）

## 1. 需求

参数模板列表每行在 [编辑] 按钮左边添加 [复制] 按钮（FontAwesome regular 款 `faCopy`）：

1. 点击复制按钮，复制当前行的全部配置（values 原样深拷贝）
2. 复制出的配置生成新 id（yaml 安全、唯一，复用 `suggest_config_id`）
3. 名字在原 name 后加 " - copy" 后缀
4. 复制出的配置放在被复制配置的正后方（列表顺序）
5. 反复点击复制，新名字必须互不冲突（见 §3）

## 2. 方案

### 2.1 不新增 IPC 命令

复制 = 渲染端组合现有两个命令：

```ts
const newId = await invoke<string>('suggest_config_id'); // 主进程保证 yaml 安全 + 不重名
const newName = nextCopyName(src.name, allNames);        // §3 命名
await invoke('save_config', newId, newName, { ...src.values });
// 本地重建 configs Record（JS 对象字符串键保持插入序）：newId 插在 srcId 之后
// emit('changed') → App bump LaunchBar configs-reload-key，下拉同步刷新
```

失败（VALIDATION / IO）→ 复用现有 `error` ref 展示，列表保持不变。

### 2.2 UI（仅改 TemplateModule.vue）

- `library.add` 注册 `faCopy`（regular，@fortawesome/free-regular-svg-icons），
  `byPrefixAndName.fat['copy']`
- 每行 `.tpl-row` 内、编辑按钮左边加
  `<button class="icon-btn icon-btn--sm" data-tooltip="复制" aria-label="复制">`
  （同编辑按钮款式与 tooltip 语言）
- 命名基础 = `entry.name`（保存时名字必填，name 缺失分支不设）

### 2.3 命名唯一性（方案 A：递增编号 + 占用检测）

- 候选序列：`base - copy`、`base - copy 2`、`base - copy 3`、…
  取**第一个不在现有全部条目 name 集合中**的（显示层唯一性；数据唯一性恒由 id 保证）
- **剥后缀防叠加**：若 base 本身以 ` - copy` 或 ` - copy N` 结尾，先剥掉该后缀还原
  原始 base 再编号——对复制品反复复制始终得到 `日常 - copy`、`日常 - copy 2`…，
  不会滚成 `日常 - copy - copy`
- 用户删除中间编号后再复制 → 编号复用（取最小可用，无冲突）
- 名字唯一性检查范围 = 当前全部配置（含源自身）；纯显示层，永不阻塞

### 2.4 列表顺序

`configs` 为 Record，键序 = 插入序 = 显示序。保存成功后本地重建：
按现有键序遍历，遇到 `srcId` 后插入 `newId`，其余不动。
（持久层顺序由主进程 `saveConfigEntry` 追加到 yaml 末尾，与本次插入位置无关——
下一次 `reload` 会从 yaml 重建顺序；复制后用户不做其他保存前，UI 顺序正确。）

### 2.5 测试（TemplateModule.test.ts 组件级）

- 每行渲染 [复制] 按钮且位于 [编辑] 按钮左边（DOM 顺序）
- 点击复制 → 新条目插入源行之后、values 完整拷贝、name = "X - copy"、新 id 经 suggest 生成
- 对已有 "X - copy" 的条目复制 → 剥后缀 + 递增 → "X - copy 2"
- 重复名字被跳过（占用检测生效）

## 3. 非目标

- 不做复制确认对话框（非破坏性操作）
- 不做批量复制 / 右键菜单
- 不改持久层顺序（yaml 键序随 append）
