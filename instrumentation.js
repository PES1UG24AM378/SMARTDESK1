// Runs once when the Next.js server starts: warms up the embedding model so the
// first ticket does not hit the timeout while the model loads.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.EMBEDDING_WARMUP !== 'false') {
      const { warmUp } = await import('./lib/embeddings.js');
      warmUp();   // intentionally not awaited: the server starts immediately
    }
    if (process.env.ENABLE_LOCAL_SCHEDULER !== 'false') {
      const { startSlaScheduler } = await import('./lib/scheduler.js');
      startSlaScheduler({ intervalMs: Number(process.env.SLA_SCAN_INTERVAL_MS || 60000) });
    }
  }
}
