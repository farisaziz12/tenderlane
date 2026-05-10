# Tenderlane

**Reactive payment orchestration for modern web apps.**

Tenderlane is an isomorphic, framework-aware payment orchestration SDK. It lets frontend and backend applications choose the right payment provider, payment method, and payment UI based on reactive business context.

> Think of it as TanStack-style payment orchestration: headless core, reactive framework bindings, adapter-based provider integrations.

## Why Tenderlane?

Most payment SDKs are backend wrappers: you call `createCheckoutSession()` and that's it. Tenderlane is different.

When your application state changes (country, currency, experiment variant, cart contents, customer type), Tenderlane **reactively re-evaluates routing rules** and updates:

- Selected payment provider
- Available payment methods
- Payment flow (redirect, embedded, custom)
- Checkout component configuration
- Submit behavior

This happens **in the frontend**, with type-safe, serializable routing rules.

## Packages

| Package | Description |
|---------|-------------|
| `@tenderlane/core` | Provider-agnostic types, routing engine, middleware, errors, server handler |
| `@tenderlane/client` | Headless checkout client with reactive state machine |
| `@tenderlane/react` | React bindings (TenderlaneProvider, hooks) |
| `@tenderlane/stripe` | Stripe browser provider + server adapter |

## Quick Start

### React Checkout

```tsx
import { TenderlaneProvider, useTenderlaneCheckout } from "@tenderlane/react";
import { stripeProvider } from "@tenderlane/stripe";
import { createRulesRouter } from "@tenderlane/core";

function App() {
  const [country, setCountry] = useState("CH");
  const [currency, setCurrency] = useState("chf");

  return (
    <TenderlaneProvider
      config={{
        context: {
          country,
          currency,
          amount: 29500,
          experiment: { checkoutRouting: "stripe-first" },
        },
        providers: [
          stripeProvider({
            publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
            serverEndpoint: "/api/payments/stripe",
          }),
        ],
        routing: createRulesRouter({
          rules: [
            {
              id: "ch-card-stripe",
              when: {
                country: "CH",
                currency: "chf",
                experiment: { checkoutRouting: "stripe-first" },
              },
              use: {
                provider: "stripe",
                flow: "checkout-session",
                paymentMethods: ["card", "paypal"],
              },
            },
          ],
          fallback: {
            provider: "stripe",
            flow: "checkout-session",
            paymentMethods: ["card"],
          },
        }),
      }}
    >
      <Checkout />
    </TenderlaneProvider>
  );
}

function Checkout() {
  const checkout = useTenderlaneCheckout();

  return (
    <div>
      <p>Provider: {checkout.selectedProvider}</p>
      {checkout.paymentMethods.map((method) => (
        <button
          key={method.id}
          onClick={() => checkout.selectPaymentMethod(method.id)}
        >
          {method.label}
        </button>
      ))}
      <button
        disabled={!checkout.canSubmit}
        onClick={() =>
          checkout.submit({
            lineItems: [{ name: "Pro Plan", quantity: 1, unitAmount: 29500, currency: "chf" }],
            successUrl: "/success?session_id={CHECKOUT_SESSION_ID}",
            cancelUrl: "/cancel",
          })
        }
      >
        Pay
      </button>
    </div>
  );
}
```

When `country` or `currency` changes, Tenderlane re-evaluates the routing rules and updates the selected provider, payment methods, and checkout behavior.

### Backend Server

```ts
import { createTenderlaneHandler } from "@tenderlane/core/server";
import { stripeServerAdapter } from "@tenderlane/stripe/server";

const handler = createTenderlaneHandler({
  providers: [
    stripeServerAdapter({
      secretKey: process.env.STRIPE_SECRET_KEY!,
    }),
  ],
});

// Next.js App Router
export async function POST(req: Request) {
  return handler.POST(req);
}
```

The server handler uses the Web Request/Response standard. Works with Next.js, Deno, Bun, Cloudflare Workers, and any framework that supports `Request`/`Response`.

## Routing

### Rules Router

Deterministic, serializable routing rules. First match wins.

