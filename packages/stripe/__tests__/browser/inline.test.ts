import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StripeElements } from '@stripe/stripe-js';
import { stripeProvider } from '../../src/browser/provider.js';

const stripeJs = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
  retrievePaymentIntent: vi.fn(),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: async () => stripeJs,
}));

const input = {
  items: [{ sku: 'pro', quantity: 1 }],
  successUrl: 'https://shop.example/success',
  cancelUrl: 'https://shop.example/cancel',
};
const route = { provider: 'stripe', flow: 'inline', paymentMethods: [], source: 'fallback' } as const;

/** A provider with a prepared session and a mounted (fake) Elements instance. */
async function preparedProvider() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ provider: 'stripe', id: 'pi_1', status: 'open', clientSecret: 'pi_1_secret' }),
    ),
  );
  const provider = stripeProvider({ publishableKey: 'pk_test_123', serverEndpoint: '/api/payments' });
  await provider.createSession?.(input, route);
  provider.setElements({} as StripeElements);
  return provider;
}

describe('stripeProvider inline submit', () => {
  beforeEach(() => {
    stripeJs.confirmPayment.mockReset();
    stripeJs.retrievePaymentIntent.mockReset();
  });

  it('reports complete only for a succeeded PaymentIntent', async () => {
    const provider = await preparedProvider();

    stripeJs.confirmPayment.mockResolvedValueOnce({ paymentIntent: { id: 'pi_1', status: 'succeeded' } });
    expect(await provider.submit(input, route)).toEqual({ provider: 'stripe', id: 'pi_1', status: 'complete' });

    stripeJs.confirmPayment.mockResolvedValueOnce({ paymentIntent: { id: 'pi_1', status: 'processing' } });
    expect(await provider.submit(input, route)).toEqual({ provider: 'stripe', id: 'pi_1', status: 'open' });
  });

  it('throws a declined card without a second request', async () => {
    const provider = await preparedProvider();
    stripeJs.confirmPayment.mockResolvedValue({
      error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' },
    });

    await expect(provider.submit(input, route)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      providerCode: 'card_declined',
    });
    expect(stripeJs.retrievePaymentIntent).not.toHaveBeenCalled();
  });

  it('does not report a failure when the connection dropped after Stripe took the payment', async () => {
    const provider = await preparedProvider();
    stripeJs.confirmPayment.mockResolvedValue({
      error: { type: 'api_connection_error', message: 'Network error' },
    });
    stripeJs.retrievePaymentIntent.mockResolvedValue({ paymentIntent: { id: 'pi_1', status: 'succeeded' } });

    expect(await provider.submit(input, route)).toEqual({ provider: 'stripe', id: 'pi_1', status: 'complete' });
    expect(stripeJs.retrievePaymentIntent).toHaveBeenCalledWith('pi_1_secret');
  });

  it('throws the original error when the payment really did not go through', async () => {
    const provider = await preparedProvider();
    stripeJs.confirmPayment.mockResolvedValue({
      error: { type: 'api_connection_error', message: 'Network error' },
    });
    stripeJs.retrievePaymentIntent.mockResolvedValue({
      paymentIntent: { id: 'pi_1', status: 'requires_payment_method' },
    });

    await expect(provider.submit(input, route)).rejects.toThrow('Network error');
  });
});
