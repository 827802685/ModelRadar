import type { FreeModel } from '../types.js';

const ENDPOINT = 'https://apihub.agnes-ai.com/v1/models';
const CHAT_BASE = 'https://apihub.agnes-ai.com/v1';

interface AgnesModel {
  id: string;
  supported_endpoint_types?: string[];
}

const SLEEP_MS = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Agnes heavily rate-limits (and sometimes blocks) datacenter/Cloudflare IPs,
// and returns 429. Retry transient throttling before giving up.
async function fetchWithRetry(endpoint: string, init: RequestInit, retries = 2): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(endpoint, init);
    // Non-429 client errors are deterministic; 5xx during rollouts can retry.
    if (resp.status !== 429 && resp.status < 500) return resp;
    last = resp;
    if (attempt < retries) await SLEEP_MS(800 * (attempt + 1));
  }
  if (!last) throw new Error('Agnes fetch failed');
  return last;
}

function statusHint(status: number): string {
  if (status === 429) {
    return '（触发了速率限制，或 Agnes 拦截了数据中心/Cloudflare IP 请稍后再试/换网络环境）';
  }
  if (status >= 500) return '（服务端暂时不可用，请稍后再试）';
  return '';
}

// agnes-2.5-pro / agnes-2.5-pro-alpha are paid; the rest are free indefinitely.
function isFree(m: AgnesModel): boolean {
  return !/pro/i.test(m.id);
}

function capabilitiesOf(id: string): string[] {
  if (id.includes('image')) return ['image'];
  if (id.includes('video')) return ['video'];
  return ['chat', 'vision'];
}

const CONTEXT: Record<string, number> = {
  'agnes-2.5-flash': 524288,
};

export class AgnesScraper {
  name = 'agnes';

  async scrape(apiKey?: string): Promise<FreeModel[]> {
    if (!apiKey) {
      // Agnes now enforces auth for datacenter/high-frequency IPs; without a
      // key we silently report nothing rather than failing the whole run.
      return [];
    }

    const resp = await fetchWithRetry(
      ENDPOINT,
      { headers: { authorization: `Bearer ${apiKey}` } }
    );
    if (!resp.ok) throw new Error(`Agnes AI models API ${resp.status}${statusHint(resp.status)}`);

    const data = (await resp.json()) as { data?: AgnesModel[] };
    const now = new Date().toISOString();

    return (data.data ?? [])
      .filter(isFree)
      .map((m) => ({
        model_name: m.id,
        provider: 'agnes' as const,
        base_url: CHAT_BASE,
        free_type: 'unlimited' as const,
        free_quota: '无限期免费(核心模型，RPM 受限)',
        rate_limit: '20 req/min (free tier, text)',
        refresh_cycle: 'none' as const,
        expire_days: null,
        context_length: CONTEXT[m.id] ?? null,
        capabilities: capabilitiesOf(m.id),
        source_url: 'https://agnes-ai.com/',
        detected_at: now,
        status: 'active' as const,
      }));
  }
}
