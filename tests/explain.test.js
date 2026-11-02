import test from 'node:test';
import assert from 'node:assert/strict';
import { scrub, isFaithful, explain } from '../lib/explain.js';
import { hashEmbedding } from '../lib/hashEmbedding.js';

const sources = [
  { ticket_id: 41, description: 'Wifi drops in lab', resolution_text: 'Restarted the access point and updated firmware.', similarity: 0.9 },
  { ticket_id: 17, description: 'Internet unstable', resolution_text: 'Replaced the faulty switch port.', similarity: 0.8 },
];

test('scrub removes emails and phone numbers', () => {
  const out = scrub('mail me at a.b@corp.com or call +91 98765 43210');
  assert.ok(!out.includes('@corp.com'));
  assert.ok(!/98765/.test(out));
});

test('isFaithful accepts answers that cite only supplied tickets', () => {
  assert.equal(isFaithful('Restart the access point [#41].', sources), true);
});
test('isFaithful rejects answers citing unknown tickets, no citations, or empty text', () => {
  assert.equal(isFaithful('Do this [#99].', sources), false);
  assert.equal(isFaithful('Restart the access point.', sources), false);
  assert.equal(isFaithful('', sources), false);
  assert.equal(isFaithful('x'.repeat(1300) + ' [#41]', sources), false);
});

test('explain returns "none" when the LLM is switched off', async () => {
  process.env.LLM_ENABLED = 'false';
  assert.equal((await explain('wifi down', sources)).status, 'none');
});

test('explain in mock mode returns a faithful answer without any API call', async () => {
  process.env.LLM_ENABLED = 'true'; process.env.GEMINI_MOCK = 'true';
  const r = await explain('wifi down', sources);
  assert.equal(r.status, 'ok');
  assert.ok(isFaithful(r.text, sources));
});

test('explain without an API key degrades to "none" instead of crashing', async () => {
  process.env.LLM_ENABLED = 'true'; process.env.GEMINI_MOCK = 'false';
  delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_MODEL;
  assert.equal((await explain('wifi down', sources)).status, 'none');
});

test('fallback embedding has 384 unit-length dimensions and groups related wording', () => {
  const a = hashEmbedding('Wi-Fi not working in the lab');
  const b = hashEmbedding('Internet is not connecting in the lab');
  const c = hashEmbedding('Water leaking from the bathroom tap');
  const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
  assert.equal(a.length, 384);
  assert.ok(Math.abs(norm - 1) < 1e-9);
  assert.ok(dot(a, b) > dot(a, c));
});
