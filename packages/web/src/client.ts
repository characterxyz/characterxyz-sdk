import { Call, type CallOptions } from './call.js';
import { Chat } from './chat.js';
import { Emitter } from './emitter.js';
import { CxError } from './errors.js';
import { request } from './http.js';
import { localStore, memoryStore, SessionManager, type VisitorStore } from './session.js';
import type {
  AgentCard,
  ClientActionCall,
  ClientActionHandler,
  ContactDetails,
  Features,
  Opening,
  SessionInfo,
  TrackResult,
  VisitorIdentity,
} from './types.js';

export const DEFAULT_API_URL = 'https://api.character.xyz';

export interface InitOptions {
  /** `cxyz_pk_live_…` — safe in the page; works only from the key's allowed sites. */
  publishableKey?: string;
  /**
   * For signed-in visitors: return a session your server minted with its
   * secret key (see `@characterxyz/server`). Called again before expiry.
   */
  getSessionToken?: () => Promise<string | SessionInfo>;
  /** Which of the key's agents to talk to. Defaults to the key's first. */
  agentId?: string;
  /** Override the API (staging, local development). */
  apiUrl?: string;
  /** Remember the anonymous visitor across visits (default) or not at all. */
  storage?: 'local' | 'memory' | VisitorStore;
}

export interface ClientEvents extends Record<string, unknown> {
  /** A call started or ended; the widget swaps its view on this. */
  call: Call | null;
  error: CxError;
  /** A site event was accepted (or ignored): the widget may open itself. */
  siteEvent: TrackResult;
}

/**
 * The headless SDK. `await CharacterXYZ.init({ publishableKey })`, then use
 * `chat` and `startCall()`. Everything the widget does goes through here, so
 * a brand can build its own UI on the same calls.
 */
export class CharacterXYZ extends Emitter<ClientEvents> {
  readonly chat: Chat;
  private currentCall: Call | null = null;
  private destroyed = false;

  private constructor(
    readonly apiUrl: string,
    private readonly session: SessionManager,
    private info: SessionInfo,
  ) {
    super();
    this.chat = new Chat(apiUrl, session);
  }

  static async init(opts: InitOptions): Promise<CharacterXYZ> {
    const apiUrl = (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, '');
    if (opts.publishableKey && /^cxyz_sk_/.test(opts.publishableKey)) {
      // A secret key in a page is a leak. Refuse loudly, before it is sent anywhere.
      throw new CxError('invalid', 'That is a SECRET key. Never put it in a web page: use a publishable key (cxyz_pk_…). Revoke the secret key now.');
    }
    const store = opts.storage === 'memory' ? memoryStore() : opts.storage && typeof opts.storage === 'object' ? opts.storage : localStore();
    const session = new SessionManager({ apiUrl, agentId: opts.agentId, publishableKey: opts.publishableKey, getSessionToken: opts.getSessionToken, store });
    const info = await session.refresh();
    return new CharacterXYZ(apiUrl, session, info);
  }

  get agent(): AgentCard {
    return (this.session.info ?? this.info).agent;
  }

  get features(): Features {
    return (this.session.info ?? this.info).features;
  }

  get appearance(): Record<string, unknown> {
    return (this.session.info ?? this.info).appearance ?? {};
  }

  get visitorId(): string {
    return (this.session.info ?? this.info).visitorId;
  }

  get mode(): 'live' | 'test' {
    return (this.session.info ?? this.info).mode;
  }

  /** The call in progress (queued, ready or live), if any. */
  get call(): Call | null {
    return this.currentCall && this.currentCall.state.phase !== 'ended' ? this.currentCall : null;
  }

  /**
   * The worn video character's full render data (the public projection the
   * app's Stage reads), for a UI that draws the face — the widget hands it to
   * the app's renderer. Null when the agent wears none.
   */
  async videoAvatar(): Promise<Record<string, unknown> | null> {
    const token = await this.session.token();
    return request<Record<string, unknown> | null>(this.apiUrl, '/sdk/v1/agent/video-avatar', { token });
  }

  private openingP: Promise<Opening | null> | null = null;

  /**
   * How the agent opens the conversation here — her greeting, a welcome-back
   * line, a teaser and likely first questions — written by her and cached by
   * the server. Fetched once per page; null if it could not be had.
   */
  opening(refresh = false): Promise<Opening | null> {
    if (refresh) this.openingP = null;
    this.openingP ??= this.session
      .token()
      .then((token) => {
        const locale = typeof navigator === 'undefined' ? '' : navigator.language || '';
        const path = locale ? `/sdk/v1/agent/opening?locale=${encodeURIComponent(locale)}` : '/sdk/v1/agent/opening';
        return request<Opening>(this.apiUrl, path, { token });
      })
      .catch(() => null);
    return this.openingP;
  }

