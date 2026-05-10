import { describe, it, expect } from 'vitest';
import { createTenderlaneHandler } from '../../src/server/handler.js';
import type { ServerProviderAdapter, CheckoutInput, CheckoutResult } from '../../src/index.js';

function createMockProvider(): ServerProviderAdapter<'mock'> {
  return {
    id: 'mock' as const,
    actions: ['checkout'] as const,
    async handle(action: string, payload: CheckoutInput): Promise<CheckoutResult> {
      return {
        provider: 'mock',
        id: 'session_123',
        status: 'created',
        url: 'https://checkout.example.com/session_123',
      };
    },
  };
}

describe('createTenderlaneHandler', () => {
  it('routes to the correct provider', async () => {
    const handler = createTenderlaneHandler({ providers: [createMockProvider()] });

    const req = new Request('http://localhost/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'mock',
        action: 'checkout',
        payload: {
          lineItems: [{ name: 'Test', quantity: 1, unitAmount: 1000 }],
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
      status: 'created',
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

    const handler = createTenderlaneHandler({ providers: [errorProvider] });

    const req = new Request('http://localhost/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'error-provider',
        action: 'checkout',
        payload: {
          lineItems: [],
          successUrl: '/success',
          cancelUrl: '/cancel',
        },
      }),
    });

    const res = await handler.POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Stripe API down');
  });
});
