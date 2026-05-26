# @tenderlane/core

Core types, routing engine, middleware, catalog primitive, error hierarchy, and server handler for [Tenderlane](https://github.com/farisaziz12/tenderlane).

Zero runtime dependencies. Provider-agnostic. Must never import a PSP SDK.

## Install

```bash
npm install @tenderlane/core
```

## What's in here

- Contracts and types shared by every package
- `createRouter` (rules-based routing across PSPs)
- `defineCatalog`, `createInlineCatalog`, `createRemoteCatalog`
- Middleware runner + lifecycle hooks
- `TenderlaneError` hierarchy with typed `code`
- `createTenderlaneHandler` — Web `Request`/`Response` server handler

## Usage

Most users install [`tenderlane`](https://www.npmjs.com/package/tenderlane) (the meta package) and never import `@tenderlane/core` directly. Reach for this package when you're building a custom provider adapter or need the contracts without any provider code.

## Status

Alpha. APIs may change before `1.0`.

## License

MIT
