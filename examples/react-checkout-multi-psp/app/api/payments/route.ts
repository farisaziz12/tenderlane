import { createTenderlaneHandler } from '@tenderlane/core/server';
import type { Catalog, ServerProviderAdapter } from '@tenderlane/core';
import { stripeServerAdapter } from '@tenderlane/stripe/server';
import { createPolarCatalog, polarServerAdapter } from '@tenderlane/polar/server';
import { catalog } from '../../checkout/catalog';
import { isCountry } from '../../checkout/countries';
import { routing } from '../../checkout/routing';
import { demoServerAdapter } from '../../demo-psp/server';

/** Real PSP adapters are registered only when their keys are present. */
function createHandler() {
  const providers: ServerProviderAdapter[] = [demoServerAdapter()];
  const catalogs: Record<string, Catalog> = {};

  if (process.env.STRIPE_SECRET_KEY) {
    providers.push(stripeServerAdapter({ secretKey: process.env.STRIPE_SECRET_KEY }));
  }

  if (process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_PRODUCT_ID) {
    const polar = {
      accessToken: process.env.POLAR_ACCESS_TOKEN,
      server: process.env.POLAR_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
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
    onError: (error) => console.error('[payments]', error),
  });
}

const handler = createHandler();

export const POST = handler.POST;
