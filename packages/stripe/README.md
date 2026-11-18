# @tenderlane/stripe

Stripe adapter for [Tenderlane](../../README.md).

Alpha. Not published to npm; use it from this workspace. No test runs against the live Stripe API; the SDK is mocked.

| Import | Runs in | Contents | Needs |
| --- | --- | --- | --- |
| `@tenderlane/stripe` | Browser | `stripeProvider({ publishableKey, serverEndpoint })` | `@stripe/stripe-js` for the inline flow |
| `@tenderlane/stripe/server` | Server | `stripeServerAdapter({ secretKey })`, `createStripeCatalog` | `stripe` |
| `@tenderlane/stripe/react` | Browser | `StripePaymentElement` | `@stripe/react-stripe-js`, `react` |

The browser entry never imports the `stripe` package and holds only the publishable key.

- `hosted`: a Checkout Session in `payment` mode, then a redirect.
- `inline`: a PaymentIntent, confirmed with the Payment Element. Card details go into Stripe's iframe.
- Prices come from the server's catalog: a Stripe Price when the item has `providerRefs.stripe.priceId`, otherwise inline `price_data`.
- `createStripeCatalog({ secretKey, skus: { 'pro-plan': { priceId } } })` reads prices from Stripe at request time (one API call per item, no cache).

Not implemented: webhooks, subscriptions, refunds, lookup keys.

MIT
