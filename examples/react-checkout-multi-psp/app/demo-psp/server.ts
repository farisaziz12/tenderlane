import {
  CHECKOUT_ID_PLACEHOLDER,
  ProviderError,
  WebhookVerificationError,
  defineServerAdapter,
} from '@tenderlane/core/adapters';
import { findDemoSession, saveDemoSession } from './sessions';
import { DEMO_SIGNATURE_HEADER, signDemoPayload } from './signature';

/**
 * Server half of the demo provider. A real adapter calls the provider's API with a
 * secret key here. This one keeps its checkouts in memory and links to a page
 * inside the example (`/demo-psp/checkout`) that stands in for a hosted
 * checkout. It implements all three parts of the contract: create, look up,
 * and verify a webhook.
 *
 * `payload.items` was priced by the server's catalog. The amount the demo
 * provider charges comes from there, not from the browser.
 */
export function demoServerAdapter() {
  return defineServerAdapter({
    id: 'demo',
    actions: ['checkout'],

    async handle(_action, payload) {
      const id = `demo_${crypto.randomUUID()}`;
      saveDemoSession({
        id,
        amount: payload.items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0),
        currency: payload.items[0]?.currency ?? 'usd',
        description: payload.items.map((item) => item.name).join(', '),
        // The provider fills in the checkout id, as Stripe and Polar do.
        successUrl: payload.successUrl.replaceAll(CHECKOUT_ID_PLACEHOLDER, id),
        cancelUrl: payload.cancelUrl,
        paid: false,
      });

      const url = new URL('/demo-psp/checkout', payload.successUrl);
      url.searchParams.set('session', id);
      return { provider: 'demo', id, status: 'open', url: url.toString() };
    },

    async retrieve(id) {
      const session = findDemoSession(id);
      if (!session) throw new ProviderError(`The demo provider has no checkout "${id}".`, 'demo');
      return {
        provider: 'demo',
        id,
        status: session.paid ? 'complete' : 'open',
        amountTotal: session.amount,
        currency: session.currency,
      };
    },

    async verifyWebhook(request) {
      // Read as text: the signature covers the exact bytes that were sent.
      const body = await request.text();
      if (request.headers.get(DEMO_SIGNATURE_HEADER) !== (await signDemoPayload(body))) {
        throw new WebhookVerificationError('The demo provider signature did not verify.', 'demo');
      }
      const event: unknown = JSON.parse(body);
      const { id, type, checkout } = event as Record<string, unknown>;
      const base = { provider: 'demo', eventId: String(id), providerEventType: String(type) };
      return type === 'checkout.paid' && typeof checkout === 'string'
        ? { ...base, type: 'payment.succeeded', checkoutId: checkout }
        : { ...base, type: 'unhandled' };
    },
  });
}
