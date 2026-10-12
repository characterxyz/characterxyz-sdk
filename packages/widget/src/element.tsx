import { CharacterXYZ, CxError, type InitOptions } from '@characterxyz/web';
import { render } from 'preact';

import { App, type AppApi, type View } from './app.js';
import { applyLayer, DEFAULTS, fromAttributes, type WidgetConfig } from './config.js';
import { CSS } from './styles.js';

export const TAG = 'character-xyz';

export interface MountOptions extends InitOptions, Partial<WidgetConfig> {
  /** Where the element goes. Default `document.body`. */
  container?: HTMLElement;
}

/** Ink that reads on the accent: white on dark accents, near-black on light ones. */
export function inkFor(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return '#ffffff';
  const hex = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#14121a' : '#ffffff';
}

/** Relative luminance of a CSS rgb()/rgba() colour, or null when transparent / unreadable. */
export function luminanceOf(color: string): number | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(color);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (alpha < 0.5) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => Number(v) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * `auto` means "look like you belong on THIS page": a dark site gets the dark
 * widget whatever the visitor's system says. The page's own background
 * decides; only a transparent one falls back to the system preference.
 */
function pageIsDark(mq: MediaQueryList | null): boolean {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const lum = luminanceOf(getComputedStyle(el).backgroundColor);
    if (lum !== null) return lum < 0.22;
  }
  return !!mq?.matches;
}

const ATTRS = ['publishable-key', 'agent', 'api-url', 'position', 'mode', 'accent', 'greeting', 'open'];

/**
 * `<character-xyz publishable-key="cxyz_pk_live_…"></character-xyz>`
 *
 * Events (bubbling, composed): `cx-ready` {agent}, `cx-open` {view},
 * `cx-close`, `cx-call` {phase}, `cx-error` {code, message}.
 * Methods: `open('chat' | 'call')`, `close()`; property `client` once ready.
 */
export class CharacterXYZElement extends HTMLElement {
  static get observedAttributes() {
    return ATTRS;
  }

  /** Set before the element connects (what `mount()` does). */
  options: MountOptions | null = null;
  client: CharacterXYZ | null = null;
  private api: AppApi | null = null;
  private pendingOpen: View | null = null;
  private booted = false;
  private mq: MediaQueryList | null = null;
  private stage: HTMLDivElement | null = null;

  connectedCallback() {
    if (this.booted) return;
    this.booted = true;
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.stage = document.createElement('div');
    root.replaceChildren(style, this.stage);
    // Out of the page's way until there is something to show.
    this.style.display = 'none';
    // The page's own work first: start once the browser is idle.
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => void this.boot(), { timeout: 2000 });
    else setTimeout(() => void this.boot(), 200);
  }

  disconnectedCallback() {
    if (this.stage) render(null, this.stage);
    this.client?.destroy();
    this.client = null;
    this.mq?.removeEventListener('change', this.onSchemeChange);
    this.booted = false;
  }

  open(view: 'chat' | 'call' = 'chat') {
    if (this.api) this.api.open(view);
    else this.pendingOpen = view;
  }

  close() {
    this.api?.close();
  }

  private fire(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private onSchemeChange = () => requestAnimationFrame(this.onScheme);

  private onScheme = () => {
    if (this.dataset.mode === 'auto') this.dataset.theme = pageIsDark(this.mq) ? 'dark' : 'light';
  };

  private async boot() {
    const opts: MountOptions = { ...(this.options ?? {}) };
    const attrs = fromAttributes(Array.from(this.attributes));
    const publishableKey = opts.publishableKey ?? (attrs.publishableKey as string | undefined);
    try {
      this.client = await CharacterXYZ.init({
        publishableKey,
        getSessionToken: opts.getSessionToken,
        agentId: opts.agentId ?? (attrs.agent as string | undefined),
        apiUrl: opts.apiUrl ?? (attrs.apiUrl as string | undefined),
        storage: opts.storage,
      });
    } catch (e) {
      const err = e instanceof CxError ? e : new CxError('unknown', String((e as Error)?.message ?? e));
      // The widget stays hidden: a broken embed must never put an error box
      // on the brand's page. The console and the event say why.
      console.warn(`[characterxyz] widget not shown: ${err.message}`);
      this.fire('cx-error', { code: err.code, message: err.message });
      return;
    }
    if (!this.isConnected) {
      this.client.destroy();
      return;
    }
    const client = this.client;
    // Designer appearance, then attributes, then mount() options.
    let config = applyLayer(DEFAULTS, client.appearance as Record<string, unknown>);
    config = applyLayer(config, attrs);
    config = applyLayer(config, opts as unknown as Record<string, unknown>);
    if (!(config.showChat && client.features.chat) && !(config.showCall && client.features.call)) {
      console.warn('[characterxyz] widget not shown: neither chat nor calls are enabled for this site');
      return;
    }
    this.applyTokens(config);
    client.on('call', (c) => {
      if (!c) return;
      c.on('state', (s) => this.fire('cx-call', { phase: s.phase, position: s.position, endReason: s.endReason }));
    });
    client.on('error', (e) => this.fire('cx-error', { code: e.code, message: e.message }));
    this.style.display = '';
    render(
      <App
        client={client}
        config={config}
        bind={(api) => {
          this.api = api;
          if (this.pendingOpen && this.pendingOpen !== 'closed') {
            api.open(this.pendingOpen);
            this.pendingOpen = null;
          }
        }}
        onView={(v) => {
          if (v === 'closed') {
            this.removeAttribute('data-open');
            this.fire('cx-close');
          } else {
            this.setAttribute('data-open', '');
            this.fire('cx-open', { view: v });
          }
        }}
      />,
      this.stage!,
    );
    if (config.open) this.setAttribute('data-open', '');
    this.fire('cx-ready', { agent: { id: client.agent.id, name: client.agent.name }, features: client.features });
  }

  private applyTokens(c: WidgetConfig) {
    this.dataset.side = c.position === 'bottom-left' ? 'left' : 'right';
    this.dataset.mode = c.mode;
    if (c.mode === 'auto') {
      this.mq = matchMedia('(prefers-color-scheme: dark)');
      // A site's own dark mode usually follows the system, so re-read the page then.
      this.mq.addEventListener('change', this.onSchemeChange);
      this.dataset.theme = pageIsDark(this.mq) ? 'dark' : 'light';
    } else {
      this.dataset.theme = c.mode;
    }
    const set = (k: string, v: string) => this.style.setProperty(k, v);
    set('--cx-accent', c.accent);
    set('--cx-accent-ink', inkFor(c.accent));
    set('--cx-radius', `${c.radius}px`);
    if (c.font) set('--cx-font', c.font);
    set('--cx-ox', `${c.offsetX}px`);
    set('--cx-oy', `${c.offsetY}px`);
    set('--cx-z', String(c.zIndex));
  }
}

export function define() {
  if (typeof customElements !== 'undefined' && !customElements.get(TAG)) customElements.define(TAG, CharacterXYZElement);
}

export interface WidgetHandle {
  element: CharacterXYZElement;
  open(view?: 'chat' | 'call'): void;
  close(): void;
  destroy(): void;
}

/** Put the widget on the page. One per page is the norm; a second replaces nothing. */
export function mount(options: MountOptions): WidgetHandle {
  define();
  const el = document.createElement(TAG) as CharacterXYZElement;
  el.options = options;
  (options.container ?? document.body).appendChild(el);
  return {
    element: el,
    open: (v) => el.open(v),
    close: () => el.close(),
    destroy: () => el.remove(),
  };
}
