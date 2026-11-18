# @tenderlane/react

React 18+ bindings for [Tenderlane](../../README.md), over `@tenderlane/client`.

Alpha. Not published to npm; use it from this workspace.

| Export | Purpose |
| --- | --- |
| `TenderlaneProvider` | Creates one client for the subtree and keeps its context in sync with `config.context` |
| `useTenderlaneCheckout()` | The checkout state (a discriminated union on `status`) plus `submit`, `prepare`, `selectPaymentMethod`, `reset` |
| `TenderlaneCheckoutForm` | Drives hosted and inline flows behind one render prop; renders no markup of its own |
| `useTenderlane()` | The client itself |

```tsx
<TenderlaneProvider config={{ context: { country }, providers: [stripe], routing }}>
  <TenderlaneCheckoutForm input={input} elements={{ stripe: StripePaymentElement }}>
    {({ submit, canSubmit, error }) => (
      <>
        <button disabled={!canSubmit} onClick={submit}>Pay</button>
        {error && <p role="alert">{error.message}</p>}
      </>
    )}
  </TenderlaneCheckoutForm>
</TenderlaneProvider>
```

A complete component: [`examples/react-checkout-multi-psp/app/checkout/checkout.tsx`](../../examples/react-checkout-multi-psp/app/checkout/checkout.tsx).

MIT
