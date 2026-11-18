import { createRulesRouter } from '@tenderlane/core';

export const routing = createRulesRouter({
  rules: [
    {
      id: 'ch-inline',
      when: { country: 'CH', currency: 'chf' },
      use: { provider: 'stripe', flow: 'inline', paymentMethods: ['card', 'twint'] },
    },
  ],
  fallback: { provider: 'stripe', flow: 'hosted', paymentMethods: ['card'] },
});

// The checkout page and the server both read this.
// Rules are plain data: keep them in code, a database or a feature flag.
