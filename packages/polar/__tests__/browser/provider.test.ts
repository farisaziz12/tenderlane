import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { polarProvider } from '../../src/browser/provider.js';

describe('polarProvider (browser)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has provider id "polar" and declares the checkout-session flow only', () => {
    const provider = polarProvider({
      organizationId: 'org_test',
      serverEndpoint: '/api/payments/polar',
    });

    expect(provider.id).toBe('polar');
    expect(provider.capabilities.flows).toEqual(['checkout-session']);
    expect(provider.capabilities.supports.embedded).toBe(false);
    expect(provider.capabilities.supports.redirect).toBe(true);
  });

  it('exposes the configured payment methods as descriptors tagged "polar"', () => {
    const provider = polarProvider({
      organizationId: 'org_test',
      serverEndpoint: '/api/payments/polar',
    });

    const methods = provider.getAvailablePaymentMethods({});
    expect(methods.map((method) => method.id)).toEqual(['card']);
    expect(methods.every((method) => method.provider === 'polar')).toBe(true);
  });

  it('POSTs { provider, action, payload, paymentMethods } to the configured endpoint and redirects to the returned url', async () => {
    const mockResult = {
      provider: 'polar',
      id: 'polar_co_abc',
      status: 'open',
      url: 'https://buy.polar.sh/c/abc',
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockResult), { status: 200 }),
    );

    const provider = polarProvider({
      organizationId: 'org_test',
      serverEndpoint: '/api/payments/polar',
    });

    const originalWindow = globalThis.window;
    (globalThis as { window: unknown }).window = { location: { href: '' } };

    const result = await provider.submit(
      {
        items: [{ sku: 'pro-plan', quantity: 1 }],
        successUrl: '/success',
        cancelUrl: '/cancel',
      },
      {
        provider: 'polar',
        flow: 'checkout-session',
        paymentMethods: ['card'],
        source: 'rule',
      },
    );

    expect(fetch).toHaveBeenCalledWith('/api/payments/polar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('"provider":"polar"'),
    });
    expect(result).toMatchObject({ provider: 'polar', id: 'polar_co_abc' });

    (globalThis as { window: unknown }).window = originalWindow;
  });

  it('NEVER posts unitAmount on the wire — price integrity contract', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ provider: 'polar', id: 'x', status: 'open' }), {
        status: 200,
      }),
    );

    const provider = polarProvider({
      organizationId: 'org_test',
      serverEndpoint: '/api/payments/polar',
    });
    const originalWindow = globalThis.window;
    (globalThis as { window: unknown }).window = { location: { href: '' } };

    await provider.submit(
      {
        items: [{ sku: 'pro-plan', quantity: 1 }],
        successUrl: '/s',
        cancelUrl: '/c',
      },
      {
        provider: 'polar',
        flow: 'checkout-session',
        paymentMethods: ['card'],
        source: 'rule',
      },
    );

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(typeof init?.body).toBe('string');
    expect(init?.body as string).not.toMatch(/unitAmount/);

    (globalThis as { window: unknown }).window = originalWindow;
  });

  it('throws ProviderError on non-OK responses', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }));

    const provider = polarProvider({
      organizationId: 'org_test',
      serverEndpoint: '/api/payments/polar',
    });

    await expect(
      provider.submit(
        {
          items: [{ sku: 'pro-plan', quantity: 1 }],
          successUrl: '/s',
          cancelUrl: '/c',
        },
        {
          provider: 'polar',
          flow: 'checkout-session',
          paymentMethods: ['card'],
          source: 'rule',
        },
      ),
    ).rejects.toThrow('Polar checkout failed');
  });
});
