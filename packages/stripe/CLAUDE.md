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
    index.ts            # Server entry: exports stripeServerAdapter()
    adapter.ts          # stripeServerAdapter() factory - ServerProviderAdapter<"stripe">
    mapper.ts           # mapToStripeSessionParams(), mapFromStripeSession()
    types.ts            # StripeServerConfig (secretKey, apiVersion)
  shared/
    capabilities.ts     # STRIPE_CAPABILITIES, STRIPE_PAYMENT_METHODS, STRIPE_FLOWS
    metadata.ts         # StripePhantomTypes type alias
```

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
