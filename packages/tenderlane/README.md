# tenderlane

Reactive, frontend-first payment orchestration for modern web apps. The meta package — installs every Tenderlane subpackage and re-exports each one behind a stable subpath import.

```bash
npm install tenderlane
```

## Subpath imports

```ts
import { createRouter, defineCatalog } from "tenderlane";          // core
import { createCheckoutClient }         from "tenderlane/client";  // headless client
import { TenderlaneProvider, useCheckout } from "tenderlane/react"; // React bindings
import { createTenderlaneHandler }    from "tenderlane/server";    // server handler
import { stripeProvider }            from "tenderlane/stripe";     // Stripe browser
import { stripeServerProvider }     from "tenderlane/stripe/server"; // Stripe server
import { polarProvider }            from "tenderlane/polar";       // Polar browser
import { polarServerProvider }     from "tenderlane/polar/server"; // Polar server
```

Peer dependencies are all optional — install only the PSP SDKs and framework you actually use.

## Why a meta package?

Internal packages (`@tenderlane/core`, `@tenderlane/client`, `@tenderlane/react`, `@tenderlane/stripe`, `@tenderlane/polar`) ship independently for users who want fine-grained control over their dependency tree. The `tenderlane` meta package is the recommended install — one dep, one version, no surprises.

## Status

Alpha (`0.1.0-alpha.x`). Published under the `alpha` dist-tag — install with `npm install tenderlane@alpha` if `latest` isn't pointing here yet.

## Docs

See the [project README](https://github.com/farisaziz12/tenderlane#readme) and [docs site](https://github.com/farisaziz12/tenderlane).

## License

MIT
