// src-main/i18n/no-hardcoded.test.ts
// S10 守护: 主进程与 App 外壳的字符串字面量不得含汉字
// S11 扩展: scripts/ 目录的 PowerShell 脚本也须走英文词典
// PENDING 为待清理清单, 随任务批次逐项移除; 归零即 S10 验收达成.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const EXCLUDE = new Set(['src-main/i18n/dict.ts']);

const PENDING = new Set<string>([
  'src-main/main.ts',
]);

// S11: PowerShell script targets
const PS_TARGETS = ['scripts/lms-launcher-update.ps1', 'scripts/verify-relaunch.ps1'];

function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  const out: string[] = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const p = rel + '/' + e.name;
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

export function targets(): string[] {
  return [...walk('src-main'), 'src/App.vue'];
}

export function literalText(src: string): string {
  let out = '';
  let block = false;
  let html = false;
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (block) {
      if (c === '*' && n === '/') { block = false; i++; }
      continue;
    }
    if (html) {
      if (c === '-' && n === '-' && src[i + 2] === '>') { html = false; i += 2; }
      continue;
    }
    if (quote) {
      if (c === '\\') { out += src[++i] ?? ''; continue; }
      if (c === quote) { quote = null; continue; }
      out += c;
      continue;
    }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '<' && n === '!' && src[i + 2] === '-' && src[i + 3] === '-') { html = true; i += 3; continue; }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'" || c == '`') { quote = c; continue; }
  }
  return out;
}

// S11: PowerShell literal text extractor
// Skips: # line comments, <# #> block comments
// Collects: single-quoted strings, double-quoted strings, @' '@ here-strings, @" "@ here-strings
export function psLiteralText(src: string): string {
  const lines = src.split('\n');
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let j = 0;
    while (j < line.length) {
      const c = line[j];
      const rest = line.slice(j);
      if (c === '#') { break; }
      if (rest.startsWith('<#')) {
        j += 2;
        while (true) {
          if (rest.startsWith('#>', j)) { j += 2; break; }
          if (j >= rest.length) { j = 0; i++; break; }
          j++;
        }
        if (j > 0) continue;
        i--;
        break;
      }
      if (rest.startsWith("@'")) {
        j += 2;
        while (true) {
          if (line.slice(j).startsWith("'@")) { j += 2; break; }
          j = line.length;
          i++;
          if (i >= lines.length) break;
          if (lines[i].trim().startsWith("'@")) { j = 2; break; }
        }
        continue;
      }
      if (rest.startsWith('@"')) {
        j += 2;
        while (true) {
          if (line.slice(j).startsWith('"@')) { j += 2; break; }
          j = line.length;
          i++;
          if (i >= lines.length) break;
          if (lines[i].trim().startsWith('"@')) { j = 2; break; }
        }
        continue;
      }
      if (c === "'") {
        j++;
        while (j < line.length && line[j] !== "'") {
          out += line[j];
          j++;
        }
        j++;
        continue;
      }
      if (c === '"') {
        j++;
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '`') { j++; if (j < line.length) out += line[j]; }
          else out += line[j];
          j++;
        }
        j++;
        continue;
      }
      j++;
    }
    i++;
  }
  return out;
}

const HAS_HAN = /\p{Script=Han}/u;

describe('i18n: 零硬编码中文', () => {
  it('待清理清单之外的文件,字符串字面量不含汉字', () => {
    const failures = [];
    for (const rel of targets()) {
      if (EXCLUDE.has(rel)) continue;
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      const found = literalText(src).match(HAS_HAN);
      if (found) failures.push({ file: rel, char: found[0] });
    }
    expect(failures).toEqual([]);
  });

  it('PENDING 中的文件确实仍含汉字(清理后须同步移除)', () => {
    for (const rel of PENDING) {
      if (!existsSync(join(ROOT, rel))) continue;
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      expect(literalText(src).match(HAS_HAN)).toBeTruthy();
    }
  });

  // S11: PowerShell script targets
  it('PowerShell 更新脚本不含硬编码中文(除注释)', () => {
    const failures = [];
    for (const rel of PS_TARGETS) {
      if (!existsSync(join(ROOT, rel))) continue;
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      const found = psLiteralText(src).match(HAS_HAN);
      if (found) failures.push({ file: rel, char: found[0] });
    }
    expect(failures).toEqual([]);
  });
});