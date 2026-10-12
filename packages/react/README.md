# @characterxyz/react

Your Character XYZ agent in React and Next.js: the ready-made widget as a component, and a hook for
building your own UI. Includes [`@characterxyz/widget`](https://www.npmjs.com/package/@characterxyz/widget)
and [`@characterxyz/web`](https://www.npmjs.com/package/@characterxyz/web); install only this.

```bash
npm install @characterxyz/react
```

## The widget

```tsx
import { CharacterXYZWidget } from '@characterxyz/react';

export function Support() {
  return <CharacterXYZWidget publishableKey="cxyz_pk_live_…" accent="#e11d48" onReady={({ agent }) => console.log(agent.name)} />;
}
```

It takes every widget setting as a prop (`agentId`, `display`, `position`, `mode`, `showCall`, …). Works
in the Next.js App Router as is: the package is marked `'use client'`.

## Your own UI

```tsx
import { useCharacterXYZ } from '@characterxyz/react';

const { messages, busy, send, startCall, call, error } = useCharacterXYZ({ publishableKey: 'cxyz_pk_live_…' });
```

`messages` stream as the reply is written; `startCall()` must run from a click (it asks for the
microphone), and `call` carries its phase, queue position and estimate.

## Signed-in visitors

Mint the session on your server with [`@characterxyz/server`](https://www.npmjs.com/package/@characterxyz/server)
and pass `getSessionToken={() => fetch('/api/characterxyz/session').then((r) => r.json())}` instead of a key.

Create keys and choose the sites they may run on in **Character XYZ › Settings › Developers**.

## License

MIT
