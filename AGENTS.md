Tenderlane selects the payment provider and checkout flow from application state. Rules are data evaluated in the browser (to render the right UI at once) and again on the server (which decides the price and refuses a mismatched provider). It is an alpha proof of concept: keep it small and say only what is true.

## Architecture

```
@tenderlane/core          no runtime dependencies, names no provider
    |                     entries: "." (router, catalogs, errors, types), "/server" (handler), "/adapters"
    |
    +--- @tenderlane/client   headless checkout state machine
    |        |
    |        +--- @tenderlane/react  provider, hook, form (useSyncExternalStore)
    |        +--- @tenderlane/vue    plugin + composables; hosted flows only, experimental
    |
    +--- @tenderlane/stripe   browser entry, /server, /react
    +--- @tenderlane/polar    browser entry, /server; hosted flow only
```

There is no umbrella package. `examples/react-checkout-multi-psp` is the one example; `docs-site/snippets/` holds the code the website shows.

## Build & Test

```bash
pnpm install
pnpm build        # all packages, the example and the docs site (Turborepo)
pnpm test         # Vitest, including type tests (*.test-d.ts)
pnpm typecheck    # tsc --noEmit: packages, e2e, the example, docs-site/snippets
pnpm lint         # oxlint, warnings are errors
pnpm test:build   # publint --strict on every package
pnpm check        # all of the above plus the hidden-code and workspace checks
pnpm example      # build packages, run the example on :3000
```

## Key Patterns

### Provider neutrality
Core has no privileged provider. The first-party adapters use only what `@tenderlane/core/adapters` exports (`defineBrowserProvider`, `defineServerAdapter`, `requestProviderAction`, `parseCheckoutResult`), which is the surface a community adapter gets. `e2e/` keeps that honest: one checkout through Stripe, Polar and a third adapter written from that entry point alone, against mocked PSP SDKs. The example's demo PSP is a second such adapter.

Errors that cross a package boundary are matched by `code` (`hasErrorCode`), not `instanceof`.

### Typed provider ids
A provider's `id` is a string literal (the `'~types'` phantom property carries it through generics). `createRulesRouter` infers the union of provider ids its rules target and returns `RulesRouter<TProviderId>`. `createTenderlaneClient`, `TenderlaneProvider` and `createTenderlaneHandler` take `Router<ids of the registered providers>`, so a rule that targets an unregistered provider does not compile. The type tests in `packages/core/__tests__/types/` and `packages/client/__tests__/types/` pin this; do not loosen a signature to make an error go away.

### Flows
`PaymentFlow` is `'hosted' | 'inline'`. Hosted: the server creates a checkout on the provider's page and the browser redirects. Inline: `prepare()` creates a provider session, the app mounts the provider's element, `submit()` confirms it.

### Routing rules
Serializable JSON, first match wins. Operators: literal, `{ in }`, `{ notIn }`, `{ gt, gte, lt, lte }`, nested objects. `predicates` (functions keyed by rule id) are the only non-serializable part.

### State machine
`TenderlaneClientState` is a discriminated union on `status`: `idle → evaluating → ready → (preparing → prepared →) submitting → success | redirecting | pending | error`. `success` means the provider's browser SDK reported the payment complete; a created hosted checkout is `redirecting`. `error` after a failed submit keeps the route, so `submit()` can be retried. One submit runs at a time. `canSubmit` and `selectedProvider` are derived, never set.

### Wire format (load-bearing)
Request: `{ provider, action, payload: CheckoutInput, paymentMethods }`. `CheckoutInput` is `{ items: [{ sku, quantity }], context?, successUrl, cancelUrl, customerEmail?, clientReferenceId?, metadata?, idempotencyKey? }`. **It has no amount, and nothing from the request may reach a PSP parameter that carries money.** The handler deletes any `unitAmount`, prices from its own catalog, and builds the adapter payload field by field from validated values. The client's `context` is untrusted: `resolveContext` derives the server's. The client names the `provider`: pass the handler the same `routing` so the server checks it.

