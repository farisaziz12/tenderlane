import { describe, it, expect, vi } from 'vitest';

const constructed = vi.fn();
vi.mock('stripe', () => {
  class StripeError extends Error {}
  class Stripe {
    static errors = { StripeError };
    checkout = { sessions: { create: vi.fn() } };
    paymentIntents = { create: vi.fn() };
    constructor(...constructorArguments: unknown[]) {
      constructed(...constructorArguments);
    }
  }
  return { default: Stripe };
});

describe('stripeServerAdapter', () => {
  it('passes the configured apiVersion to the Stripe client', async () => {
    const { stripeServerAdapter } = await import('../../src/server/adapter.js');

    stripeServerAdapter({ secretKey: 'sk_test_123', apiVersion: '2024-12-18.acacia' });

    expect(constructed).toHaveBeenCalledWith('sk_test_123', { apiVersion: '2024-12-18.acacia' });
  });
});
