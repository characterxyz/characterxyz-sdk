# Character XYZ SDK

Put a Character XYZ agent on any website or app: the character in the corner, text chat that
streams, and real-time voice calls with a fair queue when every line is busy.

```html
<script src="https://unpkg.com/@characterxyz/widget@0/dist/cx.js" data-key="cxyz_pk_live_…" async></script>
```

That is the whole integration for most sites. Create the key, choose the sites it may run on and
customise the look in **Character XYZ › Settings › Developers**.

| Package | What it is | Size (gzip) |
|---|---|---|
| [`@characterxyz/widget`](packages/widget) | The ready-made widget: `<character-xyz>` element, `mount()`, and the `cx.js` script-tag build. Works in any framework | 28 KB, everything included |
| [`@characterxyz/web`](packages/web) | The headless core: sessions, streamed chat, calls and the queue. Zero dependencies | 7 KB |
| [`@characterxyz/server`](packages/server) | On your server: mint a session for a signed-in user, verify a webhook | 1 KB |
| [`@characterxyz/react`](packages/react) | `<CharacterXYZWidget/>` and `useCharacterXYZ()` | 1 KB |
| [`android/`](android) · [`swift/`](swift) | Native SDKs — scaffolded, not built yet | — |

Install exactly one: the widget for any site or framework, `@characterxyz/react` in React and Next.js
(it brings the widget), `@characterxyz/web` to build your own UI, and `@characterxyz/server` on the server
for signed-in visitors and webhooks. The API contract: [`spec/`](spec).

## Use it

**Script tag** — settings as `data-*` attributes (`data-accent`, `data-position`, `data-greeting`,
`data-suggestions="A|B|C"`, `data-show-call="false"`, …), then `CharacterXYZ.open('chat' | 'call')`
from your own buttons.

**npm**

```ts
import { mount } from '@characterxyz/widget';

const widget = mount({ publishableKey: 'cxyz_pk_live_…', accent: '#e11d48' });
widget.open('chat');
```

**React**

```tsx
import { CharacterXYZWidget } from '@characterxyz/react';

<CharacterXYZWidget publishableKey="cxyz_pk_live_…" onReady={({ agent }) => console.log(agent.name)} />;
```

**Your own UI** on the headless core:

```ts
import { CharacterXYZ } from '@characterxyz/web';

const cx = await CharacterXYZ.init({ publishableKey: 'cxyz_pk_live_…' });
cx.chat.on('messages', render);           // streams as the reply is written
await cx.chat.send('Hello!');

callButton.onclick = async () => {        // from a click: it needs the microphone
  const call = await cx.startCall({ autoAccept: true });
  call.on('state', (s) => show(s.phase, s.position, s.etaSeconds));
  call.on('caption', (c) => caption(c.role, c.text));
};
```

**Signed-in visitors** (history follows them across devices; webhooks carry your user id):

```ts
// on your server
import { createSession } from '@characterxyz/server';
const session = await createSession({ secretKey: process.env.CHARACTERXYZ_SECRET_KEY!, visitor: { id: user.id }, origin: 'https://www.example.com' });

// in the page
mount({ getSessionToken: () => fetch('/api/characterxyz/session').then((r) => r.json()) });
```

### Customising, three layers

1. **Settings** — which agent (`agentId`), and how she is presented: `display` (bubble / half / full
   body), `launcher`, `accent`, `mode` (auto / light / dark), `position`, `radius`, `font`, `showChat`,
   `showCall`, `branding`. The defaults are saved on the key from Character XYZ's Embed page; any site
   overrides any of them in its snippet (`data-display="full"`) or in code (`mount({ display: 'full' })`).
   **What the agent says is the agent's own** — its persona, knowledge and Execution Graph — not an embed
   setting. (`greeting`, `subtitle`, `suggestions` and `placeholder` exist only as per-site overrides for
   an integrator who needs one.)
2. **CSS** — the widget lives in a Shadow DOM, so nothing of yours leaks in or out. Tokens:
   `character-xyz { --cx-accent; --cx-font; --cx-radius }`; parts: `::part(launcher | presence | actions | panel | header | composer | banner | message | message-agent | message-visitor | greeting)`.
3. **Headless** — `@characterxyz/web` gives you every capability without our UI.

Events on the element (bubbling): `cx-ready`, `cx-open`, `cx-close`, `cx-call` `{phase, position, endReason}`, `cx-error`.

## Security

- **Publishable keys** (`cxyz_pk_…`) are public by design and work only from the sites listed on the
  key, exchanging for a 15-minute session bound to that site. **Secret keys** (`cxyz_sk_…`) are for
  servers only, shown once, stored hashed; the API refuses one sent from a browser and the SDK refuses
  to run with one.
- Sessions are HMAC-signed, scoped to one agent and one visitor, and re-checked against the key on every
  request (a revoked key stops within 30 seconds). Chat history is held by the server, so a page cannot
  put words in the agent's mouth. The call socket is pinned to the session's agent and opened with a
  one-use ticket, never a token in a URL.
- Webhooks are signed (`Cxyz-Signature: t=…,v1=…`, HMAC-SHA256 over `"<t>.<body>"`): use
  `verifyWebhook()` and reject anything older than five minutes.
- Model output is rendered from tokens, never as HTML. Settings are validated before they reach CSS.

## Calls and the line

Every call uses one of the account's instance slots — the same slots the Character XYZ app uses. When
they are all busy, callers wait in a first-come line with their place and an estimate, can keep
chatting while they wait, hear a chime when it is their turn and have 30 seconds to join. Plans set
whether calls are on, their length, the line's length and the longest wait. Calls are billed per started
minute; chat is free.

## Develop

```bash
pnpm install
pnpm build        # every package
pnpm test         # vitest, every package
pnpm typecheck
pnpm size         # gzip budgets; fails when over
pnpm demo         # http://localhost:3130 — a pretend brand site with the widget, plus a webhook receiver
node scripts/e2e-api.mjs   # end-to-end against a running backend (see the file for its env)
```

The demo serves `packages/widget/dist/cx.js`, so build first. Point it at a backend with
`CXYZ_API_URL`, and give it a test key (`CXYZ_PUBLISHABLE_KEY`, created with `http://localhost:3130`
as an allowed site).

**Versions** move in lockstep across every package and platform (the Swift Package Manager reads one
tag per repository).

**Releasing**: bump the version in every `package.json`, commit, and push a tag `v<version>`. The
`release` workflow runs `pnpm check` and publishes all four packages to npm with provenance, through
npm trusted publishing (no npm token anywhere).

## License

MIT
