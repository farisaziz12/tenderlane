import { CHECKOUT_ID_PLACEHOLDER, ProviderError, defineServerAdapter } from '@tenderlane/core/adapters';
import { findDemoSession, saveDemoSession } from './sessions';

/**
 * Server half of the demo PSP. A real adapter calls the PSP's API with a
 * secret key here. This one keeps its checkouts in memory and links to a page
 * inside the example (`/demo-psp/checkout`) that stands in for a hosted
 * checkout.
 *
 * `payload.items` was priced by the server's catalog. The amount the demo
 * PSP charges comes from there, not from the browser.
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
        // The PSP fills in the checkout id, as Stripe and Polar do.
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
      if (!session) throw new ProviderError(`The demo PSP has no checkout "${id}".`, 'demo');
      return {
        provider: 'demo',
        id,
        status: session.paid ? 'complete' : 'open',
        amountTotal: session.amount,
        currency: session.currency,
      };
    },
  });
}
