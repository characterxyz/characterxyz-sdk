import { Emitter } from './emitter.js';
import { CxError } from './errors.js';
import { readEvents, request, send } from './http.js';
import type { SessionManager } from './session.js';
import type { ChatMessage } from './types.js';

export interface ChatEvents extends Record<string, unknown> {
  /** The whole list, after any change. */
  messages: ChatMessage[];
  /** True from send until the reply is complete. */
  busy: boolean;
  error: CxError;
}

let localSeq = 0;
const localId = (p: string) => `${p}_${Date.now().toString(36)}_${(localSeq++).toString(36)}`;

/**
 * Text chat with the agent. History lives on the server, so it follows the
 * visitor across page loads (and, for an identified visitor, devices).
 */
export class Chat extends Emitter<ChatEvents> {
  private list: ChatMessage[] = [];
  private loaded = false;
  private busy = false;
  private abort: AbortController | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly session: SessionManager,
  ) {
    super();
  }

  get messages(): readonly ChatMessage[] {
    return this.list;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  private publish() {
    this.list = [...this.list];
    this.emit('messages', this.list);
  }

  /** Load earlier messages (once; later calls return what is held). */
  async load(): Promise<readonly ChatMessage[]> {
    if (this.loaded) return this.list;
    const token = await this.session.token();
    const res = await request<{ messages: ChatMessage[] }>(this.apiUrl, '/sdk/v1/chat/messages?limit=50', { token });
    // Anything sent while the history was loading stays after it.
    const pending = this.list;
    this.list = [...(res?.messages ?? []), ...pending];
    this.loaded = true;
    this.publish();
    return this.list;
  }

  /**
   * Send a message; the reply streams into `messages` as it is written.
   * Resolves with the finished reply.
   */
  async send(text: string): Promise<ChatMessage> {
    const t = text.trim();
    if (!t) throw new CxError('invalid', 'Say something first.');
    if (this.busy) throw new CxError('rate_limited', 'Wait for the reply first.');
    this.setBusy(true);
    const mine: ChatMessage = { id: localId('local'), role: 'visitor', text: t, createdAt: new Date().toISOString() };
    const reply: ChatMessage = { id: localId('reply'), role: 'agent', text: '', createdAt: new Date().toISOString(), streaming: true };
    this.list.push(mine, reply);
    this.publish();

    this.abort = new AbortController();
    try {
      const token = await this.session.token();
      const res = await send(this.apiUrl, '/sdk/v1/chat/messages', { method: 'POST', body: { text: t }, token, signal: this.abort.signal });
      let finished: ChatMessage | null = null;
      let failure: string | null = null;
      await readEvents(
        res,
        ({ event, data }) => {
          const d = data as Record<string, unknown>;
          if (event === 'delta' && typeof d?.text === 'string') {
            reply.text += d.text;
            this.publish();
          } else if (event === 'done') {
            const next = Array.isArray(d.suggestions) ? d.suggestions.filter((q): q is string => typeof q === 'string' && q.trim() !== '') : [];
            finished = {
              id: String(d.id),
              role: 'agent',
              text: String(d.text ?? reply.text),
              createdAt: String(d.createdAt ?? reply.createdAt),
              ...(next.length ? { suggestions: next } : {}),
              ...(d.askDetails && typeof d.askDetails === 'object' ? { askDetails: d.askDetails as ChatMessage['askDetails'] } : {}),
              ...(d.detailsForm && typeof d.detailsForm === 'object' ? { detailsForm: d.detailsForm as ChatMessage['detailsForm'] } : {}),
            };
          } else if (event === 'error') {
            failure = typeof d?.message === 'string' ? d.message : 'Something went wrong.';
          }
        },
        this.abort.signal,
      );
      if (failure || !finished) throw new CxError('unknown', failure ?? 'The reply was cut off. Try again.');
      const done: ChatMessage = finished;
      this.replace(reply.id, done);
      return done;
    } catch (e) {
      const err = e instanceof CxError ? e : new CxError('network', 'The reply was cut off. Try again.');
      this.list = this.list.filter((m) => m.id !== reply.id);
      const idx = this.list.findIndex((m) => m.id === mine.id);
      // A refusal the server explained (a daily limit, a slow-down) is shown as
      // it was said; anything else is the generic "not sent".
      if (idx !== -1) this.list[idx] = { ...mine, failed: true, ...(err.status === 429 ? { error: err.message } : {}) };
      this.publish();
      if ((e as Error)?.name !== 'AbortError') this.emit('error', err);
      throw err;
    } finally {
      this.abort = null;
      this.setBusy(false);
    }
  }

  /**
   * Start a new conversation. The old one is archived by the server, not
   * deleted; the visitor simply starts fresh.
   */
  async reset(): Promise<void> {
    this.stop();
    const token = await this.session.token();
    await send(this.apiUrl, '/sdk/v1/chat/messages', { method: 'DELETE', token });
    this.list = [];
    this.loaded = true;
    this.publish();
  }

  /** Send a failed message again. */
  retry(id: string): Promise<ChatMessage> {
    const m = this.list.find((x) => x.id === id && x.failed);
    if (!m) throw new CxError('not_found', 'Nothing to retry.');
    this.list = this.list.filter((x) => x.id !== id);
    this.publish();
    return this.send(m.text);
  }

  /** Stop listening to a reply in progress (the server still finishes it). */
  stop(): void {
    this.abort?.abort();
  }

  private replace(id: string, next: ChatMessage) {
    const i = this.list.findIndex((m) => m.id === id);
    if (i !== -1) this.list[i] = next;
    this.publish();
  }

  private setBusy(b: boolean) {
    this.busy = b;
    this.emit('busy', b);
  }
}
