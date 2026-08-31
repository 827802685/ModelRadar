import { test } from 'node:test';
import assert from 'node:assert';
import type { FreeModel } from '../types.js';
import { isViableByTest } from '../run.js';

function model(name: string, caps: string[]): FreeModel {
  return { provider: 'nvidia', model_name: name, capabilities: caps } as FreeModel;
}

const un = new Set(['nvidia:dead-1', 'nvidia:dead-2', 'nvidia:embed-dead']);

test('test-gate keeps untested and ok models in the pool', () => {
  assert.equal(isViableByTest(model('brand-new', ['chat']), un), true);
  assert.equal(isViableByTest(model('tested-ok', ['chat', 'vision']), un), true);
});

test('test-gate removes models proven unusable', () => {
  assert.equal(isViableByTest(model('dead-1', ['chat']), un), false);
  assert.equal(isViableByTest(model('dead-2', ['chat', 'tool']), un), false);
});

test('test-gate spares pure-embedding models even if chat fails', () => {
  assert.equal(isViableByTest(model('embed-dead', ['embedding']), un), true);
  // Mixed embedding+chat that failed chat is still dropped.
  assert.equal(isViableByTest(model('dead-1', ['embedding', 'chat']), un), false);
});

test('test-gate only drops keys present in the evidence set', () => {
  // rate/auth/error records never enter the unsupported set in runSync,
  // so a model with no unsupported evidence stays in the pool.
  const empty = new Set<string>();
  assert.equal(isViableByTest(model('rl', ['chat']), empty), true);
  assert.equal(isViableByTest(model('auth', ['chat']), empty), true);
  assert.equal(isViableByTest(model('err', ['chat']), empty), true);
  assert.equal(isViableByTest(model('embed-only', ['embedding']), empty), true);
  // Only models that ARE in the set are filtered.
  assert.equal(isViableByTest(model('dead-1', ['chat']), un), false);
});