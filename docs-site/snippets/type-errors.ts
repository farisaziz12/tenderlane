import { createTenderlaneClient } from '@tenderlane/client';
import { createRulesRouter } from '@tenderlane/core';
import { stripeProvider } from '@tenderlane/stripe';

const stripe = stripeProvider({ publishableKey: 'pk_test_...', serverEndpoint: '/api/payments' });

createRulesRouter({
  rules: [
    {
      id: 'uk',
      // @ts-expect-error Type '"gpb"' is not assignable to type 'CurrencyCondition'.
      when: { currency: 'gpb' },
      use: { provider: 'stripe', flow: 'hosted' },
    },
  ],
  // @ts-expect-error Type '"embedded"' is not assignable to type 'PaymentFlow'.
  fallback: { provider: 'stripe', flow: 'embedded' },
});

createTenderlaneClient({
  context: {},
  providers: [stripe],
  // @ts-expect-error Type '"stripe" | "polar"' is not assignable to type '"stripe"'.
  routing: createRulesRouter({
    rules: [{ id: 'us', when: { country: 'US' }, use: { provider: 'polar', flow: 'hosted' } }],
    fallback: { provider: 'stripe', flow: 'hosted' },
  }),
});
