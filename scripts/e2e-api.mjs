// End-to-end checks of the SDK API against a running backend — everything a
// browser can do except speak (the call's voice is checked in a real browser).
//
//   CXYZ_API_URL=http://127.0.0.1:8080 \
//   CXYZ_PUBLISHABLE_KEY=cxyz_pk_test_… CXYZ_SECRET_KEY=cxyz_sk_test_… \
//   CXYZ_ORIGIN=http://localhost:3130 \
//   [CXYZ_DEMO_URL=http://localhost:3130]   # webhook receiver log, if running
//   [CXYZ_QUEUE=1]                          # also fill the slots and test the line (~45 s)
//   node scripts/e2e-api.mjs
//
// Exit 0 when every check passes. Prints PASS/FAIL per check, never a key.
const API = process.env.CXYZ_API_URL ?? 'http://127.0.0.1:8080';
const PK = process.env.CXYZ_PUBLISHABLE_KEY;
const SK = process.env.CXYZ_SECRET_KEY;
const ORIGIN = process.env.CXYZ_ORIGIN ?? 'http://localhost:3130';
const DEMO = process.env.CXYZ_DEMO_URL;
if (!PK) {
  console.error('Set CXYZ_PUBLISHABLE_KEY');
  process.exit(2);
}

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed += 1;
};

