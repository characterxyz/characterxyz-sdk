import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyLayer, DEFAULTS, fromAttributes, safeColor, safeFont } from './config.js';
import { blocks, clock, inline, ordinal } from './format.js';
import { ENGLISH, ending, place as linePlace, setStrings, t, wait } from './strings.js';
import { CLOSE_UP, CROWN, faceOf, HALF_BODY, HEADROOM, MEDIUM, place } from './framing.js';
import { body, panelOffset, release, step, type Body } from './move.js';

describe('config layers', () => {
  it('takes valid values and drops the rest', () => {
    const c = applyLayer(DEFAULTS, { position: 'bottom-left', accent: '#E11D48', radius: '99', showCall: 'false', suggestions: 'Pricing | Book a demo|  ', zIndex: 'x' });
    expect(c.position).toBe('bottom-left');
    expect(c.accent).toBe('#E11D48');
    expect(c.radius).toBe(40);
    expect(c.showCall).toBe(false);
    expect(c.suggestions).toEqual(['Pricing', 'Book a demo']);
    expect(c.zIndex).toBe(DEFAULTS.zIndex);
  });

  it('refuses CSS that could break out of its declaration', () => {
    expect(safeColor('red; } body { display:none')).toBeUndefined();
    expect(safeColor('url(https://evil)')).toBeUndefined();
    expect(safeColor('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)');
    expect(safeColor('oklch(0.7 0.15 250)')).toBe('oklch(0.7 0.15 250)');
    expect(safeFont('Inter; } :host { display:none')).toBeUndefined();
    expect(safeFont('"Inter", system-ui, sans-serif')).toBe('"Inter", system-ui, sans-serif');
  });

  it('later layers win; an unknown position is ignored', () => {
    const a = applyLayer(DEFAULTS, { accent: '#111111', position: 'top-center' });
    const b = applyLayer(a, { accent: '#222222' });
    expect(b.accent).toBe('#222222');
    expect(b.position).toBe('bottom-right');
  });

  it('reads kebab-case data attributes', () => {
    expect(fromAttributes([{ name: 'data-show-call', value: 'false' }, { name: 'data-key', value: 'k' }])).toEqual({ showCall: 'false', key: 'k' });
  });
});

describe('copy and formatting', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  });

  it('ETA and clock read naturally', () => {
    expect(wait(30)).toBe('less than a minute');
    expect(wait(180)).toBe('about 3 min');
    expect(wait(5400)).toBe('about 2 hr');
    expect(wait(null)).toBe('');
    expect(clock(7)).toBe('0:07');
    expect(clock(192)).toBe('3:12');
    expect(clock(3723)).toBe('1:02:03');
  });

  it('every end reason has words for the visitor', () => {
    for (const r of ['hangup', 'left', 'missed', 'timeout', 'limit', 'busy', 'mic-denied', 'credits', 'unavailable', 'failed', null]) {
      const c = ending(r, 'Ananya');
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.body.length).toBeGreaterThan(10);
    }
  });

  it('labels fill their placeholders, and a language from the server replaces English', () => {
    expect(t('chatWith', { name: 'Ananya' })).toBe('Chat with Ananya');
    expect(linePlace(2)).toBe('2nd');
    setStrings({ send: 'भेजें', chatWith: '{name} से बात करें' });
    expect(t('send')).toBe('भेजें');
    expect(t('chatWith', { name: 'Ananya' })).toBe('Ananya से बात करें');
    // A key the server did not send stays English; places become plain numbers.
    expect(t('close')).toBe('Close');
    expect(linePlace(2)).toBe('2');
    setStrings(null);
    expect(t('send')).toBe('Send');
    expect(linePlace(2)).toBe('2nd');
  });

  it('every label is non-empty and every placeholder is a known one', () => {
    for (const [key, text] of Object.entries(ENGLISH)) {
      expect(text.length, key).toBeGreaterThan(0);
      for (const ph of text.match(/\{[a-z]+\}/g) ?? []) expect(['{name}', '{position}', '{eta}', '{seconds}', '{time}', '{text}', '{n}', '{brand}']).toContain(ph);
    }
  });

  it('markdown becomes tokens, never markup', () => {
    const t = inline('<img src=x onerror=alert(1)> **bold** and [site](https://example.com) `code`');
    expect(t[0]).toEqual({ t: 'text', v: '<img src=x onerror=alert(1)> ' });
    expect(t).toContainEqual({ t: 'b', v: 'bold' });
    expect(t).toContainEqual({ t: 'link', v: 'site', href: 'https://example.com' });
    expect(t).toContainEqual({ t: 'code', v: 'code' });
    // A javascript: link is plain text, not a link.
    expect(inline('[x](javascript:alert(1))').every((p) => p.t === 'text')).toBe(true);
  });

  it('lists and paragraphs', () => {
    const b = blocks('Here are options:\n\n- One\n- Two');
    expect(b[0]?.t).toBe('p');
    expect(b[1]).toMatchObject({ t: 'ul' });
    expect(b[1]?.t === 'ul' && b[1].items.length).toBe(2);
  });
});

