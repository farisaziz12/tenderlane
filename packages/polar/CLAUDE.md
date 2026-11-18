# @tenderlane/polar

Polar adapter. Hosted flow only. Same browser/server boundary as Stripe.

```
src/
  index.ts                 browser entry
  browser/provider.ts      polarProvider(): requestProviderAction + redirect. No SDK.
  server/adapter.ts        polarServerAdapter(): 'checkout'
  server/mapper.ts         Tenderlane ↔ Polar checkout params and results
  server/catalog.ts        createPolarCatalog(): product and price from polar.products.get
  shared/capabilities.ts
```

## Rules

- Only `server/` imports `@polar-sh/sdk`.
- Polar is product-first: every item needs `providerRefs.polar.productId`. `unitAmount` is never sent to Polar; the product's own price applies.
- One product, quantity one, per checkout. The mapper throws a `CatalogError` for anything else instead of approximating.
- Sandbox and production are different hosts with separate tokens (`server: 'sandbox' | 'production'`).
- The mapper's request and response types are `Pick`s of the SDK's `CheckoutCreate` and `Checkout`. Do not cast at the SDK boundary: a cast hid `success_url` (dropped by the SDK, which takes `successUrl`) behind mocked tests.
- Only `succeeded` maps to `complete`. `confirmed` maps to `processing`.
- `server/webhook.ts` verifies with `standardwebhooks` directly (the key is the UTF-8 bytes of the secret, as in the SDK's `validateEvent`) and reads only `type`, `data.id` and `data.status`. Do not switch to `validateEvent`: it rejects a genuine event whenever Polar's payload drifts from the SDK's generated schema.

Tests mock the Polar SDK's API client; webhook tests sign and verify for real. Nothing here is verified against the live API.