async function call(path, { method, body, token, origin = ORIGIN, auth } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (auth) headers.Authorization = auth;
  const res = await fetch(API + path, { method: method ?? (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

/** Read an event stream until `until(event, data)` returns true or `ms` passes. */
async function events(path, token, until, ms = 60_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const seen = [];
  try {
    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN }, signal: ctrl.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (!ev || !data) continue;
        const parsed = JSON.parse(data);
        seen.push([ev, parsed]);
        if (until(ev, parsed, seen)) {
          ctrl.abort();
          return seen;
        }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  } finally {
    clearTimeout(timer);
  }
  return seen;
}

const session = async (extra = {}) => (await call('/sdk/v1/sessions', { body: { publishableKey: PK, ...extra } })).json?.data;

// ---------------------------------------------------------------- sessions
{
  const ok = await call('/sdk/v1/sessions', { body: { publishableKey: PK } });
  const d = ok.json?.data;
  check('publishable key from an allowed site → session', ok.status === 200 && d?.token?.startsWith('cxs1.'), `status ${ok.status}`);
  check('session carries the agent card, features, a visitor id', !!d?.agent?.name && typeof d?.features?.chat === 'boolean' && /^v_[A-Za-z0-9]{24}$/.test(d?.visitorId ?? ''), `${d?.agent?.name} chat=${d?.features?.chat} call=${d?.features?.call}`);
  check('the agent card has a playable video character', !!d?.agent?.video?.anchor?.url && !!d?.agent?.video?.clips?.idle, Object.keys(d?.agent?.video?.clips ?? {}).join(','));

  const same = await session({ visitorId: d.visitorId });
  check('a returning visitor keeps their id', same?.visitorId === d.visitorId);

  const evil = await call('/sdk/v1/sessions', { body: { publishableKey: PK }, origin: 'https://evil.example' });
  check('…from any other site → 403', evil.status === 403, evil.json?.message);
  const none = await call('/sdk/v1/sessions', { body: { publishableKey: PK }, origin: null });
  check('…with no Origin (not a page) → 403', none.status === 403, none.json?.message);
  const junk = await call('/sdk/v1/sessions', { body: { publishableKey: 'cxyz_pk_test_' + 'A'.repeat(24) } });
  check('an unknown key → 401', junk.status === 401, junk.json?.message);

  // The token is bound to the site it was minted for.
  const other = await call('/sdk/v1/agent', { token: d.token, origin: 'https://evil.example' });
  check('a session replayed from another site → 403', other.status === 403, other.json?.message);
  const tampered = d.token.slice(0, -3) + (d.token.endsWith('AAA') ? 'BBB' : 'AAA');
  check('a tampered token → 401', (await call('/sdk/v1/agent', { token: tampered })).status === 401);

  if (SK) {
    const leak = await call('/sdk/v1/sessions', { auth: `Bearer ${SK}`, body: { visitor: { id: 'u-1' } } });
    check('a secret key used from a browser (Origin set) → 403', leak.status === 403, leak.json?.message);
    const server = await call('/sdk/v1/sessions', { auth: `Bearer ${SK}`, origin: null, body: { visitor: { id: 'customer-42' }, origin: ORIGIN } });
    const s = server.json?.data;
    check('secret key on a server → identified session', server.status === 200 && /^u_/.test(s?.visitorId ?? ''), s?.visitorId);
    const again = await call('/sdk/v1/sessions', { auth: `Bearer ${SK}`, origin: null, body: { visitor: { id: 'customer-42' }, origin: ORIGIN } });
    check('the same customer gets the same visitor (history follows them)', again.json?.data?.visitorId === s?.visitorId);
    const described = await call('/sdk/v1/session', { token: s.token });
    check('GET /sdk/v1/session describes a server-minted token', described.status === 200 && described.json?.data?.features?.chat === true);
  }

  // ---------------------------------------------------------------- chat
  const t = d.token;
  const empty = await call('/sdk/v1/chat/messages', { body: { text: '   ' }, token: t });
  check('an empty message → 422', empty.status === 422);
  const long = await call('/sdk/v1/chat/messages', { body: { text: 'x'.repeat(2001) }, token: t });
  check('a 2,001-character message → 422', long.status === 422);

  const started = Date.now();
  let firstDelta = null;
  const res = await fetch(`${API}/sdk/v1/chat/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, Origin: ORIGIN },
    body: JSON.stringify({ text: 'Hi! In one sentence, who are you?' }),
  });
  check('chat answers with an event stream', res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('text/event-stream'), `${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let raw = '';
  let deltas = 0;
  let done = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    raw += dec.decode(value, { stream: true });
    for (const m of raw.matchAll(/event: delta\n/g)) void m;
    deltas = (raw.match(/event: delta\n/g) ?? []).length;
    if (deltas && firstDelta === null) firstDelta = Date.now() - started;
    const dm = /event: done\ndata: (.*)\n\n/.exec(raw);
    if (dm) done = JSON.parse(dm[1]);
    if (/event: error/.test(raw)) break;
  }
  const streamed = [...raw.matchAll(/event: delta\ndata: (.*)\n\n/g)].map((m) => JSON.parse(m[1]).text).join('');
  check('the reply streams in pieces, then completes', deltas >= 1 && !!done?.id, `${deltas} deltas, first after ${firstDelta} ms, total ${Date.now() - started} ms`);
  check('the finished reply is what streamed', done && done.text === streamed.trim(), JSON.stringify(done?.text ?? raw.slice(0, 200)).slice(0, 140));

  const hist = await call('/sdk/v1/chat/messages?limit=10', { token: t });
  const msgs = hist.json?.data?.messages ?? [];
  check('history holds the visitor line and the reply, in order', msgs.length >= 2 && msgs.at(-2)?.role === 'visitor' && msgs.at(-1)?.role === 'agent', `${msgs.length} messages`);
  const other2 = await session();
  const hist2 = await call('/sdk/v1/chat/messages', { token: other2.token });
  check("another visitor cannot see this visitor's history", (hist2.json?.data?.messages ?? []).length === 0);

  // ---------------------------------------------------------------- webhooks
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 2500));
    const log = await (await fetch(`${DEMO}/webhooks/log`)).json();
    const created = log.filter((e) => e.type === 'message.created' && e.event?.data?.visitorId === d.visitorId);
    check('webhooks: message.created for both lines, signatures valid', created.length >= 2 && created.every((e) => e.signature === 'ok'), `${created.length} received, signatures ${[...new Set(created.map((e) => e.signature))].join(',')}`);
    check('webhooks: conversation.started for a first message', log.some((e) => e.type === 'conversation.started' && e.event?.data?.visitorId === d.visitorId));
  }

  // ---------------------------------------------------------------- the line
  if (process.env.CXYZ_QUEUE === '1' && d.features.call) {
    // Fill every free slot with callers who never press Join, then one more.
    const callers = [];
    for (let i = 0; i < 20; i++) {
      const s = await session();
      const r = await call('/sdk/v1/calls', { body: {}, token: s.token });
      callers.push({ s, r: r.json?.data, status: r.status });
      if (r.json?.data?.state === 'queued') break;
    }
    const ready = callers.filter((c) => c.r?.state === 'ready');
    const queued = callers.find((c) => c.r?.state === 'queued');
    check('callers go straight through while slots are free', ready.length >= 1, `${ready.length} ready`);
    check('the next caller is put in line with a place and an ETA', !!queued && queued.r.position === 1 && queued.r.etaSeconds > 0, JSON.stringify(queued?.r));
    if (queued) {
      // Watch the line: a ready caller misses the 30 s hold, the slot frees, the head moves up.
      const seen = await events(`/sdk/v1/calls/${queued.r.callId}/events`, queued.s.token, (ev) => ev === 'ready', 75_000);
      const kinds = seen.map(([e]) => e);
      check('the waiting caller is told when it is their turn', kinds.includes('queued') && kinds.at(-1) === 'ready', kinds.join(' → '));
      const ticket = seen.at(-1)?.[1]?.ticket;
      check('…with a one-use ticket and a hold countdown', typeof ticket === 'string' && ticket.length >= 32 && seen.at(-1)[1].holdSeconds > 0);
      const left = await call(`/sdk/v1/calls/${queued.r.callId}`, { method: 'DELETE', token: queued.s.token });
      check('leaving gives the slot back', left.status === 200);
      // Someone else's call cannot be read or ended.
      const stranger = await session();
      const peek = await call(`/sdk/v1/calls/${queued.r.callId}`, { method: 'DELETE', token: stranger.token });
      check("another visitor cannot end someone's call", peek.status === 404);
    }
    for (const c of callers) await call(`/sdk/v1/calls/${c.r?.callId}`, { method: 'DELETE', token: c.s.token }).catch(() => {});
    if (DEMO) {
      await new Promise((r) => setTimeout(r, 2500));
      const log = await (await fetch(`${DEMO}/webhooks/log`)).json();
      check('webhooks: call.queued and call.abandoned arrived', log.some((e) => e.type === 'call.queued') && log.some((e) => e.type === 'call.abandoned'), log.slice(0, 8).map((e) => e.type).join(','));
    }
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
