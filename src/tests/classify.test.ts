import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyModel,
  classifyAll,
  aiRefineCategories,
} from '../classify.js';
import type { FreeModel } from '../types.js';

function m(modelName: string, overrides: Partial<FreeModel> = {}): FreeModel {
  return {
    model_name: modelName,
    provider: 'test',
    base_url: 'https://test.example/v1',
    free_type: 'unlimited',
    free_quota: 'free',
    rate_limit: '20 req/min',
    refresh_cycle: 'none',
    expire_days: null,
    context_length: null,
    capabilities: ['chat'],
    categories: [],
    source_url: 'https://example.com',
    detected_at: '2026-08-01T00:00:00Z',
    status: 'active',
    ...overrides,
  };
}

test('classifies generic chat models', () => {
  assert.deepEqual(classifyModel(m('google/gemma-3-27b-it:free')), ['chat']);
});

test('classifies vision models from name', () => {
  const cats = classifyModel(m('zhipu/glm-4.5v-flash'));
  assert.ok(cats.includes('vision'));
  assert.ok(cats.includes('chat'));
});

test('classifies vision from capability hint', () => {
  const cats = classifyModel(m('any/model', { capabilities: ['chat', 'vision'] }));
  assert.ok(cats.includes('vision'));
});

test('classifies image generation models', () => {
  const cats = classifyModel(m('black-forest-labs/flux.1-schnell:free'));
  assert.ok(cats.includes('image'));
  assert.ok(!cats.includes('embedding'));
});

test('classifies embedding models without chat tag', () => {
  const cats = classifyModel(m('openai/text-embedding-3-small'));
  assert.ok(cats.includes('embedding'));
  assert.ok(!cats.includes('chat'));
});

test('classifies code models', () => {
  const cats = classifyModel(m('anthropic/claude-sonnet-4.5-code:free'));
  assert.ok(cats.includes('code'));
});

test('classifies reasoning models', () => {
  const cats = classifyModel(m('deepseek/deepseek-r1:free'));
  assert.ok(cats.includes('reasoning'));
});

test('classifies audio models', () => {
  const cats = classifyModel(m('openai/whisper-large-v3'));
  assert.ok(cats.includes('audio'));
});

test('classifyAll fills categories and preserves existing ones', async () => {
  const withCats = m('x/y:free', { categories: ['chat'] });
  const out = await classifyAll([m('a/b:free'), withCats]);
  assert.deepEqual(out[0]?.categories, ['chat']);
  assert.deepEqual(out[1]?.categories, ['chat']);
});

test('aiRefineCategories merges AI categories with rule-based result', async () => {
  const fakeAi = {
    async run(_model: string, _inputs: unknown) {
      return { response: '```json\n["vision","code"]\n```' };
    },
  };
  const out = await aiRefineCategories([m('org/some-model:free')], fakeAi, { maxModels: 1 });
  assert.deepEqual(out[0]?.categories, ['chat', 'vision', 'code']);
});

test('aiRefineCategories ignores invalid AI output', async () => {
  const fakeAi = {
    async run(_model: string, _inputs: unknown) {
      return { response: 'not json at all' };
    },
  };
  const out = await aiRefineCategories([m('org/plain:free')], fakeAi, { maxModels: 1 });
  assert.deepEqual(out[0]?.categories, ['chat']);
});