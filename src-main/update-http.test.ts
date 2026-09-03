import { describe, it, expect, vi } from 'vitest';
const calls: any[] = [];
vi.mock('undici', () => ({
  ProxyAgent: vi.fn().mockImplementation((o: any) => ({ uri: o.uri, __tag: 'agent' })),
  fetch: vi.fn().mockImplementation(async (url: any, init: any) => {
    calls.push({ url, init });
    return new Response('ok');
  }),
}));
import { buildProxyUri, makeUpdateFetch } from './update-http';
import * as undici from 'undici';
const MockProxyAgent = undici.ProxyAgent as any;

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
