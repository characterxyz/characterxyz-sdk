# @characterxyz/web

The headless Character XYZ SDK: sessions, streamed chat, real-time voice calls and the call queue,
with no UI. Build your own interface on the same calls the ready-made widget uses. Framework-free,
zero dependencies, 7 KB gzipped.

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
