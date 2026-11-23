const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sources = new Set([
  'direct', 'search', 'other-referral', 'google', 'bing', 'duckduckgo', 'yahoo', 'brave', 'ecosia',
  'x', 'linkedin', 'facebook', 'instagram', 'reddit', 'bluesky', 'threads', 'tiktok', 'youtube',
  'discord', 'whatsapp', 'telegram', 'newsletter', 'email', 'qr', 'qa'
]);
const stages = new Set(['visit', 'landing', 'flight', 'checkout']);
const windowMs = 60_000;
const writesPerWindow = 1200;
const dayMs = 86_400_000;

export function createTrafficCollector({ store, enabled, hash, now }) {
  const available = Boolean(enabled && store);
  // The bounded process cache coalesces retries. Azure merges are still idempotent across instances.
  let resetsAt = 0;
  let writes = 0;
  const seen = new Map();

  async function collect(body) {
    const { visitor, visit, stage, source, fromLanding } = body;
    if (Object.keys(body).length !== 5 || typeof visitor !== 'string' || !uuid.test(visitor) ||
        typeof visit !== 'string' || !uuid.test(visit) || !stages.has(stage) || !sources.has(source) ||
        typeof fromLanding !== 'boolean') {
      return { status: 400, jsonBody: { error: 'Invalid traffic event.' } };
    }

    const time = now();
    if (time >= resetsAt) {
      resetsAt = time + windowMs;
      writes = 0;
      seen.clear();
    }
    const partitionKey = new Date(time).toISOString().slice(0, 10);
    const rowKey = hash('analytics-visit-v1', `${visitor}:${visit}`);
    const conversion = fromLanding && (stage === 'flight' || stage === 'checkout');
    const key = `${partitionKey}:${rowKey}:${stage}:${conversion}`;
    let pending = seen.get(key);
    if (!pending) {
      if (writes >= writesPerWindow) {
        return { status: 429, headers: { 'Retry-After': String(Math.ceil((resetsAt - time) / 1000)) } };
      }
      writes += 1;
      const row = { partitionKey, rowKey, visitorId: hash('analytics-visitor-v1', visitor), source };
      // Skip false fields so delayed and concurrent events cannot erase earlier progress.
      if (stage === 'landing' || conversion) row.landed = true;
      if (stage === 'flight') row.flew = true;
      if (stage === 'checkout') row.checkout = true;
      if (conversion) row[stage === 'flight' ? 'flightFromLanding' : 'checkoutFromLanding'] = true;
      pending = Promise.resolve().then(() => store.merge(row));
      seen.set(key, pending);
    }
    try {
      await pending;
    } catch {
      if (seen.get(key) === pending) seen.delete(key);
      return { status: 503, jsonBody: { error: 'Traffic collection is temporarily unavailable.' } };
    }
    return { status: 204 };
  }

  async function retain() {
    if (available) {
      // Preserve the current UTC day plus the previous 89 UTC dates.
      const cutoff = new Date(now() - 89 * dayMs).toISOString().slice(0, 10);
      await store.prune(cutoff);
    }
  }

  return { collect, retain, available };
}
