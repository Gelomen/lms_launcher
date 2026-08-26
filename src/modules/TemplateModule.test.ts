// @vitest-environment happy-dom
// 组件级测试：TemplateModule —— 配置存在时必须渲染出行（preview() 摘要），不得白屏。
// RED 依据：bug#2 现场复现——首次成功保存后 .module-template 整个从 DOM 消失
// （TypeError: Cannot read properties of undefined (reading 'm') @ preview()）。
import { describe, it, expect } from 'vitest';
import { mount, flushPromises as flush } from '@vue/test-utils';
import fs from 'fs';
import path from 'path';
import TemplateModule from './TemplateModule.vue';
import { defaultParams } from '../../src-main/config';

// 注入真实 style.css —— 组件测试不挂载 App,全局样式不会自动进入 DOM;CSS 契约断言(getComputedStyle)需要它
// 注入真实 style.css —— 组件测试不挂载 App,全局样式不会自动进入 DOM;CSS 契约断言(getComputedStyle)需要它
// 注入真实 style.css —— 组件测试不挂载 App,全局样式不会自动进入 DOM;CSS 契约断言(getComputedStyle)需要它。
// (vitest 下 import.meta.url 非 file://,故用进程工作目录 = 项目根) 
// 注入真实 style.css —— 组件测试不挂载 App,全局样式不会自动进入 DOM;CSS 契约断言(getComputedStyle)需要它。
// (vitest 下 import.meta.url 非 file://,故用进程工作目录 = 项目根) 
const CSS = fs.readFileSync(path.join(process.cwd(), 'src', 'style.css'), 'utf8');

const CONFIGS = {
  c1: { desc: '日常', values: { m: 'x.gguf', port: '9931' } },
};

