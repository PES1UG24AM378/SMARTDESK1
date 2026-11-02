// Pure decision logic: neighbours in, {suggest | route | triage} out. No database, no model.
export const thresholds = () => ({
  HIGH: Number(process.env.SIM_HIGH ?? 0.80),     // at/above: suggest a past fix
  MID: Number(process.env.SIM_MID ?? 0.45),       // at/above: route by vote
  SHARE: Number(process.env.VOTE_SHARE ?? 0.5),   // winning department's share of the vote
  CLUSTER: Number(process.env.SIM_CLUSTER ?? 0.75),
});

export function decide(neighbours, t = thresholds()) {
  const hits = (neighbours || []).filter((r) => r.similarity >= t.MID);
  if (hits.length === 0) return { mode: 'triage', reason: 'low_similarity' };

  const best = hits[0];
  const retrievedIds = hits.slice(0, 3).map((h) => h.ticket_id);
  if (best.similarity >= t.HIGH) {
    return {
      mode: 'suggest', deptId: best.dept_id, sourceTicketId: best.ticket_id,
      similarity: best.similarity, suggestion: best.resolution_text, retrievedIds,
    };
  }
  const votes = new Map();
  let total = 0;
  for (const h of hits) {
    votes.set(h.dept_id, (votes.get(h.dept_id) || 0) + h.similarity);
    total += h.similarity;
  }
  const [deptId, score] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (score / total < t.SHARE) return { mode: 'triage', reason: 'split_vote' };
  return { mode: 'route', deptId, similarity: best.similarity, retrievedIds };
}

// A readable reason for the routing decision, built by code (not by an LLM).
export function routingReason(decision, deptName) {
  if (decision.mode === 'suggest') return `Very similar to resolved ticket #${decision.sourceTicketId} (similarity ${decision.similarity.toFixed(2)}), so it was routed to ${deptName}.`;
  if (decision.mode === 'route') return `Most similar resolved tickets belong to ${deptName}, so it was routed there.`;
  if (decision.reason === 'split_vote') return 'Similar tickets belong to different departments, so an Admin will route it.';
  if (decision.reason === 'ai_unavailable') return 'The smart search was not available just now, so an Admin will route it. Your ticket is saved.';
  return 'No close match was found, so an Admin will route it.';
}
