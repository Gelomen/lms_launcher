import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function tmpPath(name: string): string {
  const dir = join(tmpdir(), 'lms_launcher_test');
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function rm(p: string): void {
  rmSync(p, { force: true, recursive: true });
}

export function writeText(p: string, s: string): void {
  writeFileSync(p, s);
}

/** 读文件原文（字节级断言用：证明「没有落盘」或「某个键已从文件消失」，而不是读回一个相等的值）。 */
export function readText(p: string): string {
  return readFileSync(p, 'utf8');
}

export function mkDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

export function jp(dir: string, name: string): string {
  return join(dir, name);
}

import { parse } from 'yaml';
import type { ParamsFile } from './config';

/** 参数表真相源路径（2026-10-06）：仓库 configs/llama_params.yaml，代码不再内置参数表。 */
export function repoParamsPath(): string {
  return join(__dirname, '..', 'configs', 'llama_params.yaml');
}

/** 参数表原文（写临时文件用的往返夹具）。 */
export function repoParamsText(): string {
  return readFileSync(repoParamsPath(), 'utf8');
}

/** 解析后的参数表（等价于主进程 paramsLoad 的产物，供组件测试与断言使用）。 */
export function repoParams(): ParamsFile {
  return parse(repoParamsText()) as ParamsFile;
}
