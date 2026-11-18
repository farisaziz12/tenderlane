import type { ProviderCapabilities, KnownPaymentMethodId } from '@tenderlane/core';

/**
 * Payment methods we currently expose for Polar.
 *
 * Confirmed: `card` (Polar runs card processing through Stripe under the hood).
 * Polar marketing materials reference PayPal, wallets, and local methods but
 * the docs are thin on per-region availability — kept out of the v1
 * capability declaration to avoid lying about what works.
 */
export const POLAR_PAYMENT_METHODS = ['card'] as const satisfies readonly KnownPaymentMethodId[];

/**
 * Capabilities declared by the Polar provider. Honest scope for v1:
 * redirect-only, USD-only, card-only.
 */
export const POLAR_CAPABILITIES = {
  flows: ['hosted'],
  paymentMethods: POLAR_PAYMENT_METHODS,
} as const satisfies ProviderCapabilities;

export type PolarCapabilities = typeof POLAR_CAPABILITIES;
