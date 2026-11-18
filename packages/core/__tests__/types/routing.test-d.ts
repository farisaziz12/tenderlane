import { expectTypeOf, test } from 'vitest';
import { createRulesRouter } from '../../src/index.js';
import { createTenderlaneHandler } from '../../src/server/index.js';
import { defineServerAdapter } from '../../src/adapters/index.js';
import type { Router, RulesRouter, SelectedPaymentRoute } from '../../src/index.js';

const stripeAdapter = defineServerAdapter({
  id: 'stripe',
  actions: ['checkout'],
  handle: async () => ({ provider: 'stripe', id: 'cs_1', status: 'open' }),
});

test('createRulesRouter infers the provider ids it can select', () => {
  const routing = createRulesRouter({
    rules: [{ id: 'us', when: { country: 'US' }, use: { provider: 'polar', flow: 'hosted' } }],
    fallback: { provider: 'stripe', flow: 'hosted' },
  });

  expectTypeOf(routing).toEqualTypeOf<RulesRouter<'polar' | 'stripe'>>();
  expectTypeOf(routing).toMatchTypeOf<Router<'polar' | 'stripe'>>();
  // Synchronous: no await needed to read the route.
  expectTypeOf(routing.evaluate({})).toEqualTypeOf<SelectedPaymentRoute<'polar' | 'stripe'>>();
});

test('a rule rejects a flow that does not exist', () => {
  createRulesRouter({
    rules: [],
    // @ts-expect-error 'embedded' is not a PaymentFlow
    fallback: { provider: 'stripe', flow: 'embedded' },
  });
});

test('a rule rejects a currency code that is not ISO 4217', () => {
  createRulesRouter({
    rules: [
      {
        id: 'typo',
        // @ts-expect-error 'gpb' is a typo for 'gbp'
        when: { currency: 'gpb' },
        use: { provider: 'stripe', flow: 'hosted' },
      },
    ],
    fallback: { provider: 'stripe', flow: 'hosted' },
  });
});

test('the server handler rejects a router that targets an unregistered adapter', () => {
  const routing = createRulesRouter({
    rules: [{ id: 'us', when: { country: 'US' }, use: { provider: 'polar', flow: 'hosted' } }],
    fallback: { provider: 'stripe', flow: 'hosted' },
  });

  createTenderlaneHandler({
    providers: [stripeAdapter],
    // @ts-expect-error the router can select 'polar', which has no adapter here
    routing,
  });
});

test('the server handler accepts catalogs and options only for registered adapters', () => {
  createTenderlaneHandler({
    providers: [stripeAdapter],
    providerOptions: { stripe: { locale: 'de' } },
  });

  createTenderlaneHandler({
    providers: [stripeAdapter],
    // @ts-expect-error 'polar' is not a registered adapter
    providerOptions: { polar: {} },
  });
});

test('retrieve accepts only registered provider ids', () => {
  const handler = createTenderlaneHandler({ providers: [stripeAdapter] });

  expectTypeOf(handler.retrieve).parameter(0).toEqualTypeOf<'stripe'>();
  // @ts-expect-error 'polar' is not a registered adapter
  void handler.retrieve('polar', 'co_1');
});


test('onCheckoutCreated receives a provider id that retrieve accepts', () => {
  const handler = createTenderlaneHandler({
    providers: [stripeAdapter],
    onCheckoutCreated: (event) => {
      expectTypeOf(event.provider).toEqualTypeOf<'stripe'>();
      void handler.retrieve(event.provider, event.result.id);
    },
  });
});

test('a webhook event narrows on its type and carries a registered provider id', () => {
  const handler = createTenderlaneHandler({ providers: [stripeAdapter] });

  handler.webhook('stripe', (event) => {
    expectTypeOf(event.provider).toEqualTypeOf<'stripe'>();
    if (event.type === 'unhandled') {
      // @ts-expect-error an unhandled event is not about a checkout
      void event.checkoutId;
    } else {
      expectTypeOf(event.checkoutId).toEqualTypeOf<string>();
      void handler.retrieve(event.provider, event.checkoutId);
    }
  });

  // @ts-expect-error 'polar' is not a registered adapter
  handler.webhook('polar', () => undefined);
});
