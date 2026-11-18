import { defineServerAdapter } from '@tenderlane/core/adapters';

/**
 * Server half of the demo PSP. A real adapter calls the PSP's API with a
 * secret key here. This one builds a link to a page inside the example
 * (`/demo-psp/checkout`) that stands in for a hosted checkout.
 *
 * `payload.items` was priced by the server's catalog. The amount shown on
 * the hosted page comes from there, not from the browser.
 */
export function demoServerAdapter() {
  return defineServerAdapter({
    id: 'demo',
    actions: ['checkout'],
    async handle(_action, payload) {
      const total = payload.items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
      const id = `demo_${crypto.randomUUID()}`;

      // A real PSP stores the session and looks it up by id. The demo has no
      // storage, so the page reads what to display from the query string.
      const url = new URL('/demo-psp/checkout', payload.successUrl);
      url.searchParams.set('session', id);
      url.searchParams.set('amount', String(total));
      url.searchParams.set('currency', payload.items[0]?.currency ?? 'usd');
      url.searchParams.set('item', payload.items.map((item) => item.name).join(', '));
      url.searchParams.set('success', payload.successUrl);
      url.searchParams.set('cancel', payload.cancelUrl);

      return { provider: 'demo', id, status: 'open', url: url.toString() };
    },
  });
}
