// Vector search helpers. `db` is anything with .query(): the pool or a transaction client.
export const formatVector = (arr) => '[' + arr.map((x) => Number(x).toFixed(6)).join(',') + ']';

// Five nearest VERIFIED RESOLVED tickets. The WHERE clause repeats the partial HNSW
// index predicate so the index can be used. <=> is cosine distance, so similarity = 1 - distance.
export const SIMILAR_SQL = `
  SELECT t.ticket_id, t.dept_id, t.description, t.resolution_text,
         1 - (t.embedding <=> $1::vector) AS similarity
  FROM tickets t
  WHERE t.status = 'Resolved' AND t.resolution_verified AND t.embedding IS NOT NULL
  ORDER BY t.embedding <=> $1::vector
  LIMIT 5`;

export async function findSimilar(db, vec) {
  const { rows } = await db.query(SIMILAR_SQL, [vec]);
  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
}

// How many OTHER open tickets from the last 48 hours look like this one (a likely outage).
// Returns counts only, never other people's text or names.
export async function countSimilarOpen(db, vec, threshold) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS reports, COUNT(DISTINCT user_id)::int AS people
       FROM (SELECT user_id, 1 - (embedding <=> $1::vector) AS sim
               FROM tickets
              WHERE status IN ('Open', 'In Progress') AND embedding IS NOT NULL
                AND created_at > now() - INTERVAL '48 hours'
              ORDER BY embedding <=> $1::vector
              LIMIT 20) near
      WHERE sim >= $2`, [vec, threshold]);
  return rows[0];
}
