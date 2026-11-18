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
- `CheckoutStatus` is `'open' | 'processing' | 'complete' | 'expired' | 'failed'`. `open` is waiting on the customer; `processing` is waiting for the money.
- `createRulesRouter` infers the provider ids its rules target. `createTenderlaneClient`, `TenderlaneProvider` and `createTenderlaneHandler` reject, at compile time, a router that targets a provider that is not registered; the handler also checks the keys of `catalogs` and `providerOptions`.
- `TenderlaneClientState` is a discriminated union on `status`. `canSubmit` is false on an inline route until its session exists.
- `Router.evaluate` takes a `TenderlaneContext`.
- The inline client secret travels as `CheckoutResult.clientSecret`.
- The handler requires `items` and `cancelUrl`, builds the adapter payload from validated fields only, and answers 400 with a `code` for every request error. `allowedRedirectOrigins` defaults to the request's own origin (it used to allow any URL). A missing catalog is a 500 `CONFIGURATION_ERROR`, not a 400.
- A route whose flow the provider does not declare is an `error` state (`UNSUPPORTED_CAPABILITY`) at routing time. A settled checkout no longer re-routes on a context change.

**Fixed**

- Polar: `successUrl` and `customerEmail` were sent as `success_url` and `customer_email`, which the SDK drops, so customers were not returned to the app. The mapper is now typed against the SDK.
- Stripe inline: a connection error during confirmation no longer reports a failure when the PaymentIntent succeeded or is processing.
- A `__proto__` key in the request body could supply fields through the prototype.

**Added**

- `handler.webhook(provider, onEvent)` and `ServerProviderAdapter.verifyWebhook`: verify a provider's webhook and reduce it to a `PaymentEvent` (`payment.processing`, `payment.succeeded`, `payment.failed`, `checkout.expired`, `unhandled`). Implemented for Stripe (`webhookSecret`, Checkout Session and PaymentIntent events) and Polar (`webhookSecret`, `checkout.updated`). `WebhookVerificationError`, `parsePaymentEvent`. `@tenderlane/polar` now depends on `standardwebhooks`.
- `onCheckoutCreated` on the handler: record the order under the provider's checkout id with the server's prices. Fails closed.
- `handler.retrieve(provider, id)` and `ServerProviderAdapter.retrieve`: ask the provider whether a checkout was paid. Implemented for Stripe (Checkout Session and PaymentIntent) and Polar. `{CHECKOUT_ID}` in `successUrl` is replaced with the checkout id.
- Stripe: a finished Checkout Session with `payment_status: 'unpaid'` is `processing`, not `complete`. Polar: `confirmed` is `processing`, not `complete`.
- `CheckoutDetails.paymentMethod`: the method the customer used, where the provider reports it (Stripe).
- `parseCheckoutResult` in `@tenderlane/core/adapters`. The handler passes every adapter result through it, and `requestProviderAction` validates the response, including that `url` is an absolute http(s) URL.
- `StripePaymentElement` accepts the generic provider prop, so `elements={{ stripe: StripePaymentElement }}` needs no cast. It imports `@stripe/react-stripe-js` directly; lazy-load `@tenderlane/stripe/react` to keep it out of the first bundle.
