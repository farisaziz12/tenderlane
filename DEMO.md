# Demo walkthrough (about 5 minutes)

A script for showing Tenderlane to developers who have not seen it. Everything shown is in this repository and runs locally.

Tenderlane is an independent project being put forward as a possible starting point for a payments library in the TanStack ecosystem. It is not a TanStack project and is not endorsed by TanStack.

## Before you start

```bash
pnpm install
pnpm example          # terminal 1: http://localhost:3000
```

Open three files in your editor, all under `examples/react-checkout-multi-psp/app/`:
`checkout/routing.ts`, `checkout/server.ts`, `demo-psp/server.ts`.

Decide which version you are showing and say so up front:

| Setup | What is real | What is not |
| --- | --- | --- |
| No keys (default) | Router, client state machine, wire format, server handler, catalog pricing, redirect round trip | The PSP. The demo PSP is a page inside the example. No money moves. |
| Stripe test keys in `.env.local` | All of the above, plus Stripe's API, Checkout page and Payment Element in test mode | Polar (needs its own sandbox keys). Stripe's webhooks, unless you also run `stripe listen` and set `STRIPE_WEBHOOK_SECRET`. |

Nobody has run the Stripe or Polar paths in CI. If you show them, you are showing them live.

## 1. The problem (30 seconds)

Say: a checkout with more than one provider, or more than one flow, ends up with the same `if (country === ...)` in the component, in the submit handler and in the API route. Each provider has its own session shape and its own idea of "paid". Nothing checks that the three agree, and the price often travels from the browser.

## 2. What you write (60 seconds)

Show `checkout/routing.ts`.

- Rules are data: `when` this state, `use` this provider and flow. First match wins.
- Two flows: `hosted` (redirect to the provider) and `inline` (the provider's element in your page).
- Change `'stripe'` to `'strpe'` in one rule. `checkout.tsx` stops compiling where the router is handed to a client that has no such provider: `Type '"strpe"' is not assignable to type '"stripe" | "polar" | "demo"'. Did you mean '"stripe"'?` Undo it.

## 3. It runs (90 seconds)

In the browser, with the network tab open:

1. Country is United Kingdom. The route panel shows `fallback / demo / hosted`.
2. Switch to Switzerland. The route becomes `ch-inline / stripe / inline` and the price CHF 29.00, with no request and no reload. That is the router running in the browser. (Without Stripe keys the panel says the route cannot be paid here. With keys, the Payment Element mounts.)
3. Back to United Kingdom. Press Pay. Show the request body: `items: [{ sku, quantity }]`, no amount.
4. You land on the page marked Demo PSP showing $29.00. The server chose that number.
5. Press Pay. You are back on `/success?checkout=demo_…`, which reads **Payment confirmed**. The page did not trust the return. The **learned from** line shows how the shop knows: the demo PSP sent a signed webhook the moment you paid (`handler.webhook`), and the page asked the provider again from the server (`handler.retrieve`). Both go through one update function in `checkout/server.ts`.
6. Start a second checkout and stop on the Demo PSP page. Copy its `session` id from the address bar and open `/success?checkout=<that id>` without paying. It reads **Payment not confirmed yet**.

With Stripe keys: Switzerland, card `4242 4242 4242 4242`, the status goes `prepared → submitting → success`. Germany redirects to Stripe Checkout.

## 4. The server decides, not the browser (60 seconds)

Show `checkout/server.ts` (the handler behind `/api/payments`), then run this in terminal 2:

```bash
# A forged price is ignored: the response still links to a 2900 checkout.
curl -s localhost:3000/api/payments -H 'content-type: application/json' -d '{
  "provider":"demo","action":"checkout",
  "payload":{"items":[{"sku":"pro-plan","quantity":1,"unitAmount":1}],
  "context":{"country":"GB"},
  "successUrl":"http://localhost:3000/success","cancelUrl":"http://localhost:3000/cancel"}}'

# Asking for a provider the rules would not select is refused.
curl -s localhost:3000/api/payments -H 'content-type: application/json' -d '{
  "provider":"demo","action":"checkout",
  "payload":{"items":[{"sku":"pro-plan","quantity":1}],
  "context":{"country":"CH"},
  "successUrl":"http://localhost:3000/success","cancelUrl":"http://localhost:3000/cancel"}}'
```

The first answers 200 with `amount=2900` in the URL. The second answers 400: `Provider "demo" is not the route selected for this context.`

## 5. How it is organised (45 seconds)

Show the package diagram in `README.md`.

- `core` has no dependencies and names no provider.
- `client` is the state machine. React is about 350 lines on top of `subscribe` and `getSnapshot`; Vue is about 150.
- Each provider package has a browser entry and a `/server` entry. The secret key and the PSP's server SDK exist only in the second.
- Show `demo-psp/server.ts`: a whole server adapter, create and look up, in about 50 lines, written with the same `@tenderlane/core/adapters` entry the Stripe and Polar adapters use.

## 6. What is missing (30 seconds)

Say it before someone asks:

- Webhooks stop at verification and five payment events. No refunds, disputes or subscription events, and no storage: deduplication is the app's.
- No subscriptions, refunds or failover.
- Two providers. Polar is hosted-only.
- No live PSP in CI. A Stripe test-mode suite exists (`pnpm test:live`) and has not been run yet.
- Not on npm. The API will change.

## 7. Why this could fit TanStack (30 seconds)

- A headless core with thin framework bindings over an external store, the same shape as Query and Table.
- Type inference does real work: provider ids flow from the adapters you register into the rules you may write.
- Adapters are the extension point, with no privileged provider in core.
- It is a library in the app and the API route, not a service in the payment path.

Open questions worth raising: whether routing belongs in the browser at all for teams that only need one provider, how webhook events should be normalised across providers (verification is easy; a shared vocabulary for "paid" is not), and whether `hosted` and `inline` are the right two flows once a third provider is added.

## If something goes wrong

- Port 3000 is taken: `pnpm --filter nextjs-multi-psp-checkout-example exec next dev --port 3055`, and replace the port in the `curl` commands.
- A Stripe route says the keys are not set: both `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are needed, in `examples/react-checkout-multi-psp/.env.local`, followed by a restart.
- No network: the default demo PSP path needs none.
