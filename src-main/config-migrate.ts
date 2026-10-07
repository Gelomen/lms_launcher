// 老用户存量迁移（2026-10-08）：把 <dataDir>/ 根下的两份用户 yaml 静默搬进 <dataDir>/configs/。
// 规格：docs/superpowers/specs/2026-10-08-legacy-config-migration-design.md
// 契约：无状态、无标记、不写日志、不弹提示、不抛异常；判据只有文件存在性（S1）。
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 迁移清单：llama_params.yaml 不在列——它是随包解压覆盖的受控资产，根残留留着无害（S4）
const LEGACY_FILES = ['lms_launcher.yaml', 'llama_launch_configs.yaml'];

function isPlainFile(p: string): boolean {
  try { return statSync(p).isFile(); } catch { return false; }
}

// 可注入的文件系统动作：Windows 上无法用真实文件系统稳定触发 rename 失败，兜底分支只能靠注入测（S7）
type MoveDeps = { move: (from: string, to: string) => void; copy: (from: string, to: string) => void };
const REAL_DEPS: MoveDeps = { move: renameSync, copy: copyFileSync };

export function migrateLegacyConfigs(rootDir: string, cfgDir: string, deps: MoveDeps = REAL_DEPS): void {
  for (const name of LEGACY_FILES) {
    const from = join(rootDir, name);
    const to = join(cfgDir, name);
    if (!isPlainFile(from)) continue;  // 两处皆无，或同名是目录 → 跳过（§4-3、§4-7）
    if (existsSync(to)) continue;      // 以 configs/ 为准，根残留不动（§4-2、S2）
    try { mkdirSync(cfgDir, { recursive: true }); } catch { /* 建目录失败 → 下面必失败，静默放弃（§4-4） */ }
    try {
      deps.move(from, to);
    } catch {
      try {
        deps.copy(from, to);
      } catch {
        // 两种手段都失败 → 本次放弃，下次启动重试（§4-6）。
        // copy 可能写到一半才抛错：清掉半份目标，否则下次 existsSync(to) 为真会把它永久当成已迁移。
        try { rmSync(to, { force: true }); } catch { /* 清理失败同样静默，下次启动重试 */ }
      }
    }
  }
}
