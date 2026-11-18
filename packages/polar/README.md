# @tenderlane/polar

Polar adapter for [Tenderlane](../../README.md).

Alpha. Not published to npm; use it from this workspace. No test runs against the live Polar API; the SDK is mocked.

| Import | Runs in | Contents | Needs |
| --- | --- | --- | --- |
| `@tenderlane/polar` | Browser | `polarProvider({ serverEndpoint })` | nothing |
| `@tenderlane/polar/server` | Server | `polarServerAdapter({ accessToken, server })`, `createPolarCatalog` | `@polar-sh/sdk` |

- `hosted` flow only: the server creates a Polar checkout and the browser is redirected to it.
- Polar sells products by id, so each item needs `providerRefs.polar.productId`. `createPolarCatalog({ accessToken, server, skus: { 'pro-plan': { productId } } })` supplies it and reads the price from Polar.
- One product with quantity one per checkout. Anything else is rejected with a `CATALOG_ERROR`.

Not implemented: Polar's embedded checkout, webhooks, subscriptions.

MIT
