// Turns text into a 384-number embedding.
//   EMBEDDING_PROVIDER=minilm (default)  -> Xenova/all-MiniLM-L6-v2, pre-trained, runs locally
//   EMBEDDING_PROVIDER=hash              -> offline lexical fallback (tests / no internet)
import { hashEmbedding } from './hashEmbedding.js';

export const DIM = 384;
export const provider = () => process.env.EMBEDDING_PROVIDER || 'minilm';

export function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadExtractor() {
  const { pipeline } = await import('@xenova/transformers');
  return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
}

export async function getEmbedding(text) {
  if (provider() === 'hash') return hashEmbedding(text);
  globalThis._sdExtractor ??= loadExtractor();      // load once, keep across hot reloads
  let extractor;
  try { extractor = await globalThis._sdExtractor; }
  catch (err) { globalThis._sdExtractor = undefined; throw err; }
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

// Called at server start so the first ticket does not pay the model-loading delay.
export async function warmUp() {
  try { await getEmbedding('warm up'); console.log('[smartdesk] embedding model ready (' + provider() + ')'); }
  catch (err) { console.error('[smartdesk] embedding warm-up failed:', err.message); }
}
