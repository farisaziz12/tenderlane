# Tenderlane — agent instructions

Tenderlane picks the payment provider and checkout flow for each customer, from rules the app
writes once. The browser reads the rules to show the right payment form; the server reads them
again, sets the price and confirms the payment. It is an alpha proof of concept: keep it small
and say only what is true. Vocabulary is law: [`docs/CONTEXT.md`](docs/CONTEXT.md). Use its words
in code, tests, commits and PRs.

## Non-negotiables

1. **No amount comes from the browser.** `CheckoutInput` has no price field. The handler deletes
   any `unitAmount`, prices from its own catalog, and builds the adapter payload field by field
   from validated values. Nothing else in a request may reach a provider parameter that carries
   money.
2. **No provider object goes to the browser.** The response is
   `{ provider, id, status, url?, clientSecret? }`. Adapter results pass through
   `parseCheckoutResult` on the server and again in the browser.
3. **`complete` means the provider's record says paid.** Not that a page was finished, a redirect
   happened or a browser SDK said so. `processing` (customer done, money not arrived) is never
   folded into `open` or `complete`. A webhook mapping and the `retrieve` mapping for the same
   provider state must agree.
4. **No provider SDK in `@tenderlane/core` or in a browser entry.** Only `*/server` entries
   import `stripe` or `@polar-sh/sdk`. Core names no provider and has no default one.
5. **Types are not loosened to make an error go away.** A rule that targets an unregistered
   provider does not compile; the type tests pin that.
6. **The website says only what exists.** Every code block on it is a file under
   `docs-site/snippets/` or `examples/`, imported with `?raw` and typechecked.

## If the code and the tests disagree

Stop and say so. **Never edit, skip or weaken a test to make it pass.** A test that pins behaviour
you think is wrong is a question for a person, not a line to change.

## Commands

- `pnpm check`: everything below except the live suite. Must pass.
- `pnpm test`: Vitest, including type tests (`*.test-d.ts`).
- `pnpm typecheck`: packages, `e2e`, the example and `docs-site/snippets`.
- `pnpm lint`: oxlint, warnings are errors.
- `pnpm test:words`: the copy rules in `docs/writing.md`.
- `pnpm test:hidden-code`: fails on a source line too long to have been written by hand.
- `pnpm test:build`: publint on every package.
- `pnpm test:journey`: drives the example in a real browser and captures evidence.
- `pnpm test:live`: the Stripe adapter against Stripe test mode. Needs `STRIPE_TEST_SECRET_KEY`;
  not part of `check` or CI.
- `pnpm example`: build the packages and run the example on :3000.

## Where things are

| Path | Holds | Rule |
| --- | --- | --- |
| `packages/core` | Contracts, rules router, catalogs, errors; `/server` handler; `/adapters` | No dependencies. No provider names. |
| `packages/client` | The checkout client: status, `prepare`, `submit` | No UI, no HTTP of its own |
| `packages/react`, `packages/vue` | Framework bindings over the client | No business logic. Vue: hosted flow only |
| `packages/stripe`, `packages/polar` | One provider each: browser entry, `/server`, Stripe also `/react` | Only what `core/adapters` exports |
| `examples/react-checkout-multi-psp` | The one example, with the demo provider | Runs with no keys |
| `e2e` | One checkout through three adapters, SDKs mocked; `live/` against Stripe test mode | |
| `docs-site` | The website; `snippets/` holds its code | Follows `docs/writing.md` |
| `docs` | `CONTEXT.md` (words), `writing.md` (copy) | |

Each package has its own `CLAUDE.md` with the rules for that folder: the handler's order of
operations, the client's invariants, each adapter's status mapping. Read it before editing there.
It adds to this file and does not repeat it.

## Scope

Do only what was asked. No speculative abstractions, no new dependencies without asking, no new
flow or status without an adapter that implements it. If something nearby looks wrong, mention
it; don't fix it. Not built, and not to be implied: refunds, disputes, subscriptions, failover,
other providers, webhook storage or deduplication, npm releases.
`docs-site/src/content/docs/limitations.mdx` is the public list; keep it true.

## Style

- ESM only, `.js` extensions in imports, TypeScript strict with `noUncheckedIndexedAccess`.
- No `any`, no non-null assertions in `src/`. A cast where an adapter calls an SDK needs a comment
  saying why.
- Full words for names: `provider` not `p`, `context` not `ctx`, `error` not `err`, `result` not
  `res`, `parameters` not `params`.
- Errors extend `TenderlaneError` with a `code`. An error from another package is matched with
  `hasErrorCode`, not `instanceof`.
- Tests live in `__tests__/` mirroring `src/`. A change to `packages/*/src` needs a test that
  fails without it, and a changeset.
- Comments explain why, never what.

## Writing

Anything a person reads follows [`docs/writing.md`](docs/writing.md): talk to the reader, active
voice, start with something they can picture, no claims we can't stand behind, no em dashes.
`pnpm test:words` checks what can be checked; read the page aloud for the rest.

## Commits and PRs

Conventional commits. Before a PR:

1. **Verify.** `pnpm check` on the commit you push; keep what it printed.
2. **Review.** A reviewer with a fresh context runs the `payment-review` skill over
   `git diff origin/main...HEAD`: findings with `file:line`, a concrete failure, and a tag
   (Important, Nit, Pre-existing). Fix every Important one everywhere its kind occurs. At most
   three rounds; record the counts.
3. **Show it.** A change to `docs-site/` or `examples/` needs a before and an after screenshot
   (`visual-evidence` skill). A library change shows one input and output, a type error, or a
   test that failed and now passes.
4. **Open it** with `.github/pull_request_template.md` (`open-pr` skill): under 100 visible words,
   the rest in the collapsed block. `pr-rules` checks this.

Never approve or merge. Never use live provider keys.

Config files are code: `main` was once force-pushed with a payload hidden after thousands of
spaces in `next.config.ts` and `astro.config.mjs`. Read the whole line before trusting a config
diff.
