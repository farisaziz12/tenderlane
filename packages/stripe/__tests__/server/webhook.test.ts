import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { stripeServerAdapter } from '../../src/server/adapter.js';

// The real Stripe SDK, not a mock: signatures are generated and verified
// with Stripe's own code. Nothing here touches the network.
const secret = 'whsec_test_secret';
const signer = new Stripe('sk_test_123');
const adapter = stripeServerAdapter({ secretKey: 'sk_test_123', webhookSecret: secret });

function stripeEvent(type: string, object: Record<string, unknown>, id = 'evt_1'): string {
  return JSON.stringify({ id, object: 'event', type, data: { object } });
}

function signedRequest(payload: string, options: { secret?: string; timestamp?: number } = {}) {
  const header = signer.webhooks.generateTestHeaderString({
    payload,
    secret: options.secret ?? secret,
    ...(options.timestamp !== undefined ? { timestamp: options.timestamp } : {}),
  });
  return new Request('https://shop.example/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  });
}

const verify = (payload: string) => adapter.verifyWebhook?.(signedRequest(payload));

describe('stripeServerAdapter verifyWebhook', () => {
  it.each([
    ['checkout.session.completed', { id: 'cs_1', payment_status: 'paid' }, 'payment.succeeded'],
    ['checkout.session.completed', { id: 'cs_1', payment_status: 'unpaid' }, 'payment.processing'],
    ['checkout.session.async_payment_succeeded', { id: 'cs_1' }, 'payment.succeeded'],
    ['checkout.session.async_payment_failed', { id: 'cs_1' }, 'payment.failed'],
    ['checkout.session.expired', { id: 'cs_1' }, 'checkout.expired'],
    ['payment_intent.processing', { id: 'pi_1' }, 'payment.processing'],
    ['payment_intent.succeeded', { id: 'pi_1' }, 'payment.succeeded'],
    ['payment_intent.payment_failed', { id: 'pi_1' }, 'payment.failed'],
    ['payment_intent.canceled', { id: 'pi_1' }, 'checkout.expired'],
  ])('%s %j is %s', async (providerEventType, object, type) => {
    expect(await verify(stripeEvent(providerEventType, object))).toEqual({
      provider: 'stripe',
      eventId: 'evt_1',
      providerEventType,
      type,
      checkoutId: object.id,
    });
  });

  it('passes on events that are not about a payment as unhandled', async () => {
    const setup = stripeEvent('checkout.session.completed', {
      id: 'cs_1',
      payment_status: 'no_payment_required',
    });
    const other = stripeEvent('customer.created', { id: 'cus_1' }, 'evt_2');

    expect(await verify(setup)).toEqual({
      provider: 'stripe',
      eventId: 'evt_1',
      providerEventType: 'checkout.session.completed',
      type: 'unhandled',
    });
    expect((await verify(other))?.type).toBe('unhandled');
  });

  it('rejects a body that was changed after signing', async () => {
    const payload = stripeEvent('payment_intent.succeeded', { id: 'pi_1' });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret });
    const forged = new Request('https://shop.example/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': header },
      body: payload.replace('pi_1', 'pi_2'),
    });

    await expect(adapter.verifyWebhook?.(forged)).rejects.toMatchObject({
      code: 'WEBHOOK_VERIFICATION_FAILED',
    });
  });

  it('rejects a wrong secret, a missing header and a stale timestamp', async () => {
    const payload = stripeEvent('payment_intent.succeeded', { id: 'pi_1' });
    const unsigned = new Request('https://shop.example/api/webhooks/stripe', {
      method: 'POST',
      body: payload,
    });
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;

    for (const request of [
      signedRequest(payload, { secret: 'whsec_someone_else' }),
      unsigned,
      signedRequest(payload, { timestamp: anHourAgo }),
    ]) {
      await expect(adapter.verifyWebhook?.(request)).rejects.toMatchObject({
        code: 'WEBHOOK_VERIFICATION_FAILED',
      });
    }
  });

  it('says what is missing when no webhook secret is configured', async () => {
    const withoutSecret = stripeServerAdapter({ secretKey: 'sk_test_123' });

    await expect(
      withoutSecret.verifyWebhook?.(signedRequest(stripeEvent('payment_intent.succeeded', { id: 'pi_1' }))),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });
});
