# Tenderlane

Tenderlane selects the payment provider and checkout flow from your application's state.

It is a headless TypeScript library. You write routing rules as data. A client state machine runs whichever provider the rules select behind one `submit()`, and a server handler re-checks the route and sets the price, so the browser never sends an amount.

> **Alpha proof of concept.** Not published to npm, not production-ready. See [what does not work yet](#what-does-not-work-yet).

## The problem

A checkout that uses two providers, or two flows of one provider, grows the same conditional in three places: the component that decides what to render, the submit handler, and the API route that creates the session. Each provider SDK has its own session object and its own meaning of "done", and nothing checks that the three places agree.

Tenderlane moves that decision into one router that the browser and the server both evaluate, and puts every provider behind the same two interfaces.

```ts
import { createRulesRouter } from '@tenderlane/core';

export const routing = createRulesRouter({
  rules: [
    { id: 'ch-inline', when: { country: 'CH' }, use: { provider: 'stripe', flow: 'inline' } },
    { id: 'us-polar', when: { country: 'US' }, use: { provider: 'polar', flow: 'hosted' } },
  ],
  fallback: { provider: 'stripe', flow: 'hosted' },
});
```

`hosted` redirects to the provider's page. `inline` mounts the provider's payment element in yours. A rule that names a provider you did not register is a compile error.

## Run it

Needs Node.js 18+ and pnpm 9 (`corepack enable`). No payment account.

```bash
pnpm install
pnpm example     # builds the packages, starts the example on http://localhost:3000
```

The example is one checkout form whose provider and flow follow a country select. Without keys it pays through a built-in **demo PSP**, a labelled stand-in that runs the whole flow (routing, server-side pricing, redirect, return) and moves no money. Stripe test keys in `examples/react-checkout-multi-psp/.env.local` switch on the real Stripe routes. [`DEMO.md`](./DEMO.md) is a five-minute walkthrough.

```bash
pnpm docs:dev    # the website and docs, http://localhost:4321
pnpm check       # lint, build, typecheck, tests, package export checks
```

## What works

- A rules router, evaluated in the browser and again on the server
- A headless checkout client whose state is a discriminated union
- React bindings: `TenderlaneProvider`, `useTenderlaneCheckout`, `TenderlaneCheckoutForm`
- Stripe: Checkout (hosted) and PaymentIntent with the Payment Element (inline)
- Polar: hosted checkout, one product per checkout
- Server-side pricing from a catalog you define, or read from Stripe or Polar
- Server-side confirmation on return: `onCheckoutCreated` to record the order under the provider's id, `handler.retrieve()` to ask the provider if it was paid
- An adapter API for other providers, used by the first-party adapters themselves

## What does not work yet

- **Webhooks.** `handler.retrieve()` asks the provider whether a checkout was paid when the customer returns. Nothing handles a payment that settles while nobody is asking. The client's `success` is the browser SDK's report, for the UI only.
- Subscriptions, refunds, saved payment methods, failover.
- Providers other than Stripe and Polar. Polar is hosted-only.
- Vue bindings cover hosted flows only and have no example.
- No test runs against a live PSP sandbox. The PSP SDKs are mocked in every test.
- No npm release.

The full list, including what an integrator must add, is in [`docs-site/src/content/docs/limitations.mdx`](./docs-site/src/content/docs/limitations.mdx).

## How one checkout flows

```text
browser                                         server
───────                                         ──────
app state { country, ... }
   │
router ─► route { provider, flow }
   │
client state machine ── submit() ──────────────► handler.POST
   │                    { provider,              1. drop any client amount, validate
   │                      items: [{ sku, qty }] } 2. derive the server's context
   │                                             3. same router: is this the right provider?
   │                                             4. price items from the catalog
   │                                             5. server adapter ─► PSP API (secret key)
   ◄─────────── { id, status, url | clientSecret } ◄┘
   │
hosted: redirect to url      inline: confirm in the provider's element
```

The request has no price field, and the response carries five fields and nothing else from the PSP. Card data stays in the provider's page or iframe.

## Packages

```text
@tenderlane/core          no dependencies, names no provider
   ├── @tenderlane/client     headless checkout state machine
   │      ├── @tenderlane/react
   │      └── @tenderlane/vue     (experimental, hosted flows only)
   ├── @tenderlane/stripe     browser entry, /server, /react
   └── @tenderlane/polar      browser entry, /server
```

| Package | Use it for |
| --- | --- |
| [`@tenderlane/core`](./packages/core) | Rules router, catalogs, errors. `/server`: the request handler. `/adapters`: writing a provider adapter. |
| [`@tenderlane/client`](./packages/client) | The checkout state machine, without a framework. |
| [`@tenderlane/react`](./packages/react) | Provider, hook and form for React 18+. |
| [`@tenderlane/stripe`](./packages/stripe) | Stripe. The browser entry never imports the `stripe` package. |
| [`@tenderlane/polar`](./packages/polar) | Polar. Same browser/server split. |
| [`@tenderlane/vue`](./packages/vue) | Vue 3 plugin and composables. |

## Repository

| Path | Contents |
| --- | --- |
| `packages/` | The six packages. Each has `src/` and `__tests__/`. |
| `examples/react-checkout-multi-psp/` | The Next.js example, including the demo PSP adapter. |
| `e2e/` | One checkout through Stripe, Polar and a third adapter, with mocked PSP SDKs. |
| `docs-site/` | The website (Astro). `snippets/` holds the code it shows, typechecked in CI. |
| `tools/` | Repository checks and the screenshot script. |

## Documentation

Run `pnpm docs:dev`, or read the sources in `docs-site/src/content/docs/`:

[Getting started](./docs-site/src/content/docs/getting-started.mdx) ·
[Architecture](./docs-site/src/content/docs/architecture.mdx) ·
[Routing](./docs-site/src/content/docs/routing.mdx) ·
[Server and price integrity](./docs-site/src/content/docs/server.mdx) ·
[Checkout state](./docs-site/src/content/docs/checkout-state.mdx) ·
[Providers and adapters](./docs-site/src/content/docs/adapters.mdx) ·
[Limitations](./docs-site/src/content/docs/limitations.mdx)

## Contributing

`AGENTS.md` describes the workflow and the rules that are not negotiable (no PSP SDK in core or a browser entry, no amount from the client). `pnpm check` must pass.

## License

MIT. Tenderlane is an independent project, not affiliated with or endorsed by TanStack, Stripe or Polar.
