import { test } from 'node:test';
import assert from 'node:assert';
import { dashboardHtml } from '../dashboard.js';

test('dashboard inline script is syntactically valid and markup present', () => {
  const html = dashboardHtml();
  assert.match(html, /id="testcard"/, 'test bench card present');
  assert.match(html, /模型测试台/, 'test bench label present');

  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'inline script block found');

  // new Function only compiles (does not execute), so any template-literal
  // newline misfolding inside dashboard.ts surfaces here as a SyntaxError.
  assert.doesNotThrow(() => new Function(m[1]!), 'inline JS parses cleanly');
});