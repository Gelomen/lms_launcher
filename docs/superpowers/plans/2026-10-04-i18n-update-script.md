# S11 更新脚本文案英文化 实现计划

> 依据：`docs/superpowers/specs/2026-10-04-i18n-update-script-design.md`（设计权威为其上位 `2026-09-22-i18n-design.md`）
> 分支：`feat/i18n` ｜ 预计：< 1 人日 ｜ 验证深度：静态守护 + PS 语法解析（**实现阶段不执行任何 ps1**）

## 文件结构

| 文件 | 责任 | 任务 |
|---|---|---|
| `src-main/i18n/no-hardcoded.test.ts` | PS 词法提取器 `psLiteralText` + `PS_TARGETS` 硬断言 + 提取器自检 | 任务 1 |
| `scripts/lms-launcher-update.ps1` | 32 处含汉字字符串/XML 英文化 + run 标记行 | 任务 2 |
| `scripts/verify-relaunch.ps1` | 21 处中文输出英文化 + C5 锚点改 `=== update run ===` | 任务 3 |
| `docs/superpowers/specs/2026-09-22-i18n-slices.md` | 收口：S11 状态 ◐→✅ + 完成记录 + 变更记录 | 任务 4 |

**写作用域**：任务 2 与任务 3 文件不重叠，可并行；任务 1 的守护断言在任务 2/3 完成前应为**红**（预期的失败），任务 4 必须在 2、3 之后。

---

## 任务 1：守护用例 PS 提取器 + 两脚本 targets（先行，红）

**文件**：`src-main/i18n/no-hardcoded.test.ts`（只增不改现有断言与 `PENDING` 机制）

**步骤**：

1. 新增常量与提取器：

```ts
const PS_TARGETS = ['scripts/lms-launcher-update.ps1', 'scripts/verify-relaunch.ps1'];

// 只收集「字符串字面量内容」：跳过行注释/块注释/代码，保留单引号、双引号、here-string 内容
export function psLiteralText(src: string): string { ... }
```

2. 词法规则（对照 spec §7.2 实现）：
   - `#` → 跳到行尾；`<# … #>` → 整体跳过；
   - `@'` / `@"` 且其后仅剩换行 → here-string：从下一行收集到行首 `'@` / `"@`；
   - `'…'`：`''` 为一个转义单引号；
   - `"…"`：反引号转义下一位，`""` 为转义双引号，`$( … )` 内文本原样收集；
   - 其余字符跳过。
3. 新增两条 `it`：
   - **硬断言**：`PS_TARGETS` 逐个读文件 → `psLiteralText` → 断言 `!HAS_HAN.test(...)`（附文件名便于定位）；
   - **自检**：合成 PS 片段覆盖 spec §7.3 的五类（中文注释不算、中文单/双引号串算、here-string 算、`''` 与 `@( )` 不误判）。
4. 运行：`npx vitest run src-main/i18n/no-hardcoded.test.ts`
   - 自检用例 **PASS**；
   - 硬断言用例 **FAIL**（两脚本含中文）——这是任务 1 的预期状态，作为「守护确实生效」的证据（先红后绿）。

**完成判据**：自检绿；硬断言红且失败信息指向两脚本的汉字串。

---

## 任务 2：`scripts/lms-launcher-update.ps1` 全量英文化 + run 标记

**文件**：`scripts/lms-launcher-update.ps1`（唯一写者）

**步骤**：

1. 按 spec §5 全表 33 项逐条替换（以字符串内容为锚，行号仅作导航）。重点：
   - L31 `[Console]::Error.WriteLine` 参数错误 → `Missing arguments (usage: ...)`；
   - L35 拆为两行：先 `Write-Log '[INFO] === update run ==='`，再 `Write-Log ('[INFO] Update script started | zip=' + $ZipPath + ' | dir=' + $InstallDir)`；
   - L86/L90/L100/L113 的 `-join '；'` / `-join '、'` → `-join ', '`；
   - L96/L97 `'未知'` → `'unknown'`；
   - L152 `' · 当前 lms_launcher 进程：'` → `' | current lms_launcher processes: '`；
   - L196 XML `<Description>` → `<Description>LMS Launcher: start the new version (one-shot; cleaned up by the app on startup)</Description>`；
   - `…` → `...`、`——` → ` - `、`：` → `: `、`（）` → `( )`。
