import { Polar } from '@polar-sh/sdk';
import type {
  CheckoutResult,
  ResolvedCheckoutInput,
  ServerProviderAdapter,
} from '@tenderlane/core';
import { ProviderError, CatalogError } from '@tenderlane/core';
import type { PolarServerConfig } from './types.js';
import {
  mapToPolarCheckoutParams,
  mapFromPolarCheckout,
  type PolarCheckoutResponse,
} from './mapper.js';

/**
 * Create a Polar server-side provider adapter.
 *
 * v1 scope: redirect-only Checkout via `POST /v1/checkouts/`. Polar's
 * iframe-embedded flow (`@polar-sh/checkout`) is deferred.
 *
 * @example
 * ```ts
 * import { createTenderlaneHandler } from '@tenderlane/core/server';
 * import { polarServerAdapter } from '@tenderlane/polar/server';
 *
 * const handler = createTenderlaneHandler({
 *   providers: [
 *     polarServerAdapter({
 *       accessToken: process.env.POLAR_ACCESS_TOKEN!,
 *       organizationId: process.env.POLAR_ORG_ID!,
 *       server: 'sandbox',
 *     }),
 *   ],
 *   catalog: ...,
 * });
 * ```
 */
export function polarServerAdapter(
  config: PolarServerConfig,
): ServerProviderAdapter<'polar'> {
  const polar = new Polar({
    accessToken: config.accessToken,
    server: config.server ?? 'production',
  });

  return {
    id: 'polar' as const,
    actions: ['checkout'] as const,

    async handle(
      action: string,
      payload: ResolvedCheckoutInput,
    ): Promise<CheckoutResult> {
      try {
        if (action === 'checkout') {
          const params = mapToPolarCheckoutParams(payload);
          // `@polar-sh/sdk`'s checkouts.create accepts the same body shape we
          // built locally; cast through unknown to avoid coupling our mapper
          // to the SDK's request type.
          const checkout = (await polar.checkouts.create(
            params as unknown as Parameters<typeof polar.checkouts.create>[0],
          )) as unknown as PolarCheckoutResponse;
          return mapFromPolarCheckout(checkout);
        }

        throw new ProviderError(
          `Polar adapter does not support action "${action}". Supported: checkout`,
          'polar',
        );
      } catch (error) {
        // Catalog and provider errors flow through unchanged so the server
        // handler maps them to the correct HTTP status (400 vs 500).
        if (error instanceof CatalogError) throw error;
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(
          error instanceof Error ? error.message : 'Unknown Polar error',
          'polar',
          { cause: error },
        );
      }
    },
  };
}
