# @tenderlane/vue

## 0.1.0-alpha.2

### Minor Changes

- [#3](https://github.com/farisaziz12/tenderlane/pull/3) [`82c6610`](https://github.com/farisaziz12/tenderlane/commit/82c66102aedceb0d6e639ed97e258302abb861cd) Thanks [@farisaziz12](https://github.com/farisaziz12)! - Add `@tenderlane/vue` (also `tenderlane/vue`): a plugin (`createTenderlane`), `provideTenderlane`, and the composables `useTenderlane`, `useTenderlaneState`, `useTenderlaneCheckout` and `useTenderlaneContext` over the headless client. Redirect flows only; there is no Vue component for inline payment elements yet.

  `STRIPE_CAPABILITIES` and `POLAR_CAPABILITIES` now report `supports.webhooks: false`. No webhook verification is implemented.

### Patch Changes

- Updated dependencies [[`45f3a47`](https://github.com/farisaziz12/tenderlane/commit/45f3a47ea0f5ab2a68ed67504d55d93e342bdd3a), [`4bfff50`](https://github.com/farisaziz12/tenderlane/commit/4bfff50467656a9ad3584e61cf818abd7eb9ecfd)]:
  - @tenderlane/core@0.1.0-alpha.2
  - @tenderlane/client@0.1.0-alpha.2
