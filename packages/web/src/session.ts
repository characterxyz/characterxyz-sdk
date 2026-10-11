import { CxError } from './errors.js';
import { request } from './http.js';
import type { SessionInfo } from './types.js';

/** Where the SDK may remember this browser's anonymous visitor id. */
export interface VisitorStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const memoryStore = (): VisitorStore => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

export const localStore = (): VisitorStore => ({
  get(k) {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      // private mode / blocked storage: the visitor is simply new each time
    }
  },
});

export interface SessionSource {
  apiUrl: string;
  agentId?: string;
  /** Browser path: a publishable key, exchanged from this page's origin. */
  publishableKey?: string;
  /**
   * Server path: your backend mints the session with a secret key (an
   * identified visitor) and hands the token to the page. Called again when
   * the session is about to run out.
   */
  getSessionToken?: () => Promise<string | SessionInfo>;
  store: VisitorStore;
}

/** Renew this long before expiry. */
const RENEW_EARLY_S = 60;

/**
 * Holds the current session, renews it before it runs out, and never runs
 * two renewals at once.
 */
export class SessionManager {
  private current: SessionInfo | null = null;
  private inflight: Promise<SessionInfo> | null = null;

  constructor(private readonly src: SessionSource) {
    if (!src.publishableKey && !src.getSessionToken) {
      throw new CxError('invalid', 'Pass a publishableKey, or getSessionToken for sessions your server mints.');
    }
  }

  private visitorKey(): string {
    // Per key, so two brands on one domain never share a visitor.
    const k = this.src.publishableKey ?? 'server';
    return `cxyz:visitor:${k.slice(-12)}`;
  }

  get info(): SessionInfo | null {
    return this.current;
  }

  /** A token valid for at least the next minute. */
  async token(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.current && this.current.expiresAt - RENEW_EARLY_S > now) return this.current.token;
    return (await this.refresh()).token;
  }

  refresh(): Promise<SessionInfo> {
    this.inflight ??= this.mint().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async mint(): Promise<SessionInfo> {
    let info: SessionInfo;
    if (this.src.getSessionToken) {
      const got = await this.src.getSessionToken();
      if (typeof got === 'string') {
        // A bare token: ask the server what it unlocks.
        info = await this.describe(got);
      } else {
        info = got;
      }
    } else {
      const visitorId = this.src.store.get(this.visitorKey()) ?? undefined;
      info = await request<SessionInfo>(this.src.apiUrl, '/sdk/v1/sessions', {
        method: 'POST',
        body: { publishableKey: this.src.publishableKey, agentId: this.src.agentId, visitorId },
      });
      this.src.store.set(this.visitorKey(), info.visitorId);
    }
    this.current = info;
    return info;
  }

  /** The session behind a token minted elsewhere (`getSessionToken` returned a string). */
  private async describe(token: string): Promise<SessionInfo> {
    const info = await request<SessionInfo>(this.src.apiUrl, '/sdk/v1/session', { token });
    return { ...info, token };
  }
}
