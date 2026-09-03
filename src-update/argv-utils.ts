// update.exe 参数解析（打包 exe 与 dev 模式 argv 结构不同）。
// 打包：argv = [exePath, arg1, arg2] → 参数从 argv[1] 开始
// dev（electron xxx.js a b）：argv = [electron, scriptPath, a, b] → 参数从 argv[2] 开始
export function getProgramArgs(argv: readonly string[]): string[] {
  if (argv[1] && (argv[1].endsWith('.js') || argv[1].endsWith('.ts'))) return argv.slice(2);
  return argv.slice(1);
}
