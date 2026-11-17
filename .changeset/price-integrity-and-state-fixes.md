---
'@tenderlane/core': minor
'@tenderlane/client': minor
'@tenderlane/react': minor
'@tenderlane/stripe': minor
'@tenderlane/polar': minor
'tenderlane': minor
---

Close price-integrity gaps and fix the checkout state machine.

**Server handler (`@tenderlane/core`)**

- `providerOptions` in the request body is dropped. It was merged into the PSP request and could replace the resolved price. Configure provider options on the server with the new `providerOptions` handler option.
- New `resolveContext(request, clientContext)` hook derives the pricing context on the server, so a forged context cannot select a cheaper price.
- Legacy `lineItems[]` is rejected unless `allowLegacyLineItems: true` is set and no catalog is configured. It was previously accepted for any provider without its own catalog.
- `items[]` is validated: `sku` must be a non-empty string and `quantity` an integer from 1 to `maxQuantity` (default 10 000), with at most `maxItems` entries (default 100). Inherited property names such as `constructor` are no longer treated as SKUs.
- Malformed JSON and non-object bodies return 400. 5xx responses carry a generic message and a `code`; the detail goes to the new `onError` hook.
- New `allowedRedirectOrigins` option restricts `successUrl` and `cancelUrl`.

**Client (`@tenderlane/client`)**

- `submit()` can be called again after a failed submit (for example a declined card). The route and provider session are kept.
- Only one submit runs at a time, including when `updateContext()` is called during a submit.
- New statuses `redirecting` and `pending`. `success` and `onCheckoutSuccess` now mean the provider reported the payment complete; a created hosted checkout fires the new `onCheckoutPending` hook instead.
- `updateContext()` ignores a structurally equal context, keeps the selected payment method when the new route still offers it, and discards a session that resolves after the context changed.
- `reset()` re-evaluates the route, leaving the client `ready` instead of stranded in `idle`.

**React (`@tenderlane/react`)**

- `TenderlaneCheckoutForm` creates the provider session under React StrictMode, and prepares again after a context change dropped the session.
- A parent re-render with an equal `context` object no longer wipes the session and the selected payment method.
- Returning from a hosted checkout through the back/forward cache resets a client left in `redirecting`.

**Stripe (`@tenderlane/stripe`)**

- `stripeServerAdapter` honours `apiVersion`.
- A PaymentIntent for a cart with mixed currencies is rejected instead of being charged in the first item's currency.

**Polar (`@tenderlane/polar`)**

- A cart with several items or a quantity above 1 is rejected. Polar's `products` is a list the customer picks one from, so such carts were charged as a single item.
- The unsupported `prices` override is no longer sent; the Polar product's own price is charged.
