<!-- #13 自定义下拉（共享）：TemplateModal options/boolean 行 + LaunchBar 配置下拉。
     白底卡片风格弹层，max-height 116px 可滚动，点击外部关闭；选中项 accent 色加粗。
     弹层是视口浮层（2026-10-13，用户截图：快捷启动弹窗打开 [终端] 下拉把弹窗内容撑出滚动条）：
     position:fixed + 按触发按钮矩形写内联坐标，见 place() 上方注释。
     长名 tooltip（.dd-tip 悬浮层,与「编辑」按钮 tooltip 同风格）：选项 li.tip / trigger.tip 存在时 hover 显示完整名；
     label 截断（LaunchBar >10 字 + …）由父级负责。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { library, config } from '@fortawesome/fontawesome-svg-core';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faList } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';

// FontAwesome：按需注册 list（下拉按钮 ▼ 指示符），tree-shakeable 用法；与 TemplateModal 同模式。
config.autoGenerateCss = true;
library.add(faList);
// byPrefixAndName：按「前缀 → { iconName: IconDefinition }」组织，模板侧直接取图标定义
const byPrefixAndName = { fat: { list: faList } };
// 2026-10-16（用户要求：快捷启动弹窗 [类型] 的「命令行」/「可执行程序」前加图标）：
// options 扩出**可选** icon（IconDefinition，调用方自己注册图标）。不传 = 渲染一字不变，
// TemplateModal / LaunchBar / [终端] 下拉因此完全不受影响；传了则面板选项在文字前渲染该图标，
// 收起态的 trigger 渲染**当前选中项**的图标（两处同一份来源，见下面的 currentOption）。
// 同日（2026-10-16-quick-launch-terminal-icons 规格 §6.4）：再扩一个**可选** imageUrl —— 取自本机 exe 的
// 真实图标（PNG 的 data URL，主进程 ql-terminal-icons.ts 补，见该规格 §6.1）。与 icon 并列、**优先**于它：
// 有 imageUrl 就渲染 <img>，否则走既有 FontAwesome 通道，两者都没有则渲染一字不变 ——
// 所以不传 imageUrl 的调用方（TemplateModal / LaunchBar / [类型]）照样完全不受影响。
// data: URL 直接进 <img>：index.html 无 CSP（该规格 §3-P7），不新增依赖、不加 CSP。
const props = withDefaults(defineProps<{
  value: string;
  options: Array<{ value: string; label: string; tip?: string; icon?: IconDefinition; imageUrl?: string }>;
  /** 触发按钮完整名（长名才有）——hover trigger 弹 tooltip。LaunchBar 传入选中项的 tip。 */
  tip?: string;
  /** 为 true 时禁用（不响应点击）；默认 false。用于 LaunchBar running 锁定。 */
  disabled?: boolean;
  /** 占位 label：value 未匹配任何 option（或选项表为空）时，触发按钮显示该文本。 */
  placeholder?: string;
}>(), { disabled: false, placeholder: '' });
const emit = defineEmits<{ (e: 'update:value', v: string): void }>();
const open = ref(false);

