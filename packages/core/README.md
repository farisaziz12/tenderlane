# @tenderlane/core

The contracts and the provider-neutral logic of [Tenderlane](../../README.md): the rules router, catalogs, the error types and the server handler. No runtime dependencies, and no knowledge of any payment provider.

Alpha. Not published to npm; use it from this workspace.

## Entry points

| Import | Contents |
| --- | --- |
| `@tenderlane/core` | `createRulesRouter`, `createInlineCatalog`, `defineCatalog`, `createRemoteCatalog`, the error classes and `hasErrorCode`, all shared types |
| `@tenderlane/core/server` | `createTenderlaneHandler` |
| `@tenderlane/core/adapters` | `defineBrowserProvider`, `defineServerAdapter`, `requestProviderAction`, `parseCheckoutResult` |

## Example

```ts
import { createInlineCatalog, createRulesRouter } from '@tenderlane/core';
import { createTenderlaneHandler } from '@tenderlane/core/server';

const routing = createRulesRouter({
  rules: [{ id: 'ch', when: { country: 'CH' }, use: { provider: 'stripe', flow: 'inline' } }],
  fallback: { provider: 'stripe', flow: 'hosted' },
});

const handler = createTenderlaneHandler({
  providers: [stripeServerAdapter({ secretKey })], // from @tenderlane/stripe/server
  catalog: createInlineCatalog({
    'pro-plan': { name: 'Pro plan', pricing: { amount: 2900, currency: 'chf' } },
  }),
  routing,
});

export const POST = handler.POST;
```

Docs: [routing](../../docs-site/src/content/docs/routing.mdx), [server and price integrity](../../docs-site/src/content/docs/server.mdx), [adapters](../../docs-site/src/content/docs/adapters.mdx).

MIT
