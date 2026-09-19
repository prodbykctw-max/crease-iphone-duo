const EVENTS = new Set(['visit', 'match_start', 'match_complete', 'rematch', 'share_attempt', 'share_handoff', 'share_copy', 'inquiry_click']);
const VALUES = {
  mode: ['solo', 'duo'], difficulty: ['easy', 'normal', 'hard'], reason: ['new', 'restart', 'rematch'],
  source: ['direct', 'challenge', 'instagram', 'tiktok', 'youtube', 'creator', 'store'],
  from: ['menu', 'result'], method: ['native'], winner: [1, 2],
};
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!origin || !allowed.includes(origin)) return new Response('Forbidden', { status: 403 });
    const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'no-store' };
    const reply = (body, status) => new Response(body, { status, headers });
    if (new URL(request.url).pathname !== '/events') return reply('Not found', 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
    if (request.method !== 'POST') return reply('Method not allowed', 405);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply('JSON required', 415);
    // Public telemetry is untrusted. Rate limit at Cloudflare before enabling it.
    const reader = request.body?.getReader();
    if (!reader) return reply('Body required', 400);
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return reply('Too large', 413); }
      chunks.push(value);
    }
    let body;
    try {
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) { return reply('Invalid JSON', 400); }
    if (!body || !EVENTS.has(body.name) || typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id)) return reply('Invalid event', 400);
    const props = {};
    for (const [key, values] of Object.entries(VALUES)) if (values.includes(body.props?.[key])) props[key] = body.props[key];
    try {
      await env.DB.prepare('INSERT OR IGNORE INTO events (id, name, props) VALUES (?, ?, ?)')
        .bind(body.id, body.name, JSON.stringify(props)).run();
      return reply(null, 204);
    } catch (_) { return reply('Temporarily unavailable', 503); }
  },
};

