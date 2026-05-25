# Tenderlane

**Reactive payment orchestration for modern web apps.**

Tenderlane is an isomorphic, framework-aware payment orchestration SDK. It lets frontend and backend applications choose the right payment provider, payment method, and payment UI based on reactive business context.

> TanStack-style payment orchestration: headless core, reactive framework bindings, adapter-based provider integrations.

## Install

```bash
pnpm add tenderlane
```

One package, tree-shakeable subpath exports. Only import what you need:

```ts
import { createRulesRouter } from 'tenderlane';
import { TenderlaneProvider, useTenderlaneCheckout } from 'tenderlane/react';
import { stripeProvider } from 'tenderlane/stripe';
import { createTenderlaneHandler } from 'tenderlane/server';
import { stripeServerAdapter } from 'tenderlane/stripe/server';
```

## Why Tenderlane?

Most payment SDKs are backend wrappers: you call `createCheckoutSession()` and that's it. Tenderlane is different.

When your application state changes (country, currency, experiment variant, cart contents, customer type), Tenderlane **reactively re-evaluates routing rules** and updates:

- Selected payment provider
- Available payment methods
- Payment flow (redirect, inline Elements, embedded)
- Checkout component configuration
- Submit behavior

This happens **in the frontend**, with type-safe, serializable routing rules.

## Quick Start

### React Checkout

```tsx
import { TenderlaneProvider, TenderlaneCheckoutForm } from 'tenderlane/react';
import { stripeProvider } from 'tenderlane/stripe';
import { StripePaymentElement } from 'tenderlane/stripe/react';
import { createRulesRouter } from 'tenderlane';

const stripe = stripeProvider({
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  serverEndpoint: '/api/payments/stripe',
});

function App() {
  const [country, setCountry] = useState('CH');
  const [currency, setCurrency] = useState('chf');

  return (
    <TenderlaneProvider
      config={{
        context: { country, currency, amount: 2900 },
        providers: [stripe],
        routing: createRulesRouter({
          rules: [
            {
              id: 'ch-inline',
              when: { country: 'CH', currency: 'chf' },
              use: { provider: 'stripe', flow: 'payment-intent', paymentMethods: ['card', 'twint'] },
            },
          ],
          fallback: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
        }),
      }}
    >
      <TenderlaneCheckoutForm
        input={{
          lineItems: [{ name: 'Pro Plan', quantity: 1, unitAmount: 2900, currency }],
          successUrl: '/success',
          cancelUrl: '/cancel',
        }}
        elements={{ stripe: StripePaymentElement }}
      >
        {({ canSubmit, submit, status, error }) => (
          <>
            {error && <p>{error.message}</p>}
            <button disabled={!canSubmit} onClick={submit}>
              {status === 'submitting' ? 'Processing...' : 'Pay'}
            </button>
          </>
        )}
      </TenderlaneCheckoutForm>
    </TenderlaneProvider>
  );
}
```

When `country` or `currency` changes, Tenderlane re-evaluates routing rules, creates a new PaymentIntent if needed, and reactively updates the checkout UI.

### Server Endpoint

```ts
import { createTenderlaneHandler } from 'tenderlane/server';
import { stripeServerAdapter } from 'tenderlane/stripe/server';

const handler = createTenderlaneHandler({
  providers: [
    stripeServerAdapter({ secretKey: process.env.STRIPE_SECRET_KEY! }),
  ],
});

// Next.js App Router
export async function POST(request: Request) {
  return handler.POST(request);
}
```

Uses the Web `Request`/`Response` standard. Works with Next.js, Deno, Bun, Cloudflare Workers.

## Subpath Exports

| Import | What you get |
|--------|-------------|
| `tenderlane` | Core types, routing engine, catalog primitive, middleware, errors |
| `tenderlane/client` | Headless checkout client with state machine |
| `tenderlane/react` | TenderlaneProvider, hooks, TenderlaneCheckoutForm |
| `tenderlane/server` | Framework-agnostic server request handler |
| `tenderlane/stripe` | Stripe browser provider |
| `tenderlane/stripe/server` | Stripe server adapter (Checkout Sessions + PaymentIntents) |
| `tenderlane/stripe/react` | StripePaymentElement (lazy-loaded) |
| `tenderlane/polar` | Polar.sh browser provider |
| `tenderlane/polar/server` | Polar.sh server adapter (hosted Checkout) |

