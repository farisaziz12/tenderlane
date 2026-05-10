import type { ProviderCapabilities, PaymentMethodDescriptor } from '@tenderlane/core';

/**
 * All Stripe-supported payment method IDs as a const tuple.
 *
 * Used to derive the {@link StripePaymentMethodId} union type and to declare
 * the Stripe adapter's capabilities. Includes cards, wallets, bank transfers,
 * buy-now-pay-later, and regional redirect methods.
 */
export const STRIPE_PAYMENT_METHODS = [
  'card',
  'paypal',
  'link',
  'sepa_debit',
  'ideal',
  'bancontact',
  'giropay',
  'sofort',
  'eps',
  'p24',
  'twint',
  'klarna',
  'afterpay_clearpay',
  'affirm',
  'alipay',
  'wechat_pay',
  'cash_app',
  'apple_pay',
  'google_pay',
] as const;

/**
 * Supported Stripe checkout flows as a const tuple.
 *
 * - `checkout-session` — Redirect flow using Stripe Checkout Sessions.
 * - `payment-intent` — Inline flow using Stripe PaymentIntents with Elements.
 */
export const STRIPE_FLOWS = ['checkout-session', 'payment-intent'] as const;

/** Literal union of payment methods supported by the Stripe adapter */
export type StripePaymentMethodId = (typeof STRIPE_PAYMENT_METHODS)[number];

/** Literal union of flows supported by the Stripe adapter */
export type StripeFlowId = (typeof STRIPE_FLOWS)[number];

/**
 * Map of every Stripe payment method ID to its {@link PaymentMethodDescriptor}.
 *
 * Each descriptor provides a human-readable `label`, a `type` category
 * (card, wallet, bank, redirect, local), and the owning `provider` ID.
 * Used by `getAvailablePaymentMethods()` to return labeled options for the UI.
 */
export const STRIPE_METHOD_DESCRIPTORS: Record<StripePaymentMethodId, PaymentMethodDescriptor> = {
  card: { id: 'card', label: 'Credit or debit card', type: 'card', provider: 'stripe' },
  paypal: { id: 'paypal', label: 'PayPal', type: 'wallet', provider: 'stripe' },
  link: { id: 'link', label: 'Link', type: 'wallet', provider: 'stripe' },
  sepa_debit: { id: 'sepa_debit', label: 'SEPA Direct Debit', type: 'bank', provider: 'stripe' },
  ideal: { id: 'ideal', label: 'iDEAL', type: 'redirect', provider: 'stripe' },
  bancontact: { id: 'bancontact', label: 'Bancontact', type: 'redirect', provider: 'stripe' },
  giropay: { id: 'giropay', label: 'giropay', type: 'redirect', provider: 'stripe' },
  sofort: { id: 'sofort', label: 'Sofort', type: 'redirect', provider: 'stripe' },
  eps: { id: 'eps', label: 'EPS', type: 'redirect', provider: 'stripe' },
  p24: { id: 'p24', label: 'Przelewy24', type: 'redirect', provider: 'stripe' },
  twint: { id: 'twint', label: 'TWINT', type: 'local', provider: 'stripe' },
  klarna: { id: 'klarna', label: 'Klarna', type: 'redirect', provider: 'stripe' },
  afterpay_clearpay: { id: 'afterpay_clearpay', label: 'Afterpay / Clearpay', type: 'redirect', provider: 'stripe' },
  affirm: { id: 'affirm', label: 'Affirm', type: 'redirect', provider: 'stripe' },
  alipay: { id: 'alipay', label: 'Alipay', type: 'wallet', provider: 'stripe' },
  wechat_pay: { id: 'wechat_pay', label: 'WeChat Pay', type: 'wallet', provider: 'stripe' },
  cash_app: { id: 'cash_app', label: 'Cash App Pay', type: 'wallet', provider: 'stripe' },
  apple_pay: { id: 'apple_pay', label: 'Apple Pay', type: 'wallet', provider: 'stripe' },
  google_pay: { id: 'google_pay', label: 'Google Pay', type: 'wallet', provider: 'stripe' },
};

/**
 * Full capabilities declaration for the Stripe adapter.
 *
 * Declares which flows, payment methods, currencies, and countries the
 * Stripe adapter supports, as well as feature flags for redirect, embedded,
 * subscriptions, refunds, and webhooks. Satisfies the {@link ProviderCapabilities}
 * contract from `@tenderlane/core`.
 *
 * Note: `subscriptions` and `refunds` are declared as `false` in the alpha.
 */
export const STRIPE_CAPABILITIES = {
  provider: 'stripe',
  flows: STRIPE_FLOWS,
  paymentMethods: STRIPE_PAYMENT_METHODS,
  currencies: ['usd', 'eur', 'gbp', 'chf', 'jpy', 'cad', 'aud'] as const,
  countries: ['US', 'GB', 'DE', 'FR', 'CH', 'JP', 'CA', 'AU'] as const,
  supports: {
    redirect: true,
    embedded: true,
    subscriptions: false,
    refunds: false,
    webhooks: true,
  },
} as const satisfies ProviderCapabilities;

export type StripeCapabilities = typeof STRIPE_CAPABILITIES;
