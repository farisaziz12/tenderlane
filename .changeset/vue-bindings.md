---
'@tenderlane/vue': minor
'tenderlane': minor
---

Add `@tenderlane/vue` (also `tenderlane/vue`): a plugin (`createTenderlane`), `provideTenderlane`, and the composables `useTenderlane`, `useTenderlaneState`, `useTenderlaneCheckout` and `useTenderlaneContext` over the headless client. Redirect flows only; there is no Vue component for inline payment elements yet.

`STRIPE_CAPABILITIES` and `POLAR_CAPABILITIES` now report `supports.webhooks: false`. No webhook verification is implemented.
