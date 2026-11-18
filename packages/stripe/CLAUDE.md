# @tenderlane/stripe

Stripe adapter. Three entry points with a hard boundary.

```
src/
  index.ts                 browser entry
  browser/provider.ts      stripeProvider(): hosted + inline. Lazy-loads @stripe/stripe-js.
  react/                   StripePaymentElement                     → @tenderlane/stripe/react
  server/adapter.ts        stripeServerAdapter(): 'checkout', 'create-payment-intent'
  server/mapper.ts         Tenderlane ↔ Stripe params and results
  server/catalog.ts        createStripeCatalog(): prices from stripe.prices.retrieve
  shared/capabilities.ts   flows and payment method labels
```

## Rules

- `index.ts`, `browser/` and `react/` must never import the `stripe` package. Only `server/` does.
- The browser provider talks to the app's handler through `requestProviderAction` from `@tenderlane/core/adapters`, never with a hand-written `fetch`.
- Mappers read money only from `ResolvedCheckoutInput.items`: `providerRefs.stripe.priceId` when present, otherwise `price_data` from `unitAmount`/`currency`.
- Results returned to the handler carry only `id`, `status`, `url` or `clientSecret`. Never return the Stripe object.
- A PaymentIntent has one currency; a mixed-currency cart is a `CatalogError`.
- `submitInline` reports `complete` only for `paymentIntent.status === 'succeeded'`.
- `providerOptions` on the payload comes from server config and is merged last into the Stripe params.
- `retrieve` dispatches on the id prefix (`cs_`, `pi_`) and rejects anything else before calling Stripe. A finished Checkout Session is `complete` only when `payment_status` is `paid`; `no_payment_required` is `open`; `unpaid` defers to the expanded PaymentIntent (`processing`, or `failed` once a debit bounced). A PaymentIntent in `requires_payment_method` is `failed` only with `last_payment_error`; `requires_capture` is `processing`. `retrieve` expands the payment method so `paymentMethod` is the one actually used.
- `server/webhook.ts` maps Stripe events to `PaymentEvent`. Keep it in step with the status mapping in `mapper.ts`: the same Stripe state must not read as paid in one and unpaid in the other.

Tests mock the Stripe SDK, except `__tests__/server/webhook.test.ts`, which signs and verifies with the real SDK offline. `e2e/live/stripe.live.ts` runs the adapter against Stripe test mode by hand (`pnpm test:live`).