All peer dependencies (react, stripe, @stripe/stripe-js, @polar-sh/sdk) are optional — only needed when importing the relevant subpath.

## Routing

### Rules Router

Deterministic, serializable, type-safe routing rules. First match wins.

```ts
import { createRulesRouter } from 'tenderlane';

const routing = createRulesRouter({
  rules: [
    {
      id: 'dach-stripe',
      when: {
        country: { in: ['CH', 'DE', 'AT'] },
        currency: { in: ['chf', 'eur'] },
        amount: { gte: 1000 },
      },
      use: {
        provider: 'stripe',
        flow: 'checkout-session',
        paymentMethods: ['card'],
      },
    },
  ],
  fallback: {
    provider: 'stripe',
    flow: 'checkout-session',
    paymentMethods: ['card'],
  },
});
```

Condition operators: exact match, `{ in: [...] }`, `{ notIn: [...] }`, `{ gt, gte, lt, lte }`, nested objects.

Provider, flow, and payment method fields are type-checked — typos are caught at compile time:

```ts
// TS2820: Type '"stripee"' is not assignable to type 'KnownProviderId'.
//         Did you mean '"stripe"'?
```

### Auto Router

Delegate routing to a remote endpoint:

```ts
import { createAutoRouter } from 'tenderlane';

const routing = createAutoRouter({
  endpoint: '/api/tenderlane/route',
  fallback: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
  timeoutMs: 3000,
});
```

## Payment Flows

| Flow | How it works |
|------|-------------|
| `checkout-session` | Server creates Stripe Checkout Session → browser redirects to Stripe-hosted page |
| `payment-intent` | Server creates PaymentIntent → Stripe Elements renders inline → in-page confirmation |

The `TenderlaneCheckoutForm` handles both automatically — it auto-prepares PaymentIntents for inline flows and renders the registered element component.

## Middleware

```ts
const analytics: TenderlaneMiddleware = {
  name: 'analytics',
  onRouteEvaluated({ context, route }) {
    track('route_selected', { provider: route.provider, country: context.country });
  },
  onCheckoutSuccess({ result }) {
    track('checkout_completed', { paymentId: result.id });
  },
  onCheckoutError({ error }) {
    track('checkout_error', { message: error.message });
  },
};
```

## Type Safety

Country codes, currency codes, payment methods, provider IDs, and flows all have IntelliSense autocomplete with typo protection:

```ts
// Autocompletes with 'US', 'CH', 'DE', etc.
context: { country: 'CH', currency: 'chf' }

// Autocompletes with 'card', 'paypal', 'twint', 'sepa_debit', etc.
paymentMethods: ['card', 'twint']
```

Provider adapters carry phantom type metadata (`~types`) for compile-time type inference:

```ts
import type { InferProviderId, InferPaymentMethods } from 'tenderlane';

type Id = InferProviderId<typeof stripe>;          // "stripe"
type Methods = InferPaymentMethods<typeof stripe>; // "card" | "paypal" | "link" | ...
```

## Architecture

```
tenderlane                    (single package, subpath exports)
  ├── tenderlane              (core: types, routing, middleware, errors)
  ├── tenderlane/client       (headless checkout state machine)
  ├── tenderlane/react        (React bindings via useSyncExternalStore)
  ├── tenderlane/server       (Web Request/Response handler)
  ├── tenderlane/stripe       (browser provider, lazy Stripe.js)
  ├── tenderlane/stripe/server (Checkout Sessions + PaymentIntents)
  └── tenderlane/stripe/react  (StripePaymentElement, lazy-loaded)
```

## Catalog (provider-agnostic products)

Tenderlane's **catalog primitive** is what makes the library work across PSPs with fundamentally different product models. Stripe accepts inline `price_data`; Polar requires pre-created product IDs; your own database might be the source of truth. A `Catalog` resolves `{ sku, quantity }` into canonical pricing the active PSP can charge against.

