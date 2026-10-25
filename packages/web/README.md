# @characterxyz/web

The headless Character XYZ SDK: sessions, streamed chat, real-time voice calls and the call queue,
with no UI. Build your own interface on the same calls the ready-made widget uses. Framework-free,
zero dependencies, 8 KB gzipped.

Want the ready-made widget instead? Use [`@characterxyz/widget`](https://www.npmjs.com/package/@characterxyz/widget)
(any site) or [`@characterxyz/react`](https://www.npmjs.com/package/@characterxyz/react).

```bash
npm install @characterxyz/web
```

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

When every line is busy, a call waits in a first-come queue with its place and an estimate; the
visitor can keep chatting meanwhile.

## Context, events and actions

The page and the agent talk in both directions. Three layers, one session:

```ts
// 1. CONTEXT IN — who this is and what is true now. Level-triggered: it stays
//    in scope for every later turn until changed. Scope: visitor.*, context.*.
await cx.identify({ id: 'u_42', email: 'asha@acme.com', name: 'Asha', traits: { plan: 'pro' } });
await cx.setContext({ page: '/pricing', cart: { items: 2, value: 4200 } });

// 2. EVENTS IN — something the visitor DID. Only names the agent's graph
//    declares are accepted. Fire-and-forget: do not await it.
void cx.track('pricing_viewed', { plan: 'pro' });
//    Scope in the graph: {{event.name}}, {{event.data.plan}}.
//    With `openChat` on the node, the widget opens itself for the reply.

// 3. ACTIONS OUT — the graph asks the page to do something.
const off = cx.registerAction('openCart', async ({ itemId }) => {
  await cart.open(String(itemId));
  return { opened: true, count: cart.count };
});
```

The graph side is two nodes beside the existing ones: **On Site Event** (one per
event name; the name is the allowlist, with an optional data shape and a Send
test event button in the console) and **Client Action** (pick an action the page
registered; its answer resumes down `done` or `failed`, and `result` is readable
after the node).

`cx.track` sends an idempotency id and `keepalive`, so a retry or a click that
navigates away is still one event. An awaited page action is a two-phase
handshake on the same HTTP connection: the walk suspends, the SDK runs your
handler, posts the result, and the reply comes back. Nothing is polled.

## Options

| Option | |
|---|---|
| `publishableKey` | `cxyz_pk_live_…`, safe in the page; works only from the key's allowed sites |
| `getSessionToken` | For signed-in visitors: returns a session your server minted with [`@characterxyz/server`](https://www.npmjs.com/package/@characterxyz/server) |
| `agentId` | Which of the key's agents. Default: the key's first |
| `storage` | `local` (remember the anonymous visitor, default) · `memory` · your own store |

Create keys and choose the sites they may run on in **Character XYZ › Settings › Developers**.

## License

MIT
