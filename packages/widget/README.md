# @characterxyz/widget

Put your Character XYZ agent on any website: the character in the corner, text chat that streams,
and real-time voice calls with a fair queue when every line is busy. One Web Component in a Shadow
DOM, so it works in plain HTML, React, Vue, Svelte, Angular or anything else, and nothing of your
page's CSS leaks in or out. 34 KB gzipped, everything included; it starts once the page is idle.

Create a publishable key, choose the sites it may run on and pick the look in
**Character XYZ › Settings › Developers**.

## Script tag (no build step)

```html
<script src="https://unpkg.com/@characterxyz/widget@0/dist/cx.js" data-key="cxyz_pk_live_…" async></script>
```

Settings go on the tag as `data-*` attributes: `data-display="full"`, `data-accent="#e11d48"`,
`data-position="bottom-left"`, `data-mode="dark"`, `data-show-call="false"`, `data-agent="agent_…"`.
Drive it from your own buttons with `CharacterXYZ.open('chat')` or `CharacterXYZ.open('call')`.

## Binding the page

```js
// Who this is / what is true now. Stays in scope for every later turn.
CharacterXYZ.identify({ id: 'u_42', name: 'Asha', traits: { plan: 'pro' } });
CharacterXYZ.setContext({ page: '/pricing', cart: { items: 2 } });

// Something they did. Only names the agent's graph declares.
CharacterXYZ.track('pricing_viewed', { plan: 'pro' });

// Something the agent may ask the page to do.
CharacterXYZ.registerAction('openCart', async ({ itemId }) => { cart.open(itemId); return { opened: true }; });
```

`track` is fire-and-forget (`void`), sends an idempotency id, and survives a
navigating click. An awaited page action runs your handler and posts the result
back on the same request; the agent's reply follows. The graph nodes are **On
Site Event** and **Client Action**.

## npm

```bash
npm install @characterxyz/widget
```

```ts
import { mount } from '@characterxyz/widget';

const widget = mount({ publishableKey: 'cxyz_pk_live_…', accent: '#e11d48' });
widget.open('chat'); // or 'call'; widget.close(); widget.destroy()
```

Using React or Next.js? Install [`@characterxyz/react`](https://www.npmjs.com/package/@characterxyz/react)
instead; it includes this package.

## Settings

The defaults come from the key (set on the Embed page); anything passed here overrides them for this site.

| Setting | Values |
|---|---|
| `agentId` | Which of the key's agents. Default: the key's first |
| `display` | `bubble` · `half` · `full` (how much of her shows) |
| `launcher`, `position` | Launcher style; `bottom-right` · `bottom-left` |
| `accent`, `mode`, `radius`, `font` | Colour, `auto` · `light` · `dark`, corner radius, font family |
| `showChat`, `showCall`, `branding` | Turn chat, calls or the footer off |
| `offsetX`, `offsetY`, `zIndex`, `container` | Placement |

What the agent says (persona, knowledge, greeting) is the agent's own, set in Character XYZ.

## Styling

CSS tokens on the element: `character-xyz { --cx-accent: …; --cx-font: …; --cx-radius: … }`. Parts:
`::part(launcher | presence | actions | panel | header | composer | banner | message | message-agent | message-visitor | message-event | event | greeting)`.

## Events

The element fires bubbling events: `cx-ready`, `cx-open`, `cx-close`, `cx-call` (`{phase, position, endReason}`) and `cx-error`.

## Signed-in visitors

Mint the session on your server with [`@characterxyz/server`](https://www.npmjs.com/package/@characterxyz/server),
then: `mount({ getSessionToken: () => fetch('/api/characterxyz/session').then((r) => r.json()) })`.
Their chat history then follows them across devices.

## Security

A publishable key (`cxyz_pk_…`) is public by design: it works only from the sites listed on it and
exchanges for a 15-minute session bound to that site. Never put a secret key (`cxyz_sk_…`) in a page;
the SDK refuses to run with one.

## License

MIT
