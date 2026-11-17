import { describe, it, expectTypeOf } from 'vitest';
import { defineBrowserProvider, defineServerAdapter } from '../../src/adapters/index.js';
import type {
  InferProviderId,
  InferProviderIds,
  ServerProviderAdapter,
  TenderlaneMiddleware,
} from '../../src/index.js';

const acme = defineBrowserProvider({
  id: 'acme',
  capabilities: {
    provider: 'acme',
    flows: ['checkout-session'],
    paymentMethods: ['card'],
    supports: {},
  },
  getAvailablePaymentMethods: () => [],
  submit: async () => ({ provider: 'acme', id: 'x', status: 'open' as const }),
});

describe('defineBrowserProvider', () => {
  it('keeps the provider id as a literal', () => {
    expectTypeOf(acme.id).toEqualTypeOf<'acme'>();
    expectTypeOf<InferProviderId<typeof acme>>().toEqualTypeOf<'acme'>();
  });

  it('composes with other providers in InferProviderIds', () => {
    const other = defineBrowserProvider({ ...acme, id: 'globex' });
    expectTypeOf<InferProviderIds<[typeof acme, typeof other]>>().toEqualTypeOf<
      'acme' | 'globex'
    >();
  });
});

describe('defineServerAdapter', () => {
  it('types the action parameter as the union of declared actions', () => {
    const adapter = defineServerAdapter({
      id: 'acme',
      actions: ['checkout', 'create-payment-intent'],
      async handle(action) {
        expectTypeOf(action).toEqualTypeOf<'checkout' | 'create-payment-intent'>();
        return { provider: 'acme', id: 'x', status: 'open' };
      },
    });
    expectTypeOf(adapter).toEqualTypeOf<ServerProviderAdapter<'acme'>>();
  });
});

describe('middleware hooks', () => {
  it('has a pending hook distinct from success', () => {
    expectTypeOf<TenderlaneMiddleware>().toHaveProperty('onCheckoutPending');
    expectTypeOf<TenderlaneMiddleware>().toHaveProperty('onCheckoutSuccess');
  });
});