// ---------- 弹层定位（2026-10-13，用户反馈 + 截图）----------
// 现象：快捷启动弹窗里打开 [终端] 下拉，弹窗内容出现滚动条、面板又被弹窗底缘切掉。
// 根因：面板原来是 position:absolute（style.css 原 :301）挂在 .dropdown（style.css:289 position:relative）上 ——
//   它因此是所在滚动容器（.modal-body / .template-list / .log-view）scrollHeight 的一部分（撑出滚动条），
//   同时被该容器的 overflow 裁切（.modal-box overflow:hidden，QuickLaunchModal.vue:314-315）。
// 口径：浮层一律 position:fixed 浮于视口 —— 本仓既有做法（.dd-tip style.css:366 / .tpl-tip :377 /
//   .flag-tip :479 的注释都写着「position:fixed 浮于视口避开 overflow 裁剪」）。DOM 不动（不 Teleport），
//   只改定位方式：既有的 .dropdown-panel 选择器与「点击外部关闭」的 closest('.dropdown') 判断都不受影响。
// 代价：fixed 的包含块是视口，CSS 拿不到触发按钮位置 —— 原 CSS 的 top/left/right 三条删掉，
//   坐标由下面的 place() 按触发按钮矩形写内联；祖先滚动 / 窗口尺寸变化时重算（面板恒贴触发按钮）。
// 窗口下缘放不下时不翻转、不压缩（用户 2026-10-13 决定）：仍按 max-height 116px，超出窗口的部分由窗口裁掉。
const triggerEl = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string>>({});
/** 面板与触发按钮的间距 = 原 style.css 的 calc(var(--h-control) + 2px) 里那 2px。 */
const PANEL_GAP = 2;

function place(): void {
  const el = triggerEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const next = { left: r.left + 'px', top: r.bottom + PANEL_GAP + 'px', width: r.width + 'px' };
  // 面板自身内部滚动也会走到这里（capture）：值没变就不写，省掉一次无谓的重渲染
  const cur = panelStyle.value;
  if (cur.left === next.left && cur.top === next.top && cur.width === next.width) return;
  panelStyle.value = next;
}
function startFollowing(): void {
  document.addEventListener('scroll', place, true); // scroll 不冒泡：capture 才收得到任意祖先的滚动
  window.addEventListener('resize', place);
}
function stopFollowing(): void {
  document.removeEventListener('scroll', place, true);
  window.removeEventListener('resize', place);
}
/** 开合的唯一入口：开之前先定位，面板首帧就带坐标（不留「先渲染再跳位」的一帧）。 */
function setOpen(next: boolean): void {
  if (next === open.value) return;
  if (next) { place(); open.value = true; startFollowing(); }
  else { open.value = false; stopFollowing(); }
}
function toggle(): void { setOpen(!open.value); }

function pick(v: string): void { if (props.disabled) return; emit('update:value', v); setOpen(false); tip.value = null; }

// 选中项 = value 命中的 option，否则退回第一项（原 trigger 里内联的那串表达式，语义一字未改），
// 只是拆出来给 label 与 icon 共用 —— 图标必须跟着选中项走，不能写死第一项。
const currentOption = computed(() =>
  props.options.find((o) => o.value === props.value) ?? (props.options.length > 0 ? props.options[0] : null));
const triggerLabel = computed(() => currentOption.value?.label ?? props.placeholder);
const triggerIcon = computed(() => currentOption.value?.icon);
// 图片图标与 FA 图标取自**同一份** currentOption —— 图标必须随选中项走，不能写死第一项（规格 §6.4 / 索引 K3）。
const triggerImageUrl = computed(() => currentOption.value?.imageUrl);

