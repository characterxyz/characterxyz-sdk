import { CxError, codeForStatus } from './errors.js';

export interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

async function errorFrom(res: Response): Promise<CxError> {
  let message = '';
  const fields: Record<string, string> = {};
  try {
    const j = (await res.json()) as { message?: unknown; errors?: { path?: unknown; message?: unknown }[] };
    if (typeof j?.message === 'string') message = j.message;
    for (const e of Array.isArray(j?.errors) ? j.errors : []) {
      if (typeof e?.path === 'string' && typeof e?.message === 'string') fields[e.path] = e.message;
    }
  } catch {
    // not JSON: the status says enough
  }
  return new CxError(codeForStatus(res.status), message || `Request failed (${res.status})`, res.status, fields);
}

export async function send(apiUrl: string, path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(apiUrl + path, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      // No cookies, ever: the SDK authenticates with its own bearer token, and
      // a credentialed request would carry the brand page's cookies to us.
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new CxError('network', 'Could not reach Character XYZ. Check your connection.');
  }
  if (!res.ok) throw await errorFrom(res);
  return res;
}

/** JSON request; unwraps the API's `{message, data}` envelope. */
export async function request<T>(apiUrl: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(apiUrl, path, opts);
  const j = (await res.json()) as { data?: T };
  return j.data as T;
}

export interface ServerEvent {
  event: string;
  data: unknown;
}

/**
 * Read a `text/event-stream` body, calling `onEvent` per event, until the
 * stream ends or `signal` aborts. Fetch-based on purpose: `EventSource` cannot
 * send an Authorization header, so it would need the token in the URL.
 */
export async function readEvents(res: Response, onEvent: (e: ServerEvent) => void, signal?: AbortSignal): Promise<void> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', onAbort);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      buf = drain(buf, onEvent);
    }
    buf += decoder.decode();
    drain(buf + '\n\n', onEvent);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Dispatch every complete event in `buf`; return what is left over. */
export function drain(buf: string, onEvent: (e: ServerEvent) => void): string {
  const normalised = buf.replace(/\r\n/g, '\n');
  let rest = normalised;
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (!data.length) continue;
    const raw = data.join('\n');
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // plain text data
    }
    onEvent({ event, data: parsed });
  }
  return rest;
}
