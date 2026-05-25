# @tenderlane/stripe

Stripe provider adapter for Tenderlane. Has separate browser and server entry points.

## Structure

```
src/
  index.ts              # Browser entry: exports stripeProvider()
  browser/
    provider.ts         # stripeProvider() factory - BrowserPaymentProvider<"stripe", ...>
    types.ts            # StripeProviderOptions (publishableKey, serverEndpoint)
  server/
    index.ts            # Server entry: exports stripeServerAdapter() + createStripeCatalog()
    adapter.ts          # stripeServerAdapter() factory - ServerProviderAdapter<"stripe">
    catalog.ts          # createStripeCatalog() — PSP-sourced catalog (stripe.prices.retrieve)
    mapper.ts           # mapToStripeSessionParams(), mapFromStripeSession()
    types.ts            # StripeServerConfig (secretKey, apiVersion)
  shared/
    capabilities.ts     # STRIPE_CAPABILITIES, STRIPE_PAYMENT_METHODS, STRIPE_FLOWS
    metadata.ts         # StripePhantomTypes type alias
```

## Stripe-sourced catalog

`createStripeCatalog({ secretKey, skus })` returns a `Catalog` whose `resolve()` calls `stripe.prices.retrieve(priceId, { expand: ['product'] })` for each requested SKU. Reads `unit_amount`, `currency`, and the product's `name`. Populates `providerRefs.stripe.priceId` on the result so the adapter's mapper emits `{ price: priceId, quantity }` — Stripe looks up the canonical price internally.

Server-only by construction (requires `secretKey`). Pair with `createRemoteCatalog` on the client. The mapper's inline `price_data` fallback path remains for catalogs that don't declare a Stripe priceId (e.g., `createInlineCatalog` with no `providerRefs.stripe`).

## Critical Boundary

**Browser entry (`@tenderlane/stripe`):**
- Must NEVER import the `stripe` npm package
- Only uses `fetch()` to call the configured `serverEndpoint`
- On submit: POST `{ provider: "stripe", action: "checkout", payload }` → get back `{ url }` → redirect

**Server entry (`@tenderlane/stripe/server`):**
- Imports `stripe` npm package
- Creates `new Stripe(secretKey)`
- Maps `CheckoutInput` → `stripe.checkout.sessions.create()` params

This boundary is enforced via `package.json` `exports` and `tsup.config.ts` entry points.

## Stripe Checkout Session Mapping

`mapToStripeSessionParams()` in `server/mapper.ts`:
- `mode: "payment"` (always for alpha)
- `line_items` use `price_data` with `product_data` (inline pricing, no pre-created Price objects)
- `success_url` supports `{CHECKOUT_SESSION_ID}` placeholder token
- `customer_email`, `client_reference_id`, `metadata` mapped directly
- `idempotencyKey` passed via `Stripe.RequestOptions` (not session params)
- `providerOptions` from `CheckoutInput` merged into params as escape hatch (allows `payment_method_types`, `allow_promotion_codes`, etc.)

## Mapper Migration to Catalog (planned)

When the catalog primitive lands, `mapToStripeSessionParams()` will accept `ResolvedCatalogItem[]` instead of raw line items. Preference order per item:
1. If `item.providerRefs.stripe.priceId` is present → emit `{ price: <priceId>, quantity }` (uses a pre-created Stripe Price object).
2. Otherwise → fall back to today's inline `price_data` shape using `item.unitAmount`, `item.currency`, `item.name`. Behavior unchanged from current alpha.

Server-supplied amounts are canonical (see root CLAUDE.md "Price integrity"). The mapper never reads pricing from anything except the resolved catalog item.

## Provider ID Inference

`stripeProvider()` returns `BrowserPaymentProvider<"stripe", StripeCapabilities, StripeProviderOptions>`. The literal `"stripe"` is preserved through the `~types` phantom metadata, allowing type-level inference of valid provider IDs.

## Alpha Capabilities (honest)

- flows: `["checkout-session"]`
- paymentMethods: `["card"]`
- redirect: yes
- embedded: no
- subscriptions: no
- refunds: no
- webhooks: declared but not implemented
