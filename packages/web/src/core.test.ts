import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Chat } from './chat.js';
import { CharacterXYZ } from './client.js';
import { CxError } from './errors.js';
import { drain, type ServerEvent } from './http.js';
import { buildPacket, parsePacket } from './protocol.js';
import { memoryStore, SessionManager } from './session.js';
import type { SessionInfo } from './types.js';

const API = 'https://api.test';

function sessionInfo(over: Partial<SessionInfo> = {}): SessionInfo {
  return {
    token: 'cxs1.payload.sig',
    expiresAt: Math.floor(Date.now() / 1000) + 900,
    visitorId: 'v_aaaaaaaaaaaaaaaaaaaaaaaa',
    agent: { id: 'agent_1', name: 'Ananya', tagline: 'Host', locale: 'en-IN', cameo: null, video: null },
    features: { chat: true, call: true, maxCallMinutes: 10 },
    appearance: {},
    mode: 'test',
    ...over,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(status < 300 ? { message: 'ok', data } : data), { status, headers: { 'Content-Type': 'application/json' } });
}

function sse(frames: string[], status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f));
      c.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => vi.restoreAllMocks());

describe('event-stream parser', () => {
  it('dispatches complete events and keeps the remainder', () => {
    const got: ServerEvent[] = [];
    const rest = drain('event: delta\ndata: {"text":"Hel"}\n\nevent: delta\ndata: {"te', (e) => got.push(e));
    expect(got).toEqual([{ event: 'delta', data: { text: 'Hel' } }]);
    expect(rest).toBe('event: delta\ndata: {"te');
  });

  it('ignores comments, joins multi-line data, accepts CRLF', () => {
    const got: ServerEvent[] = [];
    drain(': keepalive\r\n\r\nevent: x\r\ndata: a\r\ndata: b\r\n\r\n', (e) => got.push(e));
    expect(got).toEqual([{ event: 'x', data: 'a\nb' }]);
  });
});

describe('agent socket packet', () => {
  it('round-trips a voice chunk', () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const p = parsePacket(buildPacket({ kind: 1, final: true, corr: 'turn-7', payload }));
    expect(p?.kind).toBe(1);
    expect(p?.final).toBe(true);
    expect(p?.corr).toBe('turn-7');
    expect(Array.from(p!.payload)).toEqual([1, 2, 3, 4]);
  });

  it('refuses foreign or truncated buffers', () => {
    expect(parsePacket(new ArrayBuffer(10))).toBeNull();
    const ok = buildPacket({ kind: 1, final: false, corr: 'c', payload: new Uint8Array(8) });
    expect(parsePacket(ok.slice(0, ok.byteLength - 4))).toBeNull();
    const bad = new Uint8Array(ok.slice(0));
    bad[0] = 0x41;
    expect(parsePacket(bad.buffer)).toBeNull();
  });
});

describe('sessions', () => {
  it('exchanges the publishable key once, remembers the visitor, and renews only near expiry', async () => {
    const store = memoryStore();
    const calls: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return json(sessionInfo());
    });
    const m = new SessionManager({ apiUrl: API, publishableKey: 'cxyz_pk_test_AAAAAAAAAAAAAAAAAAAAAAAA', store });
    await Promise.all([m.token(), m.token(), m.token()]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ publishableKey: 'cxyz_pk_test_AAAAAAAAAAAAAAAAAAAAAAAA' });
    await m.token();
    expect(calls).toHaveLength(1);

    // A second manager on the same storage presents the same visitor.
    const m2 = new SessionManager({ apiUrl: API, publishableKey: 'cxyz_pk_test_AAAAAAAAAAAAAAAAAAAAAAAA', store });
    await m2.token();
    expect(calls[1]).toMatchObject({ visitorId: 'v_aaaaaaaaaaaaaaaaaaaaaaaa' });
  });

  it('renews a session about to run out', async () => {
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      n += 1;
      return json(sessionInfo({ token: `t${n}`, expiresAt: Math.floor(Date.now() / 1000) + (n === 1 ? 30 : 900) }));
    });
    const m = new SessionManager({ apiUrl: API, publishableKey: 'cxyz_pk_test_AAAAAAAAAAAAAAAAAAAAAAAA', store: memoryStore() });
    await m.refresh();
    expect(await m.token()).toBe('t2');
  });

  it('refuses a secret key in the page before sending it anywhere', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    await expect(CharacterXYZ.init({ publishableKey: 'cxyz_sk_live_' + 'A'.repeat(40) })).rejects.toThrow(/SECRET key/);
    expect(f).not.toHaveBeenCalled();
  });

  it('surfaces the server message for a refused origin', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'This site is not allowed to use this key' }, 403));
    const err = await CharacterXYZ.init({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA', apiUrl: API, storage: 'memory' }).catch((e) => e);
    expect(err).toBeInstanceOf(CxError);
    expect(err.code).toBe('forbidden');
    expect(err.message).toMatch(/not allowed/);
  });
});

describe('chat', () => {
  let m: SessionManager;
  beforeEach(async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(sessionInfo()));
    m = new SessionManager({ apiUrl: API, publishableKey: 'cxyz_pk_test_AAAAAAAAAAAAAAAAAAAAAAAA', store: memoryStore() });
    await m.refresh();
  });

  it('streams the reply into the list and settles on the stored message', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      sse(['event: delta\ndata: {"text":"Hi"}\n\n', 'event: delta\ndata: {"text":" there"}\n\n', 'event: done\ndata: {"id":"msg_9","text":"Hi there","createdAt":"2026-10-12T00:00:00Z"}\n\n']),
    );
    const chat = new Chat(API, m);
    const seen: string[] = [];
    chat.on('messages', (list) => {
      const last = list[list.length - 1];
      if (last?.role === 'agent') seen.push(last.text);
    });
    const done = await chat.send('hello');
    expect(done).toMatchObject({ id: 'msg_9', text: 'Hi there' });
    expect(seen).toContain('Hi');
    expect(chat.messages.map((x) => [x.role, x.text])).toEqual([
      ['visitor', 'hello'],
      ['agent', 'Hi there'],
    ]);
    expect(chat.isBusy).toBe(false);
  });

  it('marks the message failed when the server reports an error, and can retry it', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sse(['event: error\ndata: {"message":"Something went wrong. Try again."}\n\n']));
    const chat = new Chat(API, m);
    const errors: CxError[] = [];
    chat.on('error', (e) => errors.push(e));
    await expect(chat.send('hello')).rejects.toThrow(/Try again/);
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toMatchObject({ role: 'visitor', failed: true });
    expect(errors).toHaveLength(1);

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sse(['event: done\ndata: {"id":"m2","text":"ok","createdAt":"x"}\n\n']));
    await chat.retry(chat.messages[0]!.id);
    expect(chat.messages.map((x) => x.text)).toEqual(['hello', 'ok']);
  });

  it('refuses an empty message and a second send while busy', async () => {
    const chat = new Chat(API, m);
    await expect(chat.send('   ')).rejects.toThrow();
    let release!: () => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          release = () => r(sse(['event: done\ndata: {"id":"a","text":"x","createdAt":"y"}\n\n']));
        }),
    );
    const first = chat.send('one');
    await expect(chat.send('two')).rejects.toThrow(/Wait/);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await first;
  });
});
