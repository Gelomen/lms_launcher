import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { AppConfig } from './config';

/** 有效代理 → http://host:port；否则 null（未配置代理时行为与现状一致） */
export function buildProxyUri(cfg: Pick<AppConfig, 'proxy_host' | 'proxy_port'>): string | null {
  const host = cfg.proxy_host?.trim();
  const port = cfg.proxy_port;
  if (!host || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return `http://${host}:${port}`;
}

// 代理连接池缓存：同一 uri 复用同一 ProxyAgent，避免每次 check_update/download_update 都新建而泄漏空闲连接。
// 更新虽是低频操作，但反复触发仍会累积未关闭的连接池；故收敛为「单例 + uri 变化时关闭旧实例」，
// 保证整个主进程生命周期内同一代理至多持有一个连接池。
let cachedAgent: { uri: string; agent: ProxyAgent } | null = null;

function getOrSwapAgent(uri: string): ProxyAgent {
  if (cachedAgent && cachedAgent.uri === uri) return cachedAgent.agent;
  if (cachedAgent) {
    // uri 切换：关闭旧代理释放空闲连接（close 返回 Promise，reject 不阻断更新主流程）
    Promise.resolve(cachedAgent.agent.close()).catch(() => { /* 关闭失败不影响新请求 */ });
  }
  cachedAgent = { uri, agent: new ProxyAgent({ uri }) };
  return cachedAgent.agent;
}

/** 返回更新流程使用的 fetch：无代理 = 全局 fetch（零变化）；有代理 = undici ProxyAgent 隧道（按 uri 复用） */
export function makeUpdateFetch(cfg: Pick<AppConfig, 'proxy_host' | 'proxy_port'>): typeof fetch {
  const uri = buildProxyUri(cfg);
  if (!uri) return fetch;
  const agent = getOrSwapAgent(uri);
  return (url: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    undiciFetch(url as string, { ...init, dispatcher: agent } as any) as unknown as Promise<Response>;
}

/** 测试用：清空代理缓存（生产代码不应调用）。 */
export function __resetProxyAgentCacheForTest(): void {
  cachedAgent = null;
}
