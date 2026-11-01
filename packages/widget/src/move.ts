/**
 * `movable`: the visitor can pick her up and put her anywhere along the
 * bottom of the page, so nothing on the site sits behind her for good.
 *
 * She lives on the floor, and she has weight. Held, she follows the hand a
 * beat behind and sways like something carried by the head. Let go higher up
 * and she falls back down: she keeps some of the throw's sideways speed (a
 * flick slides her a little way, not across the screen), stops softly at the
 * sides, and lands with a small squash and one low bounce. Reduced motion:
 * she glides straight down.
 *
 * The chat opens from where she stands: on the right half of the screen it
 * grows leftwards from her right edge, on the left half rightwards from her
 * left edge, always kept on screen. Her label and greeting face the middle
 * the same way. (A phone keeps its full-width sheet.)
 *
 * Mouse: a press that moves a few pixels drags. Touch: hold ~0.35 s first (a
 * quick swipe stays a tap or a scroll), with a short buzz when she lifts. The
 * spot is kept for the visit.
 *
 * The physics is a pure `step` (tested); `attachMover` is the DOM around it.
 */

export interface Body {
  x: number;
  /** 0 is the floor; up is negative. */
  y: number;
  vx: number;
  vy: number;
  held: boolean;
  /** Where the hand wants her while held. */
  tx: number;
  ty: number;
  rot: number;
  rv: number;
  /** Squash and stretch (1 = none) and their velocities. */
  sx: number;
  sxv: number;
  sy: number;
  syv: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
}

export const body = (x = 0): Body => ({ x, y: 0, vx: 0, vy: 0, held: false, tx: x, ty: 0, rot: 0, rv: 0, sx: 1, sxv: 0, sy: 1, syv: 0 });

/** Paced by eye: a 500 px fall takes ~0.7 s, a throw keeps 60% of her speed. */
const G = 1900;
const AIR = 1;
const FRICTION = 8;
const WALL = 0.12;
const FLOOR = 0.28;
/** Below this landing speed she stops instead of bouncing again. */
const REST_VY = 180;
/** How quickly she catches up with the hand (1/s): a beat behind, never laggy. */
const FOLLOW = 14;
const THROW = 0.6;
const MAX_THROW = 1500;
const LIFT = 1.04;
const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function spring(p: number, v: number, target: number, k: number, c: number, dt: number): [number, number] {
  v += (k * (target - p) - c * v) * dt;
  return [p + v * dt, v];
}

/** She is let go: what is left of the hand's speed becomes the throw. */
export function release(b: Body) {
  b.held = false;
  b.vx = clampTo(b.vx * THROW, -MAX_THROW, MAX_THROW);
  b.vy = clampTo(b.vy * THROW, -MAX_THROW, MAX_THROW);
}

/** Advance one tick (seconds). Returns true while anything is still moving. */
export function step(b: Body, dt: number, bounds: Bounds, reduced = false): boolean {
  for (let left = Math.min(dt, 1 / 20); left > 1e-6; left -= 1 / 120) {
    const h = Math.min(left, 1 / 120);
    if (b.held) {
      const k = 1 - Math.exp(-FOLLOW * h);
      const nx = b.x + (b.tx - b.x) * k;
      const ny = b.y + (b.ty - b.y) * k;
      b.vx = (nx - b.x) / h;
      b.vy = (ny - b.y) / h;
      b.x = nx;
      b.y = ny;
    } else if (reduced) {
      b.vx = b.vy = 0;
      b.y += (0 - b.y) * (1 - Math.exp(-12 * h));
      if (b.y > -0.5) b.y = 0;
    } else {
      b.vy += G * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.vx *= Math.exp(-(b.y < 0 ? AIR : FRICTION) * h);
      if (b.x < bounds.minX || b.x > bounds.maxX) {
        b.x = clampTo(b.x, bounds.minX, bounds.maxX);
        b.vx = -b.vx * WALL;
      }
      if (b.y < bounds.minY && b.vy < 0) {
        b.y = bounds.minY;
        b.vy = -b.vy * 0.2;
      }
      if (b.y >= 0 && b.vy >= 0) {
        const hit = Math.min(1, b.vy / 1400);
        b.vy = b.vy > REST_VY ? -b.vy * FLOOR : 0;
        if (hit > 0.05) {
          b.syv -= 1.8 * hit;
          b.sxv += 1.3 * hit;
        }
        b.y = 0;
      }
      if (b.y === 0 && b.vy === 0 && Math.abs(b.vx) < 6) b.vx = 0;
    }
    const lift = b.held ? LIFT : 1;
    // A slow pendulum: held, she leans into the motion; let go, she swings upright.
    [b.rot, b.rv] = spring(b.rot, b.rv, reduced || !b.held ? 0 : clampTo(b.vx * 0.01, -9, 9), 90, 8, h);
    [b.sx, b.sxv] = spring(b.sx, b.sxv, lift, 260, 13, h);
    [b.sy, b.syv] = spring(b.sy, b.syv, lift, 260, 13, h);
  }
  const still = !b.held && b.y === 0 && b.vy === 0 && b.vx === 0;
  const calm = Math.abs(b.rot) + Math.abs(b.rv) + Math.abs(b.sx - 1) + Math.abs(b.sy - 1) + Math.abs(b.sxv) + Math.abs(b.syv) < 0.01;
  return !(still && calm);
}

