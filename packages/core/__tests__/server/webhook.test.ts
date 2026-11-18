import { describe, expect, it, vi } from 'vitest';
import { createTenderlaneHandler } from '../../src/server/handler.js';
import { WebhookVerificationError } from '../../src/errors/errors.js';
import type { PaymentEvent, ServerProviderAdapter } from '../../src/index.js';

const succeeded: PaymentEvent = {
  type: 'payment.succeeded',
  provider: 'acme',
  eventId: 'evt_1',
  providerEventType: 'payment.paid',
  checkoutId: 'cs_1',
};

function adapterThat(verifyWebhook: ServerProviderAdapter['verifyWebhook']): ServerProviderAdapter {
  return {
    id: 'acme',
    actions: ['checkout'],
    handle: async () => ({ provider: 'acme', id: 'cs_1', status: 'open' }),
    verifyWebhook,
  };
}

const request = () =>
  new Request('https://shop.example/api/webhooks/acme', { method: 'POST', body: '{}' });

describe('handler.webhook', () => {
  it('hands a verified event to onEvent and answers 200', async () => {
    const onEvent = vi.fn();
    const handler = createTenderlaneHandler({
      // The adapter adds a field: only the known ones are passed on.
      providers: [adapterThat(async () => ({ ...succeeded, customerEmail: 'someone@example.com' }) as PaymentEvent)],
    });

    const response = await handler.webhook('acme', onEvent)(request());

    expect(response.status).toBe(200);
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith(succeeded);
  });

  it('answers 400 and does not call onEvent when the signature does not verify', async () => {
    const onEvent = vi.fn();
    const handler = createTenderlaneHandler({
      providers: [
        adapterThat(async () => {
          throw new WebhookVerificationError('bad signature', 'acme');
        }),
      ],
    });

    const response = await handler.webhook('acme', onEvent)(request());

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('WEBHOOK_VERIFICATION_FAILED');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('answers 500 when onEvent throws, so the provider delivers again', async () => {
    const onError = vi.fn();
    const handler = createTenderlaneHandler({
      providers: [adapterThat(async () => succeeded)],
      onError,
    });

    const response = await handler.webhook('acme', () => {
      throw new Error('orders table is locked');
    })(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook handler failed.', code: 'INTERNAL_ERROR' });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('answers 500, not 400, when verification fails for a reason other than the signature', async () => {
    const handler = createTenderlaneHandler({
      providers: [
        adapterThat(async () => {
          throw new Error('webhook secret is not configured');
        }),
      ],
    });

    expect((await handler.webhook('acme', vi.fn())(request())).status).toBe(500);
  });

  it('rejects an event without a checkout id as an adapter fault', async () => {
    const onEvent = vi.fn();
    const handler = createTenderlaneHandler({
      providers: [adapterThat(async () => ({ ...succeeded, checkoutId: '' }) as PaymentEvent)],
    });

    expect((await handler.webhook('acme', onEvent)(request())).status).toBe(500);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('fails when the route is built, not on the first delivery, if it cannot work', () => {
    const handler = createTenderlaneHandler({ providers: [adapterThat(undefined)] });

    expect(() => handler.webhook('nope', vi.fn())).toThrowError(
      expect.objectContaining({ code: 'CONFIGURATION_ERROR' }),
    );
    expect(() => handler.webhook('acme', vi.fn())).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_CAPABILITY' }),
    );
  });
});
