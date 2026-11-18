import { createRulesRouter } from '@tenderlane/core';

export const routing = createRulesRouter({
  rules: [
    {
      id: 'ch-inline',
      when: { country: 'CH' },
      use: { provider: 'stripe', flow: 'inline', paymentMethods: ['card', 'twint'] },
    },
    {
      id: 'high-value',
      when: { country: { in: ['DE', 'FR', 'NL'] }, amount: { gte: 50_000 } },
      use: { provider: 'stripe', flow: 'hosted' },
    },
  ],
  fallback: { provider: 'stripe', flow: 'hosted' },
});
