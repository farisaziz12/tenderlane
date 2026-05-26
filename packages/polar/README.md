# @tenderlane/polar

[Polar.sh](https://polar.sh) provider adapter for [Tenderlane](https://github.com/farisaziz12/tenderlane).

Same browser/server boundary as `@tenderlane/stripe`:

- `@tenderlane/polar` — browser entry. Uses `fetch`. No SDK import.
- `@tenderlane/polar/server` — server adapter. Imports `@polar-sh/sdk`.

## Install

```bash
npm install @tenderlane/polar @tenderlane/core @polar-sh/sdk
```

`@polar-sh/sdk` is a peer dep marked optional.

## Flow

Redirect-only in v1. Polar's iframe embed (`@polar-sh/checkout`) is a whole-page iframe rather than a field-level Stripe-Elements analog, so embedded support is deferred.

## Catalog support

`createPolarCatalog` calls the Polar API at resolve time so the Polar dashboard remains the source of truth for product/price data.

## Status

Alpha. APIs may change before `1.0`.

## License

MIT