Confirmation: `onCheckoutCreated` hands the app the provider's checkout id and the server-priced items (record the order there; it fails closed). `handler.retrieve(provider, id)` asks the provider for `{ status, amountTotal?, currency? }` with the secret key; it is a server function, never a route. `'complete'` means the provider's record says paid (Stripe: `payment_status`, not only `status`; Polar: `succeeded`, not `confirmed`). `{CHECKOUT_ID}` in `successUrl` is filled in by the provider.

Response: `{ provider, id, status, url?, clientSecret? }` and nothing else. Adapter results pass through `parseCheckoutResult` on the server and again in the browser. Never return a PSP object from an adapter.

### Catalog
`Catalog.resolve(items, context)` turns `{ sku, quantity }` into name, `unitAmount` (integer, minor units) and currency. `createInlineCatalog`, `defineCatalog`, `createRemoteCatalog` in core; `createStripeCatalog`, `createPolarCatalog` read from the PSP. The handler takes `catalog` (default, and the `resolve` route) and `catalogs` (per provider).

## Conventions

- ESM only (`"type": "module"` in all packages)
- TypeScript strict mode with `noUncheckedIndexedAccess`; no `any`, no non-null assertions in `src/`. A cast at an SDK boundary needs a comment saying why.
- All exports use `.js` extensions in import paths (for ESM resolution)
- Errors extend `TenderlaneError` with a `code`
- Tests live in `__tests__/` directories mirroring `src/`; type tests use `.test-d.ts`
- Use full, descriptive variable names — never abbreviations or single-letter initials (e.g. `provider` not `p`, `context` not `ctx`, `configuration` not `cfg`, `error` not `err`, `result` not `res`, `middleware` not `mw`, `parameters` not `params`)
- Website and README copy: say what exists. Every code block on the website is a file under `docs-site/snippets/` or `examples/`, imported with `?raw`, so it is typechecked. Do not paste code into a page.

## Alpha Scope

Implemented: rules router, headless client, React bindings, Stripe hosted + inline, Polar hosted, catalogs, middleware observers, typed errors, adapter entry point, Vue bindings for hosted flows.

Not implemented: webhooks (only the pull-based `retrieve` exists), subscriptions, refunds, failover, other PSPs, Polar's embedded checkout, Solid/Svelte/Angular bindings, `lookup_key` for `createStripeCatalog`, catalog caching, npm releases. No test runs against a live PSP. `docs-site/src/content/docs/limitations.mdx` is the public list; keep it in step with this one.

## Workflow

Every change goes through the same loop, whoever writes it.

1. **Verify.** Run `pnpm check` and report what it printed. A change to `packages/*/src` needs a test that fails without it, and a changeset (`pnpm changeset`).
2. **Review locally before pushing.** Start a reviewer subagent with a fresh context: give it `git diff origin/main...HEAD` and the `payment-review` skill, not your reasoning. It reports correctness and security problems first, each with `file:line` and a concrete failure (input, state, wrong result), tagged Important, Nit or Pre-existing. Fix every Important finding everywhere its kind occurs, then re-review only what changed. At most three rounds; record the counts in the PR.
3. **Show it.** A change under `docs-site/` or `examples/` needs before and after screenshots, and a recording for an interactive flow (`visual-evidence` skill, `tools/shot.mjs`). A library change shows one concrete input and output, a type error, or a failing-then-passing test.
4. **Open a slim PR.** Use `.github/pull_request_template.md` (`open-pr` skill). Under 100 visible words; everything else goes in the collapsed block. `pr-rules` in CI enforces this.

Skills live in `.claude/skills/`: `payment-review`, `open-pr`, `visual-evidence`.

Config files are code. `pnpm test:hidden-code` (first step of `pnpm check` and of CI) fails on a source line too long to have been written by hand; main was once force-pushed with a payload hidden after thousands of spaces in `next.config.ts` and `astro.config.mjs`. Read the whole line before trusting a config diff.

Never: put a PSP SDK import in `@tenderlane/core` or a browser entry, send or trust an amount from the client, return a PSP object to the browser, skip or weaken a test to get green, add a default or privileged provider to core types, or describe on the website something that is not implemented.