describe('TemplateModule', () => {
  it('renders_config_rows_with_preview_after_load', async () => {
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === 'get_configs') return Promise.resolve(CONFIGS);
        if (cmd === 'get_params') return Promise.resolve(defaultParams());
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const wrapper = mount(TemplateModule);
    await flush();

    // 配置行必须渲染：仅 desc（c0c1ecf 起列表显示 desc，id 仍为数据 key 不直接展示）+ 操作按钮。
    // 2026-08-26 行卡片化：每配置 = 一个 .tpl-row（灰边框圆角行卡片），列表不再是 table。
    expect(wrapper.text()).toContain('日常');
    expect(wrapper.text()).not.toContain('c1'); // 裸 id 不直接展示
    expect(wrapper.text()).not.toContain('id'); // 表头 id 列标签已移除
    expect(wrapper.text()).not.toContain('-m x.gguf');
    expect(wrapper.text()).not.toContain('desc');
    expect(wrapper.text()).not.toContain('参数预览');
    expect(wrapper.findAll('.module-template table').length).toBe(0); // table 已移除
    const row = wrapper.findAll('.module-template .tpl-row');
    expect(row.length).toBe(1);
    // 行内显示的是 desc（日常），裸 id（c1）不出现——与上方整卡断言一致
    expect(row[0].text()).toContain('日常');
    expect(row[0].text()).not.toContain('c1');
    // 行卡片内含编辑按钮
    expect(row[0].findAll("button[data-tooltip='编辑']").length).toBe(1);
    wrapper.unmount();
  });

  it('row_label_truncates_beyond_15_chars_and_tooltips_full_name', async () => {
    const longDesc = '这是一个非常非常长的模板描述文案用来验证截断与省略号行为'; // 29 字 > 15
    const CONFIGS_LONG = { c_long: { desc: longDesc, values: {} } };
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === 'get_configs') return Promise.resolve(CONFIGS_LONG);
        if (cmd === 'get_params') return Promise.resolve(defaultParams());
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const wrapper = mount(TemplateModule, { attachTo: document.body });
    await flush();

    const label = wrapper.findAll('.module-template .tpl-row__id')[0];
    expect(label.exists()).toBe(true);
    // 截断：前 15 字 + …（U+2026），完整文案不直接渲染进列表
    expect(label.text().endsWith('…')).toBe(true);
    const t = label.text();
    expect(t.length).toBe(16); // 15 + 省略号
    expect(t.slice(0, 15)).toBe(longDesc.slice(0, 15));
    // tooltip：与编辑按钮同款机制（data-tooltip 属性），内容为完整名字
    expect(label.attributes('data-tooltip')).toBe(longDesc);
    wrapper.unmount();
  });

  it('row_label_short_than_15_chars_shows_full_name_without_tooltip_attr', async () => {
    const CONFIGS_SHORT = { c_short: { desc: '日常', values: {} } };
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === 'get_configs') return Promise.resolve(CONFIGS_SHORT);
        if (cmd === 'get_params') return Promise.resolve(defaultParams());
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const wrapper = mount(TemplateModule, { attachTo: document.body });
    await flush();

    // 短名字完整显示、单行无省略号，且无需 tooltip（属性缺失）
    const label = wrapper.findAll('.module-template .tpl-row__id')[0];
    expect(label.text()).toBe('日常');
    expect(label.attributes('data-tooltip')).toBeUndefined();
    wrapper.unmount();
  });

  it('row_label_css_keeps_single_line_(no_wrap)()', async () => {
    if (!document.getElementById('__global-css__')) {
      const st = document.createElement('style');
      st.id = '__global-css__';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'tpl-row__id';
    document.body.appendChild(el);
    // 换行曾把行卡片撑高——CSS 契约: nowrap + overflow:hidden(与 JS 25 字截断双保险)
    expect(getComputedStyle(el).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(el).overflow).toBe('hidden');
    el.remove();
  });

  it('list_wrapped_in_fixed_height_container', async () => {
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === 'get_configs') return Promise.resolve(CONFIGS);
        if (cmd === 'get_params') return Promise.resolve(defaultParams());
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const wrapper = mount(TemplateModule);
    await flush();

    // 方案 B：模板列表（含行卡片）必须包在 .template-list 固定高度容器内——卡片高度恒定、超出内部滚动
    expect(wrapper.findAll('.module-template .template-list').length).toBe(1);
    expect(wrapper.findAll('.module-template .template-list .tpl-row').length).toBe(1);
    wrapper.unmount();
  });

  it('list_has_no_delete_and_edit_modal_shows_it', async () => {
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === 'get_configs') return Promise.resolve(CONFIGS);
        if (cmd === 'get_params') return Promise.resolve(defaultParams());
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const wrapper = mount(TemplateModule, { attachTo: document.body });
    await flush();

    // 列表行不再渲染删除按钮（新建模板 / 编辑除外，均不出现「删除」字样）
    expect(wrapper.text()).not.toContain('删除');

    // 点「编辑」→ teleport 到 body 的弹窗 modal-actions 最左出现删除按钮
    const editBtn = wrapper.findAll("button").find(
      (b) => b.attributes("data-tooltip") === "编辑",
    )!;
    await editBtn.trigger('click');
    await flush();
    const del = [...document.querySelectorAll('.modal-actions button')].find(
      (b) => (b.textContent ?? '').includes('删除'),
    );
    expect(del).toBeDefined();
    wrapper.unmount();
  });

  it("top_button_is_plus_icon_with_tooltip_opens_new_modal", async () => {
    (window as any).lms = {
      invoke: (cmd: string) => {
        if (cmd === "get_configs") return Promise.resolve(CONFIGS);
        if (cmd === "get_params") return Promise.resolve(defaultParams());
        return Promise.resolve(null);
      },
      onLogLine: () => () => {},
      onProcessExit: () => () => {},
      onTrayExitRequest: () => () => {},
    };
    const wrapper = mount(TemplateModule, { attachTo: document.body });
    await flush();

    // 顶部图标按钮：+ 号 SVG + data-tooltip/aria-label=新建模板
    const addBtn = wrapper.findAll("button").find(
      (b) => b.attributes("data-tooltip") === "新建模板",
    )!;
    expect(addBtn).toBeDefined();
    expect(addBtn.attributes("aria-label")).toBe("新建模板");

    // 卡片内（不含 teleport 弹窗）不再出现可点击文字「新建模板」「编辑」
    expect(wrapper.text()).not.toContain("新建模板");
    expect(wrapper.text()).not.toContain("编辑");

    await addBtn.trigger("click");
    await flush();
    const h3 = document.querySelector(".modal-box h3");
    expect(h3?.textContent).toBe("新建模板");
    wrapper.unmount();
  });
});
