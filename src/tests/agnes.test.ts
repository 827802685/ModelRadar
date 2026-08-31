import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgnesScraper } from '../providers/agnes.js';

const ENDPOINT = 'https://apihub.agnes-ai.com/v1/models';

function mockFetch(handler: (url: string) => Response | Promise<Response>): void {
  const g = globalThis as { fetch?: typeof fetch };
  g.fetch = (async (input) => handler(String(input))) as typeof fetch;
}

const CATALOG = {
  data: [
    { id: 'agnes-2.5-flash', supported_endpoint_types: ['chat'] },
    // "pro" models are paid and must be filtered out.
    { id: 'agnes-2.5-pro', supported_endpoint_types: ['chat'] },
    { id: 'agnes-2.5-image', supported_endpoint_types: ['chat', 'image'] },
  ],
};

test('agnes requires an API key; returns empty without one', async () => {
  const models = await new AgnesScraper().scrape(undefined);
  assert.equal(models.length, 0);
});

test('agnes retries on 429 and succeeds, and filters out paid models', async () => {
  let calls = 0;
  mockFetch(async () => {
    calls += 1;
    if (calls === 1) return new Response('rate limited', { status: 429 });
    return new Response(JSON.stringify(CATALOG), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const models = await new AgnesScraper().scrape('sk-ag');
  assert.equal(calls, 2);
  const ids = models.map((m) => m.model_name).sort();
  assert.deepEqual(ids, ['agnes-2.5-flash', 'agnes-2.5-image']);
  assert.ok(models.some((m) => m.capabilities.includes('image')));
});

test('agnes surfaces a Cloudflare/datacenter hint on persistent 429', async () => {
  mockFetch(async () => new Response('rate limited', { status: 429 }));
  await assert.rejects(
    () => new AgnesScraper().scrape('sk-ag'),
    /Agnes AI models API 429.*(Cloudflare|限)/,
  );
});