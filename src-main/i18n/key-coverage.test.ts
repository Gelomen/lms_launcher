// src-main/i18n/key-coverage.test.ts
// 接线守护（2026-10-08 i18n key 漂移）：源码里以**字面量 key** 调用的 t()/hasKey()/errTextOf()/errFromIpc()
// 必须在 zh 与 en 词典里都存在；调用点用对象字面量传的占位符名必须与词典值里的 {name} 一致。
// 为什么需要它：dict.test.ts 只比对 zh/en 两侧的 key 集合一致 → 两侧**同时缺**某个 key 时照样绿。
// App.vue 与 main.ts 因此漂移出 13 个词典里不存在的调用点，日志区直接显示原始 key（中英文同样）。
// 范围与已知局限（规格 H6/H7）：只认字面量 key。t('tplModal.tip.' + k) 这类拼接、t(status.msg) 这类
// 变量传 key、以及第二实参不是简单对象字面量的调用（变量 / spread / 计算键）一律跳过——它们分别由
// hasKey() 的未知 key 回退与 dict.test.ts 的 IPC_ERROR_KEYS 用例守护，本文件不重复覆盖。
// 规格：docs/superpowers/specs/2026-10-08-i18n-key-drift-design.md
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dict } from './dict';

const ROOT = join(__dirname, '..', '..');
const KEY = '[A-Za-z0-9_.]+';

function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  const out: string[] = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const p = rel + '/' + e.name;
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|vue)$/.test(e.name) && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

// 渲染端组件里的 t() 同样会把 key 显示到界面上，所以两侧源码都在范围内
function targets(): string[] {
  return [...walk('src-main'), ...walk('src')];
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

// 字面量 key 的调用点。闭合引号后必须是 , 或 ) —— 借此排除 t('prefix.' + k) 这种拼接（规格 H6）
const KEY_CALL = new RegExp(
  "(?<![A-Za-z0-9_$])(?:t|hasKey)\\(\\s*'(" + KEY + ")'\\s*(?=[,)])" +
    "|(?:errTextOf|errFromIpc)\\(\\s*[^)]*?,\\s*'(" + KEY + ")'\\s*\\)", 'g');

// t('key', { … —— 第二实参以 { 开头才做占位符比对
const CALL_WITH_PARAMS = new RegExp("(?<![A-Za-z0-9_$])t\\(\\s*'(" + KEY + ")'\\s*,\\s*\\{", 'g');

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** 词典某条取值里的 {name} 占位符；key 不存在 → null */
function placeholdersOf(lang: 'zh' | 'en', key: string): string[] | null {
  const value = (dict[lang] as Readonly<Record<string, string>>)[key];
  if (value === undefined) return null;
  return [...value.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

/** 从 open 处的 { 扫到配对的 }（跳过字符串字面量；模板串的 `${}» 自身配对，按深度计数即可） */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** 按顶层逗号切分对象体（嵌套括号与字符串内的逗号不算） */
function topLevelEntries(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      cur += c;
      if (c === '\\') { cur += body[++i] ?? ''; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    if (c === '}' || c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** 对象字面量里的属性名；出现 spread / 计算键等无法静态确定的形态 → null（跳过整处调用，规格 H7） */
function paramNames(body: string): string[] | null {
  const names: string[] = [];
  for (const rawEntry of topLevelEntries(body)) {
    const e = rawEntry.trim();
    if (!e) continue;
    if (e.startsWith('...')) return null;
    const labeled = e.match(/^([A-Za-z_$][\w$]*)\s*:/) ?? e.match(/^['"]([^'"]+)['"]\s*:/);
    if (labeled) { names.push(labeled[1]); continue; }
    const shorthand = e.match(/^([A-Za-z_$][\w$]*)$/);
    if (shorthand) { names.push(shorthand[1]); continue; }
    return null;
  }
  return names;
}

interface MissingKey { file: string; line: number; key: string; inZh: boolean; inEn: boolean }
interface PlaceholderDrift { file: string; line: number; key: string; passed: string[]; zh: string[]; en: string[] }

describe('i18n 接线：调用点 ↔ 词典', () => {
  it('全部字面量 t()/hasKey()/errTextOf()/errFromIpc() 的 key 在 zh 与 en 词典中都存在', () => {
    const failures: MissingKey[] = [];
    for (const rel of targets()) {
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      for (const m of src.matchAll(KEY_CALL)) {
        const key = m[1] ?? m[2];
        const inZh = (dict.zh as Readonly<Record<string, string>>)[key] !== undefined;
        const inEn = (dict.en as Readonly<Record<string, string>>)[key] !== undefined;
        if (!inZh || !inEn) failures.push({ file: rel, line: lineOf(src, m.index ?? 0), key, inZh, inEn });
      }
    }
    expect(failures).toEqual([]);
  });

  it('调用点传的占位符名与词典取值里的 {name} 双向一致', () => {
    const failures: PlaceholderDrift[] = [];
    for (const rel of targets()) {
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      for (const m of src.matchAll(CALL_WITH_PARAMS)) {
        const key = m[1];
        const open = (m.index ?? 0) + m[0].length - 1;
        const close = matchBrace(src, open);
        if (close < 0) continue;
        const passed = paramNames(src.slice(open + 1, close));
        if (passed === null) continue;
        const zh = placeholdersOf('zh', key);
        const en = placeholdersOf('en', key);
        if (zh === null || en === null) continue; // key 不存在由上一条用例报，同一处不重复报
        const drift = passed.some((n) => !zh.includes(n)) || zh.some((n) => !passed.includes(n))
          || passed.some((n) => !en.includes(n)) || en.some((n) => !passed.includes(n));
        if (drift) failures.push({ file: rel, line: lineOf(src, m.index ?? 0), key, passed, zh, en });
      }
    }
    expect(failures).toEqual([]);
  });
});
