import { createRulesRouter } from '@tenderlane/core';

/**
 * Which provider and flow a checkout uses, as data. The browser evaluates
 * these rules to render the right UI; the server evaluates the same rules to
 * refuse a request for any other provider.
 */
export const routing = createRulesRouter({
  rules: [
    {
      id: 'ch-inline',
      description: 'Switzerland pays in the page with the Stripe Payment Element',
      when: { country: 'CH' },
      use: { provider: 'stripe', flow: 'inline' },
    },
    {
      id: 'eu-hosted',
      description: 'The rest of the EU is sent to Stripe Checkout',
      when: { country: { in: ['DE', 'FR', 'NL'] } },
      use: { provider: 'stripe', flow: 'hosted' },
    },
    {
      id: 'us-polar',
      description: 'The US is sent to Polar, which acts as merchant of record',
      when: { country: 'US' },
      use: { provider: 'polar', flow: 'hosted' },
    },
  ],
  fallback: { provider: 'demo', flow: 'hosted' },
});
