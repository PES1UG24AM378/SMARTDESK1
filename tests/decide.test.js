import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, routingReason } from '../lib/decide.js';

const T = { HIGH: 0.80, MID: 0.45, SHARE: 0.5, CLUSTER: 0.75 };
const n = (ticket_id, dept_id, similarity) => ({ ticket_id, dept_id, similarity, resolution_text: 'Fix ' + ticket_id });

test('empty neighbour list goes to triage', () => {
  assert.equal(decide([], T).mode, 'triage');
  assert.equal(decide(undefined, T).mode, 'triage');
});

test('everything below the lower threshold goes to triage', () => {
  const d = decide([n(1, 1, 0.30), n(2, 1, 0.20)], T);
  assert.equal(d.mode, 'triage');
  assert.equal(d.reason, 'low_similarity');
});

test('a strong match suggests the past fix and its department', () => {
  const d = decide([n(41, 1, 0.86), n(7, 1, 0.60)], T);
  assert.equal(d.mode, 'suggest');
  assert.equal(d.deptId, 1);
  assert.equal(d.sourceTicketId, 41);
  assert.equal(d.suggestion, 'Fix 41');
  assert.deepEqual(d.retrievedIds, [41, 7]);
});

test('exactly at the high threshold still suggests', () => {
  assert.equal(decide([n(1, 2, 0.80)], T).mode, 'suggest');
});

test('a medium match routes by similarity-weighted vote', () => {
  const d = decide([n(1, 5, 0.70), n(2, 5, 0.60), n(3, 1, 0.50)], T);
  assert.equal(d.mode, 'route');
  assert.equal(d.deptId, 5);
  assert.equal(d.suggestion, undefined);
});

test('a split vote goes to triage', () => {
  const d = decide([n(1, 1, 0.60), n(2, 2, 0.59), n(3, 3, 0.58)], T);
  assert.equal(d.mode, 'triage');
  assert.equal(d.reason, 'split_vote');
});

test('neighbours below the lower threshold do not vote', () => {
  const d = decide([n(1, 5, 0.70), n(2, 1, 0.40), n(3, 1, 0.40), n(4, 1, 0.40)], T);
  assert.equal(d.mode, 'route');
  assert.equal(d.deptId, 5);
});

test('routing reasons are readable', () => {
  assert.match(routingReason({ mode: 'suggest', sourceTicketId: 41, similarity: 0.86 }, 'IT Network'), /#41/);
  assert.match(routingReason({ mode: 'route' }, 'IT Network'), /IT Network/);
  assert.match(routingReason({ mode: 'triage', reason: 'split_vote' }, 'Triage'), /different departments/);
  assert.match(routingReason({ mode: 'triage', reason: 'ai_unavailable' }, 'Triage'), /not available/);
});
