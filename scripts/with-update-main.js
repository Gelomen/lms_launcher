// 临时切换 package.json 的 main 为 update.exe 入口 → 运行给定命令（cmd /c 转发）→ 恢复原文件
// 用法：node scripts\with-update-main.js npx electron-builder --config electron-builder-update.yml --win portable
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'package.json');
const original = fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(original);
pkg.main = 'dist-update/src-update/main.js';
fs.writeFileSync(file, JSON.stringify(pkg, null, 2));

let code = 1;
try {
  const r = spawnSync('cmd', ['/c', ...process.argv.slice(2)], { stdio: 'inherit' });
  code = r.status ?? 1;
} finally {
  fs.writeFileSync(file, original);
}
process.exit(code);
