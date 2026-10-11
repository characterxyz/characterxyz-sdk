import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./audio/mic.js', () => ({
  openMic: vi.fn(async () => ({ muted: false, setMuted: vi.fn(), stop: vi.fn() })),
}));
vi.mock('./audio/player.js', () => ({
  audioContext: vi.fn(),
  PcmPlayer: vi.fn(),
}));

import { openMic } from './audio/mic.js';
import { Call } from './call.js';
import { memoryStore, SessionManager } from './session.js';
import type { CallState, SessionInfo } from './types.js';

const API = 'https://api.test';

function info(): SessionInfo {
  return {
    token: 'cxs1.p.s',
    expiresAt: Math.floor(Date.now() / 1000) + 900,
    visitorId: 'v_x',
    agent: { id: 'agent_1', name: 'Ananya', tagline: '', locale: null, cameo: null, video: null },
    features: { chat: true, call: true, maxCallMinutes: 10 },
    appearance: {},
    mode: 'test',
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status < 300 ? { data } : data), { status, headers: { 'Content-Type': 'application/json' } });
}

/** An event stream the test feeds by hand. */
function liveStream() {
  const enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    push: (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
    close: () => {
      try {
        ctrl.close();
      } catch {
        // the SDK already cancelled it (hang-up), which is the point
      }
    },
  };
}

async function session() {
  const m = new SessionManager({ apiUrl: API, publishableKey: 'cxyz_pk_test_AAAAAAAAAAAAAAAAAAAAAAAA', store: memoryStore() });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(info()));
  await m.refresh();
  return m;
}

afterEach(() => vi.restoreAllMocks());

describe('a call through the line', () => {
  it('queues, moves up, is told it is ready, and leaves cleanly', async () => {
    const m = await session();
    const stream = liveStream();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(json({ callId: 'call_1', state: 'queued', position: 2, etaSeconds: 360 }))
      .mockResolvedValueOnce(stream.response)
      .mockResolvedValueOnce(json(null)); // DELETE

    const call = new Call(API, m, 'agent_1', { autoAccept: false });
    const phases: CallState['phase'][] = [];
    call.on('state', (s) => {
      if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    });
    const ready = vi.fn();
    call.on('ready', ready);

    await call.start();
    expect(call.state).toMatchObject({ phase: 'queued', position: 2, etaSeconds: 360, callId: 'call_1' });

    stream.push('queued', { position: 1, etaSeconds: 180 });
    await vi.waitFor(() => expect(call.state.position).toBe(1));

    stream.push('ready', { ticket: 'TICKET', holdSeconds: 30 });
    await vi.waitFor(() => expect(call.state.phase).toBe('ready'));
    expect(ready).toHaveBeenCalledWith({ holdSeconds: 30 });

    await call.hangUp();
    expect(call.state).toMatchObject({ phase: 'ended', endReason: 'left' });
    const del = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'DELETE');
    expect(String(del?.[0])).toBe(`${API}/sdk/v1/calls/call_1`);
    expect(phases).toEqual(['joining', 'queued', 'ready', 'ended']);
    stream.close();
  });

  it('ends with the reason the server gives', async () => {
    const m = await session();
    const stream = liveStream();
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(json({ callId: 'call_2', state: 'queued', position: 1, etaSeconds: 60 }))
      .mockResolvedValueOnce(stream.response);
    const call = new Call(API, m, 'agent_1', { autoAccept: false });
    await call.start();
    stream.push('ended', { reason: 'timeout', seconds: 0 });
    await vi.waitFor(() => expect(call.state.phase).toBe('ended'));
    expect(call.state.endReason).toBe('timeout');
  });

  it('a full line ends as busy, with the server message', async () => {
    const m = await session();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(json({ message: 'The line is full right now.' }, 429));
    const call = new Call(API, m, 'agent_1');
    await call.start();
    expect(call.state).toMatchObject({ phase: 'ended', endReason: 'busy', error: 'The line is full right now.' });
  });

  it('a denied microphone ends before joining the line', async () => {
    const m = await session();
    vi.mocked(openMic).mockRejectedValueOnce(new Error('NotAllowedError'));
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    const before = f.mock.calls.length;
    const call = new Call(API, m, 'agent_1');
    await call.start();
    expect(call.state.endReason).toBe('mic-denied');
    expect(f.mock.calls.length).toBe(before);
  });
});
