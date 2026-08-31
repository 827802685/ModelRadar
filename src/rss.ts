import type { FreeModel } from './types.js';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './classify.js';

/** RFC-2822 date as required by RSS <pubDate>. */
function rfc2822(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function xmlEsc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the free-model catalog as an RSS 2.0 feed.
 * Only active models are included.
 */
export function toRssXml(models: FreeModel[], selfUrl: string): string {
  const now = new Date().toUTCString();
  const items = models
    .filter((m) => m.status === 'active')
    .slice()
    .sort((a, b) => (a.detected_at < b.detected_at ? 1 : -1))
    .map((m) => {
      const caps = (m.capabilities ?? []).join(', ');
      const ctx = m.context_length ? m.context_length.toLocaleString() : '未知';
      const region = m.region ? `地区: ${m.region}; ` : '';
      const cats = (m.categories ?? [])
        .map((c) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c)
        .join(', ');
      const description = [
        `厂商: ${m.provider}`,
        `Base URL: ${m.base_url}`,
        cats ? `分类: ${cats}` : '',
        `免费类型: ${m.free_type}`,
        `额度: ${m.free_quota}`,
        `限速: ${m.rate_limit}`,
        `上下文: ${ctx}`,
        caps ? `能力: ${caps}` : '',
        `${region}检测于: ${m.detected_at}`,
      ]
        .filter(Boolean)
        .join(' | ');

      const categoryTags = (m.categories ?? [])
        .filter((c) => CATEGORY_ORDER.includes(c as (typeof CATEGORY_ORDER)[number]))
        .map((c) => `    <category>${xmlEsc(CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c)}</category>`)
        .join('\n');

      return [
        '  <item>',
        `    <title>${xmlEsc(`${m.provider}/${m.model_name}`)}</title>`,
        `    <link>${xmlEsc(m.source_url)}</link>`,
        `    <guid isPermaLink="false">${xmlEsc(`${m.provider}:${m.model_name}`)}</guid>`,
        `    <pubDate>${rfc2822(m.detected_at)}</pubDate>`,
        categoryTags,
        `    <description>${xmlEsc(description)}</description>`,
        '  </item>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>ModelRadar 免费 AI 模型</title>`,
    `    <link>${xmlEsc(selfUrl)}</link>`,
    `    <description>免费 AI 模型自动发现与同步 - 当前 ${models.filter((m) => m.status === 'active').length} 个实测可用免费模型</description>`,
    `    <lastBuildDate>${now}</lastBuildDate>`,
    `    <pubDate>${now}</pubDate>`,
    `    <ttl>720</ttl>`,
    items,
    '  </channel>',
    '</rss>',
  ].join('\n');
}