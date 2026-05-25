# @tenderlane/core

Provider-agnostic foundation package. Zero external runtime dependencies.

## Structure

```
src/
  types/          # All type definitions and contracts
    context.ts    # TenderlaneContext (extensible payment context)
    provider.ts   # BrowserPaymentProvider, ServerProviderAdapter interfaces
    phantom.ts    # ProviderPhantomTypes for ~types pattern
    capabilities.ts # ProviderCapabilities, PaymentMethodDescriptor, PaymentFlow
    routing.ts    # RoutingRule, SelectedPaymentRoute, condition operators
    checkout.ts   # CheckoutInput, CheckoutResult, CheckoutLineItem
    catalog.ts    # (in design) Catalog, CatalogRequest, ResolvedCatalogItem, CatalogPhantomTypes
    middleware.ts # TenderlaneMiddleware lifecycle hooks interface
    utils.ts      # InferProviderId, InferProviderIds, InferCapabilities, InferCatalogSkus (planned)
  routing/        # Route evaluation engine
    evaluate.ts   # Core: resolvePath (dot-paths), matchConditionValue (operators), matchRuleConditions
    rules-router.ts  # createRulesRouter() - declarative, serializable, first-match-wins
    auto-router.ts   # createAutoRouter() - remote endpoint + AbortController timeout + fallback
  catalog/        # (in design) Catalog resolution primitives
    inline.ts     # createInlineCatalog() - pure, isomorphic, shareable code
    remote.ts     # createRemoteCatalog() - client stub posting to /resolve
    define.ts     # defineCatalog() - server-only custom resolver (DB, CMS)
    runner.ts     # resolveCatalog() helper + lineItems auto-wrap shim
  middleware/
    runner.ts     # runMiddlewareHook() - iterates middleware array, calls named hooks, catches errors
  errors/
    errors.ts     # TenderlaneError hierarchy: Configuration, Routing, Provider, Validation, UnsupportedCapability, Catalog (planned)
  server/
    handler.ts    # createTenderlaneHandler() - Web Request/Response, provider dispatch + catalog resolution (planned)
    catalog-route.ts # (in design) Built-in POST /resolve route — target for createRemoteCatalog
```

## Key Design Rules

- This package must NEVER import any provider SDK (Stripe, Adyen, etc.)
- All types should be exported from `src/types/index.ts` and re-exported from `src/index.ts`
- The `server/` subpath is exported separately via `@tenderlane/core/server` (see `tsup.config.ts` entries and `package.json` exports)
- Routing rules use serializable condition objects, not functions. The `predicates` map is the only function-based escape hatch
- Condition evaluation uses dot-path resolution for nested access (e.g., `experiment.checkoutRouting`)
- **Price integrity**: the server handler MUST strip any client-supplied `unitAmount` before catalog resolution. Client → server wire carries `{ items: [{ sku, quantity }], context }`, never amounts. Server's `catalog.resolve()` is canonical; the PSP session is created with server-derived amounts.

## Catalog Dispatch Order (in server/handler.ts)

1. Parse `{ provider, action, payload }`; defensively strip `payload.unitAmount` and any nested `items[].unitAmount` (the `lineItems` subtree is preserved — no catalog overrides it).
2. Pick the catalog: `catalogs[body.provider]` if configured, else top-level `catalog`.
3. If `payload.lineItems` is set and `payload.items` is not → wrap into an ephemeral inline catalog (deprecated shim path).
4. `const resolved = await catalog.resolve(payload.items, payload.context)`.
5. Fire `onCatalogResolved({ context, resolved })` middleware hook.
6. Dispatch `adapter.handle(action, { ...payload, items: resolved })`.

The `/resolve` route is a separate POST that runs only steps 1, 3–5 against the top-level `catalog` (no provider context) — this is what `createRemoteCatalog` targets for preview.

`createTenderlaneHandler` config:
- `providers` — required, the registered server adapters
- `catalog?` — optional default catalog used when no per-provider entry matches; also used by the `/resolve` route
- `catalogs?: Record<ProviderId, Catalog>` — optional per-provider map. When the wire payload's `provider` matches a key, that catalog is used. PSP-sourced catalogs (`createStripeCatalog`, `createPolarCatalog`) live here.
- `middleware?` — lifecycle hooks (currently only `onCatalogResolved` fires server-side)

## Condition Operators

- Exact: `"CH"` matches `=== "CH"`
- In: `{ in: ["CH", "DE"] }` matches if value is in array
- NotIn: `{ notIn: ["RU"] }` matches if value is NOT in array
- Numeric: `{ gte: 1000, lt: 50000 }` all specified bounds must be satisfied
- Nested objects: `{ variant: "a" }` recursively matches each key

## Testing

- `__tests__/routing/` - Evaluation engine, rules router, auto router (mocked fetch)
- `__tests__/middleware/` - Hook execution order, error handling
- `__tests__/errors.test.ts` - Error hierarchy and properties
- `__tests__/server/` - Server handler routing and error responses
- `__tests__/types/inference.test-d.ts` - Type-level tests using `expectTypeOf`
