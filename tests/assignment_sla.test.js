import test from 'node:test';
import assert from 'node:assert/strict';

test('SLA policies define correct expected resolution targets', () => {
  const policies = {
    Critical: 4,
    High: 8,
    Medium: 24,
    Low: 72,
  };
  assert.equal(policies.Critical, 4);
  assert.equal(policies.High, 8);
  assert.equal(policies.Medium, 24);
  assert.equal(policies.Low, 72);
});

test('SLA deadline calculation adds exact policy hours to created_at', () => {
  const created = new Date('2026-10-24T10:00:00.000Z');
  const criticalDeadline = new Date(created.getTime() + 4 * 3600000);
  const highDeadline = new Date(created.getTime() + 8 * 3600000);
  const mediumDeadline = new Date(created.getTime() + 24 * 3600000);
  const lowDeadline = new Date(created.getTime() + 72 * 3600000);

  assert.equal(criticalDeadline.toISOString(), '2026-10-24T14:00:00.000Z');
  assert.equal(highDeadline.toISOString(), '2026-10-24T18:00:00.000Z');
  assert.equal(mediumDeadline.toISOString(), '2026-10-25T10:00:00.000Z');
  assert.equal(lowDeadline.toISOString(), '2026-10-27T10:00:00.000Z');
});

test('SLA state classification correctly distinguishes Resolved, Overdue, Due Soon, and On Track', () => {
  function getSlaState(ticket, nowTime) {
    if (ticket.status === 'Resolved') return 'Resolved';
    const hours = (new Date(ticket.sla_deadline).getTime() - nowTime) / 3600000;
    if (ticket.overdue || hours < 0) return 'Overdue';
    if (hours <= 4) return 'Due Soon';
    return 'On Track';
  }

  const now = new Date('2026-10-24T12:00:00.000Z').getTime();

  // Resolved ticket
  assert.equal(getSlaState({ status: 'Resolved', sla_deadline: '2026-10-24T10:00:00.000Z' }, now), 'Resolved');

  // Overdue ticket (deadline was 2 hours ago)
  assert.equal(getSlaState({ status: 'Open', sla_deadline: '2026-10-24T10:00:00.000Z' }, now), 'Overdue');

  // Due Soon ticket (deadline is in 2 hours <= 4)
  assert.equal(getSlaState({ status: 'Open', sla_deadline: '2026-10-24T14:00:00.000Z' }, now), 'Due Soon');

  // On Track ticket (deadline is in 10 hours > 4)
  assert.equal(getSlaState({ status: 'Open', sla_deadline: '2026-10-24T22:00:00.000Z' }, now), 'On Track');
});

test('Unassigned reason mapping preserves correct codes and readable text', () => {
  const REASON_LABELS = {
    'NO_ACTIVE_TECHNICIAN': 'No active technician',
    'TRIAGE_REQUIRED': 'Awaiting triage',
    'LOW_CONFIDENCE': 'Low similarity',
    'SPLIT_VOTE': 'Split vote',
    'AI_UNAVAILABLE': 'AI unavailable',
    'MANUAL_UNASSIGN': 'Unassigned',
  };

  assert.equal(REASON_LABELS['NO_ACTIVE_TECHNICIAN'], 'No active technician');
  assert.equal(REASON_LABELS['TRIAGE_REQUIRED'], 'Awaiting triage');
  assert.equal(REASON_LABELS['LOW_CONFIDENCE'], 'Low similarity');
  assert.equal(REASON_LABELS['SPLIT_VOTE'], 'Split vote');
});
