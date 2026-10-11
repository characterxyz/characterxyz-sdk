/**
 * Everything a brand can set, from three places, later wins:
 *   1. the key's `appearance` (the Embed designer in Character XYZ),
 *   2. the element's attributes / `data-*` on the script tag,
 *   3. options passed to `mount()`.
 */

export type Position = 'bottom-right' | 'bottom-left';
export type ColorMode = 'light' | 'dark' | 'auto';

export interface WidgetConfig {
  position: Position;
  mode: ColorMode;
  /** Any CSS colour. */
  accent: string;
  /** Corner radius of the panel, px. */
  radius: number;
  /** A CSS font-family; defaults to the system UI font. */
  font: string;
  /** The line under her name; defaults to the agent's tagline. */
  subtitle: string | null;
  /** Shown once per visitor above the launcher. Empty = none. */
  greeting: string;
  /** Seconds before the greeting appears. */
  greetingDelay: number;
  /** Suggested first messages in an empty chat. */
  suggestions: string[];
  /** Placeholder in the message box. */
  placeholder: string;
  showChat: boolean;
  showCall: boolean;
  /** The "Powered by Character XYZ" line. */
  branding: boolean;
  /** px from the corner. */
  offsetX: number;
  offsetY: number;
  zIndex: number;
  /** Open the panel on load. */
  open: boolean;
}

export const DEFAULTS: WidgetConfig = {
  position: 'bottom-right',
  mode: 'auto',
  accent: '#7c5cff',
  radius: 24,
  font: '',
  subtitle: null,
  greeting: '',
  greetingDelay: 3,
  suggestions: [],
  placeholder: 'Message',
  showChat: true,
  showCall: true,
  branding: true,
  offsetX: 20,
  offsetY: 20,
  zIndex: 2147483000,
  open: false,
};

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};

const bool = (v: unknown): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
};

const str = (v: unknown, max = 200): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);

/** A colour the page can use safely in CSS: hex, rgb()/hsl()/oklch() or a name. Anything else is ignored. */
export function safeColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab)\([0-9.,%\s/+-]+\)$/i.test(s)) return s;
  if (/^[a-z]{3,20}$/i.test(s)) return s;
  return undefined;
}

/** A font-family list without anything that could escape the declaration. */
export function safeFont(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return /^[\w\s,"'-]{1,120}$/.test(s) ? s : undefined;
}

/** Merge one layer of untrusted settings onto a config. Unknown or invalid values are dropped. */
export function applyLayer(base: WidgetConfig, raw: Record<string, unknown> | null | undefined): WidgetConfig {
  if (!raw || typeof raw !== 'object') return base;
  const c = { ...base };
  if (raw.position === 'bottom-left' || raw.position === 'bottom-right') c.position = raw.position;
  if (raw.mode === 'light' || raw.mode === 'dark' || raw.mode === 'auto') c.mode = raw.mode;
  c.accent = safeColor(raw.accent) ?? c.accent;
  c.radius = num(raw.radius, 0, 40) ?? c.radius;
  c.font = safeFont(raw.font) ?? c.font;
  if (raw.subtitle === null) c.subtitle = null;
  else c.subtitle = str(raw.subtitle, 80) ?? c.subtitle;
  c.greeting = str(raw.greeting, 160) ?? c.greeting;
  c.greetingDelay = num(raw.greetingDelay, 0, 120) ?? c.greetingDelay;
  if (Array.isArray(raw.suggestions)) {
    c.suggestions = raw.suggestions.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.slice(0, 80)).slice(0, 4);
  } else if (typeof raw.suggestions === 'string') {
    c.suggestions = raw.suggestions.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  }
  c.placeholder = str(raw.placeholder, 60) ?? c.placeholder;
  c.showChat = bool(raw.showChat) ?? c.showChat;
  c.showCall = bool(raw.showCall) ?? c.showCall;
  c.branding = bool(raw.branding) ?? c.branding;
  c.offsetX = num(raw.offsetX, 0, 200) ?? c.offsetX;
  c.offsetY = num(raw.offsetY, 0, 200) ?? c.offsetY;
  c.zIndex = num(raw.zIndex, 0, 2147483647) ?? c.zIndex;
  c.open = bool(raw.open) ?? c.open;
  return c;
}

/** `data-show-call="false"` → `{ showCall: 'false' }`: kebab attributes to camel keys. */
export function fromAttributes(attrs: Iterable<{ name: string; value: string }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { name, value } of attrs) {
    const key = name.replace(/^data-/, '').replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    out[key] = value;
  }
  return out;
}
