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
    middleware.ts # TenderlaneMiddleware lifecycle hooks interface
    utils.ts      # InferProviderId, InferProviderIds, InferCapabilities
  routing/        # Route evaluation engine
    evaluate.ts   # Core: resolvePath (dot-paths), matchConditionValue (operators), matchRuleConditions
    rules-router.ts  # createRulesRouter() - declarative, serializable, first-match-wins
    auto-router.ts   # createAutoRouter() - remote endpoint + AbortController timeout + fallback
  middleware/
    runner.ts     # runMiddlewareHook() - iterates middleware array, calls named hooks, catches errors
  errors/
    errors.ts     # TenderlaneError hierarchy: Configuration, Routing, Provider, Validation, UnsupportedCapability
  server/
    handler.ts    # createTenderlaneHandler() - Web Request/Response, provider dispatch
```

## Key Design Rules

- This package must NEVER import any provider SDK (Stripe, Adyen, etc.)
- All types should be exported from `src/types/index.ts` and re-exported from `src/index.ts`
- The `server/` subpath is exported separately via `@tenderlane/core/server` (see `tsup.config.ts` entries and `package.json` exports)
- Routing rules use serializable condition objects, not functions. The `predicates` map is the only function-based escape hatch
- Condition evaluation uses dot-path resolution for nested access (e.g., `experiment.checkoutRouting`)

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
