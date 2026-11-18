import { describe, it, expect } from 'vitest';
import { createTenderlaneHandler } from '../../src/server/handler.js';
import { createInlineCatalog } from '../../src/index.js';
import type { ServerProviderAdapter, CheckoutResult } from '../../src/index.js';

const catalog = createInlineCatalog({
  widget: { name: 'Widget', pricing: { amount: 1000, currency: 'usd' } },
});

function createMockProvider(): ServerProviderAdapter<'mock'> {
  return {
    id: 'mock' as const,
    actions: ['checkout'] as const,
    async handle(): Promise<CheckoutResult> {
      return {
        provider: 'mock',
        id: 'session_123',
        status: 'open',
        url: 'https://checkout.example.com/session_123',
      };
    },
  };
}

describe('createTenderlaneHandler', () => {
  it('routes to the correct provider', async () => {
    const handler = createTenderlaneHandler({
      providers: [createMockProvider()],
      catalog,
    });

    const req = new Request('http://localhost/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'mock',
        action: 'checkout',
        payload: {
          items: [{ sku: 'widget', quantity: 1 }],
          successUrl: '/success',
          cancelUrl: '/cancel',
        },
      }),
    });

    const res = await handler.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      provider: 'mock',
      id: 'session_123',
      status: 'open',
      url: 'https://checkout.example.com/session_123',
    });
  });

  it('returns 400 for unknown provider', async () => {
    const handler = createTenderlaneHandler({ providers: [createMockProvider()] });

    const req = new Request('http://localhost/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'unknown',
        action: 'checkout',
        payload: {},
      }),
    });

    const res = await handler.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unknown provider');
  });

  it('returns 400 for unsupported action', async () => {
    const handler = createTenderlaneHandler({ providers: [createMockProvider()] });

    const req = new Request('http://localhost/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'mock',
        action: 'refund',
        payload: {},
      }),
    });

    const res = await handler.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('does not support action');
  });

  it('returns 400 for missing fields', async () => {
    const handler = createTenderlaneHandler({ providers: [createMockProvider()] });

    const req = new Request('http://localhost/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await handler.POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 on provider error', async () => {
    const errorProvider: ServerProviderAdapter = {
      id: 'error-provider',
      actions: ['checkout'],
      async handle() {
        throw new Error('Stripe API down');
      },
    };

    const handler = createTenderlaneHandler({
      providers: [errorProvider],
      catalog,
    });

    const req = new Request('http://localhost/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'error-provider',
        action: 'checkout',
        payload: {
          items: [{ sku: 'widget', quantity: 1 }],
          successUrl: '/success',
          cancelUrl: '/cancel',
        },
      }),
    });

    const res = await handler.POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    // The provider's message can hold internals; the response stays generic.
    expect(body.error).toBe('Checkout request failed.');
    expect(JSON.stringify(body)).not.toContain('Stripe API down');
  });
});
