import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyLayer, DEFAULTS, fromAttributes, safeColor, safeFont } from './config.js';
import { blocks, clock, endCopy, eta, inline, ordinal } from './format.js';
import { CLOSE_UP, faceOf, MEDIUM, place } from './framing.js';

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
    expect(eta(30)).toBe('less than a minute');
    expect(eta(180)).toBe('about 3 min');
    expect(eta(5400)).toBe('about 2 hr');
    expect(clock(7)).toBe('0:07');
    expect(clock(192)).toBe('3:12');
    expect(clock(3723)).toBe('1:02:03');
  });

  it('every end reason has words for the visitor', () => {
    for (const r of ['hangup', 'left', 'missed', 'timeout', 'limit', 'busy', 'mic-denied', 'credits', 'unavailable', 'failed', null]) {
      const c = endCopy(r, 'Ananya');
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.body.length).toBeGreaterThan(10);
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
