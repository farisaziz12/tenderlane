import { describe, it, expect } from 'vitest';
import { createRulesRouter } from '../../src/routing/rules-router.js';

describe('createRulesRouter', () => {
  const fallback = {
    provider: 'stripe',
    flow: 'checkout-session' as const,
    paymentMethods: ['card'],
  };

  it('matches first matching rule', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'ch-stripe',
          when: { country: 'CH', currency: 'chf' },
          use: {
            provider: 'stripe',
            flow: 'checkout-session',
            paymentMethods: ['card', 'twint'],
          },
        },
        {
          id: 'de-stripe',
          when: { country: 'DE', currency: 'eur' },
          use: {
            provider: 'stripe',
            flow: 'checkout-session',
            paymentMethods: ['card', 'sepa_debit'],
          },
        },
      ],
      fallback,
    });

    const route = router.evaluate({ country: 'CH', currency: 'chf' });
    expect(route).toMatchObject({
      provider: 'stripe',
      paymentMethods: ['card', 'twint'],
      source: 'rule',
      ruleId: 'ch-stripe',
    });
  });

  it('uses fallback when no rule matches', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'ch-only',
          when: { country: 'CH' },
          use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
        },
      ],
      fallback,
    });

    const route = router.evaluate({ country: 'US' });
    expect(route).toMatchObject({
      provider: 'stripe',
      source: 'fallback',
    });
  });

  it('first matching rule wins (order matters)', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'first',
          when: { country: 'CH' },
          use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
        },
        {
          id: 'second',
          when: { country: 'CH' },
          use: { provider: 'adyen', flow: 'redirect', paymentMethods: ['twint'] },
        },
      ],
      fallback,
    });

    const route = router.evaluate({ country: 'CH' });
    expect(route.ruleId).toBe('first');
    expect(route.provider).toBe('stripe');
  });

  it('supports { in: [...] } operator', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'dach',
          when: { country: { in: ['CH', 'DE', 'AT'] } },
          use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
        },
      ],
      fallback,
    });

    expect(router.evaluate({ country: 'DE' }).ruleId).toBe('dach');
    expect(router.evaluate({ country: 'US' }).source).toBe('fallback');
  });

  it('supports amount comparison operators', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'high-value',
          when: { amount: { gte: 5000 } },
          use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
        },
      ],
      fallback,
    });

    expect(router.evaluate({ amount: 5000 }).ruleId).toBe('high-value');
    expect(router.evaluate({ amount: 4999 }).source).toBe('fallback');
  });

  it('supports nested experiment conditions', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'stripe-experiment',
          when: {
            country: 'CH',
            experiment: { checkoutRouting: 'stripe-first' },
          },
          use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
        },
      ],
      fallback,
    });

    const context = {
      country: 'CH',
      experiment: { checkoutRouting: 'stripe-first' },
    };
    expect(router.evaluate(context).ruleId).toBe('stripe-experiment');

    const noMatch = {
      country: 'CH',
      experiment: { checkoutRouting: 'adyen-first' },
    };
    expect(router.evaluate(noMatch).source).toBe('fallback');
  });

  it('supports predicates escape hatch', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'custom-predicate',
          when: {},
          use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
        },
      ],
      fallback,
      predicates: {
        'custom-predicate': (ctx) => (ctx['amount'] as number) > 10000,
      },
    });

    expect(router.evaluate({ amount: 20000 }).ruleId).toBe('custom-predicate');
    expect(router.evaluate({ amount: 5000 }).source).toBe('fallback');
  });

  it('provides descriptive reason in matched route', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'test-rule',
          description: 'Swiss card payments via Stripe',
          when: { country: 'CH' },
          use: { provider: 'stripe', flow: 'checkout-session' },
        },
      ],
      fallback,
    });

    const route = router.evaluate({ country: 'CH' });
    expect(route.reason).toBe('Swiss card payments via Stripe');
  });

  it('throws RoutingError when no match and no fallback', () => {
    const router = createRulesRouter({
      rules: [],
      fallback: undefined as any,
    });

    expect(() => router.evaluate({ country: 'US' })).toThrow(
      'No payment route matched the current context and no fallback route was configured.',
    );
  });

  it('re-evaluates correctly when context changes', () => {
    const router = createRulesRouter({
      rules: [
        {
          id: 'ch-rule',
          when: { country: 'CH' },
          use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
        },
        {
          id: 'de-rule',
          when: { country: 'DE' },
          use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['sepa_debit'] },
        },
      ],
      fallback,
    });

    const route1 = router.evaluate({ country: 'CH' });
    expect(route1.ruleId).toBe('ch-rule');
    expect(route1.paymentMethods).toEqual(['card']);

    const route2 = router.evaluate({ country: 'DE' });
    expect(route2.ruleId).toBe('de-rule');
    expect(route2.paymentMethods).toEqual(['sepa_debit']);
  });
});
