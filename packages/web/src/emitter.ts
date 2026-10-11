/** A tiny typed event emitter. `on` returns the unsubscribe. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    (this.handlers[event] ??= new Set()).add(fn);
    return () => this.handlers[event]?.delete(fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const fn of this.handlers[event] ?? []) {
      try {
        fn(payload);
      } catch (e) {
        // A listener's bug must never break the SDK's own state machine.
        console.error('[characterxyz] listener threw', e);
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}
