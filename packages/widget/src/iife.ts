/**
 * `cx.js` — the script-tag build. Everything in one file; reads its settings
 * from its own `data-*` attributes and mounts itself:
 *
 * ```html
 * <script src="https://unpkg.com/@characterxyz/widget@0/dist/cx.js"
 *         data-key="cxyz_pk_live_…" data-accent="#e11d48" async></script>
 * ```
 *
 * `window.CharacterXYZ` is then `{ mount, open, close, widget }` for pages
 * that want to drive it (`CharacterXYZ.open('call')`).
 */
import { applyLayer, DEFAULTS, fromAttributes } from './config.js';
import { mount, type MountOptions, type WidgetHandle } from './element.js';
import type { ClientActionHandler, TrackResult, VisitorIdentity } from '@characterxyz/web';

export { mount };

const script = document.currentScript as HTMLScriptElement | null;
let widget: WidgetHandle | null = null;

function start() {
  if (!script) return;
  const attrs = fromAttributes(Array.from(script.attributes).filter((a) => a.name.startsWith('data-')));
  // An empty attribute is "not set" (a template that left it blank), never "".
  const given = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const key = given(attrs.key) ?? given(attrs.publishableKey);
  if (!key) return; // no key on the tag: the page will call CharacterXYZ.mount() itself
  // Only the presentational settings pass through the config filter; the
  // connection settings are read directly.
  const config = applyLayer(DEFAULTS, attrs);
  const changed = Object.fromEntries(Object.entries(config).filter(([k, v]) => k in attrs && v !== (DEFAULTS as unknown as Record<string, unknown>)[k]));
  const opts: MountOptions = {
    ...changed,
    publishableKey: key,
    agentId: given(attrs.agent),
    apiUrl: given(attrs.apiUrl),
  };
  widget = mount(opts);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

const api = {
  mount: (o: MountOptions) => (widget = mount(o)),
  open: (v?: 'chat' | 'call') => widget?.open(v),
  close: () => widget?.close(),
  track: (name: string, data?: Record<string, unknown>, opts?: { id?: string }): Promise<TrackResult> | undefined => widget?.track(name, data, opts),
  identify: (visitor: VisitorIdentity): Promise<void> | undefined => widget?.identify(visitor),
  setContext: (context: Record<string, unknown>): Promise<void> | undefined => widget?.setContext(context),
  registerAction: (name: string, handler: ClientActionHandler): (() => void) | undefined => widget?.registerAction(name, handler),
  get widget() {
    return widget;
  },
};
(window as unknown as { CharacterXYZ: typeof api }).CharacterXYZ = api;
