import { describe, it, expect, vi } from 'vitest';
import {
  defineBrowserProvider,
  defineServerAdapter,
  requestProviderAction,
} from '../../src/adapters/index.js';
import { ProviderError } from '../../src/errors/errors.js';
import type { SelectedPaymentRoute } from '../../src/index.js';

const route: SelectedPaymentRoute = {
  provider: 'acme',
  flow: 'checkout-session',
  paymentMethods: ['card'],
  source: 'rule',
};
const input = { items: [{ sku: 'pro', quantity: 1 }], successUrl: 'https://shop.example/s', cancelUrl: 'https://shop.example/c' };

describe('defineBrowserProvider', () => {
  it('returns the provider with the phantom property added', () => {
    const submit = vi.fn();
    const provider = defineBrowserProvider({
      id: 'acme',
      capabilities: { provider: 'acme', flows: ['checkout-session'], paymentMethods: ['card'], supports: {} },
      getAvailablePaymentMethods: () => [],
      submit,
    });

    expect(provider.id).toBe('acme');
    expect(provider.submit).toBe(submit);
    expect(provider).toHaveProperty('~types');
  });
});

describe('defineServerAdapter', () => {
  it('returns the adapter unchanged', () => {
    const definition = {
      id: 'acme',
      actions: ['checkout'],
      handle: vi.fn(),
    } as const;

    expect(defineServerAdapter(definition)).toBe(definition);
  });
});

describe('requestProviderAction', () => {
  it('posts the wire format the handler expects and returns the result', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ provider: 'acme', id: 'session_1', status: 'open', url: 'https://pay.example' }),
    );

    const result = await requestProviderAction({
      endpoint: '/api/payments',
      provider: 'acme',
      action: 'checkout',
      input,
      route,
      fetch,
      headers: { 'x-csrf': 'token' },
    });

    expect(result.id).toBe('session_1');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/payments');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-csrf']).toBe('token');
    expect(JSON.parse(init.body as string)).toEqual({
      provider: 'acme',
      action: 'checkout',
      payload: input,
      paymentMethods: ['card'],
    });
  });

  it('throws a ProviderError naming the provider on a non-2xx answer', async () => {
    const fetch = vi.fn(async () => Response.json({ error: 'nope' }, { status: 400 }));

    await expect(
      requestProviderAction({ endpoint: '/api', provider: 'acme', action: 'checkout', input, route, fetch }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ProviderError && error.provider === 'acme' && error.message.includes('400'),
    );
  });
});
