import { audioContext, PcmPlayer } from './audio/player.js';
import { openMic, type Mic } from './audio/mic.js';
import { Emitter } from './emitter.js';
import { CxError } from './errors.js';
import { readEvents, request, send } from './http.js';
import { parsePacket } from './protocol.js';
import type { SessionManager } from './session.js';
import type { CallEndReason, CallState, Caption } from './types.js';

export interface CallEvents extends Record<string, unknown> {
  state: CallState;
  /** The visitor's words and the agent's reply, as they are recognised. */
  caption: Caption;
  /** A caption the server withdrew (the visitor was not finished). */
  captionRemoved: string;
  /** The turn is ready: accept() within `holdSeconds`. */
  ready: { holdSeconds: number };
  /** One streamed face batch (kind-3 msgpack payload) for line `corr` — only with `face`. */
  face: { corr: string; payload: Uint8Array };
  /** A line of the agent's voice became audible, or ended (naturally or interrupted). */
  line: { corr: string; event: 'audible' | 'end' };
  error: CxError;
}

export interface CallOptions {
  /** Join the moment it is this visitor's turn (default true). */
  autoAccept?: boolean;
  deviceId?: string;
  /**
   * Ask for the agent's face streamed with the voice (Neural Lip Sync), for a
   * UI that draws it. `emotion()` is read when the call connects: the face's
   * mood as the face service takes it (`joy:0.3`), or null for neutral.
   */
  face?: { emotion?: () => string | null };
}

/** Talking over the agent this loud, this long, stops her. */
const BARGE_IN_LEVEL = 0.09;
const BARGE_IN_MS = 350;
const HEARTBEAT_MS = 25_000;

const initial = (): CallState => ({
  phase: 'idle',
  callId: null,
  position: null,
  etaSeconds: null,
  holdSeconds: null,
  maxSeconds: null,
  startedAt: null,
  endReason: null,
  muted: false,
  speaking: false,
  agentState: 'idle',
  error: null,
});

/**
 * One voice call: join the line, wait (chatting is fine meanwhile), accept,
 * talk, hang up. A call is single-use; start another for the next one.
 */
