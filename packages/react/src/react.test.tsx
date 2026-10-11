import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const mount = vi.hoisted(() =>
  vi.fn((_options: Record<string, unknown>) => {
    const element = document.createElement('character-xyz');
    document.body.appendChild(element);
    return { element, open: vi.fn(), close: vi.fn(), destroy: vi.fn(() => element.remove()) };
  }),
);
vi.mock('@characterxyz/widget', () => ({ mount }));
vi.mock('@characterxyz/web', () => ({ CharacterXYZ: { init: vi.fn() } }));

import { CharacterXYZWidget } from './index.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('<CharacterXYZWidget>', () => {
  it('mounts the widget once, forwards its events, and removes it on unmount', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const onReady = vi.fn();
    await act(async () => root.render(<CharacterXYZWidget publishableKey="cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA" accent="#e11d48" onReady={onReady} />));
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[0]?.[0]).toMatchObject({ publishableKey: 'cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA', accent: '#e11d48' });
    expect(mount.mock.calls[0]?.[0]?.onReady).toBeUndefined();

    const el = document.querySelector('character-xyz')!;
    el.dispatchEvent(new CustomEvent('cx-ready', { detail: { agent: { id: 'a', name: 'Ananya' } } }));
    expect(onReady).toHaveBeenCalledWith({ agent: { id: 'a', name: 'Ananya' } });

    // Re-render with the same key: no second widget.
    await act(async () => root.render(<CharacterXYZWidget publishableKey="cxyz_pk_live_AAAAAAAAAAAAAAAAAAAAAAAA" accent="#000000" />));
    expect(mount).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    expect(document.querySelector('character-xyz')).toBeNull();
  });
});
