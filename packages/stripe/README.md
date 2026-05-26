# @tenderlane/stripe

Stripe provider adapter for [Tenderlane](https://github.com/farisaziz12/tenderlane).

Split into three entry points so the browser bundle never pulls in the server-only `stripe` SDK:

- `@tenderlane/stripe` — browser entry. Redirect-to-Checkout flow. No `stripe` import.
- `@tenderlane/stripe/server` — server adapter. Imports `stripe`.
- `@tenderlane/stripe/react` — React helpers (Stripe Elements wiring, when shipped).

## Install

```bash
npm install @tenderlane/stripe @tenderlane/core stripe
# Browser-only apps additionally need:
npm install @stripe/stripe-js
```

`stripe` and `@stripe/stripe-js` are peer deps, marked optional, so you only install what you actually use.

## Catalog support

Use `createStripeCatalog` to make Stripe the source of truth for product/price data. The server handler resolves catalog items at submit time, so `unitAmount` never crosses the wire from the client.

## Status

Alpha. Stripe Checkout redirect is implemented; Elements is on the roadmap.

## License

MIT
