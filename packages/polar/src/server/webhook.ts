import { Webhook, WebhookVerificationError as SignatureError } from 'standardwebhooks';
import type { PaymentEvent } from '@tenderlane/core';
import { WebhookVerificationError } from '@tenderlane/core';

/**
 * Verify a Polar webhook and return its JSON payload.
 *
 * Polar signs with the Standard Webhooks scheme, using the UTF-8 bytes of
 * the endpoint secret as the key. This is what `validateEvent` in
 * `@polar-sh/sdk/webhooks` does before it parses. The SDK then validates the
 * whole payload against its generated schema, which rejects a genuine event
 * as soon as Polar adds or changes an unrelated field; this adapter needs
 * three fields, so it verifies the signature and reads only those.
 *
 * @throws {WebhookVerificationError} If the signature does not verify.
 */
export function verifyPolarSignature(
  body: string,
  headers: Record<string, string>,
  secret: string,
): unknown {
  const key = btoa(String.fromCharCode(...new TextEncoder().encode(secret)));
  try {
    return new Webhook(key).verify(body, headers);
  } catch (error) {
    if (error instanceof SignatureError) {
      throw new WebhookVerificationError('The Polar webhook signature did not verify.', 'polar', {
        cause: error,
      });
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reduce a verified Polar payload to a provider-neutral payment event.
 *
 * Only `checkout.updated` is interpreted, with the same status mapping as
 * `retrieve()`, so a webhook and a lookup never disagree. Polar's order
 * events (`order.created`, `order.paid`, ...) describe the same payment from
 * the order's side and are passed on as `unhandled`.
 *
 * @param eventId The `webhook-id` header: Polar's id for the message.
 */
export function mapPolarEvent(payload: unknown, eventId: string): PaymentEvent<'polar'> {
  const providerEventType = isRecord(payload) && typeof payload.type === 'string' ? payload.type : '';
  const base = { provider: 'polar', eventId, providerEventType } as const;

  const data = isRecord(payload) ? payload.data : undefined;
  if (providerEventType !== 'checkout.updated' || !isRecord(data) || typeof data.id !== 'string') {
    return { ...base, type: 'unhandled' };
  }

  switch (data.status) {
    case 'confirmed':
      return { ...base, type: 'payment.processing', checkoutId: data.id };
    case 'succeeded':
      return { ...base, type: 'payment.succeeded', checkoutId: data.id };
    case 'failed':
      return { ...base, type: 'payment.failed', checkoutId: data.id };
    case 'expired':
      return { ...base, type: 'checkout.expired', checkoutId: data.id };
    // `open`: the customer changed something on the page. Not a payment event.
    default:
      return { ...base, type: 'unhandled' };
  }
}
