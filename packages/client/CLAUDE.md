# @tenderlane/client

The headless checkout state machine. Depends only on `@tenderlane/core`.

```
src/
  client.ts   createTenderlaneClient()
  types.ts    TenderlaneClientState (discriminated union), TenderlaneClientConfig, TenderlaneClient
```

## State

```
idle → evaluating → ready ─(inline: preparing → prepared)→ submitting → success | redirecting | pending
            ↘ error                  ↘ error                              ↘ error (route kept; submit again)
```

`TenderlaneClientState` is a union on `status`; each variant says which of `route`, `providerSession`, `checkoutResult`, `error` are non-null. Every transition goes through `setState(next)` with a complete variant, so the compiler checks it. `selectedProvider` and `canSubmit` are derived in `derive()` and never set by hand.

## Invariants (each has a test in `__tests__/client-state.test.ts`)

- One submit at a time (`submitInFlight`).
- An inline route needs a session: `canSubmit` is false and `submit()` throws `INVALID_STATE` until `prepare()` succeeded.
- A new evaluation or `prepare()` drops the previous session before doing anything else.
- `updateContext` and `reset` during a submit are deferred until it settles.
- Async results are discarded when `evaluationVersion` has moved on.
- `success` only for `result.status === 'complete'`. A result with a `url` is `redirecting`; otherwise `pending`. `failed` and `expired` are errors.
- A failed submit keeps the route and session, so it can be retried.

`getSnapshot()` returns the same reference until the next transition (required by `useSyncExternalStore`).
