import { describe, it, expect, vi, beforeEach } from 'vitest';
const calls: any[] = [];
const createdAgents: any[] = [];
vi.mock('undici', () => ({
  ProxyAgent: vi.fn().mockImplementation((o: any) => {
    const agent = { uri: o.uri, __tag: 'agent', close: vi.fn(() => Promise.resolve()) };
    createdAgents.push(agent);
    return agent;
  }),
  fetch: vi.fn().mockImplementation(async (url: any, init: any) => {
    calls.push({ url, init });
    return new Response('ok');
  }),
}));
import { buildProxyUri, makeUpdateFetch, __resetProxyAgentCacheForTest } from './update-http';
import * as undici from 'undici';
const MockProxyAgent = undici.ProxyAgent as any;

beforeEach(() => {
  createdAgents.length = 0;
  MockProxyAgent.mockClear?.();
  __resetProxyAgentCacheForTest();
});

describe('buildProxyUri', () => {
  it('host+port 有效 → http://host:port', () => {
    expect(buildProxyUri({ llama_dir: '', proxy_host: '127.0.0.1', proxy_port: 10808 }))
      .toBe('http://127.0.0.1:10808');
  });
  it('缺 host → null', () => {
    expect(buildProxyUri({ llama_dir: '', proxy_port: 10808 })).toBeNull();
  });
  it('缺 port → null', () => {
    expect(buildProxyUri({ llama_dir: '', proxy_host: '127.0.0.1' })).toBeNull();
  });
  it('port 超范围 → null', () => {
    expect(buildProxyUri({ llama_dir: '', proxy_host: 'h', proxy_port: 99999 })).toBeNull();
    expect(buildProxyUri({ llama_dir: '', proxy_host: 'h', proxy_port: 0 })).toBeNull();
  });
  it('host 前后空白 → trim 后使用', () => {
    expect(buildProxyUri({ llama_dir: '', proxy_host: ' h ', proxy_port: 1 })).toBe('http://h:1');
  });
});

describe('makeUpdateFetch', () => {
  it('无代理 → 返回全局 fetch 本体（零行为变化）', () => {
    const f = makeUpdateFetch({ llama_dir: '' });
    expect(f).toBe(fetch);
  });
  it('有代理 → 走 undici.fetch + ProxyAgent，保留原 init', async () => {
    calls.length = 0;
    const f = makeUpdateFetch({ llama_dir: '', proxy_host: '127.0.0.1', proxy_port: 10808 });
    const resp = await f('https://example.com', { headers: { a: 'b' }, redirect: 'follow' });
    expect(resp.status).toBe(200);
    expect(MockProxyAgent).toHaveBeenCalledWith({ uri: 'http://127.0.0.1:10808' });
    const c = calls[calls.length - 1];
    expect(c.url).toBe('https://example.com');
    expect(c.init.headers).toEqual({ a: 'b' });
    expect(c.init.redirect).toBe('follow');
    expect(c.init.dispatcher).toMatchObject({ __tag: 'agent' });
  });
});

describe('makeUpdateFetch 连接池缓存', () => {
  it('同一 uri 复用 → ProxyAgent 只创建一次', () => {
    const cfg = { llama_dir: '', proxy_host: '127.0.0.1', proxy_port: 10808 };
    makeUpdateFetch(cfg);
    makeUpdateFetch(cfg);
    expect(createdAgents.length).toBe(1);
  });

  it('uri 变化 → 关闭旧代理，新建新代理', async () => {
    makeUpdateFetch({ llama_dir: '', proxy_host: '10.0.0.1', proxy_port: 8080 });
    const oldAgent = createdAgents[0];
    expect(createdAgents.length).toBe(1);
    makeUpdateFetch({ llama_dir: '', proxy_host: '10.0.0.2', proxy_port: 9090 });
    expect(createdAgents.length).toBe(2);
    // 旧代理被关闭
    expect(oldAgent.close).toHaveBeenCalledTimes(1);
  });

  it('关闭失败 → 不抛错阻断（close 的 Promise reject 被吞）', () => {
    // 手动注入一个 close 会 reject 的 agent 到缓存，验证 swap 不崩
    makeUpdateFetch({ llama_dir: '', proxy_host: 'a', proxy_port: 1 });
    createdAgents[0].close = vi.fn(() => Promise.reject(new Error('close fail')));
    // 触发 swap（不同 uri），不应同步抛错
    expect(() => makeUpdateFetch({ llama_dir: '', proxy_host: 'b', proxy_port: 2 })).not.toThrow();
  });
});
