# @tenderlane/client

The headless checkout state machine of [Tenderlane](../../README.md). It selects a route for the current context and drives one checkout through the selected provider. No framework, no rendering.

Alpha. Not published to npm; use it from this workspace.

```ts
import { createTenderlaneClient } from '@tenderlane/client';

const client = createTenderlaneClient({
  context: { country: 'CH' },
  providers: [stripe], // from @tenderlane/stripe
  routing, // from createRulesRouter
});

client.subscribe(() => {
  const state = client.getSnapshot();
  if (state.status === 'error') console.error(state.error.code);
});

client.updateContext({ country: 'DE' }); // selects a route for the new state
await client.submit({ items: [{ sku: 'pro-plan', quantity: 1 }], successUrl, cancelUrl });
```

`getSnapshot()` returns a discriminated union on `status`; `subscribe`/`getSnapshot` follow the `useSyncExternalStore` contract. States and rules: [checkout state](../../docs-site/src/content/docs/checkout-state.mdx).

MIT
