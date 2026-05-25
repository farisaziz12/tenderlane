import type {
  BrowserPaymentProvider,
  TenderlaneContext,
  PaymentMethodDescriptor,
  CheckoutInput,
  CheckoutResult,
  SelectedPaymentRoute,
} from '@tenderlane/core';
import { ProviderError } from '@tenderlane/core';
import { POLAR_CAPABILITIES, type PolarCapabilities } from '../shared/capabilities.js';
import type { PolarPhantomTypes } from '../shared/metadata.js';
import type { PolarProviderOptions } from './types.js';

/**
 * Browser-side Polar payment provider. v1 ships redirect-only — POSTs the
 * checkout intent to the configured `serverEndpoint`, gets back a hosted
 * Polar checkout URL, and redirects.
 *
 * Importing this module pulls **zero bytes** of `@polar-sh/sdk` or
 * `@polar-sh/checkout` into the browser bundle. The SDK is only used on the
 * server side (`@tenderlane/polar/server`).
 *
 * Polar's iframe embedded flow is deferred to a future minor — it warrants
 * its own design pass since it's a whole-page iframe, not a field-level
 * component like Stripe Elements.
 */
export function polarProvider(
  options: PolarProviderOptions,
): BrowserPaymentProvider<'polar', PolarCapabilities, PolarProviderOptions> {
  const { serverEndpoint } = options;

  return {
    '~types': {} as PolarPhantomTypes,
    id: 'polar' as const,
    capabilities: POLAR_CAPABILITIES,

    getAvailablePaymentMethods(_context: TenderlaneContext): PaymentMethodDescriptor[] {
      return POLAR_CAPABILITIES.paymentMethods.map((id) => ({
        id,
        label: id === 'card' ? 'Card' : id,
        type: 'card',
        provider: 'polar',
      }));
    },

    async submit(
      input: CheckoutInput,
      route: SelectedPaymentRoute,
    ): Promise<CheckoutResult> {
      const response = await fetch(serverEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'polar',
          action: 'checkout',
          payload: input,
          paymentMethods: route.paymentMethods,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ProviderError(
          `Polar checkout failed (${response.status}): ${body}`,
          'polar',
          { cause: new Error(body) },
        );
      }

      const result = (await response.json()) as CheckoutResult;

      if (result.url && typeof window !== 'undefined') {
        window.location.href = result.url;
      }

      return result;
    },
  };
}
