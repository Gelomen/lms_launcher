// src-main/i18n/no-hardcoded.test.ts
// S10 守护: 主进程与 App 外壳的字符串字面量不得含汉字
// PENDING 为待清理清单, 随任务批次逐项移除; 归零即 S10 验收达成.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const EXCLUDE = new Set(['src-main/i18n/dict.ts']);

const PENDING = new Set<string>([
  'src-main/main.ts',
]);

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

const HAS_HAN = /\p{Script=Han}/u;

describe('i18n: 零硬编码中文', () => {
  it('待清理清单之外的文件,字符串字面量不含汉字', () => {
    const bad = targets()
      .filter((f) => !EXCLUDE.has(f) && !PENDING.has(f))
      .filter((f) => HAS_HAN.test(literalText(readFileSync(join(ROOT, f), 'utf8'))));
    expect(bad, '这些文件的文案未走词典:').toEqual([]);
  });

  it('PENDING 中的文件确实仍含汉字(清理后须同步移除)', () => {
    const stale = [...PENDING].filter(
      (f) => !HAS_HAN.test(literalText(readFileSync(join(ROOT, f), 'utf8'))),
    );
    expect(stale, '这些文件已无硬编码汉字,请从 PENDING 移除:').toEqual([]);
  });
});
