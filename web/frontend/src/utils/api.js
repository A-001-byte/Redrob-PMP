const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export const getHealth = () => getJson('/health');
export const getResults = () => getJson('/api/results');
export const getMetrics = () => getJson('/api/metrics');
export const getCandidate = (id) =>
  getJson(`/api/candidate/${encodeURIComponent(id)}`);
export const getFairness = () => getJson('/api/fairness');
export const getTalentMarket = () => getJson('/api/talent-market');
export const exportUrl = `${BASE}/api/export`;

export async function postPreview(candidateIds) {
  const res = await fetch(`${BASE}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_ids: candidateIds }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `preview: HTTP ${res.status}`);
  }
  return res.json();
}

/** POST /api/rerank and parse the SSE stream. EventSource is GET-only, so
 *  the stream is consumed via fetch + ReadableStream. onEvent receives
 *  ({event, data}) for every SSE frame: stage / progress / log / error /
 *  complete (complete carries the fresh results payload). */
export async function rerankStream(onEvent) {
  const res = await fetch(`${BASE}/api/rerank`, { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `rerank: HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) onEvent({ event, data: JSON.parse(data) });
    }
  }
}
