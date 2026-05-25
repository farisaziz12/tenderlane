import { describe, it, expect, vi } from 'vitest';
import { runMiddlewareHook } from '../../src/middleware/runner.js';
import type { TenderlaneMiddleware } from '../../src/types/middleware.js';

describe('runMiddlewareHook', () => {
  it('calls the correct hook on each middleware', async () => {
    const onRouteEvaluated1 = vi.fn();
    const onRouteEvaluated2 = vi.fn();

    const middlewares: TenderlaneMiddleware[] = [
      { name: 'first', onRouteEvaluated: onRouteEvaluated1 },
      { name: 'second', onRouteEvaluated: onRouteEvaluated2 },
    ];

    const event = {
      context: { country: 'CH' },
      route: {
        provider: 'stripe',
        flow: 'checkout-session' as const,
        paymentMethods: ['card'],
        source: 'rule' as const,
      },
    };

    await runMiddlewareHook(middlewares, 'onRouteEvaluated', event);

    expect(onRouteEvaluated1).toHaveBeenCalledWith(event);
    expect(onRouteEvaluated2).toHaveBeenCalledWith(event);
  });

  it('calls middleware in order', async () => {
    const order: string[] = [];

    const middlewares: TenderlaneMiddleware[] = [
      {
        name: 'first',
        onRouteEvaluated: () => { order.push('first'); },
      },
      {
        name: 'second',
        onRouteEvaluated: () => { order.push('second'); },
      },
    ];

    await runMiddlewareHook(middlewares, 'onRouteEvaluated', {
      context: {},
      route: {
        provider: 'stripe',
        flow: 'checkout-session' as const,
        paymentMethods: [],
        source: 'rule' as const,
      },
    });

    expect(order).toEqual(['first', 'second']);
  });

  it('skips middleware without the requested hook', async () => {
    const onCheckoutStart = vi.fn();

    const middlewares: TenderlaneMiddleware[] = [
      { name: 'logging-only', onRouteEvaluated: vi.fn() },
      { name: 'checkout-tracker', onCheckoutStart },
    ];

    await runMiddlewareHook(middlewares, 'onCheckoutStart', {
      context: {},
      route: {
        provider: 'stripe',
        flow: 'checkout-session' as const,
        paymentMethods: [],
        source: 'rule' as const,
      },
      input: {
        lineItems: [],
        successUrl: '/success',
        cancelUrl: '/cancel',
      },
    });

    expect(onCheckoutStart).toHaveBeenCalled();
  });

  it('catches and logs middleware errors without breaking', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();

    const middlewares: TenderlaneMiddleware[] = [
      {
        name: 'broken',
        onRouteEvaluated: () => { throw new Error('middleware failed'); },
      },
      {
        name: 'still-works',
        onRouteEvaluated: second,
      },
    ];

    await runMiddlewareHook(middlewares, 'onRouteEvaluated', {
      context: {},
      route: {
        provider: 'stripe',
        flow: 'checkout-session' as const,
        paymentMethods: [],
        source: 'rule' as const,
      },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('broken'),
      expect.any(Error),
    );
    expect(second).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('dispatches onCatalogResolved with the resolved items', async () => {
    const onCatalogResolved = vi.fn();

    const middlewares: TenderlaneMiddleware[] = [
      { name: 'audit', onCatalogResolved },
    ];

    const resolved = [
      {
        sku: 'pro-plan',
        quantity: 1,
        name: 'Pro Plan',
        unitAmount: 2900,
        currency: 'usd',
      },
    ];

    await runMiddlewareHook(middlewares, 'onCatalogResolved', {
      context: { currency: 'usd' },
      resolved,
    });

    expect(onCatalogResolved).toHaveBeenCalledWith({
      context: { currency: 'usd' },
      resolved,
    });
  });

  it('handles async middleware', async () => {
    const order: string[] = [];

    const middlewares: TenderlaneMiddleware[] = [
      {
        name: 'async-mw',
        onRouteEvaluated: async () => {
          await new Promise((r) => setTimeout(r, 10));
          order.push('async');
        },
      },
      {
        name: 'sync-mw',
        onRouteEvaluated: () => { order.push('sync'); },
      },
    ];

    await runMiddlewareHook(middlewares, 'onRouteEvaluated', {
      context: {},
      route: {
        provider: 'stripe',
        flow: 'checkout-session' as const,
        paymentMethods: [],
        source: 'rule' as const,
      },
    });

    expect(order).toEqual(['async', 'sync']);
  });
});
