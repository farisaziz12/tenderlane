---
'@tenderlane/core': minor
'@tenderlane/client': minor
'@tenderlane/react': minor
'@tenderlane/stripe': minor
'@tenderlane/polar': minor
'@tenderlane/vue': minor
---

Narrow the alpha to what is demonstrated, and tighten the types and the wire format. Breaking.

**Removed**

- The `tenderlane` umbrella package. Import from the scoped packages.
- `createAutoRouter`. Any object with `evaluate(context)` is still a router.
- `CheckoutInput.lineItems`, `CheckoutLineItem`, `allowLegacyLineItems`, `wrapLegacyLineItems`: the wire format has no way to carry a price.
- `CheckoutInput.providerOptions` and `RouteTarget.providerOptions`: PSP options are server configuration (`createTenderlaneHandler({ providerOptions })`).
- `CheckoutResult.raw`. The server handler returned the whole PSP object (for Stripe, the Checkout Session) to the browser.
- `ProviderCapabilities.provider`, `.currencies`, `.countries`, `.supports`; `usePaymentMethods`, `useProviderSession` (read them from `useTenderlaneCheckout()`); `PolarProviderOptions.organizationId`, `PolarServerConfig.organizationId`; `StripeProviderOptions.locale`.

**Changed**

- Flows are `'hosted'` and `'inline'` (were `'checkout-session'` and `'payment-intent'`; `'embedded-checkout'`, `'redirect'` and `'custom'` had no implementation).
- `CheckoutStatus` is `'open' | 'complete' | 'expired' | 'failed'`.
- `createRulesRouter` infers the provider ids its rules target. `createTenderlaneClient`, `TenderlaneProvider` and `createTenderlaneHandler` reject, at compile time, a router that targets a provider that is not registered; the handler also checks the keys of `catalogs` and `providerOptions`.
- `TenderlaneClientState` is a discriminated union on `status`. `canSubmit` is false on an inline route until its session exists.
- `Router.evaluate` takes a `TenderlaneContext`.
- The inline client secret travels as `CheckoutResult.clientSecret`.
- The handler requires `items` and `cancelUrl`, builds the adapter payload from validated fields only, and answers 400 with a `code` for every request error.

**Added**

- `parseCheckoutResult` in `@tenderlane/core/adapters`. The handler passes every adapter result through it, and `requestProviderAction` validates the response, including that `url` is an absolute http(s) URL.
- `StripePaymentElement` accepts the generic provider prop, so `elements={{ stripe: StripePaymentElement }}` needs no cast. It imports `@stripe/react-stripe-js` directly; lazy-load `@tenderlane/stripe/react` to keep it out of the first bundle.
