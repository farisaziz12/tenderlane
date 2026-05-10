Tenderlane is not just a backend payment wrapper. Its core value is frontend-first, reactive payment orchestration: application state changes should be able to change the selected PSP, payment method, payment flow, and checkout UI in a typed, provider-agnostic way.

## Architecture

Tenderlane follows a TanStack-inspired layered architecture:

```
@tenderlane/core          (zero external deps, provider-agnostic)
    |
    +--- @tenderlane/client   (headless checkout state machine)
    |        |
    |        +--- @tenderlane/react  (thin React bindings via useSyncExternalStore)
    |
    +--- @tenderlane/stripe   (browser provider + server adapter)
```

- **@tenderlane/core** - All contracts, types, routing engine, middleware runner, error hierarchy, and server handler. Zero runtime dependencies. Must never import any provider SDK.
- **@tenderlane/client** - Framework-agnostic headless checkout client. Owns the state machine (idle → evaluating → ready → submitting → success/error). Exposes `subscribe`/`getSnapshot` for external store integration.
- **@tenderlane/react** - Thin React wrapper. `TenderlaneProvider` creates the client once via `useRef`. Hooks use `useSyncExternalStore`. No business logic here.
- **@tenderlane/stripe** - Browser entry (`@tenderlane/stripe`) must NOT import the `stripe` npm package. Server entry (`@tenderlane/stripe/server`) imports `stripe`. Subpath exports enforce the boundary.

## Build & Test

```bash
pnpm install
pnpm build        # Build all packages (Turborepo, tsup)
pnpm test         # Run all tests (Vitest, includes type tests)
pnpm typecheck    # tsc --noEmit across all packages
```

Build order is managed by Turborepo via `turbo.json`. Core builds first, then client+stripe in parallel, then react.

## Key Patterns

### Phantom Type Metadata (`~types`)
Provider adapters carry a `'~types'` property for compile-time type inference without runtime cost. This is the TanStack pattern for preserving literal types through generic boundaries.

```ts
interface BrowserPaymentProvider<TProviderId extends string = string, ...> {
  readonly '~types': ProviderPhantomTypes<TProviderId, ...>;
  readonly id: TProviderId;  // literal "stripe", not string
}
```

Use `InferProviderId<T>`, `InferProviderIds<T[]>`, `InferCapabilities<T>` to extract type info.

### Routing Rules
Rules are serializable JSON objects, not functions. First match wins. Support operators: exact match, `{ in: [...] }`, `{ notIn: [...] }`, `{ gt, gte, lt, lte }`. Nested object matching for `experiment: { variant: "a" }`. Optional `predicates` escape hatch for function-based rules keyed by rule ID.

### State Machine
Client state transitions: `idle → evaluating → ready → submitting → success | error`. State is replaced immutably. `getSnapshot()` returns stable references for `useSyncExternalStore`.

### Server Handler
Uses Web `Request`/`Response` standard. Framework-agnostic. Body format: `{ provider: string, action: string, payload: CheckoutInput }`.

## Conventions

- ESM only (`"type": "module"` in all packages)
- TypeScript strict mode with `noUncheckedIndexedAccess`
- All exports use `.js` extensions in import paths (for ESM resolution)
- Errors extend `TenderlaneError` with typed `code` field
- Tests live in `__tests__/` directories mirroring `src/` structure
- Type tests use `.test-d.ts` extension with `expectTypeOf` from Vitest
- Use full, descriptive variable names — never abbreviations or single-letter initials (e.g. `provider` not `p`, `context` not `ctx`, `configuration` not `cfg`, `error` not `err`, `result` not `res`, `middleware` not `mw`, `parameters` not `params`)

## Alpha Scope

Implemented: rules router, auto router interface, headless client, React hooks, Stripe Checkout redirect flow, middleware lifecycle, typed errors, type inference.

Not implemented: Stripe Elements, other PSPs (Adyen/Polar/Revolut/Braintree/PayPal), Vue/Solid/Svelte bindings, webhooks, subscriptions, refunds, failover, ML routing, devtools.
