import { createTenderlaneHandler } from '@tenderlane/core/server';
import type { Catalog, PaymentEvent, ServerProviderAdapter } from '@tenderlane/core';
import { stripeServerAdapter } from '@tenderlane/stripe/server';
import { createPolarCatalog, polarServerAdapter } from '@tenderlane/polar/server';
import { demoServerAdapter } from '../demo-psp/server';
import { catalog } from './catalog';
import { isCountry } from './countries';
import { applyPaymentStatus, findOrder, recordOrder } from './orders';
import type { Order, UpdateSource } from './orders';
import { routing } from './routing';

/** Real provider adapters are registered only when their keys are present. */
function createHandler() {
  const providers: ServerProviderAdapter[] = [demoServerAdapter()];
  const catalogs: Record<string, Catalog> = {};

  if (process.env.STRIPE_SECRET_KEY) {
    providers.push(
      stripeServerAdapter({
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      }),
    );
  }

  if (process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_PRODUCT_ID) {
    const polar = {
      accessToken: process.env.POLAR_ACCESS_TOKEN,
      server: process.env.POLAR_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      webhookSecret: process.env.POLAR_WEBHOOK_SECRET,
    } as const;
    providers.push(polarServerAdapter(polar));
    // Polar sells products it knows by id, so its price comes from Polar.
    catalogs.polar = createPolarCatalog({
      ...polar,
      skus: { 'pro-plan': { productId: process.env.POLAR_PRODUCT_ID } },
    });
  }

  return createTenderlaneHandler({
    providers,
    // Prices come from here, never from the request.
    catalog,
    catalogs,
    // The same rules the browser evaluated. A request for any other provider is rejected.
    routing,
    // The request's context is written by the browser. This example accepts
    // only a country from its own list; a real app would read it from a geo
    // header or the session instead.
    resolveContext: (_request, clientContext) => ({
      country: isCountry(clientContext.country) ? clientContext.country : 'GB',
    }),
    // Record the order under the provider's id, with the prices the server
    // charged. The success page and a webhook look it up by that id.
    onCheckoutCreated: ({ provider, result, items }) => {
      recordOrder({ provider, checkoutId: result.id, items });
    },
    onError: (error) => console.error('[payments]', error),
  });
}

/** Server-only: holds the secret keys. Imported by the API routes and by server components. */
export const handler = createHandler();

/**
 * Ask the provider what the state of an order's payment is and record it.
 * The one place an order's status changes, whoever asks: the success page
 * when the customer returns, or a webhook when the provider says something
 * happened.
 */
export async function refreshOrder(order: Order, source: UpdateSource): Promise<void> {
  const details = await handler.retrieve(order.provider, order.checkoutId);
  applyPaymentStatus(order, details.status, source);
}

/**
 * A webhook is treated as a hint that something changed, not as the change
 * itself: events arrive more than once and out of order, so the current
 * state is read back from the provider.
 */
export async function onPaymentEvent(event: PaymentEvent): Promise<void> {
  if (event.type === 'unhandled') return;
  // Providers also report payments this shop did not start. Not an error.
  const order = findOrder(event.checkoutId);
  if (order) await refreshOrder(order, 'webhook');
}
