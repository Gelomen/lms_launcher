// 复制命名（2026-08-30 spec-template-copy-button，方案 A：递增编号 + 占用检测）：
// 候选 base - copy / base - copy 2 / …，取第一个不在现有 name 集合中的；
// base 本身是复制品（- copy / - copy N 结尾）→ 剥后缀还原原始 base，防止滚成 "X - copy - copy"
// （2026-10-10 quick-launch-card 任务 1：从 src/modules/TemplateModule.vue 原样搬出，供模板卡与快捷启动卡共用，行为不变）
const COPY_SUFFIX = / - copy( \d+)?$/;
export function nextCopyName(base: string, taken: Set<string>): string {
  const root = base.replace(COPY_SUFFIX, '');
  for (let i = 1; ; i++) {
    const cand = i === 1 ? `${root} - copy` : `${root} - copy ${i}`;
    if (!taken.has(cand)) return cand;
  }
}
