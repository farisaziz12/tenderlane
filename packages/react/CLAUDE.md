# @tenderlane/react

Thin React bindings over `@tenderlane/client`. No business logic here.

## Structure

```
src/
  context.ts                    # React.createContext for TenderlaneClient
  provider.tsx                  # TenderlaneProvider component
  hooks/
    use-tenderlane.ts           # Raw client access from context
    use-tenderlane-checkout.ts  # Derived checkout state (primary hook)
    use-payment-methods.ts      # Just payment methods
```

## Key Design Rules

- `TenderlaneProvider` creates the client ONCE via `useRef` initialization (same pattern as QueryClientProvider)
- Config changes after mount are handled via `useEffect` that calls `client.updateContext()` when `config.context` changes
- All hooks use `useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot)` for correct React 18+ concurrent mode support
- `useTenderlaneCheckout()` wraps with `useMemo` to avoid creating new derived objects on re-renders when state hasn't changed
- `useTenderlane()` throws a helpful error if used outside `TenderlaneProvider`
- Peer dependency: `react >= 18` (required for `useSyncExternalStore`)

## Primary Hook API

```ts
const checkout = useTenderlaneCheckout();
checkout.status              // "idle" | "evaluating" | "ready" | "submitting" | "success" | "error"
checkout.selectedProvider    // "stripe" | "polar" | null   (polar planned)
checkout.selectedRoute       // SelectedPaymentRoute | null
checkout.paymentMethods      // PaymentMethodDescriptor[]
checkout.selectedPaymentMethod // string | null
checkout.canSubmit           // boolean
checkout.error               // TenderlaneError | null
checkout.checkoutResult      // CheckoutResult | null
checkout.selectPaymentMethod(id)  // select a payment method
checkout.submit(input)            // start checkout
// Planned (catalog primitive):
checkout.previewItems        // ResolvedCatalogItem[] | null — client-side resolve for display only; server re-resolves at submit
checkout.previewTotal        // { amount, currency } | null — derived from previewItems
```

## Catalog (planned)

The React layer is a passthrough: catalog is configured on the `TenderlaneProvider` (`config.catalog`), and `useTenderlaneCheckout()` exposes `previewItems` / `previewTotal` for currency-switcher and running-total UX. The wire payload from React → server still carries no `unitAmount`. See root `CLAUDE.md` for the price-integrity contract.

## Testing

Tests use `@testing-library/react` with `jsdom` environment (see `vitest.config.ts`).
