import Stripe from 'stripe';
import type {
  ServerActionOptions,
  ServerProviderAdapter,
  ResolvedCheckoutInput,
  CheckoutResult,
} from '@tenderlane/core';
import { CatalogError, ProviderError } from '@tenderlane/core';
import type { StripeServerConfig } from './types.js';
import {
  mapToStripeSessionParams,
  mapFromStripeSession,
  mapToStripePaymentIntentParams,
  mapFromStripePaymentIntent,
} from './mapper.js';

/**
 * Create a Stripe server-side provider adapter.
 *
 * Supports the hosted (Checkout Session) and inline (PaymentIntent) flows.
 * The adapter handles two actions:
 * - `checkout` — Creates a Stripe Checkout Session and returns a redirect URL.
 * - `create-payment-intent` — Creates a Stripe PaymentIntent and returns the `clientSecret`.
 *
 * This function imports the `stripe` npm package and must only be used in
 * server-side code. The browser entry (`@tenderlane/stripe`) never imports this module.
 *
 * @example
 * ```ts
 * import { createTenderlaneHandler } from '@tenderlane/core/server';
 * import { stripeServerAdapter } from '@tenderlane/stripe/server';
 *
 * const handler = createTenderlaneHandler({
 *   providers: [
 *     stripeServerAdapter({
 *       secretKey: process.env.STRIPE_SECRET_KEY,
 *     }),
 *   ],
 * });
 *
 * // Use with any framework (e.g. Next.js App Router)
 * export const POST = handler.POST;
 * ```
 */
export function stripeServerAdapter(
  config: StripeServerConfig,
): ServerProviderAdapter<'stripe'> {
  const stripe = new Stripe(
    config.secretKey,
    config.apiVersion
      ? ({ apiVersion: config.apiVersion } as ConstructorParameters<typeof Stripe>[1])
      : undefined,
  );

  return {
    id: 'stripe' as const,
    actions: ['checkout', 'create-payment-intent'] as const,

    async handle(
      action: string,
      payload: ResolvedCheckoutInput,
      options?: ServerActionOptions,
    ): Promise<CheckoutResult> {
      const paymentMethods = options?.paymentMethods;

      try {
        if (action === 'checkout') {
          const parameters = mapToStripeSessionParams(payload, paymentMethods);

          const session = payload.idempotencyKey
            ? await stripe.checkout.sessions.create(parameters, { idempotencyKey: payload.idempotencyKey })
            : await stripe.checkout.sessions.create(parameters);

          return mapFromStripeSession(session);
        }

        if (action === 'create-payment-intent') {
          const parameters = mapToStripePaymentIntentParams(payload, paymentMethods);

          const paymentIntent = payload.idempotencyKey
            ? await stripe.paymentIntents.create(parameters, { idempotencyKey: payload.idempotencyKey })
            : await stripe.paymentIntents.create(parameters);

          return mapFromStripePaymentIntent(paymentIntent);
        }

        throw new ProviderError(
          `Stripe adapter does not support action "${action}". Supported: checkout, create-payment-intent`,
          'stripe',
        );
      } catch (error) {
        if (error instanceof ProviderError || error instanceof CatalogError) throw error;

        if (error instanceof Stripe.errors.StripeError) {
          throw new ProviderError(
            `Stripe error: ${error.message}`,
            'stripe',
            { providerCode: error.code, cause: error },
          );
        }

        throw new ProviderError(
          error instanceof Error ? error.message : 'Unknown Stripe error',
          'stripe',
          { cause: error },
        );
      }
    },
  };
}
