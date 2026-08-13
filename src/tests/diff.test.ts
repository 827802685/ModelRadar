import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffModels } from '../diff.js';
import type { FreeModel } from '../types.js';

function m(provider: string, modelName: string, overrides: Partial<FreeModel> = {}): FreeModel {
  return {
    model_name: modelName,
    provider,
    base_url: `https://${provider}.example/v1`,
    free_type: 'unlimited',
    free_quota: 'free',
    rate_limit: '20 req/min',
    refresh_cycle: 'none',
    expire_days: null,
    context_length: null,
    capabilities: ['chat'],
    source_url: 'https://example.com',
    detected_at: '2026-08-01T00:00:00Z',
    status: 'active',
    ...overrides,
  };
}

test('detects added, removed and changed models', () => {
  const existing = [m('p', 'a'), m('p', 'b'), m('p', 'c', { free_quota: 'old' })];
  const incoming = [m('p', 'b'), m('p', 'c', { free_quota: 'new' }), m('p', 'd')];

  const diff = diffModels(existing, incoming, ['p']);
  assert.deepEqual(diff.added.map((x) => x.model_name), ['d']);
  assert.deepEqual(diff.removed.map((x) => x.model_name), ['a']);
  assert.deepEqual(diff.changed.map((x) => x.model_name), ['c']);
});

test('does not report removals for a provider that did not run', () => {
  const existing = [m('p', 'a'), m('q', 'b')];
  const incoming = [m('p', 'a')]; // q failed/returned nothing

  const diff = diffModels(existing, incoming, ['p']);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.added, []);
});

test('same catalog yields empty diff', () => {
  const models = [m('p', 'a'), m('q', 'b')];
  const diff = diffModels(models, models, ['p', 'q']);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
});