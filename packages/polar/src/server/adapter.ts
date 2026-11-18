import { Polar } from '@polar-sh/sdk';
import type {
  CheckoutDetails,
  CheckoutResult,
  ResolvedCheckoutInput,
  ServerProviderAdapter,
} from '@tenderlane/core';
import type { PaymentEvent } from '@tenderlane/core';
import { ProviderError, CatalogError, ConfigurationError } from '@tenderlane/core';
import { mapPolarEvent, verifyPolarSignature } from './webhook.js';
import type { PolarServerConfig } from './types.js';
import {
  mapToPolarCheckoutParams,
  mapFromPolarCheckout,
  mapPolarCheckoutDetails,
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
          const checkout = await polar.checkouts.create(mapToPolarCheckoutParams(payload));
          return mapFromPolarCheckout(checkout);
        }

        throw new ProviderError(
          `Polar adapter does not support action "${action}". Supported: checkout`,
          'polar',
        );
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async retrieve(id: string): Promise<CheckoutDetails> {
      try {
        return mapPolarCheckoutDetails(await polar.checkouts.get({ id }));
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async verifyWebhook(request: Request): Promise<PaymentEvent> {
      if (!config.webhookSecret) {
        throw new ConfigurationError(
          'polarServerAdapter needs `webhookSecret` (the secret set on the webhook endpoint) to verify webhooks.',
        );
      }
      // The signature covers the exact bytes Polar sent.
      const body = await request.text();
      const headers = Object.fromEntries(request.headers);
      const payload = verifyPolarSignature(body, headers, config.webhookSecret);
      return mapPolarEvent(payload, headers['webhook-id'] ?? '');
    },
  };
}

/**
 * Catalog and provider errors pass through unchanged, so the server handler
 * maps them to the right HTTP status. Anything else becomes a ProviderError.
 */
function toProviderError(error: unknown): unknown {
  if (error instanceof CatalogError || error instanceof ProviderError) return error;
  return new ProviderError(error instanceof Error ? error.message : 'Unknown Polar error', 'polar', {
    cause: error,
  });
}
