# @tenderlane/core

Contracts and provider-neutral logic. No runtime dependencies.

```
src/
  types/        every shared contract (context, routing, checkout, provider, catalog, middleware)
  routing/      rules-router.ts (createRulesRouter), evaluate.ts (condition matching)
  catalog/      inline.ts, define.ts, remote.ts, runner.ts
  middleware/   runner.ts (runMiddlewareHook: calls observers, logs and swallows their errors)
  errors/       TenderlaneError and subclasses, hasErrorCode
  server/       handler.ts (createTenderlaneHandler)   → exported as @tenderlane/core/server
  adapters/     defineBrowserProvider, defineServerAdapter,
                requestProviderAction, parseCheckoutResult → exported as @tenderlane/core/adapters
```

## Rules

- Never import a PSP SDK, and never name a provider in logic. `KnownProviderId` is autocomplete only.
- `PaymentFlow` is `'hosted' | 'inline'`. Do not add a flow without an adapter that implements it.
- `Router<TProviderId>` carries the provider ids a router can select. `createRulesRouter` infers them; the client and the handler constrain them to the registered providers. Keep that inference intact when touching these signatures (`__tests__/types/routing.test-d.ts`, and `client.test-d.ts` in the client package).
- The three entry points must share one copy of the error classes (`splitting: true` in `tsup.config.ts`). Errors that cross a package boundary are matched with `hasErrorCode`, not `instanceof`.

## The handler (`server/handler.ts`)

Order of operations in `POST`, each step covered by `__tests__/server/`:

1. Parse JSON; delete every `unitAmount` and `__proto__` key at any depth.
2. Validate `provider`, `action`, `items`, `successUrl`, `cancelUrl` (absolute, on `allowedRedirectOrigins`, default the request's origin), optional strings, `metadata`.
3. `resolveContext(request, clientContext)`.
4. With `routing`: evaluate it, reject a provider mismatch, take payment methods from the route.
5. `catalogs[provider] ?? catalog` resolves the items. No catalog is a `ConfigurationError` (500).
6. `onCatalogResolved` middleware.
7. Build the adapter payload field by field from validated values. Nothing else from the body is forwarded.
8. `adapter.handle(...)`, then `parseCheckoutResult`: only `{ provider, id, status, url?, clientSecret? }` is returned.

Request errors are 400 with `{ error, code }`. Everything else is 500 with a generic message and goes to `onError`.

`resolve` prices `{ items, context }` with the top-level `catalog` for display (`createRemoteCatalog`).

## Tests

`__tests__/` mirrors `src/`. Type tests are `*.test-d.ts` and run with the suite (`typecheck.enabled` in `vitest.config.ts`).
