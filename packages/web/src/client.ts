import { Call, type CallOptions } from './call.js';
import { Chat } from './chat.js';
import { Emitter } from './emitter.js';
import { CxError } from './errors.js';
import { request } from './http.js';
import { localStore, memoryStore, SessionManager, type VisitorStore } from './session.js';
import type { AgentCard, Features, Opening, SessionInfo } from './types.js';

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
  opening(): Promise<Opening | null> {
    this.openingP ??= this.session
      .token()
      .then((token) => request<Opening>(this.apiUrl, '/sdk/v1/agent/opening', { token }))
      .catch(() => null);
    return this.openingP;
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
    this.clear();
  }
}
