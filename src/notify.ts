import type { DiffResult, RunSummary, FreeModel } from './types.js';

export interface NotifyOptions {
  webhookUrl?: string;
  diff: DiffResult;
  summary: RunSummary;
}

/** Push a change summary to a webhook (generic JSON or Feishu card). */
export async function sendNotification(opts: NotifyOptions): Promise<void> {
  const { webhookUrl, diff, summary } = opts;
  if (!webhookUrl || webhookUrl.trim() === '') return;

  const isFeishu =
    webhookUrl.includes('open.feishu.cn') || webhookUrl.includes('open.larksuite.com');
  const body = isFeishu ? feishuPayload(diff, summary) : genericPayload(diff, summary);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function genericPayload(diff: DiffResult, summary: RunSummary) {
  return {
    event: 'free_model_sync',
    timestamp: new Date().toISOString(),
    summary: {
      total_scraped: summary.total_scraped,
      added: summary.added,
      removed: summary.removed,
      changed: summary.changed,
    },
    added: diff.added.map(compact),
    removed: diff.removed.map(compact),
    changed: diff.changed.map(compact),
  };
}

function feishuPayload(diff: DiffResult, summary: RunSummary) {
  const lines: string[] = [];
  if (summary.added > 0) lines.push(`新增 ${summary.added} 个模型：`);
  if (summary.removed > 0) lines.push(`下线/移除 ${summary.removed} 个模型：`);
  if (summary.changed > 0) lines.push(`变更 ${summary.changed} 个模型：`);
  const joined = [...lines, ...diff.added.map((m) => `+ ${m.provider}/${m.model_name}`),
    ...diff.removed.map((m) => `- ${m.provider}/${m.model_name}`),
    ...diff.changed.map((m) => `~ ${m.provider}/${m.model_name}`)].join('\n');

  return {
    msg_type: 'text',
    content: { text: `[ModelRadar] 免费模型同步\n${joined}` },
  };
}

function compact(m: FreeModel) {
  const { detected_at, capabilities, ...rest } = m;
  void detected_at;
  return { ...rest, capabilities };
}