import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutoRouter } from '../../src/routing/auto-router.js';

describe('createAutoRouter', () => {
  const fallback = {
    provider: 'stripe',
    flow: 'checkout-session' as const,
    paymentMethods: ['card'],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the remote endpoint with context', async () => {
    const mockResponse = {
      provider: 'adyen',
      flow: 'redirect',
      paymentMethods: ['ideal'],
      reason: 'best-conversion',
      confidence: 0.9,
    };

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const router = createAutoRouter({ endpoint: '/api/route', fallback });
    const route = await router.evaluate({ country: 'NL', currency: 'eur' });

    expect(fetch).toHaveBeenCalledWith('/api/route', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));

    expect(route).toMatchObject({
      provider: 'adyen',
      flow: 'redirect',
      paymentMethods: ['ideal'],
      source: 'auto',
    });
  });

  it('falls back on fetch error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const router = createAutoRouter({ endpoint: '/api/route', fallback });
    const route = await router.evaluate({ country: 'US' });

    expect(route).toMatchObject({
      provider: 'stripe',
      source: 'auto-fallback',
    });
  });

  it('falls back on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Server Error', { status: 500 }),
    );

    const router = createAutoRouter({ endpoint: '/api/route', fallback });
    const route = await router.evaluate({ country: 'US' });

    expect(route.source).toBe('auto-fallback');
  });

  it('passes custom headers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        provider: 'stripe',
        flow: 'checkout-session',
        paymentMethods: ['card'],
      }), { status: 200 }),
    );

    const router = createAutoRouter({
      endpoint: '/api/route',
      fallback,
      headers: { Authorization: 'Bearer token123' },
    });
    await router.evaluate({ country: 'US' });

    expect(fetch).toHaveBeenCalledWith('/api/route', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
    }));
  });
});
