import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSession, verifyWebhook } from './index.js';

describe('createSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the visitor with the secret key as a bearer and returns the session', async () => {
    const data = { token: 'cxs1.a.b', expiresAt: 1, visitorId: 'u_1' };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const session = await createSession({
      secretKey: 'cxyz_sk_test_x',
      visitor: { id: 'u_1' },
      origin: 'https://www.example.com',
      apiUrl: 'https://api.example.test/',
    });

    expect(session).toEqual(data);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/sdk/v1/sessions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cxyz_sk_test_x');
    expect(JSON.parse(init.body as string)).toEqual({ visitor: { id: 'u_1' }, origin: 'https://www.example.com' });
  });

  it('surfaces the server message when the session is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Unrecognised key' }), { status: 401 })));
    await expect(createSession({ secretKey: 'cxyz_sk_test_bad' })).rejects.toThrow(/401.*Unrecognised key/);
  });

  it('refuses to run in a browser', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    await expect(createSession({ secretKey: 'cxyz_sk_test_x' })).rejects.toThrow(/never reach a browser/);
  });
});

describe('webhook verification', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1","type":"call.started"}';
  const t = 1_760_000_000;
  // Exactly what the backend sends: hex(hmac-sha256(secret, "<t>.<body>")).
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

  it('accepts the backend signature', async () => {
    expect(await verifyWebhook({ secret, body, signature: `t=${t},v1=${v1}`, now: t + 10 })).toBe(true);
  });

  it('rejects a changed body, a wrong secret, a stale timestamp and garbage', async () => {
    expect(await verifyWebhook({ secret, body: body + ' ', signature: `t=${t},v1=${v1}`, now: t })).toBe(false);
    expect(await verifyWebhook({ secret: 'whsec_other', body, signature: `t=${t},v1=${v1}`, now: t })).toBe(false);
    expect(await verifyWebhook({ secret, body, signature: `t=${t},v1=${v1}`, now: t + 301 })).toBe(false);
    expect(await verifyWebhook({ secret, body, signature: 'nonsense', now: t })).toBe(false);
    expect(await verifyWebhook({ secret, body, signature: null, now: t })).toBe(false);
  });
});
