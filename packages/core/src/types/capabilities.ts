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
 * Well-known ISO 3166-1 alpha-2 country codes.
 * Provides IntelliSense autocomplete for country fields in context and routing rules.
 */
export type KnownCountryCode =
  | 'US' | 'GB' | 'DE' | 'FR' | 'CH' | 'AT' | 'NL' | 'BE'
  | 'IT' | 'ES' | 'PT' | 'IE' | 'SE' | 'NO' | 'DK' | 'FI'
  | 'PL' | 'CZ' | 'HU' | 'RO' | 'BG' | 'HR' | 'SK' | 'SI'
  | 'LT' | 'LV' | 'EE' | 'LU' | 'MT' | 'CY' | 'GR'
  | 'JP' | 'CN' | 'KR' | 'IN' | 'SG' | 'HK' | 'TW' | 'TH'
  | 'AU' | 'NZ' | 'CA' | 'MX' | 'BR' | 'AR' | 'CL' | 'CO'
  | 'AE' | 'SA' | 'IL' | 'ZA' | 'NG' | 'KE' | 'EG';

/** Country code. Autocompletes with known ISO 3166-1 alpha-2 codes but accepts any string. */
export type CountryCode = KnownCountryCode | (string & {});

/**
 * Well-known ISO 4217 currency codes (lowercase).
 * Lowercase convention matches Stripe's API format.
 */
export type KnownCurrencyCode =
  | 'usd' | 'eur' | 'gbp' | 'chf' | 'jpy' | 'cad' | 'aud' | 'nzd'
  | 'sek' | 'nok' | 'dkk' | 'pln' | 'czk' | 'huf' | 'ron' | 'bgn'
  | 'hrk' | 'isk' | 'try' | 'rub' | 'brl' | 'mxn' | 'ars' | 'clp'
  | 'cop' | 'pen' | 'inr' | 'cny' | 'krw' | 'sgd' | 'hkd' | 'twd'
  | 'thb' | 'myr' | 'idr' | 'php' | 'vnd' | 'aed' | 'sar' | 'ils'
  | 'zar' | 'ngn' | 'kes' | 'egp';

/** Currency code. Autocompletes with known ISO 4217 codes (lowercase) but accepts any string. */
export type CurrencyCode = KnownCurrencyCode | (string & {});

/**
 * Well-known BCP 47 locale tags.
 */
export type KnownLocale =
  | 'en' | 'en-US' | 'en-GB' | 'en-AU' | 'en-CA'
  | 'de' | 'de-DE' | 'de-AT' | 'de-CH'
  | 'fr' | 'fr-FR' | 'fr-CA' | 'fr-CH' | 'fr-BE'
  | 'it' | 'it-IT' | 'it-CH'
  | 'es' | 'es-ES' | 'es-MX' | 'es-AR'
  | 'pt' | 'pt-BR' | 'pt-PT'
  | 'nl' | 'nl-NL' | 'nl-BE'
  | 'ja' | 'ko' | 'zh' | 'zh-CN' | 'zh-TW'
  | 'ar' | 'he' | 'th' | 'vi' | 'id' | 'ms'
  | 'pl' | 'cs' | 'hu' | 'ro' | 'bg' | 'hr'
  | 'sv' | 'nb' | 'da' | 'fi';

/** Locale tag. Autocompletes with known BCP 47 tags but accepts any string. */
export type Locale = KnownLocale | (string & {});

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
  readonly currencies?: readonly CurrencyCode[];
  readonly countries?: readonly CountryCode[];
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
