import { describe, expect, it, vi } from 'vitest';
import {
  parseCheckoutDetails,
  parseCheckoutResult,
  requestProviderAction,
} from '../../src/adapters/index.js';
import { createTenderlaneHandler } from '../../src/server/handler.js';
import { createInlineCatalog } from '../../src/index.js';

const route = { provider: 'acme', flow: 'hosted', paymentMethods: [], source: 'fallback' } as const;
const input = {
  items: [{ sku: 'pro', quantity: 1 }],
  successUrl: 'https://shop.example/success',
  cancelUrl: 'https://shop.example/cancel',
};

describe('parseCheckoutResult', () => {
  it('returns only the known fields', () => {
    const parsed = parseCheckoutResult(
      {
        provider: 'acme',
        id: 'cs_1',
        status: 'open',
        url: 'https://pay.acme.example/cs_1',
        raw: { customer: { email: 'someone@example.com' } },
      },
      'acme',
    );

    expect(parsed).toEqual({
      provider: 'acme',
      id: 'cs_1',
      status: 'open',
      url: 'https://pay.acme.example/cs_1',
    });
  });

  it.each([
    ['not an object', 'nope'],
    ['missing id', { provider: 'acme', status: 'open' }],
    ['unknown status', { provider: 'acme', id: 'cs_1', status: 'paid' }],
    ['script url', { provider: 'acme', id: 'cs_1', status: 'open', url: 'javascript:alert(1)' }],
    ['relative url', { provider: 'acme', id: 'cs_1', status: 'open', url: '/pay' }],
    ['non-string secret', { provider: 'acme', id: 'pi_1', status: 'open', clientSecret: 42 }],
  ])('rejects a result with %s', (_label, value) => {
    expect(() => parseCheckoutResult(value, 'acme')).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_ERROR', provider: 'acme' }),
    );
  });
});

describe('parseCheckoutDetails', () => {
  const base = { provider: 'acme', id: 'cs_1', status: 'complete' };

  it('keeps the known fields and lower-cases the currency', () => {
    expect(
      parseCheckoutDetails({ ...base, amountTotal: 3132, currency: 'USD', clientSecret: 's' }, 'acme'),
    ).toEqual({ ...base, amountTotal: 3132, currency: 'usd' });
  });

  it.each([-1, 29.5, '2900', Number.NaN])('rejects amountTotal %s', (amountTotal) => {
    expect(() => parseCheckoutDetails({ ...base, amountTotal }, 'acme')).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_ERROR' }),
    );
  });
});

describe('requestProviderAction', () => {
  it('rejects a 200 response that is not a checkout result', async () => {
    const fetchMock = vi.fn(async () => Response.json({ redirect: 'javascript:alert(1)' }));

    await expect(
      requestProviderAction({
        endpoint: 'https://shop.example/api/payments',
        provider: 'acme',
        action: 'checkout',
        input,
        route,
        fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});

describe('server handler response', () => {
  it('forwards nothing from the adapter result except the CheckoutResult fields', async () => {
    const handler = createTenderlaneHandler({
      providers: [
        {
          id: 'acme',
          actions: ['checkout'],
          async handle() {
            // An adapter that returns the whole PSP object alongside the result.
            return {
              provider: 'acme',
              id: 'cs_1',
              status: 'open' as const,
              url: 'https://pay.acme.example/cs_1',
              raw: { customer_details: { email: 'someone@example.com' }, livemode: true },
            };
          },
        },
      ],
      catalog: createInlineCatalog({ pro: { name: 'Pro', pricing: { amount: 2900, currency: 'usd' } } }),
    });

    const response = await handler.POST(
      new Request('https://shop.example/api/payments', {
        method: 'POST',
        body: JSON.stringify({ provider: 'acme', action: 'checkout', payload: input }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider: 'acme',
      id: 'cs_1',
      status: 'open',
      url: 'https://pay.acme.example/cs_1',
    });
  });

  it('answers 500 when an adapter returns something that is not a checkout result', async () => {
    const onError = vi.fn();
    const handler = createTenderlaneHandler({
      providers: [
        {
          id: 'acme',
          actions: ['checkout'],
          // @ts-expect-error a result without a status does not satisfy CheckoutResult
          async handle() {
            return { provider: 'acme', id: 'cs_1' };
          },
        },
      ],
      catalog: createInlineCatalog({ pro: { name: 'Pro', pricing: { amount: 2900, currency: 'usd' } } }),
      onError,
    });

    const response = await handler.POST(
      new Request('https://shop.example/api/payments', {
        method: 'POST',
        body: JSON.stringify({ provider: 'acme', action: 'checkout', payload: input }),
      }),
    );

    expect(response.status).toBe(500);
    expect(onError).toHaveBeenCalledOnce();
  });
});
