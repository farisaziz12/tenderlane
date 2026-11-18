import { expectTypeOf, test } from 'vitest';
import { createRulesRouter } from '@tenderlane/core';
import { defineBrowserProvider } from '@tenderlane/core/adapters';
import type {
  CheckoutResult,
  ProviderSession,
  SelectedPaymentRoute,
  TenderlaneError,
} from '@tenderlane/core';
import { createTenderlaneClient } from '../../src/index.js';
import type { TenderlaneClientState } from '../../src/index.js';

function provider<const TId extends string>(id: TId) {
  return defineBrowserProvider({
    id,
    capabilities: { flows: ['hosted'], paymentMethods: ['card'] },
    getAvailablePaymentMethods: () => [],
    submit: async () => ({ provider: id, id: 'cs_1', status: 'open' }),
  });
}

const stripe = provider('stripe');
const polar = provider('polar');

test('accepts a router whose targets are all registered', () => {
  createTenderlaneClient({
    context: {},
    providers: [stripe, polar],
    routing: createRulesRouter({
      rules: [{ id: 'us', when: { country: 'US' }, use: { provider: 'polar', flow: 'hosted' } }],
      fallback: { provider: 'stripe', flow: 'hosted' },
    }),
  });
});

test('accepts a router that uses only some of the providers', () => {
  createTenderlaneClient({
    context: {},
    providers: [stripe, polar],
    routing: createRulesRouter({ rules: [], fallback: { provider: 'stripe', flow: 'hosted' } }),
  });
});

test('rejects a router that targets a provider that is not registered', () => {
  const routing = createRulesRouter({
    rules: [{ id: 'us', when: { country: 'US' }, use: { provider: 'polar', flow: 'hosted' } }],
    fallback: { provider: 'stripe', flow: 'hosted' },
  });

  createTenderlaneClient({
    context: {},
    providers: [stripe],
    // @ts-expect-error the router can select 'polar', which is not in `providers`
    routing,
  });
});

test('rejects a misspelled provider id in an inline router', () => {
  createTenderlaneClient({
    context: {},
    providers: [stripe],
    routing: createRulesRouter({
      rules: [],
      // @ts-expect-error 'strpe' is not a registered provider
      fallback: { provider: 'strpe', flow: 'hosted' },
    }),
  });
});

test('status narrows the state', () => {
  const state = {} as TenderlaneClientState;

  if (state.status === 'error') {
    expectTypeOf(state.error).toEqualTypeOf<TenderlaneError>();
    expectTypeOf(state.checkoutResult).toEqualTypeOf<null>();
  }
  if (state.status === 'prepared') {
    expectTypeOf(state.providerSession).toEqualTypeOf<ProviderSession>();
    expectTypeOf(state.route).toEqualTypeOf<SelectedPaymentRoute>();
  }
  if (state.status === 'success' || state.status === 'redirecting' || state.status === 'pending') {
    expectTypeOf(state.checkoutResult).toEqualTypeOf<CheckoutResult>();
    expectTypeOf(state.error).toEqualTypeOf<null>();
  }
  if (state.status === 'ready') {
    expectTypeOf(state.route).toEqualTypeOf<SelectedPaymentRoute>();
    expectTypeOf(state.providerSession).toEqualTypeOf<null>();
  }
});