2. **注释零改动**（52 行中文注释保留；spec N1）。
3. 编码/行尾保持 UTF-8 with BOM + LF（spec N6）；不改任何控制流、退出码、超时值。

**自检命令**（应输出 0 行）：

```powershell
powershell -NoProfile -Command "Get-Content scripts/lms-launcher-update.ps1 | Where-Object { $_ -notmatch '^\s*#' } | Select-String -Pattern '[\u4e00-\u9fff]' | Measure-Object | Select-Object -ExpandProperty Count"
```

**完成判据**：spec §5 全表落地；非注释行零汉字；`Write-Log` 调用数 = 28（27 + 标记行）。

---

## 任务 3：`scripts/verify-relaunch.ps1` 全量英文化 + C5 锚点切标记

**文件**：`scripts/verify-relaunch.ps1`（唯一写者；与任务 2 文件不重叠）

**步骤**：

1. 按 spec §6 全表 21 项逐条替换（`[PASS]/[FAIL]/[INFO]/[OK]` 标签与退出码语义不变）。
2. C5 锚点：`if ($lines[$i] -match '更新脚本启动')` → `if ($lines[$i].Contains('=== update run ==='))`；未找到时保持 `$segment = $lines` 回落（现状行为）。
3. 注释：仅同步 L13 / L134 及 L143 附近描述锚点的措辞为标记行，**仍用中文**；其余注释零改动。
4. 编码/行尾保持 UTF-8 with BOM + LF。

**完成判据**：spec §6 全表落地；非注释行零汉字；C5 逻辑仅换锚点、分段语义不变。

---

## 任务 4：收口验证与文档

**步骤**：

1. `npx vitest run src-main/i18n/no-hardcoded.test.ts` → 全绿（任务 1 的硬断言转绿）。
2. `npm test` → 全绿（预期 **35 文件 / 585 用例**：基线实测 583 + 新增 2 条 `it`）。
3. PS 语法解析（对照改写前基线：两脚本均 OK）：

```powershell
powershell -NoProfile -Command "$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts/lms-launcher-update.ps1'),[ref]$t,[ref]$e)|Out-Null; if($e.Count){$e|%{$_.Message};exit 1}else{'update script: syntax OK'}"
```

   对 `scripts/verify-relaunch.ps1` 重复一次。
4. 编码校验：首三字节 `EF BB BF`；`CRLF` 计数 = 0（LF 保持）。
5. 全表逐条核对（spec A5）：`scripts/` 两文件非注释行汉字数 = 0。
6. 文档回写 `docs/superpowers/specs/2026-09-22-i18n-slices.md`：
   - S11 卡状态 ◐→✅，补「完成记录（2026-10-04）」（改动清单、测试结果、人工验收留待用户）；
   - 变更记录追加一条实现完成记录。
7. **人工验收（用户执行，A6/A7）**：`build.bat` 刷新发布包 → 一次真实更新 → 确认更新日志脚本行全英文且含 `=== update run ===` → `scripts/verify-relaunch.ps1` 5 项全 PASS（含 C5）。

**完成判据**：A1–A5 全绿；slices 已回写；A6/A7 明确标注「留待用户人工验收」。

---

## 自检

- [ ] 改动文件仅 4 个（两脚本 + 守护用例 + slices），无渲染端/主进程改动
- [ ] 两脚本**注释**仍为中文，**字符串**零汉字
- [ ] `[INFO]/[ERROR]/[PASS]/[FAIL]/[OK]` 标签与退出码语义不变
- [ ] 标记行 `[INFO] === update run ===` 是脚本首个 `Write-Log`
- [ ] C5 用 `.Contains('=== update run ===')`，无标记时回落全文件
- [ ] 守护用例为**硬断言**（无 PENDING），显式列两脚本、未用通配
- [ ] 编码 UTF-8 BOM + LF 未变
- [ ] `npm test` 35 文件 / 585 用例全绿
- [ ] 未执行任何 ps1（Q7）；未改动 `dist-release`、`package-zip.ps1`、`build.bat`
