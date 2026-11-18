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
- The two `as unknown as` casts at the SDK boundary in `server/` exist because the mapper keeps its own request and response shapes instead of the SDK's generated types.

Tests mock the Polar SDK. Nothing here is verified against the live API in CI.
