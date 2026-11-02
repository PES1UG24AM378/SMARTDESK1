// OFFLINE FALLBACK embedding (EMBEDDING_PROVIDER=hash).
// Feature hashing of normalised words and word pairs into 384 dimensions, plus a small
// domain synonym table. It is lexical, NOT a semantic model. It exists so the system,
// the tests and the demo can run without downloading the MiniLM model.
export const DIM = 384;

const SYNONYMS = {
  wifi: 'netconn', 'wi-fi': 'netconn', internet: 'netconn', network: 'netconn', lan: 'netconn',
  ethernet: 'netconn', connection: 'netconn', connectivity: 'netconn', online: 'netconn',
  vpn: 'vpnconn', ac: 'cooling', aircon: 'cooling', hvac: 'cooling', cooling: 'cooling', cold: 'cooling',
  hot: 'cooling', temperature: 'cooling', laptop: 'computer', notebook: 'computer', pc: 'computer',
  desktop: 'computer', computer: 'computer', mail: 'email', outlook: 'email', inbox: 'email', email: 'email',
  slow: 'slowperf', lag: 'slowperf', lagging: 'slowperf', hanging: 'slowperf', freezing: 'slowperf',
  printer: 'printing', print: 'printing', printing: 'printing', scanner: 'printing',
  light: 'lighting', lights: 'lighting', bulb: 'lighting', tubelight: 'lighting', lamp: 'lighting',
  leak: 'water', leaking: 'water', leakage: 'water', dripping: 'water', tap: 'water', water: 'water',
  pipe: 'water', drain: 'drainage', clogged: 'drainage', blocked: 'drainage', choked: 'drainage',
  toilet: 'restroom', restroom: 'restroom', washroom: 'restroom', bathroom: 'restroom',
  power: 'electric', electricity: 'electric', socket: 'electric', outlet: 'electric', switch: 'electric',
  battery: 'battery', charger: 'battery', charging: 'battery', screen: 'display', monitor: 'display',
  display: 'display', flicker: 'display', flickering: 'display',
  password: 'login', login: 'login', locked: 'login', account: 'login', signin: 'login',
  software: 'software', install: 'software', installation: 'software', license: 'software',
  crash: 'crash', crashing: 'crash', crashes: 'crash', keyboard: 'keyboard', mouse: 'mouse',
  projector: 'projector', door: 'door', lock: 'door', broken: 'broken', damaged: 'broken',
};
const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'be', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'my', 'our',
  'it', 'this', 'that', 'with', 'not', 'no', 'cannot', 'cant', 'can', 'since', 'from', 'by', 'very', 'has', 'have', 'been', 'i', 'we',
  'again', 'keeps', 'still', 'getting', 'gets', 'get', 'please', 'working', 'works', 'work', 'issue', 'problem', 'there', 'when', 'after']);

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokens(text) {
  return String(text).toLowerCase().replace(/wi-fi/g, 'wifi').split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w)).map((w) => SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? stem(w));
}

function fnv(str, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function hashEmbedding(text) {
  const v = new Array(DIM).fill(0);
  const toks = tokens(text);
  const add = (feat, weight) => {
    const h = fnv(feat);
    v[h % DIM] += (fnv(feat, 99991) & 1 ? 1 : -1) * weight;
  };
  toks.forEach((t) => add(t, 1));
  for (let i = 0; i < toks.length - 1; i++) add(toks[i] + '_' + toks[i + 1], 0.5);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