// 长名 tooltip（2026-08-26 spec + 当日挪位）：trigger / li 的 tip 存在时 hover 弹 .dd-tip
// （position:fixed 浮于视口——.dropdown-panel max-height+overflow:auto 会裁剪行内 absolute 浮层，
// fixed 不受裁剪且跟随视口）。触发按钮与面板选项共用同一悬浮层；移出 / 关面板即清。
// 挪位：上方居中会被应用窗口/卡片裁剪（启动控制卡尤其明显）→ 默认挂元素右侧垂直居中
// （left = 右缘 + 8px，top = 垂直中心，CSS translateY(-50%) 居中）；右侧估宽放不下视口
// （估算宽 > innerWidth - right - gap）时翻转 .dd-tip--flip：左缘内侧（left = 左缘 - 8px，
// CSS translateX(-100%) 右对齐锚点），不出窗口。
const tip = ref<{ text: string; x: number; y: number; flip: boolean } | null>(null);
/** tooltip 估算宽：CJK 12px/字 × 字数 + padding 2×8 + 余量（ASCII 窄，取保守上限避免误 flip）。 */
function estWidth(text: string): number { return text.length * 12 + 36; }
function showTip(e: MouseEvent, text: string): void {
  if (!text) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const y = r.top + r.height / 2; // 垂直中心（CSS translateY(-50%) 居中）
  // 右侧放不下（right + gap + 估宽 > 视口宽 - 右侧 8px 安全边距）→ flip 到左缘内侧
  const w = estWidth(text);
  const fitsRight = r.right + 8 + w <= (window.innerWidth ?? 0) - 8;
  tip.value = { text, x: fitsRight ? r.right + 8 : r.left - 8, y, flip: !fitsRight };
}
function hideTip(): void { tip.value = null; }
// 点击外部关闭：面板浮在弹窗外，但 DOM 仍是 .dropdown 的子节点，closest('.dropdown') 判断不变。
// 清理挂 onBeforeUnmount：Vue 3 不使用 onMounted 的返回值做 teardown（那是 Vue 2 的行为，见 runtime-core
// 的 injectHook / createHook），原来那句 return () => removeEventListener(...) 其实一直没生效。
function closeOnOutsideClick(ev: MouseEvent): void {
  if (!(ev.target as HTMLElement).closest('.dropdown')) { setOpen(false); tip.value = null; }
}
onMounted(() => { document.addEventListener('click', closeOnOutsideClick); });
onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnOutsideClick);
  stopFollowing();
});
</script>
<template>
  <div class="dropdown">
    <!-- trigger：长名携带 data-tooltip=完整名 + hover 弹 .dd-tip（样式同「编辑」按钮 tooltip） -->
    <button ref="triggerEl" class="btn select-trigger" :disabled="props.disabled"
            :data-tooltip="props.tip"
            @mouseenter="(e) => showTip(e, props.tip)"
            @mouseleave="hideTip"
            @click.stop="toggle()">
      <!-- 选中项的图标（option.icon / option.imageUrl 才有）排在 .select-label 之前：与面板选项同一位置口径。
           优先级（规格 §6.4）：有 imageUrl → <img>（真实图标，src 原样进 img）；否则有 icon → FontAwesome；
           两者都无 → 与今天一字不变（只有 .select-label + .select-caret）。alt 置空：图标是装饰（规格 §4-4）。 -->
      <img v-if="triggerImageUrl" :src="triggerImageUrl" class="select-image" alt="" />
      <FontAwesomeIcon v-else-if="triggerIcon" :icon="triggerIcon" class="select-icon" />
      <span class="select-label">{{ triggerLabel }}</span>
      <span class="select-caret"><FontAwesomeIcon :icon="byPrefixAndName.fat['list']" /></span>
    </button>
    <!-- 坐标来自 place() 的内联 style（left/top/width）；position 与外观仍在全局 .dropdown-panel 里 -->
    <ul v-if="open" class="dropdown-panel" :style="panelStyle">
      <!-- 选项：长名截断（父级 label），li 携带完整名 tooltip + hover 弹 .dd-tip -->
      <li v-for="o in props.options" :key="o.value"
          :data-tooltip="o.tip"
          :class="{ option: true, selected: o.value === props.value }"
          @mouseenter="(e) => showTip(e, o.tip)"
          @mouseleave="hideTip"
          @click="pick(o.value)"><img v-if="o.imageUrl" :src="o.imageUrl" class="option-image" alt="" /><FontAwesomeIcon v-else-if="o.icon" :icon="o.icon" class="option-icon" />{{ o.label }}</li>
    </ul>
    <!-- 长名 tooltip：position:fixed 悬浮层（样式同「编辑」按钮 tooltip / .tpl-tip），显示完整名；
         默认挂元素右侧垂直居中，右侧放不下时 flip 到左缘内侧（.dd-tip--flip） -->
    <div v-if="tip" class="dd-tip" :class="{ 'dd-tip--flip': tip.flip }"
      :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
  </div>
</template>