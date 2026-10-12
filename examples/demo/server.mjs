// The SDK demo: a pretend brand site with the widget embedded, on its own
// port (3130, canon/docs/port-registry.md), plus the two server-side pieces a
// real integration has — minting identified sessions and receiving webhooks.
//
//   pnpm build && pnpm demo
//
// Environment (all optional):
//   CXYZ_PUBLISHABLE_KEY   cxyz_pk_test_…   used by the page
//   CXYZ_SECRET_KEY        cxyz_sk_test_…   enables /session (identified visitors)
//   CXYZ_WEBHOOK_SECRET    whsec_…          enables signature checks on /webhooks
//   CXYZ_API_URL           default http://127.0.0.1:8080 (the local backend)
//   CXYZ_AGENT_ID          which of the key's agents to show
//   CXYZ_FACE_URL          the app's face page (default http://localhost:3000/embed/face)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3130;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const env = (k, d = '') => process.env[k] ?? d;
const API = env('CXYZ_API_URL', 'http://127.0.0.1:8080');

/** Received webhooks, newest first, for GET /webhooks/log. */
const received = [];

function verify(raw, header, secret) {
  if (!secret) return 'unchecked';
  const parts = Object.fromEntries(String(header ?? '').split(',').map((p) => p.split('=', 2)));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > 300) return 'bad';
  const want = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  const a = Buffer.from(want);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'bad';
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.map': 'application/json' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = readFileSync(join(here, 'index.html'), 'utf8')
        .replaceAll('%PUBLISHABLE_KEY%', env('CXYZ_PUBLISHABLE_KEY'))
        .replaceAll('%API_URL%', API)
        .replaceAll('%AGENT_ID%', env('CXYZ_AGENT_ID'))
        .replaceAll('%FACE_URL%', env('CXYZ_FACE_URL', 'http://localhost:3000/embed/face'));
      res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    // The script-tag build, as a CDN would serve it.
    if (url.pathname === '/cx.js' || url.pathname === '/cx.js.map') {
      const file = join(root, 'packages', 'widget', 'dist', url.pathname.slice(1));
      if (!existsSync(file)) {
        res.writeHead(404);
        return res.end('Build the widget first: pnpm build');
      }
      res.writeHead(200, { 'Content-Type': types[url.pathname.endsWith('.map') ? '.map' : '.js'], 'Cache-Control': 'no-store' });
      return res.end(readFileSync(file));
    }
    // What a brand's server does for a signed-in visitor.
    if (url.pathname === '/session') {
      const secretKey = env('CXYZ_SECRET_KEY');
      if (!secretKey) {
        res.writeHead(501, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Set CXYZ_SECRET_KEY to try identified visitors.' }));
      }
      const r = await fetch(`${API}/sdk/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secretKey}` },
        body: JSON.stringify({ visitor: { id: url.searchParams.get('user') ?? 'demo-user-1' }, origin: `http://localhost:${PORT}`, agentId: env('CXYZ_AGENT_ID') || undefined }),
      });
      const body = await r.json();
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(body.data ?? body));
    }
    // A webhook receiver: check the signature, keep the event.
    if (url.pathname === '/webhooks' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const check = verify(raw, req.headers['cxyz-signature'], env('CXYZ_WEBHOOK_SECRET'));
      let event = null;
      try {
        event = JSON.parse(raw);
      } catch {}
      received.unshift({ at: new Date().toISOString(), signature: check, type: event?.type, event });
      received.length = Math.min(received.length, 100);
      console.log(`[webhook] ${event?.type ?? '?'} signature=${check}`);
      res.writeHead(check === 'bad' ? 400 : 200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ received: true }));
    }
    if (url.pathname === '/webhooks/log') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(received, null, 2));
    }
    res.writeHead(404);
    res.end('not found');
  } catch (e) {
    res.writeHead(500);
    res.end(String(e?.message ?? e));
  }
});

// The port guard every workspace project runs: refuse rather than drift.
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. It belongs to the SDK demo (canon/docs/port-registry.md); free it rather than starting elsewhere.`);
    process.exit(1);
  }
  throw e;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`SDK demo on http://localhost:${PORT}  (API ${API})`);
  if (!env('CXYZ_PUBLISHABLE_KEY')) console.log('  ⚠ set CXYZ_PUBLISHABLE_KEY (create one in Character XYZ › Settings › API keys)');
});
