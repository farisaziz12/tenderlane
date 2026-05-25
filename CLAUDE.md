Tenderlane is not just a backend payment wrapper. Its core value is frontend-first, reactive payment orchestration: application state changes should be able to change the selected PSP, payment method, payment flow, and checkout UI in a typed, provider-agnostic way.

## Architecture

Tenderlane follows a TanStack-inspired layered architecture:

```
@tenderlane/core          (zero external deps, provider-agnostic)
    |                      includes: routing, catalog, middleware, errors, server handler
    |
    +--- @tenderlane/client   (headless checkout state machine)
    |        |
    |        +--- @tenderlane/react  (thin React bindings via useSyncExternalStore)
    |
    +--- @tenderlane/stripe   (browser provider + server adapter)
    |
    +--- @tenderlane/polar    (in design — see "In Design" below)
```

- **@tenderlane/core** - All contracts, types, routing engine, catalog primitive, middleware runner, error hierarchy, and server handler. Zero runtime dependencies. Must never import any provider SDK.
- **@tenderlane/client** - Framework-agnostic headless checkout client. Owns the state machine (idle → evaluating → ready → submitting → success/error). Exposes `subscribe`/`getSnapshot` for external store integration.
- **@tenderlane/react** - Thin React wrapper. `TenderlaneProvider` creates the client once via `useRef`. Hooks use `useSyncExternalStore`. No business logic here.
- **@tenderlane/stripe** - Browser entry (`@tenderlane/stripe`) must NOT import the `stripe` npm package. Server entry (`@tenderlane/stripe/server`) imports `stripe`. Subpath exports enforce the boundary.
- **@tenderlane/polar** - Same browser/server boundary as Stripe. Browser uses `fetch`; server imports `@polar-sh/sdk`. Redirect-only in v1 (Polar's iframe embed is deferred — it's a whole-page iframe, not a field-level Stripe-Elements analog).

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

### Catalog (provider-agnostic product/pricing)
A `Catalog` is the same architectural slot as a router: one user-supplied object, all providers consume its output. Catalog implementations ship in core (`createInlineCatalog`, `createRemoteCatalog`, `defineCatalog`) and in provider packages (`createStripeCatalog`, `createPolarCatalog`). Each `ResolvedCatalogItem` carries optional `providerRefs` (e.g. `{ stripe: { priceId }, polar: { productId } }`) so a single SKU can target multiple PSPs.

The server handler accepts `catalogs: Record<ProviderId, Catalog>` for per-provider dispatch — when routing picks Stripe, `catalogs.stripe` runs; when routing picks Polar, `catalogs.polar` runs. PSP-sourced catalogs (`createStripeCatalog`, `createPolarCatalog`) call the PSP API at resolve time so the PSP dashboard itself is the source of truth for money. Top-level `catalog` is a fallback and the target for the `/resolve` route used by `createRemoteCatalog` clients.

### Price integrity (load-bearing rule)
**`unitAmount` MUST never cross the wire from client to server.** Wire payload is `{ items: [{ sku, quantity }], context, successUrl, ... }`. The client says *what* (SKU + quantity + context); the server runs its own `catalog.resolve()` and decides *for how much*. Client-side catalog resolution is display-only; the server re-resolves at submit time and always wins. The handler strips any client-supplied `unitAmount` defensively before resolution.

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

Not implemented: Stripe Elements, other PSPs (Adyen/Revolut/Braintree/PayPal), Vue/Solid/Svelte bindings, webhooks, subscriptions, refunds, failover, ML routing, devtools.

## In Design / Future Work

Original plan lives at `/Users/farisaziz/.claude/plans/what-would-it-take-rustling-fox.md` (catalog primitive + Polar provider — landed). PSP-sourced catalogs (`createStripeCatalog`, `createPolarCatalog`) + per-provider catalog dispatch — landed.

Not yet built:
- Polar iframe embedded flow (`@polar-sh/checkout` — whole-page iframe, deferred since it's not a field-level Stripe-Elements analog)
- Cross-PSP webhook verification helpers
- Subscriptions, refunds
- Additional providers (Adyen, Paddle, LemonSqueezy, Revolut, Braintree, PayPal)
- `createStripeCatalog` `lookup_key` support (today only `priceId`)
- Catalog response caching (each resolve hits the PSP API per item)
