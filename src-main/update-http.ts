import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { AppConfig } from './config';

/** 有效代理 → http://host:port；否则 null（未配置代理时行为与现状一致） */
export function buildProxyUri(cfg: Pick<AppConfig, 'proxy_host' | 'proxy_port'>): string | null {
  const host = cfg.proxy_host?.trim();
  const port = cfg.proxy_port;
  if (!host || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return `http://${host}:${port}`;
}

/** 返回更新流程使用的 fetch：无代理 = 全局 fetch（零变化）；有代理 = undici ProxyAgent 隧道 */
export function makeUpdateFetch(cfg: Pick<AppConfig, 'proxy_host' | 'proxy_port'>): typeof fetch {
  const uri = buildProxyUri(cfg);
  if (!uri) return fetch;
  const agent = new ProxyAgent({ uri });
  return (url: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    undiciFetch(url as string, { ...init, dispatcher: agent } as any) as unknown as Promise<Response>;
}
