export type PaymentFlow =
  | 'checkout-session'
  | 'payment-intent'
  | 'embedded-checkout'
  | 'redirect'
  | 'custom';

/**
 * Well-known payment method IDs across all providers.
 * Provides IntelliSense autocomplete while remaining extensible via `(string & {})`.
 */
export type KnownPaymentMethodId =
  // Cards
  | 'card'
  // Bank transfers & debits
  | 'sepa_debit'
  | 'bacs_debit'
  | 'ach_debit'
  | 'bank_transfer'
  // European local methods
  | 'ideal'
  | 'bancontact'
  | 'giropay'
  | 'sofort'
  | 'eps'
  | 'p24'
  // Swiss
  | 'twint'
  // Wallets
  | 'apple_pay'
  | 'google_pay'
  | 'paypal'
  // Buy now pay later
  | 'klarna'
  | 'afterpay_clearpay'
  | 'affirm'
  // Asian methods
  | 'alipay'
  | 'wechat_pay'
  // Other
  | 'crypto'
  | 'cash_app'
  | 'link';

/**
 * Payment method identifier. Autocompletes with known methods but accepts
 * any string for custom/provider-specific methods.
 */
export type PaymentMethodId = KnownPaymentMethodId | (string & {});

/**
 * Well-known payment provider IDs.
 * Provides IntelliSense autocomplete for provider names in routing rules.
 */
export type KnownProviderId =
  | 'stripe'
  | 'adyen'
  | 'polar'
  | 'revolut'
  | 'braintree'
  | 'paypal'
  | 'mollie'
  | 'square';

/**
 * Provider identifier. Autocompletes with known providers but accepts
 * any string for custom/internal PSPs.
 */
export type ProviderId = KnownProviderId | (string & {});

/**
 * Capabilities declared by a provider adapter.
 * Generic `TPaymentMethods` preserves literal method IDs through the type system.
 */
export interface ProviderCapabilities<
  TPaymentMethods extends PaymentMethodId = PaymentMethodId,
> {
  readonly provider: ProviderId;
  readonly flows: readonly PaymentFlow[];
  readonly paymentMethods: readonly TPaymentMethods[];
  readonly currencies?: readonly string[];
  readonly countries?: readonly string[];
  readonly supports: {
    readonly redirect?: boolean;
    readonly embedded?: boolean;
    readonly subscriptions?: boolean;
    readonly refunds?: boolean;
    readonly webhooks?: boolean;
  };
}

export interface PaymentMethodDescriptor {
  readonly id: PaymentMethodId;
  readonly label: string;
  readonly type: 'card' | 'bank' | 'wallet' | 'redirect' | 'local' | 'other';
  readonly provider: ProviderId;
}
