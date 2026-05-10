import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stripeProvider } from '../../src/browser/provider.js';

describe('stripeProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has correct provider ID', () => {
    const provider = stripeProvider({
      publishableKey: 'pk_test_123',
      serverEndpoint: '/api/payments/stripe',
    });

    expect(provider.id).toBe('stripe');
  });

  it('declares checkout-session flow', () => {
    const provider = stripeProvider({
      publishableKey: 'pk_test_123',
      serverEndpoint: '/api/payments/stripe',
    });

    expect(provider.capabilities.flows).toContain('checkout-session');
  });

  it('returns all supported payment methods', () => {
    const provider = stripeProvider({
      publishableKey: 'pk_test_123',
      serverEndpoint: '/api/payments/stripe',
    });

    const methods = provider.getAvailablePaymentMethods({});
    const ids = methods.map((m) => m.id);
    expect(ids).toContain('card');
    expect(ids).toContain('paypal');
    expect(ids).toContain('twint');
    expect(ids).toContain('ideal');
    expect(ids).toContain('klarna');
    // Every method has the stripe provider
    expect(methods.every((m) => m.provider === 'stripe')).toBe(true);
    // Every method has a label
    expect(methods.every((m) => m.label.length > 0)).toBe(true);
  });

  it('submit calls server endpoint', async () => {
    const mockResult = {
      provider: 'stripe',
      id: 'cs_test_123',
      status: 'created',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    };

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockResult), { status: 200 }),
    );

    const provider = stripeProvider({
      publishableKey: 'pk_test_123',
      serverEndpoint: '/api/payments/stripe',
    });

    // Mock window to prevent redirect
    const origWindow = globalThis.window;
    (globalThis as any).window = { location: { href: '' } };

    const result = await provider.submit(
      {
        lineItems: [{ name: 'Test', quantity: 1, unitAmount: 1000 }],
        successUrl: '/success',
        cancelUrl: '/cancel',
      },
      {
        provider: 'stripe',
        flow: 'checkout-session',
        paymentMethods: ['card'],
        source: 'rule',
      },
    );

    expect(fetch).toHaveBeenCalledWith('/api/payments/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('"provider":"stripe"'),
    });

    expect(result).toMatchObject({
      provider: 'stripe',
      id: 'cs_test_123',
      status: 'created',
    });

    // Restore window
    (globalThis as any).window = origWindow;
  });

  it('throws ProviderError on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );

    const provider = stripeProvider({
      publishableKey: 'pk_test_123',
      serverEndpoint: '/api/payments/stripe',
    });

    await expect(
      provider.submit(
        {
          lineItems: [{ name: 'Test', quantity: 1, unitAmount: 1000 }],
          successUrl: '/success',
          cancelUrl: '/cancel',
        },
        {
          provider: 'stripe',
          flow: 'checkout-session',
          paymentMethods: ['card'],
          source: 'rule',
        },
      ),
    ).rejects.toThrow('Stripe checkout failed');
  });
});
