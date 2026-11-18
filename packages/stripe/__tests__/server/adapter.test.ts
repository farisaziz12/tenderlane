import { describe, it, expect, vi } from 'vitest';

const constructed = vi.fn();
const sessionsRetrieve = vi.fn();
const paymentIntentsRetrieve = vi.fn();
vi.mock('stripe', () => {
  class StripeError extends Error {}
  class Stripe {
    static errors = { StripeError };
    checkout = { sessions: { create: vi.fn(), retrieve: sessionsRetrieve } };
    paymentIntents = { create: vi.fn(), retrieve: paymentIntentsRetrieve };
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

describe('stripeServerAdapter retrieve', () => {
  it('reads a Checkout Session for a cs_ id and reports it paid only when Stripe does', async () => {
    const { stripeServerAdapter } = await import('../../src/server/adapter.js');
    const adapter = stripeServerAdapter({ secretKey: 'sk_test_123' });
    const session = { id: 'cs_test_1', status: 'complete', amount_total: 2900, currency: 'chf' };

    sessionsRetrieve.mockResolvedValueOnce({ ...session, payment_status: 'paid' });
    expect(await adapter.retrieve?.('cs_test_1')).toEqual({
      provider: 'stripe',
      id: 'cs_test_1',
      status: 'complete',
      amountTotal: 2900,
      currency: 'chf',
    });

    // A bank debit: the customer finished the page, no money has moved yet.
    sessionsRetrieve.mockResolvedValueOnce({ ...session, payment_status: 'unpaid' });
    expect((await adapter.retrieve?.('cs_test_1'))?.status).toBe('open');

    // A setup-mode session or a free trial: finished, and nothing was charged.
    sessionsRetrieve.mockResolvedValueOnce({ ...session, payment_status: 'no_payment_required' });
    expect((await adapter.retrieve?.('cs_test_1'))?.status).toBe('open');

    sessionsRetrieve.mockResolvedValueOnce({ ...session, status: 'expired', payment_status: 'unpaid' });
    expect((await adapter.retrieve?.('cs_test_1'))?.status).toBe('expired');
  });

  it('reads a PaymentIntent for a pi_ id', async () => {
    const { stripeServerAdapter } = await import('../../src/server/adapter.js');
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      amount: 2900,
      currency: 'chf',
      client_secret: 'pi_1_secret',
    });

    const details = await stripeServerAdapter({ secretKey: 'sk_test_123' }).retrieve?.('pi_1');

    expect(details).toEqual({
      provider: 'stripe',
      id: 'pi_1',
      status: 'complete',
      amountTotal: 2900,
      currency: 'chf',
    });
  });

  it('rejects an id that is neither, without calling Stripe', async () => {
    const { stripeServerAdapter } = await import('../../src/server/adapter.js');
    sessionsRetrieve.mockClear();

    await expect(
      stripeServerAdapter({ secretKey: 'sk_test_123' }).retrieve?.('../customers'),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });
});
