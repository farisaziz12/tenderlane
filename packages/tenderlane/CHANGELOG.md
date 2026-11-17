# tenderlane

## 0.1.0-alpha.2

### Minor Changes

- [#3](https://github.com/farisaziz12/tenderlane/pull/3) [`45f3a47`](https://github.com/farisaziz12/tenderlane/commit/45f3a47ea0f5ab2a68ed67504d55d93e342bdd3a) Thanks [@farisaziz12](https://github.com/farisaziz12)! - Add `@tenderlane/core/adapters` (also `tenderlane/adapters`), the entry point for writing a provider adapter: `defineBrowserProvider`, `defineServerAdapter`, `requestProviderAction`, and the adapter contracts.

  - Routing rules can target any provider id and payment method id. `RouteTarget.provider` was limited to a built-in list, so a rule could not select a community or in-house adapter without a cast.
  - `@tenderlane/core` and `@tenderlane/core/server` now share one copy of the error classes. They were bundled separately, so a `CatalogError` thrown by `@tenderlane/stripe` or `@tenderlane/polar` was not recognised by the handler and came back as a 500 instead of a 400. The handler also matches errors by `code`, and `hasErrorCode(error, code)` is exported for the same purpose.

- [#3](https://github.com/farisaziz12/tenderlane/pull/3) [`4bfff50`](https://github.com/farisaziz12/tenderlane/commit/4bfff50467656a9ad3584e61cf818abd7eb9ecfd) Thanks [@farisaziz12](https://github.com/farisaziz12)! - Close price-integrity gaps and fix the checkout state machine.

  **Server handler (`@tenderlane/core`)**

  - `providerOptions` in the request body is dropped. It was merged into the PSP request and could replace the resolved price. Configure provider options on the server with the new `providerOptions` handler option.
  - New `resolveContext(request, clientContext)` hook derives the pricing context on the server, so a forged context cannot select a cheaper price.
  - Legacy `lineItems[]` is rejected unless `allowLegacyLineItems: true` is set and no catalog is configured. It was previously accepted for any provider without its own catalog.
  - `items[]` is validated: `sku` must be a non-empty string and `quantity` an integer from 1 to `maxQuantity` (default 10 000), with at most `maxItems` entries (default 100). Inherited property names such as `constructor` are no longer treated as SKUs.
  - Malformed JSON and non-object bodies return 400. 5xx responses carry a generic message and a `code`; the detail goes to the new `onError` hook.
  - New `allowedRedirectOrigins` option restricts `successUrl` and `cancelUrl`.
  - New `routing` option: the server evaluates the same router and rejects a request whose `provider` is not the selected route, and takes payment methods from the route instead of the body.
  - `successUrl`, `metadata` and the other pass-through fields are type-checked (400 instead of a PSP 500).

  **Client (`@tenderlane/client`)**

  - `submit()` can be called again after a failed submit (for example a declined card). The route and provider session are kept.
  - Only one submit runs at a time, including when `updateContext()` is called during a submit.
  - New statuses `redirecting` and `pending`. `success` and `onCheckoutSuccess` now mean the provider reported the payment complete; a created hosted checkout fires the new `onCheckoutPending` hook instead.
  - `updateContext()` ignores a structurally equal context, keeps the selected payment method when the new route still offers it, and discards a session that resolves after the context changed.
  - `reset()` re-evaluates the route, leaving the client `ready` instead of stranded in `idle`.
  - A context change or `reset()` during a submit is applied after the submit settles, so it cannot overwrite a completed payment or unmount an inline payment element mid-confirmation.
  - `prepare()` drops the previous provider session, so a failed re-prepare cannot leave an outdated session payable. A failed prepare can be retried.
  - `submit()` on an inline flow without a provider session throws `INVALID_STATE`. A `failed` or `expired` result is an error. `canSubmit` is false while evaluating and preparing.

  **React (`@tenderlane/react`)**

  - `TenderlaneCheckoutForm` creates the provider session under React StrictMode, and prepares again after a context change dropped the session.
  - A parent re-render with an equal `context` object no longer wipes the session and the selected payment method.
  - The render prop gets `retry()` to create the session again after a failed prepare; the form does not retry a failing endpoint on its own.
  - Returning from a hosted checkout through the back/forward cache resets a client left in `redirecting`.

  **Stripe (`@tenderlane/stripe`)**

  - `stripeServerAdapter` honours `apiVersion`.
  - A failed price lookup in `createStripeCatalog` (and product lookup in `createPolarCatalog`) is a `ProviderError` (5xx, generic body) instead of a 400 that echoed the price id.
  - A PaymentIntent for a cart with mixed currencies is rejected instead of being charged in the first item's currency.

  **Polar (`@tenderlane/polar`)**

  - A cart with several items or a quantity above 1 is rejected. Polar's `products` is a list the customer picks one from, so such carts were charged as a single item.
  - The unsupported `prices` override is no longer sent; the Polar product's own price is charged.

- [#3](https://github.com/farisaziz12/tenderlane/pull/3) [`82c6610`](https://github.com/farisaziz12/tenderlane/commit/82c66102aedceb0d6e639ed97e258302abb861cd) Thanks [@farisaziz12](https://github.com/farisaziz12)! - Add `@tenderlane/vue` (also `tenderlane/vue`): a plugin (`createTenderlane`), `provideTenderlane`, and the composables `useTenderlane`, `useTenderlaneState`, `useTenderlaneCheckout` and `useTenderlaneContext` over the headless client. Redirect flows only; there is no Vue component for inline payment elements yet.

  `STRIPE_CAPABILITIES` and `POLAR_CAPABILITIES` now report `supports.webhooks: false`. No webhook verification is implemented.

### Patch Changes

- Updated dependencies [[`45f3a47`](https://github.com/farisaziz12/tenderlane/commit/45f3a47ea0f5ab2a68ed67504d55d93e342bdd3a), [`4bfff50`](https://github.com/farisaziz12/tenderlane/commit/4bfff50467656a9ad3584e61cf818abd7eb9ecfd), [`82c6610`](https://github.com/farisaziz12/tenderlane/commit/82c66102aedceb0d6e639ed97e258302abb861cd)]:
  - @tenderlane/core@0.1.0-alpha.2
  - @tenderlane/client@0.1.0-alpha.2
  - @tenderlane/react@0.1.0-alpha.2
  - @tenderlane/stripe@0.1.0-alpha.2
  - @tenderlane/polar@0.1.0-alpha.2
  - @tenderlane/vue@0.1.0-alpha.2

## 0.1.0-alpha.1

### Minor Changes

- [`d9ce4a2`](https://github.com/farisaziz12/tenderlane/commit/d9ce4a25fbdb3f0fa681d8414e8e05549d9d2cde) Thanks [@farisaziz12](https://github.com/farisaziz12)! - Initial alpha release. Tenderlane is a reactive, frontend-first payment orchestration SDK. Ships with rules-based PSP routing, headless checkout state machine, React bindings, provider-agnostic catalog primitive, and adapters for Stripe Checkout (redirect) and Polar.sh (redirect).

### Patch Changes

- Updated dependencies [[`d9ce4a2`](https://github.com/farisaziz12/tenderlane/commit/d9ce4a25fbdb3f0fa681d8414e8e05549d9d2cde)]:
  - @tenderlane/core@0.1.0-alpha.1
  - @tenderlane/client@0.1.0-alpha.1
  - @tenderlane/react@0.1.0-alpha.1
  - @tenderlane/stripe@0.1.0-alpha.1
  - @tenderlane/polar@0.1.0-alpha.1
