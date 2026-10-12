# @characterxyz/server

Character XYZ on your server. Mint a session for a signed-in visitor with your secret key, and verify
webhook signatures. Works in Node 18+, Deno, Bun and edge runtimes.

```ts
import { createSession, verifyWebhook } from '@characterxyz/server';

const session = await createSession({
  secretKey: process.env.CHARACTERXYZ_SECRET_KEY!,
  visitor: { id: user.id },
  origin: 'https://www.example.com',
});
```

A secret key never belongs in a browser: `createSession` refuses to run in one.

See the [repository README](https://github.com/characterxyz/characterxyz-sdk#readme) for usage, security and customising.
