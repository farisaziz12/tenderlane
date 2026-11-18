import { Webhook } from 'standardwebhooks';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { describe, expect, it, vi } from 'vitest';

// Signature verification is real (standardwebhooks, the library Polar's SDK
// uses). Only the SDK's API client is replaced, because the adapter builds one.
vi.mock('@polar-sh/sdk', () => ({ Polar: class {} }));

const secret = 'polar_whs_test_secret';

/** Sign the way Polar does: the key is the UTF-8 bytes of the endpoint secret. */
function signedRequest(
  payload: string,
  options: { secret?: string; body?: string; sentAt?: Date } = {},
) {
  const key = Buffer.from(options.secret ?? secret, 'utf-8').toString('base64');
  const sentAt = options.sentAt ?? new Date();
  return new Request('https://shop.example/api/webhooks/polar', {
    method: 'POST',
    headers: {
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(Math.floor(sentAt.getTime() / 1000)),
      'webhook-signature': new Webhook(key).sign('msg_1', sentAt, payload),
    },
    body: options.body ?? payload,
  });
}

const checkoutUpdated = (status: string) =>
  JSON.stringify({
    type: 'checkout.updated',
    timestamp: '2026-11-18T10:00:00Z',
    // A field this adapter has never heard of must not break verification.
    data: { id: 'polar_co_1', status, some_future_field: { nested: true } },
  });

async function adapter(webhookSecret: string | undefined = secret) {
  const { polarServerAdapter } = await import('../../src/server/adapter.js');
  return polarServerAdapter({ accessToken: 'polar_oat_x', webhookSecret });
}

describe('polarServerAdapter verifyWebhook', () => {
  it.each([
    ['confirmed', 'payment.processing'],
    ['succeeded', 'payment.succeeded'],
    ['failed', 'payment.failed'],
    ['expired', 'checkout.expired'],
  ])('checkout.updated with status %s is %s', async (status, type) => {
    const event = await (await adapter()).verifyWebhook?.(signedRequest(checkoutUpdated(status)));

    expect(event).toEqual({
      provider: 'polar',
      eventId: 'msg_1',
      providerEventType: 'checkout.updated',
      type,
      checkoutId: 'polar_co_1',
    });
  });

  it('passes on an open checkout and order events as unhandled', async () => {
    const polar = await adapter();
    const orderPaid = JSON.stringify({ type: 'order.paid', data: { id: 'order_1', checkout_id: 'polar_co_1' } });

    expect((await polar.verifyWebhook?.(signedRequest(checkoutUpdated('open'))))?.type).toBe('unhandled');
    expect(await polar.verifyWebhook?.(signedRequest(orderPaid))).toEqual({
      provider: 'polar',
      eventId: 'msg_1',
      providerEventType: 'order.paid',
      type: 'unhandled',
    });
  });

  it('rejects a changed body and a wrong secret', async () => {
    const polar = await adapter();
    const payload = checkoutUpdated('succeeded');

    await expect(
      polar.verifyWebhook?.(signedRequest(payload, { body: payload.replace('polar_co_1', 'polar_co_2') })),
    ).rejects.toMatchObject({ code: 'WEBHOOK_VERIFICATION_FAILED' });
    await expect(
      polar.verifyWebhook?.(signedRequest(payload, { secret: 'someone_elses_secret' })),
    ).rejects.toMatchObject({ code: 'WEBHOOK_VERIFICATION_FAILED' });
  });

  it('says what is missing when no webhook secret is configured', async () => {
    const polar = await (await import('../../src/server/adapter.js')).polarServerAdapter({
      accessToken: 'polar_oat_x',
    });

    await expect(
      polar.verifyWebhook?.(signedRequest(checkoutUpdated('succeeded'))),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });

  it('rejects a stale timestamp and a request without signature headers', async () => {
    const polar = await adapter();
    const payload = checkoutUpdated('succeeded');
    const anHourAgo = new Date(Date.now() - 3_600_000);
    const unsigned = new Request('https://shop.example/api/webhooks/polar', {
      method: 'POST',
      body: payload,
    });

    for (const request of [signedRequest(payload, { sentAt: anHourAgo }), unsigned]) {
      await expect(polar.verifyWebhook?.(request)).rejects.toMatchObject({
        code: 'WEBHOOK_VERIFICATION_FAILED',
      });
    }
  });

  it("derives the key the way Polar's SDK does", async () => {
    // The SDK checks the signature first and its schema second. A request
    // this adapter accepts must get past the SDK's signature check too: it
    // then fails only on the schema, which is the step this adapter skips.
    const request = signedRequest(checkoutUpdated('succeeded'));
    const body = await request.clone().text();
    const headers = Object.fromEntries(request.headers);

    expect(() => validateEvent(body, headers, secret)).not.toThrow(WebhookVerificationError);
    expect(() => validateEvent(body, headers, secret)).toThrow();
    expect(() => validateEvent(body, headers, 'someone_elses_secret')).toThrow(
      WebhookVerificationError,
    );
    expect((await (await adapter()).verifyWebhook?.(request))?.type).toBe('payment.succeeded');
  });

  it('acknowledges a signed body that is not JSON instead of asking for it again', async () => {
    const event = await (await adapter()).verifyWebhook?.(signedRequest('not json'));

    expect(event).toMatchObject({ type: 'unhandled', eventId: 'msg_1' });
  });
});