```ts
import { createInlineCatalog, defineCatalog, createRemoteCatalog } from 'tenderlane';
import { createStripeCatalog } from 'tenderlane/stripe/server';
import { createPolarCatalog } from 'tenderlane/polar/server';

// 1. Inline — pure, isomorphic, shareable code
const inline = createInlineCatalog({
  'pro-plan': {
    name: 'Pro Plan',
    pricing: (context) => ({
      amount: context.currency === 'eur' ? 2700 : 2900,
      currency: context.currency ?? 'usd',
    }),
    providerRefs: { stripe: { priceId: 'price_xxx' }, polar: { productId: 'polar_prod_yyy' } },
  },
});

// 2. Remote — client stub, server-side resolution (production default)
const remote = createRemoteCatalog({ endpoint: '/api/tenderlane/resolve' });

// 3. Custom — server-only, backed by your DB / CMS
const custom = defineCatalog({
  async resolve(items, context) { /* hit your DB, return ResolvedCatalogItem[] */ },
});

// 4. PSP-sourced — server-only, PSP API is the source of truth for pricing
const stripeSourced = createStripeCatalog({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  skus: { 'pro-plan': { priceId: 'price_xxx' } },
});
const polarSourced = createPolarCatalog({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  organizationId: process.env.POLAR_ORG_ID!,
  server: 'sandbox',
  skus: { 'pro-plan': { productId: 'polar_prod_yyy' } },
});
```

`createTenderlaneHandler` accepts a `catalogs: Record<ProviderId, Catalog>` map for per-provider dispatch — when routing picks Stripe, `catalogs.stripe` runs and the Stripe Price is canonical; when routing picks Polar, `catalogs.polar` runs and Polar's product is canonical. Top-level `catalog` is the fallback + the target for the `/resolve` route.

**Price integrity**: `unitAmount` never crosses the wire from client to server. The wire payload is `{ items: [{ sku, quantity }], context, ... }`. The client says *what*; the server runs its own `catalog.resolve()` and decides *for how much*. Forged amounts are stripped before resolution.

## Alpha Status

**Implemented:**
- Reactive rules-based and auto routing with typed condition operators
- Provider-agnostic catalog primitive with `createInlineCatalog`, `createRemoteCatalog`, `defineCatalog`
- PSP-sourced catalogs: `createStripeCatalog` (calls `stripe.prices.retrieve`), `createPolarCatalog` (calls `polar.products.get`)
- Per-provider catalog dispatch: `catalogs: Record<ProviderId, Catalog>` on `createTenderlaneHandler`
- Server-canonical pricing (client never declares `unitAmount`)
- Headless checkout client with state machine (idle → evaluating → ready → preparing → prepared → submitting → success/error)
- React provider, hooks, and `TenderlaneCheckoutForm` container
- Stripe Checkout (redirect) and PaymentIntent (Elements) flows; prefers pre-created `priceId` when declared on the catalog, falls back to inline `price_data`
- Polar.sh hosted Checkout (redirect-only); requires `providerRefs.polar.productId` on resolved items
- Lazy-loaded Stripe.js and Elements (zero bundle impact for redirect flows)
- Polar browser bundle ships zero bytes of `@polar-sh/sdk`
- Framework-agnostic server handler with built-in `/resolve` route for remote catalogs
- Middleware lifecycle hooks (incl. `onCatalogResolved`)
- Typed errors (`CatalogError` carries the offending SKU + provider)
- Type-safe provider/method/flow/country/currency fields

**Not yet implemented:**
- Additional providers (Adyen, Revolut, Braintree, PayPal)
- Polar iframe embedded flow (`@polar-sh/checkout`)
- Vue, Solid, Svelte bindings
- Webhook verification (Polar fulfillment is webhook-driven; wire `@polar-sh/sdk/webhooks` directly for now)
- Subscriptions, refunds
- Provider failover
- ML-based auto-routing

## Development

```bash
pnpm install
pnpm build        # Build all packages
pnpm test         # Run all tests (98 tests)
pnpm dev          # Watch mode (all packages + example)
pnpm docs:dev     # Starlight docs site at localhost:4321
```

## License

MIT
