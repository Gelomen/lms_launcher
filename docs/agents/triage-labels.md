# 分级标签（Triage Labels）

本仓使用的工程技能用五个规范化的分级角色来沟通。本文件把这些角色映射到本仓 issue tracker 里实际使用的标签字符串。

| mattpocock/skills 里的标签 | 本仓 tracker 里的标签 | 含义 |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | 待维护者评估这条 issue  |
| `needs-info`               | `needs-info`         | 等报告者补充信息 |
| `ready-for-agent`          | `ready-for-agent`    | 规格已完备，可以交给 AFK 代理实现  |
| `ready-for-human`          | `ready-for-human`    | 需要人来实现            |
| `wontfix`                  | `wontfix`            | 不予处理                     |

当某个技能提到某个分级角色（例如「打上 AFK-ready 的分级标签」）时，用本表「本仓 tracker 里的标签」那一列的字符串。

本表五条标签已于 2026-10-18 在本仓 tracker 建好并实际使用（spec #1 与三张子票都带 `ready-for-agent`；`wontfix` 是 GitHub 默认标签，原本就在）。2026-10-19 经 `gh label list` 复核：五条全部在位，描述与默认词表一致（`needs-triage` = Raw issue awaiting triage、`needs-info` = Waiting on more information、`ready-for-agent` = Agent-ready: can be implemented as-is、`ready-for-human` = Needs a human, not an agent）。本表未做任何改名。

想换用你自己的标签词汇，就改「本仓 tracker 里的标签」这一列。
