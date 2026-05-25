import { createTenderlaneHandler } from 'tenderlane/server';
import {
  stripeServerAdapter,
  createStripeCatalog,
} from 'tenderlane/stripe/server';
import {
  polarServerAdapter,
  createPolarCatalog,
} from 'tenderlane/polar/server';
import type { Catalog, ServerProviderAdapter } from 'tenderlane';
import { previewCatalog } from '../../catalog';

/**
 * Per-provider catalogs: Stripe pulls canonical pricing from
 * `stripe.prices.retrieve(...)`; Polar pulls from `polar.products.get(...)`.
 * The Stripe dashboard / Polar dashboard is the single source of truth for
 * money — no amounts in the example's code, no amounts in any DB.
 *
 * Each catalog only registers when its credentials AND its SKU → native-ID
 * config are present, so the demo still runs Stripe-only when Polar isn't
 * configured (or vice versa).
 */
function getHandler() {
  const providers: ServerProviderAdapter[] = [
    stripeServerAdapter({
      secretKey: process.env.STRIPE_SECRET_KEY!,
    }),
  ];
  const catalogs: Record<string, Catalog> = {};

  if (process.env.STRIPE_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID) {
    catalogs.stripe = createStripeCatalog({
      secretKey: process.env.STRIPE_SECRET_KEY!,
      skus: {
        'premium-plan': {
          priceId: (process.env.STRIPE_PRICE_ID ??
            process.env.NEXT_PUBLIC_STRIPE_PRICE_ID) as string,
        },
      },
    });
  }

  if (
    process.env.POLAR_ACCESS_TOKEN &&
    process.env.POLAR_ORGANIZATION_ID
  ) {
    providers.push(
      polarServerAdapter({
        accessToken: process.env.POLAR_ACCESS_TOKEN,
        organizationId: process.env.POLAR_ORGANIZATION_ID,
        server:
          process.env.POLAR_ENVIRONMENT === 'production'
            ? 'production'
            : 'sandbox',
      }),
    );
    if (process.env.POLAR_PRODUCT_ID) {
      catalogs.polar = createPolarCatalog({
        accessToken: process.env.POLAR_ACCESS_TOKEN,
        organizationId: process.env.POLAR_ORGANIZATION_ID,
        server:
          process.env.POLAR_ENVIRONMENT === 'production'
            ? 'production'
            : 'sandbox',
        skus: {
          'premium-plan': { productId: process.env.POLAR_PRODUCT_ID },
        },
      });
    }
  }

  return createTenderlaneHandler({
    providers,
    // Top-level catalog is the fallback when no per-provider catalog matches
    // and the target for the `/resolve` route. We reuse `previewCatalog`
    // (the same inline catalog the client uses for the running-total
    // preview) so the demo runs out of the box without any PSP product IDs
    // configured. Once `STRIPE_PRICE_ID` / `POLAR_PRODUCT_ID` are set, the
    // per-provider PSP-sourced catalogs in `catalogs` take precedence and
    // this fallback is bypassed for those providers.
    catalog: previewCatalog,
    catalogs,
    middleware: [
      {
        name: 'server-debug',
        onCatalogResolved({ context, resolved }) {
          console.log('[tenderlane:server] Catalog resolved:', {
            currency: context.currency,
            items: resolved.map((item) => ({
              sku: item.sku,
              unitAmount: item.unitAmount,
              currency: item.currency,
              source: item.providerRefs?.stripe?.priceId
                ? `stripe:${item.providerRefs.stripe.priceId}`
                : item.providerRefs?.polar?.productId
                  ? `polar:${item.providerRefs.polar.productId}`
                  : 'unknown',
            })),
          });
        },
      },
    ],
  });
}

export async function POST(request: Request) {
  const handler = getHandler();
  return handler.POST(request);
}
