# 领域文档（Domain Docs）

工程技能在探索代码库时应该怎样消费本仓的领域文档。

## 探索之前先读这些

- 仓库根目录的 **`GLOSSARY.md`**；或
- 若存在 **`GLOSSARY-MAP.md`**（在仓库根），它指向每个上下文各自的 `GLOSSARY.md`。读与当前话题相关的那些。
- **`docs/adr/`**：读与你即将改动的区域相关的 ADR。多上下文仓库里，还要看 `src/<context>/docs/adr/` 里上下文级的决策。

这些文件若不存在，**静默跳过**：不要指出它们缺失，也不要主动建议先建。`/domain-modeling` 技能（入口是 `/grill-with-docs` 与 `/improve-codebase-architecture`）会在术语或决策真正定下来时按需创建它们。

## 当前状态（2026-10-18 实测，2026-10-19 复核）

本仓是**单上下文（single-context）**布局：`GLOSSARY.md` 在仓库根、ADR 放 `docs/adr/`。

两者**目前都还不存在**（`GLOSSARY.md`、`GLOSSARY-MAP.md`、`docs/adr/` 实测均缺失）。按上面的规则静默跳过即可：不要

**同日再复核（2026-10-19，票 #6）**：`GLOSSARY.md` 已按惰性创建口径建立——首条「快捷启动类型（QuickLaunchKind）」。
`GLOSSARY-MAP.md` 与 `docs/adr/` 仍不存在；单上下文判定不变，静默跳过口径不变。因为找不到就报错或先建空文件，等术语或决策真正定下来时由 `/domain-modeling` 建。同样地，`AGENTS.md` 与 `docs/agents/domain.md` 里写的「单上下文」是**声明的布局**，不是「文件已就位」。

**单上下文判定依据（2026-10-19 复核，仍然成立）**：没有 monorepo 迹象——`pnpm-workspace.yaml` 只有 `allowBuilds`（electron / esbuild），没有 `packages` 条目；根目录没有 `packages/*`；`package.json` 没有 `workspaces` 字段。因此不需要根目录 `GLOSSARY-MAP.md`。

## 文件结构

单上下文仓库（single-context，绝大多数仓库属于这种）：

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（multi-context，根目录有 `GLOSSARY-MAP.md`）：

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 全系统级决策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## 使用术语表里的词汇

当你的产出要写出一个领域概念（issue 标题、重构提案、假设、测试名），用 `GLOSSARY.md` 里定义的词。不要漂移到术语表明令回避的同义词。

你要用的概念还不在术语表里，这本身就是信号：要么你在发明项目并不使用的语言（那就重新想），要么是真有缺口（记下来交给 `/domain-modeling`）。

## 撞上 ADR 就明说

你的产出若与既有 ADR 冲突，明确点出来，不要悄悄覆盖：

> _与 ADR-0007（事件溯源的订单）冲突，但值得重开，因为……_
