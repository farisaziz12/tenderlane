# Tenderlane

Tenderlane picks the payment provider and checkout flow for each customer, from rules you write once.

Say you take cards through Stripe in Switzerland and send customers in the US to Polar. With Tenderlane you write that down as a short list of rules. Your checkout page reads the rules to show the right payment form. Your server reads the same rules before it creates the payment, and it sets the price, so the browser never sends one.

It works with Stripe and Polar today and has React bindings. It ships no UI: the buttons and forms are yours.

> **Alpha proof of concept.** Not published to npm, not production-ready. See [what does not work yet](#what-does-not-work-yet).

## The problem

As soon as a checkout uses two providers, or two ways of paying with one provider, you write the same `if (country === ...)` three times: where you decide what to render, where you handle the Pay button, and in the API route that creates the payment. Each provider's SDK has its own objects and its own idea of "paid". Nothing checks that your three copies agree, and the price often travels from the browser.

With Tenderlane you make that decision in one place. The browser and the server both read it, and every provider plugs in the same way.

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

Use `hosted` to send the customer to the provider's own page, or `inline` to show the provider's payment form inside yours. A rule that names a provider you did not register does not compile.

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
pnpm test:live   # the Stripe adapter against Stripe test mode; needs STRIPE_TEST_SECRET_KEY
```

## What works

- A rules router, evaluated in the browser and again on the server
- A checkout client with no UI, whose state TypeScript can narrow by status
- React bindings: `TenderlaneProvider`, `useTenderlaneCheckout`, `TenderlaneCheckoutForm`
- Stripe: Checkout (hosted) and PaymentIntent with the Payment Element (inline)
- Polar: hosted checkout, one product per checkout
- Server-side pricing from a catalog you define, or read from Stripe or Polar
- Server-side confirmation: `onCheckoutCreated` records the order under the provider's id, `handler.retrieve()` asks the provider for its status, `handler.webhook()` verifies a provider's webhook and says what it means
- An adapter API for other providers, used by the first-party adapters themselves

## What does not work yet

- Refund, dispute and subscription events. Webhooks are verified and reduced to payment events; storing and deduplicating them is the app's job.
- Subscriptions, refunds, saved payment methods, failover.
- Providers other than Stripe and Polar. Polar is hosted-only.
- Vue bindings cover hosted flows only and have no example.
- No test in CI runs against a live PSP. A Stripe test-mode suite exists (`pnpm test:live`) and has not been run yet.
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
[Testing](./docs-site/src/content/docs/testing.mdx) ·
[Limitations](./docs-site/src/content/docs/limitations.mdx)

## Contributing

`AGENTS.md` describes the workflow and the rules that are not negotiable (no PSP SDK in core or a browser entry, no amount from the client). `pnpm check` must pass.

## License

MIT. Tenderlane is an independent project, not affiliated with or endorsed by TanStack, Stripe or Polar.
