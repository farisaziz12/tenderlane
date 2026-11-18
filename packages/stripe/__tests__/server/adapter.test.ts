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
    const session = {
      id: 'cs_test_1',
      status: 'complete',
      amount_total: 2900,
      currency: 'chf',
      payment_intent: { id: 'pi_1', payment_method: { id: 'pm_1', type: 'sepa_debit' } },
    };

    sessionsRetrieve.mockResolvedValueOnce({ ...session, payment_status: 'paid' });
    expect(await adapter.retrieve?.('cs_test_1')).toEqual({
      provider: 'stripe',
      id: 'cs_test_1',
      status: 'complete',
      amountTotal: 2900,
      currency: 'chf',
      paymentMethod: 'sepa_debit',
    });
    expect(sessionsRetrieve).toHaveBeenCalledWith('cs_test_1', {
      expand: ['payment_intent.payment_method'],
    });

    // A bank debit: the customer finished the page, no money has moved yet.
    const debit = (status: string, last_payment_error: unknown = null) => ({
      ...session,
      payment_status: 'unpaid',
      payment_intent: { id: 'pi_1', status, last_payment_error, payment_method: null },
    });
    sessionsRetrieve.mockResolvedValueOnce(debit('processing'));
    expect((await adapter.retrieve?.('cs_test_1'))?.status).toBe('processing');

    // Days later the debit bounces. The session still says complete/unpaid.
    sessionsRetrieve.mockResolvedValueOnce(
      debit('requires_payment_method', { code: 'payment_intent_payment_attempt_failed' }),
    );
    expect((await adapter.retrieve?.('cs_test_1'))?.status).toBe('failed');

    // Still on the page.
    sessionsRetrieve.mockResolvedValueOnce({ ...session, status: 'open', payment_status: 'unpaid' });
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
      payment_method: { id: 'pm_1', type: 'cashapp' },
    });

    const details = await stripeServerAdapter({ secretKey: 'sk_test_123' }).retrieve?.('pi_1');

    expect(details).toEqual({
      provider: 'stripe',
      id: 'pi_1',
      status: 'complete',
      amountTotal: 2900,
      currency: 'chf',
      // Stripe's `cashapp` is Tenderlane's `cash_app`.
      paymentMethod: 'cash_app',
    });
  });

  it('separates a PaymentIntent waiting on the bank from one waiting on the customer', async () => {
    const { stripeServerAdapter } = await import('../../src/server/adapter.js');
    const adapter = stripeServerAdapter({ secretKey: 'sk_test_123' });
    const paymentIntent = { id: 'pi_1', amount: 2900, currency: 'eur', payment_method: 'pm_1' };

    paymentIntentsRetrieve.mockResolvedValueOnce({ ...paymentIntent, status: 'processing' });
    const processing = await adapter.retrieve?.('pi_1');
    expect(processing?.status).toBe('processing');
    // Not expanded: the method is not guessed.
    expect(processing).not.toHaveProperty('paymentMethod');

    paymentIntentsRetrieve.mockResolvedValueOnce({ ...paymentIntent, status: 'requires_action' });
    expect((await adapter.retrieve?.('pi_1'))?.status).toBe('open');

    // Authorised with manual capture: the customer is done.
    paymentIntentsRetrieve.mockResolvedValueOnce({ ...paymentIntent, status: 'requires_capture' });
    expect((await adapter.retrieve?.('pi_1'))?.status).toBe('processing');

    // New, nothing tried yet.
    paymentIntentsRetrieve.mockResolvedValueOnce({
      ...paymentIntent,
      status: 'requires_payment_method',
      last_payment_error: null,
    });
    expect((await adapter.retrieve?.('pi_1'))?.status).toBe('open');

    // Back to requires_payment_method after a failed debit.
    paymentIntentsRetrieve.mockResolvedValueOnce({
      ...paymentIntent,
      status: 'requires_payment_method',
      last_payment_error: { code: 'payment_intent_payment_attempt_failed' },
    });
    expect((await adapter.retrieve?.('pi_1'))?.status).toBe('failed');
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