export class Call extends Emitter<CallEvents> {
  private s: CallState = initial();
  private ticket: string | null = null;
  private eventsAbort: AbortController | null = null;
  private ws: WebSocket | null = null;
  private mic: Mic | null = null;
  private players = new Map<string, PcmPlayer>();
  private sampleRates = new Map<string, number>();
  private cancelled = new Set<string>();
  private speakingCorr: string | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private loudSince: number | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly session: SessionManager,
    private readonly agentId: string,
    private readonly opts: CallOptions = {},
  ) {
    super();
  }

  get state(): CallState {
    return this.s;
  }

  /** The line being voiced now, and how much of it has been heard (ms). */
  audible(): { corr: string; ms: number } | null {
    const corr = this.speakingCorr;
    const p = corr ? this.players.get(corr) : undefined;
    return corr && p ? { corr, ms: p.playedMs() } : null;
  }

  /** Loudness of the agent's voice right now, 0..1. */
  voiceLevel(): number {
    const p = this.speakingCorr ? this.players.get(this.speakingCorr) : undefined;
    return p ? p.level() : 0;
  }

  private set(patch: Partial<CallState>) {
    this.s = { ...this.s, ...patch };
    this.emit('state', this.s);
  }

  /**
   * Call from a click: it unlocks audio, asks for the microphone, then joins
   * the line (or goes straight through when a slot is free).
   */
  async start(): Promise<void> {
    if (this.s.phase !== 'idle') return;
    this.set({ phase: 'joining' });
    // Created inside the gesture, or the browser keeps it suspended.
    audioContext();
    try {
      this.mic = await openMic({ deviceId: this.opts.deviceId, onFrame: (pcm, level) => this.onMicFrame(pcm, level) });
    } catch {
      this.finish('mic-denied', 'Allow the microphone to talk, or chat instead.');
      return;
    }
    try {
      const token = await this.session.token();
      const r = await request<{ callId: string; state: string; position?: number; etaSeconds?: number }>(this.apiUrl, '/sdk/v1/calls', {
        method: 'POST',
        body: {},
        token,
      });
      this.set({ callId: r.callId, phase: r.state === 'ready' ? 'joining' : 'queued', position: r.position ?? null, etaSeconds: r.etaSeconds ?? null });
      void this.follow();
    } catch (e) {
      const err = e instanceof CxError ? e : new CxError('unknown', 'Could not start the call.');
      const reason: CallEndReason = err.code === 'rate_limited' ? 'busy' : 'unavailable';
      this.finish(reason, err.message);
      this.emit('error', err);
    }
  }

  /** Follow the call's server-side state, reconnecting the stream if it drops. */
  private async follow(): Promise<void> {
    let failures = 0;
    while (this.s.callId && this.s.phase !== 'ended' && this.s.phase !== 'idle') {
      this.eventsAbort = new AbortController();
      try {
        const token = await this.session.token();
        const res = await send(this.apiUrl, `/sdk/v1/calls/${encodeURIComponent(this.s.callId)}/events`, { token, signal: this.eventsAbort.signal });
        failures = 0;
        await readEvents(res, (e) => this.onServerEvent(e.event, e.data as Record<string, unknown>), this.eventsAbort.signal);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        if (e instanceof CxError && e.code === 'not_found') {
          this.finish('failed', 'The call ended.');
          return;
        }
        failures += 1;
        if (failures > 5) {
          this.finish('failed', 'Lost the connection to the call.');
          return;
        }
      }
      if (this.ended()) return;
      await new Promise((r) => setTimeout(r, Math.min(4000, 500 * 2 ** failures)));
    }
  }

  private onServerEvent(event: string, d: Record<string, unknown>) {
    switch (event) {
      case 'queued':
        if (this.s.phase === 'joining' || this.s.phase === 'queued') {
          this.set({ phase: 'queued', position: Number(d.position) || 1, etaSeconds: Number(d.etaSeconds) || null });
        }
        break;
      case 'ready': {
        if (typeof d.ticket === 'string' && d.ticket) this.ticket = d.ticket;
        const hold = Number(d.holdSeconds) || 0;
        if (this.s.phase !== 'ready' && this.s.phase !== 'connecting' && this.s.phase !== 'live') {
          this.set({ phase: 'ready', holdSeconds: hold, position: null, etaSeconds: null });
          this.emit('ready', { holdSeconds: hold });
          if (this.opts.autoAccept !== false) this.accept();
        } else if (this.s.phase === 'ready') {
          this.set({ holdSeconds: hold });
        }
        break;
      }
      case 'live':
        this.set({ phase: 'live', maxSeconds: Number(d.maxSeconds) || null, startedAt: this.s.startedAt ?? Date.now() - (Number(d.elapsedSeconds) || 0) * 1000 });
        break;
      case 'ended':
        this.finish((String(d.reason || 'hangup') as CallEndReason) || 'hangup', null);
        break;
    }
  }

  // A method, not an inline comparison: the phase changes across an await,
  // which TypeScript's narrowing cannot see.
  private ended(): boolean {
    return this.s.phase === 'ended';
  }

  /** Take the call now that it is this visitor's turn. */
  accept(): void {
    if (this.s.phase !== 'ready' || !this.ticket || this.ws) return;
    this.set({ phase: 'connecting' });
    const url = this.apiUrl.replace(/^http/, 'ws') + '/sdk/v1/calls/socket';
    const ws = new WebSocket(url, [`cxyz-ticket.${this.ticket}`]);
    this.ticket = null;
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      const face = this.opts.face;
      const emotion = face?.emotion?.() ?? null;
      ws.send(
        JSON.stringify({
          type: 'agent_identity',
          agent_id: this.agentId,
          skin_index: 0,
          blendshapes: !!face,
          ...(face ? { blendshape_stream: true } : {}),
          ...(face && emotion ? { face_emotion: emotion } : {}),
        }),
      );
      // This page does not gate the microphone: the server's own voice
      // detection judges every frame.
      ws.send(JSON.stringify({ type: 'mic_state', silero: 'off', denoise: false }));
      this.heartbeat = setInterval(() => this.sendJson({ type: 'heartbeat' }), HEARTBEAT_MS);
      this.set({ phase: 'live', startedAt: this.s.startedAt ?? Date.now() });
    };
    ws.onmessage = (e) => this.onSocket(e.data);
    ws.onclose = () => {
      this.ws = null;
      // The event stream says why; give it a moment before calling it ourselves.
      setTimeout(() => {
        if (this.s.phase === 'live' || this.s.phase === 'connecting') this.finish('hangup', null);
      }, 1500);
    };
  }

  private sendJson(o: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }

  private onMicFrame(pcm: ArrayBuffer, level: number) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (this.speakingCorr) {
      // The agent must not hear itself: while she talks the frames go up as
      // silence, unless the visitor is clearly talking over her.
      const now = performance.now();
      if (level > BARGE_IN_LEVEL) {
        this.loudSince ??= now;
        if (now - this.loudSince >= BARGE_IN_MS) {
          this.loudSince = null;
          this.interrupt();
          ws.send(pcm);
          return;
        }
      } else {
        this.loudSince = null;
      }
      ws.send(new ArrayBuffer(pcm.byteLength));
      return;
    }
    ws.send(pcm);
  }

  private onSocket(data: unknown) {
    if (data instanceof ArrayBuffer) {
      const p = parsePacket(data);
      if (!p || this.cancelled.has(p.corr)) return;
      if (p.kind === 3) {
        // A copy, so the receiver may keep or transfer it.
        if (this.opts.face) this.emit('face', { corr: p.corr, payload: p.payload.slice() });
        return;
      }
      if (p.kind !== 1) return;
      let player = this.players.get(p.corr);
      if (!player) {
        // A new line: whatever was playing is over.
        for (const [c, old] of this.players) {
          old.stop();
          this.players.delete(c);
        }
        const corr = p.corr;
        player = new PcmPlayer({
          sampleRate: this.sampleRates.get(corr) ?? 16_000,
          onStart: () => {
            this.speakingCorr = corr;
            this.set({ speaking: true });
            this.emit('line', { corr, event: 'audible' });
            this.sendJson({ type: 'playback_started', correlationId: corr, timestampMs: Date.now() });
          },
          onEnd: () => {
            this.players.delete(corr);
            if (this.speakingCorr === corr) this.speakingCorr = null;
            this.set({ speaking: false });
            this.emit('line', { corr, event: 'end' });
            this.sendJson({ type: 'playback_ended', correlationId: corr, timestampMs: Date.now(), reason: 'natural' });
            this.sendJson({ type: 'speech_ended' });
          },
        });
        this.players.set(corr, player);
      }
      player.enqueue(p.payload);
      if (p.final) player.end();
      return;
    }
    if (typeof data !== 'string') return;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(data);
    } catch {
      return;
    }
    if ('AgentSpeechMeta' in o) {
      const m = o.AgentSpeechMeta as { correlation_id?: string; sample_rate?: number };
      if (m?.correlation_id && m.sample_rate) this.sampleRates.set(m.correlation_id, m.sample_rate);
      return;
    }
    if ('InteractorTranscript' in o) {
      const t = o.InteractorTranscript as { correlation_id: string; text: string };
      if (t?.text) this.emit('caption', { id: `v:${t.correlation_id}`, role: 'visitor', text: t.text });
      return;
    }
    if ('AgentReplyTranscript' in o) {
      const t = o.AgentReplyTranscript as { correlation_id: string; text: string };
      if (t?.text && !this.cancelled.has(t.correlation_id)) this.emit('caption', { id: `a:${t.correlation_id}`, role: 'agent', text: t.text });
      return;
    }
    if (o.type === 'turn_cancelled' && typeof o.correlationId === 'string') {
      const cid = o.correlationId;
      this.cancelled.add(cid);
      this.players.get(cid)?.stop();
      this.players.delete(cid);
      this.emit('line', { corr: cid, event: 'end' });
      if (this.speakingCorr === cid) {
        this.speakingCorr = null;
        this.set({ speaking: false });
      }
      this.emit('captionRemoved', `a:${cid}`);
      return;
    }
    if (o.kind === 'agent_status' && typeof o.state === 'string') {
      this.set({ agentState: o.state.toLowerCase() });
    }
  }

  /** Stop the agent mid-sentence (the visitor wants to speak). */
  interrupt(): void {
    const corr = this.speakingCorr;
    if (!corr) return;
    const p = this.players.get(corr);
    const heardMs = Math.round(p?.playedMs() ?? 0);
    p?.stop();
    this.players.delete(corr);
    this.cancelled.add(corr);
    this.speakingCorr = null;
    this.set({ speaking: false });
    this.emit('line', { corr, event: 'end' });
    this.sendJson({ type: 'playback_ended', correlationId: corr, timestampMs: Date.now(), reason: 'interrupted' });
    this.sendJson({ type: 'interrupt', correlationId: corr, heardMs, timestampMs: Date.now() });
  }

  setMuted(muted: boolean): void {
    this.mic?.setMuted(muted);
    this.set({ muted });
  }

  /** Leave the line, or hang up. */
  async hangUp(): Promise<void> {
    const id = this.s.callId;
    const was = this.s.phase;
    this.finish(was === 'live' ? 'hangup' : 'left', null);
    if (!id) return;
    try {
      const token = await this.session.token();
      await send(this.apiUrl, `/sdk/v1/calls/${encodeURIComponent(id)}`, { method: 'DELETE', token });
    } catch {
      // The server notices a closed socket / abandoned line on its own.
    }
  }

  private finish(reason: CallEndReason, error: string | null) {
    if (this.s.phase === 'ended') return;
    this.eventsAbort?.abort();
    this.eventsAbort = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const p of this.players.values()) p.stop();
    this.players.clear();
    this.speakingCorr = null;
    this.mic?.stop();
    this.mic = null;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000);
    this.ticket = null;
    this.set({ phase: 'ended', endReason: reason, speaking: false, holdSeconds: null, error });
  }
}