/**
 * Where the open panel goes, as the host's x offset: grown from her outer edge
 * towards the middle of the screen, and kept `margin` inside it.
 */
export function panelOffset(her: { left: number; right: number }, anchorX: number, panel: number, vw: number, margin: number): { x: number; grow: 'left' | 'right' } {
  const grow = (her.left + her.right) / 2 > vw / 2 ? 'left' : 'right';
  const lo = margin;
  const hi = Math.max(margin, vw - margin - panel);
  const left = clampTo(grow === 'left' ? her.right - panel : her.left, lo, hi);
  return { x: (grow === 'left' ? left + panel : left) - anchorX, grow };
}

const HOLD_MS = 350;
const MOVE_PX = 6;
const MARGIN = 8;
const PANEL_MARGIN = 16;
/** Below this the panel is a full-width sheet that ignores where she is. */
const SHEET_PX = 520;
const SPOT_KEY = 'cx:spot';

/** Make the widget's host movable. Returns the detach. */
export function attachMover(host: HTMLElement): () => void {
  const b = body();
  let bounds: Bounds = { minX: 0, maxX: 0, minY: 0 };
  // Her box with nothing applied (closed), and where the open host's corner is.
  let base = { left: 0, right: 0 };
  let frame = 0;
  let last = 0;
  const open = () => host.hasAttribute('data-open');
  const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vw = () => document.documentElement.clientWidth || innerWidth;
  const css = host.style;

  const measure = () => {
    const { translate, rotate } = css;
    css.translate = css.rotate = '';
    const r = host.getBoundingClientRect();
    css.translate = translate;
    css.rotate = rotate;
    if (!r.width) return false;
    base = { left: r.left, right: r.right };
    bounds = { minX: MARGIN - r.left, maxX: Math.max(MARGIN - r.left, vw() - MARGIN - r.right), minY: MARGIN - r.top };
    b.x = b.tx = clampTo(b.x, bounds.minX, bounds.maxX);
    b.y = clampTo(b.y, bounds.minY, 0);
    return true;
  };
  /** Which way her label, greeting and panel grow: towards the middle of the screen. */
  const face = () => {
    host.dataset.grow = (base.left + base.right) / 2 + b.x > vw() / 2 ? 'left' : 'right';
  };
  const paint = () => {
    if (open()) {
      css.rotate = '';
      css.removeProperty('--cx-sq');
      if (vw() <= SHEET_PX) {
        css.translate = '';
        return;
      }
      // Open, the host is a 0×0 corner the panel hangs from: its right edge
      // when she is anchored right, its left edge otherwise.
      const anchorX = host.dataset.side === 'left' ? base.left : base.right;
      const panel = (host.shadowRoot?.querySelector('.panel') as HTMLElement | null)?.offsetWidth || 392;
      const p = panelOffset({ left: base.left + b.x, right: base.right + b.x }, anchorX, panel, vw(), PANEL_MARGIN);
      host.dataset.grow = p.grow;
      css.translate = `${p.x.toFixed(1)}px 0px`;
      return;
    }
    css.translate = `${b.x.toFixed(1)}px ${b.y.toFixed(1)}px`;
    css.rotate = `${b.rot.toFixed(2)}deg`;
    css.setProperty('--cx-sq', `${b.sx.toFixed(3)} ${b.sy.toFixed(3)}`);
  };
  const persist = () => {
    try {
      sessionStorage.setItem(SPOT_KEY, String(Math.round(b.x)));
    } catch {}
  };
  const tick = (now: number) => {
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const moving = step(b, dt, bounds, reduced());
    paint();
    if (moving) frame = requestAnimationFrame(tick);
    else {
      frame = 0;
      face();
      persist();
    }
  };
  const run = () => {
    if (frame || open()) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };

  try {
    b.x = b.tx = Number(sessionStorage.getItem(SPOT_KEY)) || 0;
  } catch {}
  css.transformOrigin = '50% 0';
  const settle = () => {
    css.touchAction = open() ? '' : 'none';
    if (!open() && measure()) face();
    paint();
  };
  requestAnimationFrame(settle);

  let start: { px: number; py: number; x: number; y: number; id: number; touch: boolean } | null = null;
  let swallow = false;
  let hold: ReturnType<typeof setTimeout> | undefined;

  const lift = () => {
    if (!start || !measure()) return;
    b.held = true;
    b.tx = b.x;
    b.ty = b.y;
    css.cursor = 'grabbing';
    if (start.touch) navigator.vibrate?.(12);
    run();
  };
  const onDown = (e: PointerEvent) => {
    if (open() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start = { px: e.clientX, py: e.clientY, x: b.x, y: b.y, id: e.pointerId, touch: e.pointerType !== 'mouse' };
    swallow = false;
    if (start.touch) hold = setTimeout(lift, HOLD_MS);
  };
  const onMove = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const mx = e.clientX - start.px;
    const my = e.clientY - start.py;
    if (!b.held) {
      if (Math.hypot(mx, my) < MOVE_PX) return;
      // A touch that moves before the hold completes is a scroll, not a drag.
      if (start.touch) return drop();
      lift();
      if (!b.held) return;
    }
    e.preventDefault();
    b.tx = clampTo(start.x + mx, bounds.minX, bounds.maxX);
    b.ty = clampTo(start.y + my, bounds.minY, 0);
  };
  const drop = () => {
    clearTimeout(hold);
    if (b.held) {
      swallow = true;
      css.cursor = '';
      release(b);
      run();
    }
    start = null;
  };
  const onClick = (e: MouseEvent) => {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  };
  // A long press would otherwise open the system menu.
  const onMenu = (e: Event) => {
    if (b.held || start?.touch) e.preventDefault();
  };
  // Opening or closing the chat. A mutation callback runs before the next
  // paint, so the panel's first frame is already beside her, never a jump.
  const seen = new MutationObserver(() => {
    if (open()) {
      cancelAnimationFrame(frame);
      frame = 0;
      if (b.held) release(b);
      // Still settling when the chat opened: she is where she was heading.
      b.y = 0;
      b.vx = b.vy = 0;
      persist();
    }
    settle();
  });
  seen.observe(host, { attributes: true, attributeFilter: ['data-open'] });

  host.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: false });
  addEventListener('pointerup', drop);
  addEventListener('pointercancel', drop);
  host.addEventListener('click', onClick, true);
  host.addEventListener('contextmenu', onMenu);
  addEventListener('resize', settle);
  addEventListener('pagehide', persist);
  return () => {
    clearTimeout(hold);
    cancelAnimationFrame(frame);
    seen.disconnect();
    host.removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', drop);
    removeEventListener('pointercancel', drop);
    host.removeEventListener('click', onClick, true);
    host.removeEventListener('contextmenu', onMenu);
    removeEventListener('resize', settle);
    removeEventListener('pagehide', persist);
  };
}
