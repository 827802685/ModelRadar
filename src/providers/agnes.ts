import type { FreeModel } from '../types.js';

const ENDPOINT = 'https://apihub.agnes-ai.com/v1/models';
const CHAT_BASE = 'https://apihub.agnes-ai.com/v1';

interface AgnesModel {
  id: string;
  supported_endpoint_types?: string[];
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

    const resp = await fetch(ENDPOINT, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) throw new Error(`Agnes AI models API ${resp.status}`);

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
