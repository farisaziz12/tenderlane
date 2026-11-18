# @tenderlane/vue

Vue 3 bindings for [Tenderlane](../../README.md), over `@tenderlane/client`.

Experimental. Hosted flows only: there is no component for inline payment elements, and no example app. Not published to npm.

```ts
import { createTenderlane, useTenderlaneCheckout, useTenderlaneContext } from '@tenderlane/vue';

app.use(createTenderlane({ context: { country: 'CH' }, providers: [stripe], routing }));

// in a component
const checkout = useTenderlaneCheckout(); // refs: status, route, canSubmit, error, ...
useTenderlaneContext(() => ({ country: country.value })); // re-routes when it changes
```

MIT