  /**
   * Leave the visitor's details for the brand's team. Sending is the consent
   * (the card says so). Fails `invalid` with `fields` naming each problem.
   */
  async sendDetails(details: ContactDetails): Promise<void> {
    const token = await this.session.token();
    const page = typeof location !== 'undefined' ? location.href : undefined;
    await request(this.apiUrl, '/sdk/v1/lead', { token, body: { ...details, consent: true, ...(page ? { page } : {}) } });
  }

  /** "Not now" on the details card: she will not ask again in this conversation. */
  async declineDetails(): Promise<void> {
    const token = await this.session.token();
    await request(this.apiUrl, '/sdk/v1/lead/decline', { token, method: 'POST', body: {} });
  }

  /**
   * Who the visitor is (`cx.identify`). Level-triggered: it stays in scope for
   * every later turn, event and lead until changed.
   */
  async identify(visitor: VisitorIdentity): Promise<void> {
    const token = await this.session.token();
    await request(this.apiUrl, '/sdk/v1/context', { token, method: 'POST', body: { visitor } });
  }

  /**
   * What the page currently knows (`cx.setContext`): plan, cart, page,
   * entitlement. Replaces the previous object, so removing a key means removing
   * it here too.
   */
  async setContext(context: Record<string, unknown>): Promise<void> {
    const token = await this.session.token();
    await request(this.apiUrl, '/sdk/v1/context', { token, method: 'POST', body: { context } });
  }

  /**
   * Something the visitor DID (`cx.track`). Only names the agent's graph
   * declares are accepted; anything else comes back `ignored`.
   *
   * Fire-and-forget for the caller: `void cx.track(...)` is the normal use. The
   * request is `keepalive`, so a click that navigates away still lets the agent
   * finish. Two calls with the same `id` are one event.
   */
  async track(name: string, data: Record<string, unknown> = {}, opts: { id?: string } = {}): Promise<TrackResult> {
    const token = await this.session.token();
    const id = opts.id ?? eventId();
    let res = await request<TrackResult>(this.apiUrl, '/sdk/v1/track', {
      token,
      method: 'POST',
      body: { name, data, id },
      keepalive: true,
    });
    this.emit('siteEvent', res);
    if (!res.accepted && res.ignored && res.ignored !== 'duplicate') {
      console.warn(`[characterxyz] event "${name}" ignored: ${res.ignored}`);
    }
    // Nobody waits for these; run them and forget.
    for (const a of res.actions ?? []) void this.runAction(a);
    // Awaited page actions: run, report, and keep going if the graph asks again.
    let guard = 0;
    while (res.action && guard++ < 4) {
      const action = res.action;
      const outcome = await this.runAction(action);
      res = await request<TrackResult>(this.apiUrl, `/sdk/v1/actions/${encodeURIComponent(action.id)}`, {
        token,
        method: 'POST',
        body: outcome,
      });
      this.emit('siteEvent', res);
    }
    this.chat.applySiteEvent(res);
    return res;
  }

  /**
   * Offer an action the agent may call on this page (`Client Action` node).
   * Returns a function that removes it. A missing handler is a graph `failed`,
   * not a broken page: the SDK reports the error instead of throwing.
   */
  registerAction(name: string, handler: ClientActionHandler): () => void {
    this.actionHandlers.set(name, handler);
    return () => {
      if (this.actionHandlers.get(name) === handler) this.actionHandlers.delete(name);
    };
  }

  private readonly actionHandlers = new Map<string, ClientActionHandler>();

  private async runAction(a: ClientActionCall): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const handler = this.actionHandlers.get(a.name);
    if (!handler) return { ok: false, error: `no handler registered for "${a.name}"` };
    try {
      const result = await handler(a.inputs ?? {}, a.name);
      return { ok: true, result: result ?? null };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }

  /** Start a voice call. Call from a click: it needs the microphone and audio unlocked. */
  async startCall(opts: CallOptions = {}): Promise<Call> {
    if (this.destroyed) throw new CxError('invalid', 'This client was destroyed.');
    if (!this.features.call) throw new CxError('forbidden', 'Calls are not available on this site.');
    if (this.call) return this.call;
    const call = new Call(this.apiUrl, this.session, this.agent.id, opts);
    this.currentCall = call;
    call.on('state', (s) => {
      if (s.phase === 'ended' && this.currentCall === call) this.emit('call', null);
    });
    call.on('error', (e) => this.emit('error', e));
    this.emit('call', call);
    await call.start();
    return call;
  }

  destroy(): void {
    this.destroyed = true;
    void this.currentCall?.hangUp();
    this.chat.stop();
    this.chat.clear();
    this.actionHandlers.clear();
    this.clear();
  }
}

/** An idempotency id for one event, without requiring a secure context. */
function eventId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return `evt_${c.randomUUID()}`;
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
