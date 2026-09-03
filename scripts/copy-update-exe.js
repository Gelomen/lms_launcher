const fs = require('node:fs');
const path = require('node:path');

// 构建后步骤(build.bat 末尾调用): 把 update 产物的 portable exe 拷为
// dist-release/win-unpacked/update.exe, 与 lms_launcher.exe 同目录。
const root = process.env.COPY_UPDATE_EXE_ROOT || path.join(__dirname, '..');
const srcDir = path.join(root, 'dist-release-update');
const destDir = path.join(root, 'dist-release', 'win-unpacked');

const files = fs.existsSync(srcDir)
  ? fs.readdirSync(srcDir).filter((f) => f.startsWith('update-') && f.endsWith('.exe'))
  : [];
if (files.length !== 1) {
  console.error('[copy-update-exe] 未找到唯一 update-*.exe: ' + (files.join(', ') || '无') + ' @ ' + srcDir);
  process.exit(1);
}
if (!fs.existsSync(destDir)) {
  console.error('[copy-update-exe] 目标目录不存在: ' + destDir);
  process.exit(1);
}
fs.copyFileSync(path.join(srcDir, files[0]), path.join(destDir, 'update.exe'));
console.log('[copy-update-exe] ' + files[0] + ' -> dist-release/win-unpacked/update.exe');
