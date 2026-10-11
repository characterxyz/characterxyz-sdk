/**
 * `@characterxyz/web/server` — mint a session for a SIGNED-IN visitor, on
 * your server, with your secret key. Node 18+, Deno, Bun, edge runtimes.
 *
 * ```ts
 * // e.g. a Next.js route handler: GET /api/characterxyz/session
 * import { createSession } from '@characterxyz/web/server';
 *
 * export async function GET() {
 *   const user = await currentUser();
 *   const session = await createSession({
 *     secretKey: process.env.CHARACTERXYZ_SECRET_KEY!,
 *     visitor: { id: user.id },
 *     origin: 'https://www.example.com',
 *   });
 *   return Response.json(session);
 * }
 * ```
 *
 * Then in the page: `CharacterXYZ.init({ getSessionToken: () => fetch('/api/characterxyz/session').then(r => r.json()) })`.
 * The visitor's chat history then follows them across devices, and webhooks
 * carry your id for them as `externalId`.
 */
import type { SessionInfo } from './types.js';

export interface CreateSessionOptions {
  /** `cxyz_sk_…` — from your server's environment, never from code. */
  secretKey: string;
  /** Your id for this person (≤ 128 characters). Omit for an anonymous visitor. */
  visitor?: { id: string };
  agentId?: string;
  /** The site the session will be used from; binds it there. Must be on the key. */
  origin?: string;
  apiUrl?: string;
}

export async function createSession(opts: CreateSessionOptions): Promise<SessionInfo> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    throw new Error('createSession runs on your server. A secret key must never reach a browser.');
  }
  const apiUrl = (opts.apiUrl ?? 'https://api.character.xyz').replace(/\/+$/, '');
  const res = await fetch(`${apiUrl}/sdk/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.secretKey}` },
    body: JSON.stringify({ agentId: opts.agentId, visitor: opts.visitor, origin: opts.origin }),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: SessionInfo; message?: string };
  if (!res.ok || !body.data) throw new Error(`Character XYZ session failed (${res.status}): ${body.message ?? 'unknown error'}`);
  return body.data;
}

/**
 * Check a webhook's `Cxyz-Signature` header. Pass the RAW body string, exactly
 * as received. Rejects anything older than `toleranceSeconds` (default 300).
 */
export async function verifyWebhook(opts: { secret: string; body: string; signature: string | null; toleranceSeconds?: number; now?: number }): Promise<boolean> {
  const sig = opts.signature ?? '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=', 2) as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? 300)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(opts.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${opts.body}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

export type { SessionInfo } from './types.js';
