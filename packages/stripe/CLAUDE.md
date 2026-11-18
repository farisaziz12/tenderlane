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
- `retrieve` dispatches on the id prefix (`cs_`, `pi_`) and rejects anything else before calling Stripe. A Checkout Session is `complete` only when `payment_status` is `paid` (`unpaid` and `no_payment_required` are not payments).

Tests mock the Stripe SDK. Nothing here is verified against the live API in CI.
