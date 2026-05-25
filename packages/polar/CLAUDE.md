# @tenderlane/polar

Polar.sh provider adapter for Tenderlane. Mirrors the `@tenderlane/stripe` layout: separate browser and server entry points with a hard isolation boundary.

## Structure

```
src/
  index.ts              # Browser entry: exports polarProvider()
  browser/
    provider.ts         # polarProvider() factory — BrowserPaymentProvider<"polar", ...>
    types.ts            # PolarProviderOptions (organizationId, serverEndpoint)
  server/
    index.ts            # Server entry: exports polarServerAdapter() + createPolarCatalog()
    adapter.ts          # polarServerAdapter() factory — ServerProviderAdapter<"polar">
    catalog.ts          # createPolarCatalog() — PSP-sourced catalog (polar.products.get)
    mapper.ts           # mapToPolarCheckoutParams(), mapFromPolarCheckout()
    types.ts            # PolarServerConfig (accessToken, organizationId, server)
  shared/
    capabilities.ts     # POLAR_CAPABILITIES (flows, paymentMethods, currencies, countries)
    metadata.ts         # PolarPhantomTypes type alias
```

## Polar-sourced catalog

`createPolarCatalog({ accessToken, organizationId, server, skus })` returns a `Catalog` whose `resolve()` calls `polar.products.get({ id })` for each requested SKU. Reads `product.name` and the first fixed-amount price (`priceAmount`, `priceCurrency`) — or a specific `priceId` when declared on the SKU config (useful for products with multiple prices, e.g., monthly + annual). Populates `providerRefs.polar.productId` and `providerRefs.polar.priceId` on the result; the adapter's mapper then emits `products: [productId]` to Polar's checkout API and Polar charges its own canonical price.

Server-only by construction (requires `accessToken`). Pair with `createRemoteCatalog` on the client, or use a separate fast in-memory catalog for previews.

## Critical Boundary

**Browser entry (`@tenderlane/polar`):**
- Must NEVER import `@polar-sh/sdk` or `@polar-sh/checkout`
- Only uses `fetch()` to call the configured `serverEndpoint`
- On submit: POST `{ provider: "polar", action: "checkout", payload }` → get back `{ url }` → redirect

**Server entry (`@tenderlane/polar/server`):**
- Imports `@polar-sh/sdk`
- Instantiates `new Polar({ accessToken, server })`
- Maps `ResolvedCheckoutInput.items[]` → Polar `POST /v1/checkouts/` body

Enforced via `package.json` `exports` and `tsup.config.ts` entry points.

## Catalog-driven checkout

Polar is product-first: every checkout must reference at least one pre-created Polar product ID. The adapter reads it from `item.providerRefs.polar.productId` on each resolved catalog item — if missing, it throws `CatalogError`. There is no inline `price_data`-style fallback for Polar.

This is why the unified catalog primitive in `@tenderlane/core` carries `providerRefs`: a single SKU can declare its native references for multiple PSPs at once.

## Alpha capabilities (honest)

- `flows: ['checkout-session']` only — Polar's iframe embedded flow is deferred (it's a whole-page iframe, not a field-level Stripe-Elements analog; warrants its own design pass)
- `paymentMethods: ['card']` — confirmed; other methods (PayPal, wallets, locals) are reported in Polar marketing but ambiguous in the docs
- `currencies: ['usd']` — multi-currency tracking [polarsource/polar#7842](https://github.com/polarsource/polar/issues/7842)
- `supports: { redirect: true, embedded: false, subscriptions: false, refunds: false, webhooks: true }`

## Sandbox vs production

`polarServerAdapter` takes `server: 'sandbox' | 'production'`. Polar separates sandbox (`https://sandbox-api.polar.sh`) from production (`https://api.polar.sh`) by hostname, not by key prefix — so the environment is an explicit knob, not detected from the access token.

## Webhooks (not in v1)

Polar's redirect-to-success_url is **not authoritative for fulfillment** — the source of truth is webhooks (Standard Webhooks spec). v1 does not ship a webhook verifier; consumers should handle fulfillment via Polar's webhook delivery directly until a cross-PSP webhook helper lands in core.
