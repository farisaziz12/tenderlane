---
name: payment-review
description: Review a Tenderlane change for price integrity, provider boundaries, checkout state-machine correctness and provider neutrality. Use when reviewing a diff, branch or PR that touches packages/, the server handler, a catalog, a provider adapter, the client state machine or React bindings, or when asked whether a change is safe to merge.
argument-hint: "[file, diff, branch or PR to review]"
---

# Reviewing a Tenderlane change

$ARGUMENTS

Review the diff against the whole repository, not only the changed lines. Work through the sections in order. For each finding give `file:line`, a concrete failure (input, state, wrong result) and the smallest fix, and tag it Important, Nit or Pre-existing. Skip style. Start with the count of findings and say plainly when there are none. If a section does not apply, say so and move on.

## 1. Authority over money

- Can any value from the request body change what is charged? Check every field the handler forwards to an adapter, not only `unitAmount`: `providerOptions`, `metadata`, `context`, `paymentMethods`, `lineItems`, `successUrl`.
- Is anything from the client merged into PSP parameters after the server resolved the price?
- Does pricing depend on `context` the client sent, with no server-side derivation?
- Is there a path where no catalog runs (legacy `lineItems`, a provider missing from `catalogs`)?
- Are `sku` and `quantity` validated (own property, positive integer, bounded) before use?

## 2. Boundaries

- Does `@tenderlane/core` import a PSP SDK, a framework, or anything with a runtime dependency?
- Does a browser entry (`@tenderlane/stripe`, `@tenderlane/polar`) import a server SDK, statically or transitively?
- Does `@tenderlane/react` hold business logic that belongs in `@tenderlane/client`?
- Does a core type or API name a specific provider, or make one the default?

## 3. State machine

- Can every state be left? Check `error` and `idle` in particular: is retry possible after a decline?
- Can two submits run at once, including after `updateContext()` during `submitting`?
- Is `success` set only when the payment is known to be complete, not when a redirect URL was created?
- Does a re-evaluation discard a provider session or the user's selected payment method without cause?
- Is the snapshot replaced immutably and stable between changes (`useSyncExternalStore`)?
- Do effects survive React StrictMode's double invocation?

## 4. Idempotency and failure

- Does a retry, re-render or re-prepare create a second PaymentIntent or session?
- Is a timeout or lost connection reported as a failed payment?
- Do 4xx responses mean a malformed request and 5xx a server fault? Is a PSP error message leaked to the browser?

## 5. Adapter parity

- Does the adapter honour `quantity`, multiple items and currency the way the PSP's API actually defines them? Read the installed SDK's types rather than trusting a cast through `unknown`.
- Is every declared config field used?

## 6. Types and repository rules

- Do literal provider ids, SKUs and flows survive inference? Is there a `.test-d.ts` for a changed public type?
- ESM only, `.js` import extensions, full variable names (no `ctx`, `err`, `mw`, `params`).
- Does a change to `packages/*/src` come with a test that fails without it, and a changeset?

Run `pnpm check` before you conclude, and report what they actually printed.
