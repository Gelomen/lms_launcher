// 验收勾普查（AGENTS.md「check 表」一节的执行门）。用法：node .superpowers/sdd/2026-10-13-quick-launch-elevated-exe/tick-census.mjs [checks目录]
// 规则：某任务表的 H2（提交信息逐字）已勾 = 该任务已提交 → 该表不得再有裸 ☐ 或 `- [ ]`；
//       未满足的项必须写成 ☐（原因 + 去处），普查会把它们列出来供主代理核对，不算违规。
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'docs/superpowers/checks/2026-10-13-quick-launch-elevated-exe';
const files = fs.readdirSync(dir).filter(f => /^task-\d+/.test(f)).sort();
let violations = 0;
for (const f of files) {
  const txt = fs.readFileSync(path.join(dir, f), 'utf8');
  const lines = txt.split(/\r?\n/);
  let done = 0, bare = 0, annotated = [], mdBare = 0, mdDone = 0, committed = false;
  for (const ln of lines) {
    const t = ln.trim();
    if (/^- \[ \]/.test(t)) mdBare++;
    if (/^- \[x\]/.test(t)) mdDone++;
    if (!t.startsWith('|')) continue;
    const cells = t.replace(/^\|/, '').replace(/\|$/, '').replace(/\\\|/g, '\u00a7').split('|').map(s => s.trim());
    if (!(cells[0] && /^[A-J][A-Za-z0-9]*$/.test(cells[0]))) continue;
    const last = cells[cells.length - 1];
    if (cells[0] === 'H2' && last.startsWith('☑')) committed = true;
    if (last.startsWith('☑')) done++;
    else if (last === '☐') bare++;
    else if (last.startsWith('☐')) annotated.push(cells[0] + ' → ' + last.slice(1).trim());
    // 附加列里的裸 ☐ 也算未落勾
    for (const c of cells.slice(1, -1)) if (c === '☐') bare++;
  }
  const bad = committed && (bare > 0 || mdBare > 0);
  if (bad) violations++;
  console.log((bad ? '✗ ' : '  ') + f.padEnd(40) + ' ☑=' + String(done).padStart(3) + '  裸☐=' + String(bare).padStart(2) + '  I段 -[ ]=' + mdBare + '  H2=' + (committed ? '已提交' : '未提交') + (annotated.length ? '  显式未勾: ' + annotated.join(' | ') : ''));
}
console.log(violations ? '\n违规：' + violations + ' 张已提交表仍有裸 ☐ / - [ ] → 先落勾或写成 ☐（原因+去处）' : '\n通过：已提交的任务表没有裸 ☐ / - [ ]');
process.exit(violations ? 1 : 0);