describe('framing', () => {
  // Ananya's real anchor: 1792×2400, eyes ~(890, 236), chin (893, 374).
  const video = {
    anchor: { url: 'a.png', alphaUrl: 'a.png' },
    clips: {},
    face: { eyes: { left: { x: 848.83, y: 236.56 }, right: { x: 932.61, y: 235.69 } }, chin: { x: 892.76, y: 373.79 } },
  };

  it('finds the face in normalised coordinates', () => {
    const f = faceOf(video, 1792, 2400);
    expect(f.cx).toBeCloseTo(0.4966, 3);
    expect(f.span).toBeCloseTo((373.79 - 236.125) / 2400, 4);
  });

  it('a close-up puts the face at the centre of the circle, at the asked size', () => {
    const f = faceOf(video, 1792, 2400);
    const p = place(f, 1792 / 2400, 68, 68, CLOSE_UP);
    expect(p.left + f.cx * p.width).toBeCloseTo(34, 5);
    expect(p.top + f.cy * p.height).toBeCloseTo(34, 5);
    expect(f.span * p.height).toBeCloseTo(68 * CLOSE_UP.faceFraction, 5);
  });

  it('the medium shot leaves headroom', () => {
    const f = faceOf(video, 1792, 2400);
    const p = place(f, 0.75, 392, 600, MEDIUM);
    expect(p.top + f.cy * p.height).toBeCloseTo(600 * MEDIUM.at.y, 5);
    expect(p.height).toBeGreaterThan(600);
  });

  it('the half body keeps the top of her head in the box (it used to cut it)', () => {
    const f = faceOf(video, 1792, 2400);
    for (const [w, h] of [[128, 170], [104, 138]] as const) {
      const p = place(f, 1792 / 2400, w, h, HALF_BODY);
      const crown = p.top + (f.cy - f.span * CROWN) * p.height;
      expect(crown).toBeGreaterThanOrEqual(h * HEADROOM - 1e-9);
      expect(f.span * p.height).toBeCloseTo(h * HALF_BODY.faceFraction, 5);
    }
  });

  it('falls back sensibly without face data', () => {
    const f = faceOf(null, 0, 0);
    expect(f.cx).toBe(0.5);
    expect(f.span).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- the element

const fakeClient = vi.hoisted(() => ({
  agent: { id: 'agent_1', name: 'Ananya', tagline: 'Host and moderator', locale: 'en-IN', cameo: null, video: null },
  features: { chat: true, call: true, maxCallMinutes: 10 },
  appearance: { greeting: '', accent: '#e11d48' },
  mode: 'live',
  call: null,
  chat: { messages: [], isBusy: false, on: () => () => {}, load: async () => [], send: async () => ({}), stop() {}, clear() {} },
  on: () => () => {},
  opening: async () => ({
    greeting: 'Hi! I help with Traction. What are you working on?',
    welcomeBack: 'Good to see you again!',
    teaser: 'Need a hand with your pipeline?',
    suggestions: ['How does event mode work?', 'What is the follow-up cadence?'],
    details: { fields: ['name', 'email', 'phone'], privacyUrl: null, consent: 'By sending, you agree to be contacted about your enquiry.' },
  }),
  destroy: vi.fn(),
}));

vi.mock('@characterxyz/web', () => {
  class CxError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    CxError,
    CharacterXYZ: { init: vi.fn(async () => fakeClient) },
  };
});

describe('<character-xyz>', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the launcher in its shadow root with the brand accent, and fires cx-ready', async () => {
    const { mount } = await import('./element.js');
    const ready = vi.fn();
    document.addEventListener('cx-ready', ready);
    const w = mount({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA' });
    await vi.waitFor(() => expect(ready).toHaveBeenCalled(), { timeout: 3000 });
    const root = w.element.shadowRoot!;
    // The default launcher is just her: a tap opens the chat, calls are inside.
    expect(root.querySelector('.presence')?.getAttribute('aria-label')).toBe('Chat with Ananya');
    expect(root.querySelector('.acts')).toBeNull();
    expect(w.element.style.getPropertyValue('--cx-accent')).toBe('#e11d48');
    expect(w.element.dataset.side).toBe('right');
  });

  it('the opt-in launcher puts chat and call buttons beside her', async () => {
    const { mount } = await import('./element.js');
    const w = mount({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA', launcher: 'actions' });
    await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.act--call')).not.toBeNull(), { timeout: 3000 });
  });

  it('a tap on her opens the chat, and the empty chat offers the call', async () => {
    const { mount } = await import('./element.js');
    const w = mount({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA' });
    await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.presence')).not.toBeNull(), { timeout: 3000 });
    (w.element.shadowRoot!.querySelector('.presence') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.panel')).not.toBeNull());
    // Her own first message, after a typing beat, then her questions and the call.
    await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.chip--call')?.textContent).toContain('Call Ananya'), { timeout: 3000 });
    const root = w.element.shadowRoot!;
    expect(root.querySelector('.msg--agent')?.textContent).toContain('What are you working on?');
    expect([...root.querySelectorAll('.chip')].map((c) => c.textContent)).toContain('How does event mode work?');
  });

  it("shows her teaser beside the launcher once, from the agent's own opening", async () => {
    localStorage.clear();
    const { mount } = await import('./element.js');
    const w = mount({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA', greetingDelay: 0 });
    await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.greeting')?.textContent).toContain('Need a hand with your pipeline?'), { timeout: 3000 });
  });

  it('opens the chat panel with an empty-state greeting', async () => {
    const { mount } = await import('./element.js');
    const w = mount({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA', suggestions: ['What do you do?'] });
    await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.presence')).not.toBeNull(), { timeout: 3000 });
    w.open('chat');
    await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.panel')).not.toBeNull());
    const root = w.element.shadowRoot!;
    expect(root.querySelector('.empty__title')?.textContent).toBe('Ananya');
    // A brand's own suggestions win over hers.
    await vi.waitFor(() => expect(root.querySelector('.chip')?.textContent).toContain('What do you do?'), { timeout: 3000 });
    expect([...root.querySelectorAll('.chip')].map((c) => c.textContent)).not.toContain('How does event mode work?');
    expect(w.element.hasAttribute('data-open')).toBe(true);
  });

  it('stays invisible when the session is refused', async () => {
    const web = await import('@characterxyz/web');
    vi.mocked(web.CharacterXYZ.init).mockRejectedValueOnce(new web.CxError('forbidden', 'This site is not allowed to use this key'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mount } = await import('./element.js');
    const err = vi.fn();
    document.addEventListener('cx-error', err);
    const w = mount({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA' });
    await vi.waitFor(() => expect(err).toHaveBeenCalled(), { timeout: 3000 });
    expect(w.element.style.display).toBe('none');
    expect(w.element.shadowRoot!.querySelector('.presence')).toBeNull();
    warn.mockRestore();
  });
});

describe('page colour', () => {
  it('reads a page background as light, dark, or unknown', async () => {
    const { luminanceOf } = await import('./element.js');
    expect(luminanceOf('rgb(255, 255, 255)')).toBeCloseTo(1, 3);
    expect(luminanceOf('rgb(17, 16, 22)')!).toBeLessThan(0.22);
    expect(luminanceOf('rgba(0, 0, 0, 0)')).toBeNull();
    expect(luminanceOf('transparent')).toBeNull();
    expect(luminanceOf('rgb(247 245 242)')!).toBeGreaterThan(0.8);
  });
});

describe('accent ink', () => {
  it('white on dark accents, dark on light ones', async () => {
    const { inkFor } = await import('./element.js');
    expect(inkFor('#7c5cff')).toBe('#ffffff');
    expect(inkFor('#ffd60a')).toBe('#14121a');
    expect(inkFor('rebeccapurple')).toBe('#ffffff');
  });
});

describe('details typed into the chat', () => {
  it('finds an email, a phone and an explicit name, and nothing else', async () => {
    const { extractContact } = await import('./contact.js');
    expect(extractContact("sure, I'm ginger, ginger@alpha.com, 72005 80713")).toEqual({ name: 'Ginger', email: 'ginger@alpha.com', phone: '72005 80713' });
    expect(extractContact('My name is Priya Raman and my number is +91 98400 12345')).toEqual({ name: 'Priya Raman', phone: '+91 98400 12345' });
    expect(extractContact("I'm interested, reach me at zeno@character.xyz.")).toEqual({ email: 'zeno@character.xyz' });
    expect(extractContact('We have 8 people and a budget of 2026')).toBeNull();
    expect(extractContact('How much does it cost?')).toBeNull();
  });

  it('opens the card filled in with what was typed, and the chips step aside', async () => {
    const { mount } = await import('./element.js');
    const w = mount({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA' });
    await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.presence')).not.toBeNull(), { timeout: 3000 });
    w.open('chat');
    const root = w.element.shadowRoot!;
    await vi.waitFor(() => expect(root.querySelector('.chips--start')).not.toBeNull(), { timeout: 3000 });
    const ta = root.querySelector('textarea')!;
    ta.value = "I'm Ginger, ginger@alpha.com";
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect((root.querySelector('.send') as HTMLButtonElement).disabled).toBe(false));
    (root.querySelector('.send') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root.querySelector('.card__title')?.textContent).toBe('Confirm your details'), { timeout: 3000 });
    const values = [...root.querySelectorAll<HTMLInputElement>('.card input')].map((i) => i.value);
    expect(values).toEqual(['Ginger', 'ginger@alpha.com', '']);
    expect(root.querySelector('.chips--start')).toBeNull();
  });

  it('keeps an unfilled card after later messages (closing and reopening used to lose it)', async () => {
    const form = { fields: ['name', 'email'], privacyUrl: null, consent: 'Sending is consent.' };
    const at = new Date().toISOString();
    const before = fakeClient.chat.messages;
    fakeClient.chat.messages = [
      { id: 'v1', role: 'visitor', text: 'I would like an invite', createdAt: at },
      { id: 'a1', role: 'agent', text: 'Leave your details below.', createdAt: at, askDetails: form },
      { id: 'a2', role: 'agent', text: 'Good to see you again!', createdAt: at },
    ] as never;
    try {
      const { mount } = await import('./element.js');
      const w = mount({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA' });
      await vi.waitFor(() => expect(w.element.shadowRoot!.querySelector('.presence')).not.toBeNull(), { timeout: 3000 });
      w.open('chat');
      const root = w.element.shadowRoot!;
      await vi.waitFor(() => expect(root.querySelector('.card__title')?.textContent).toBe('Leave your details'), { timeout: 3000 });
    } finally {
      fakeClient.chat.messages = before;
    }
  });
});

describe('movable: she falls back to the floor', () => {
  const bounds = { minX: -900, maxX: 0, minY: -700 };
  const settle = (b: Body, reduced = false) => {
    let frames = 0;
    while (step(b, 1 / 60, bounds, reduced) && frames < 1200) frames++;
    return frames;
  };

  it('is off unless asked for, and reads the attribute', () => {
    expect(DEFAULTS.movable).toBe(false);
    expect(applyLayer(DEFAULTS, { movable: 'true' }).movable).toBe(true);
  });

  it('dropped high up, she lands where she was let go, bounces once and comes to rest', () => {
    const b = { ...body(-300), y: -600 };
    let lowest = -Infinity;
    let bounced = false;
    let frames = 0;
    while (step(b, 1 / 60, bounds) && frames < 1200) {
      if (b.y === 0) lowest = 0;
      if (lowest === 0 && b.y < -1) bounced = true;
      frames++;
    }
    expect(b).toMatchObject({ x: -300, y: 0, vx: 0, vy: 0 });
    expect(bounced).toBe(true);
    expect(frames).toBeLessThan(260);
  });

  it('a sideways throw carries her along, the side wall stops her, and she never leaves the screen', () => {
    const b = { ...body(-300), y: -400, vx: 2400 };
    settle(b);
    expect(b.x).toBeLessThanOrEqual(bounds.maxX);
    // The wall takes most of the throw: she ends up nearer it than where she was let go.
    expect(b.x).toBeGreaterThan(-250);
    expect(b.y).toBe(0);
  });

  it('thrown upwards she stops at the top of the screen and still comes down', () => {
    const b = { ...body(-100), y: -600, vy: -2600 };
    let highest = 0;
    while (step(b, 1 / 60, bounds)) highest = Math.min(highest, b.y);
    expect(highest).toBeGreaterThanOrEqual(bounds.minY);
    expect(b.y).toBe(0);
  });

  it('the landing squashes her a little and she springs back', () => {
    const b = { ...body(), y: -600 };
    let squash = 1;
    while (step(b, 1 / 60, bounds)) squash = Math.min(squash, b.sy);
    expect(squash).toBeLessThan(0.97);
    expect(squash).toBeGreaterThan(0.8);
    expect(b.sy).toBeCloseTo(1, 2);
  });

  it('with reduced motion she glides straight down: no bounce, no squash, no slide', () => {
    const b = { ...body(-200), y: -500, vx: 2000 };
    let squash = 1;
    let bounced = false;
    while (step(b, 1 / 60, bounds, true)) {
      squash = Math.min(squash, b.sy);
      if (b.vy < 0) bounced = true;
    }
    expect(b).toMatchObject({ x: -200, y: 0 });
    expect(bounced).toBe(false);
    expect(squash).toBe(1);
  });

  it('held, she follows the hand a beat behind, leans into the motion and lifts; let go, she swings upright', () => {
    const b = { ...body(), held: true, tx: -400 };
    step(b, 1 / 60, bounds);
    expect(b.x).toBeLessThan(0);
    expect(b.x).toBeGreaterThan(-400); // a beat behind, not snapped to the hand
    for (let i = 0; i < 12; i++) step(b, 1 / 60, bounds);
    expect(b.rot).toBeLessThan(-2);
    expect(b.sx).toBeGreaterThan(1.02);
    for (let i = 0; i < 60; i++) step(b, 1 / 60, bounds);
    expect(b.x).toBeCloseTo(-400, 0);
    release(b);
    settle(b);
    expect(Math.abs(b.rot)).toBeLessThan(0.05);
  });

  it("a throw keeps only part of the hand's speed, so a flick never sends her across the screen", () => {
    const b = { ...body(-300), y: -300, held: true, vx: -6000, vy: -4000 };
    release(b);
    expect(b.held).toBe(false);
    expect(Math.abs(b.vx)).toBeLessThanOrEqual(1500);
    expect(Math.abs(b.vy)).toBeLessThanOrEqual(1500);
    settle(b);
    expect(b.y).toBe(0);
  });

  it('a 500 px fall takes about 0.7 s: weighty, not floaty, not instant', () => {
    const b = { ...body(), y: -500 };
    let frames = 0;
    // The first landing: the moment she stops going down.
    do {
      step(b, 1 / 60, bounds);
      frames++;
    } while (b.vy > 0 && frames < 300);
    expect(frames / 60).toBeGreaterThan(0.6);
    expect(frames / 60).toBeLessThan(0.85);
  });
});

describe('movable: the chat opens from where she stands', () => {
  const VW = 1440;
  it('on the right half it grows leftwards from her right edge', () => {
    // Anchored right at 1420; she has been moved to 1000-1128.
    const p = panelOffset({ left: 1000, right: 1128 }, 1420, 392, VW, 16);
    expect(p.grow).toBe('left');
    expect(1420 + p.x).toBe(1128); // the panel's right edge = hers
  });
  it('on the left half it grows rightwards from her left edge', () => {
    const p = panelOffset({ left: 200, right: 328 }, 1420, 392, VW, 16);
    expect(p.grow).toBe('right');
    expect(1420 + p.x).toBe(200); // the panel's left edge = hers
  });
  it('is always kept on screen', () => {
    const atEdge = panelOffset({ left: 4, right: 132 }, 1420, 392, VW, 16);
    expect(1420 + atEdge.x).toBe(16);
    const nearMiddleRight = panelOffset({ left: 740, right: 868 }, 1420, 392, VW, 16);
    expect(1420 + nearMiddleRight.x - 392).toBeGreaterThanOrEqual(16);
    // Anchored left: the open host's corner is its left edge.
    const fromLeft = panelOffset({ left: 1200, right: 1328 }, 20, 392, VW, 16);
    expect(20 + fromLeft.x).toBe(1328);
  });
});
