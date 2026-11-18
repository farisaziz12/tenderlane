# @tenderlane/react

Thin React bindings over `@tenderlane/client`. No business logic.

```
src/
  provider.tsx                   TenderlaneProvider: creates the client once, syncs config.context
  hooks/use-tenderlane.ts        the client from context
  hooks/use-tenderlane-checkout.ts  state + actions via useSyncExternalStore
  components/checkout-form.tsx   TenderlaneCheckoutForm
```

## Rules

- The client is created once (`useRef`). Only `config.context` is watched afterwards; `providers`, `routing` and `middleware` are read at creation.
- `TenderlaneProvider` is generic over the providers tuple so the routing check from `@tenderlane/client` applies to the `config` prop.
- `TenderlaneCheckoutForm` calls `prepare()` for an inline route when the route or the serialized `input` changes. The call is deferred with `setTimeout(0)` because child effects run before the provider's context-sync effect, and the prepare key is recorded only when `prepare()` is actually called (StrictMode cancels the first timer). A failed prepare is retried only through `retry()`.
- It renders no markup: the inline element (from `elements[provider]`) and then `children(renderState)`.

Tests use `@testing-library/react` with jsdom.
