# @tenderlane/client

Framework-agnostic headless checkout client. Depends only on `@tenderlane/core`.

## Structure

```
src/
  client.ts   # createTenderlaneClient() factory - owns the state machine
  types.ts    # ClientConfig, ClientState, ClientStatus, TenderlaneClient interface
  index.ts    # Public exports
```

## State Machine

```
idle → evaluating → ready → submitting → success
                  ↘ error                ↘ error
```

- `idle`: Initial state before evaluation starts
- `evaluating`: Router is evaluating the current context (async)
- `ready`: Route selected, provider resolved, payment methods available, canSubmit=true
- `submitting`: Provider.submit() in progress
- `success`: Checkout completed (may trigger redirect for Stripe)
- `error`: Any failure; canSubmit remains true for retries after submit errors

## Key Design Rules

- Client is a plain object with closures (not a class) to avoid `this`-binding issues
- `subscribe()` + `getSnapshot()` follow the `useSyncExternalStore` contract exactly
- State is replaced immutably on every `setState()` call so `getSnapshot()` returns stable references
- Uses an `evaluationVersion` counter to handle rapid `updateContext()` calls - stale evaluations are discarded
- `evaluate()` is fire-and-forget from `updateContext()` - the state machine handles async lifecycle
- Initial evaluation happens automatically in `createTenderlaneClient()`
- Middleware hooks are fired at each lifecycle point via `runMiddlewareHook` from core
- **Price integrity**: the client must NEVER post `unitAmount` to the server. The wire shape is `{ items: [{ sku, quantity }], context, ... }`. Server's catalog is canonical and re-resolves at submit time. Client-side `catalog.resolve()` results are display-only.

## CheckoutInput Migration (planned)

- New canonical shape: `submit({ items: [{ sku, quantity }], successUrl, ... })`.
- Legacy `submit({ lineItems: [{ name, unitAmount, currency, quantity }] })` continues to work — the client wraps it in an ephemeral inline catalog on the way out and posts the resulting `items[]`. No behavior change for existing Stripe consumers.
- When a `catalog` is configured at the client level (planned `ClientConfig.catalog`), `client.previewItems()` returns the client-side resolved `ResolvedCatalogItem[]` for currency-switcher / running-total UX. The submit path still hits the server, which re-resolves canonically.

## API

```ts
const client = createTenderlaneClient({
  context: { country: "CH", currency: "chf", amount: 1000 },
  providers: [stripeProvider(...)],
  routing: createRulesRouter({ rules: [...], fallback: {...} }),
  middleware: [{ name: "analytics", onRouteEvaluated: ... }],
});

client.subscribe(listener);     // useSyncExternalStore compatible
client.getSnapshot();           // returns immutable ClientState
client.updateContext(newCtx);   // triggers re-evaluation
client.selectPaymentMethod(id); // updates selected method
client.submit(checkoutInput);   // delegates to provider
client.reset();                 // back to idle
```