```ts
import { createRulesRouter } from "@tenderlane/core";

const routing = createRulesRouter({
  rules: [
    {
      id: "dach-stripe",
      when: {
        country: { in: ["CH", "DE", "AT"] },
        currency: { in: ["chf", "eur"] },
        amount: { gte: 1000 },
      },
      use: {
        provider: "stripe",
        flow: "checkout-session",
        paymentMethods: ["card"],
      },
    },
    {
      id: "high-value",
      when: {
        amount: { gte: 50000 },
        customer: { type: "business" },
      },
      use: {
        provider: "stripe",
        flow: "checkout-session",
        paymentMethods: ["card"],
        providerOptions: { allow_promotion_codes: true },
      },
    },
  ],
  fallback: {
    provider: "stripe",
    flow: "checkout-session",
    paymentMethods: ["card"],
  },
});
```

Supported condition operators:
- **Exact match**: `country: "CH"`
- **In list**: `country: { in: ["CH", "DE", "AT"] }`
- **Not in list**: `country: { notIn: ["RU", "CN"] }`
- **Numeric comparison**: `amount: { gte: 1000, lt: 50000 }`
- **Nested objects**: `experiment: { checkoutRouting: "stripe-first" }`

Rules are serializable JSON. You can load them from an API:

```ts
const config = await fetch("/api/payment-config").then((r) => r.json());
const routing = createRulesRouter(config.routing);
```

### Auto Router

Delegate routing decisions to a remote endpoint:

```ts
import { createAutoRouter } from "@tenderlane/core";

const routing = createAutoRouter({
  endpoint: "/api/tenderlane/route",
  fallback: {
    provider: "stripe",
    flow: "checkout-session",
    paymentMethods: ["card"],
  },
  timeoutMs: 3000,
});
```

The auto router sends the payment context to the endpoint and expects a routing decision back. Falls back to the configured fallback on any error or timeout.

## Middleware

Observe lifecycle events for logging, analytics, A/B experiment tracking, and debugging:

```ts
const analytics: TenderlaneMiddleware = {
  name: "analytics",
  onRouteEvaluated({ context, route }) {
    track("payment_route_selected", {
      provider: route.provider,
      country: context.country,
    });
  },
  onCheckoutSuccess({ result }) {
    track("checkout_completed", { paymentId: result.id });
  },
  onCheckoutError({ error }) {
    track("checkout_error", { message: error.message });
  },
};
```

## Provider Adapters

Provider adapters declare their capabilities and implement the checkout flow:

```ts
const stripe = stripeProvider({
  publishableKey: "pk_test_...",
  serverEndpoint: "/api/payments/stripe",
});

stripe.id; // "stripe" (literal type)
stripe.capabilities.flows; // ["checkout-session"]
stripe.capabilities.paymentMethods; // ["card"]
```

Provider IDs are preserved as literal types via phantom type metadata (`~types`), enabling type-safe routing rules.

## Type Safety

Tenderlane uses TanStack-style phantom types for strong TypeScript inference:

```ts
import type { InferProviderId, InferProviderIds } from "@tenderlane/core";

type StripeId = InferProviderId<typeof stripe>; // "stripe"
```

## Architecture

```
@tenderlane/core          (zero external deps)
    |
    +--- @tenderlane/client   (headless state machine)
    |        |
    |        +--- @tenderlane/react  (thin React bindings)
    |
    +--- @tenderlane/stripe   (browser + server adapters)
```

- **Core** contains no provider-specific code
- **Client** is framework-agnostic (uses subscribe/getSnapshot pattern)
- **React** is a thin wrapper using `useSyncExternalStore`
- **Stripe** browser entry never imports the server Stripe SDK
- **Server handler** uses Web Request/Response (framework-agnostic)

## Alpha Status

This is an alpha release. The following is implemented:

- Provider-agnostic core with typed contracts
- Reactive rules-based routing with condition operators
- Auto router interface with remote endpoint support
- Headless checkout client with state machine
- React provider and hooks
- Stripe Checkout Session (redirect flow)
- Framework-agnostic server handler
- Middleware lifecycle hooks
- Typed error hierarchy
- Type inference via phantom types

### Not yet implemented

- Stripe Elements / embedded checkout
- Additional providers (Adyen, Polar.sh, Revolut, Braintree, PayPal)
- Vue, Solid, Svelte bindings
- Webhook verification
- Subscription lifecycle
- Refunds
- Provider failover
- ML-based auto-routing
- DevTools UI

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## License

MIT
