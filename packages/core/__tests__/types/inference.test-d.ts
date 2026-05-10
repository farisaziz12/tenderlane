import { expectTypeOf, test } from 'vitest';
import type {
  InferProviderId,
  InferProviderIds,
  InferCapabilities,
  InferPaymentMethods,
  BrowserPaymentProvider,
  ProviderCapabilities,
  PaymentMethodId,
  KnownPaymentMethodId,
  KnownCountryCode,
  CountryCode,
  KnownCurrencyCode,
  CurrencyCode,
} from '../../src/index.js';

test('InferProviderId extracts literal provider ID', () => {
  type StripeAdapter = BrowserPaymentProvider<'stripe', ProviderCapabilities>;
  expectTypeOf<InferProviderId<StripeAdapter>>().toEqualTypeOf<'stripe'>();
});

test('InferProviderId returns never for non-provider types', () => {
  expectTypeOf<InferProviderId<{ id: string }>>().toEqualTypeOf<never>();
});

test('InferProviderIds extracts union from tuple', () => {
  type Adapters = readonly [
    BrowserPaymentProvider<'stripe', ProviderCapabilities>,
    BrowserPaymentProvider<'adyen', ProviderCapabilities>,
  ];
  expectTypeOf<InferProviderIds<Adapters>>().toEqualTypeOf<'stripe' | 'adyen'>();
});

test('InferCapabilities extracts capabilities from adapter', () => {
  type TestCaps = ProviderCapabilities & {
    provider: 'test';
    flows: readonly ['checkout-session'];
  };
  type Adapter = BrowserPaymentProvider<'test', TestCaps>;
  expectTypeOf<InferCapabilities<Adapter>>().toEqualTypeOf<TestCaps>();
});

test('provider ID is preserved as literal on adapter', () => {
  type Adapter = BrowserPaymentProvider<'stripe', ProviderCapabilities>;
  const adapter = {} as Adapter;
  expectTypeOf(adapter.id).toEqualTypeOf<'stripe'>();
});

test('InferPaymentMethods extracts literal methods from adapter', () => {
  type Caps = ProviderCapabilities<'card' | 'ideal'>;
  type Adapter = BrowserPaymentProvider<'test', Caps>;
  expectTypeOf<InferPaymentMethods<Adapter>>().toEqualTypeOf<'card' | 'ideal'>();
});

test('InferPaymentMethods works directly on capabilities', () => {
  const caps = {
    provider: 'test',
    flows: ['checkout-session'] as const,
    paymentMethods: ['card', 'sepa_debit'] as const,
    supports: {},
  } as const satisfies ProviderCapabilities;

  expectTypeOf<InferPaymentMethods<typeof caps>>().toEqualTypeOf<'card' | 'sepa_debit'>();
});

test('PaymentMethodId accepts known methods and arbitrary strings', () => {
  // Known methods are assignable
  expectTypeOf<'card'>().toMatchTypeOf<PaymentMethodId>();
  expectTypeOf<'sepa_debit'>().toMatchTypeOf<PaymentMethodId>();
  expectTypeOf<'ideal'>().toMatchTypeOf<PaymentMethodId>();

  // Arbitrary strings are also assignable (extensibility)
  expectTypeOf<'my_custom_method'>().toMatchTypeOf<PaymentMethodId>();
});

test('KnownPaymentMethodId is a strict union', () => {
  expectTypeOf<'card'>().toMatchTypeOf<KnownPaymentMethodId>();
  expectTypeOf<'ideal'>().toMatchTypeOf<KnownPaymentMethodId>();
  // Arbitrary string should NOT match KnownPaymentMethodId
  expectTypeOf<'not_a_real_method'>().not.toMatchTypeOf<KnownPaymentMethodId>();
});

test('KnownCountryCode is a strict union', () => {
  expectTypeOf<'US'>().toMatchTypeOf<KnownCountryCode>();
  expectTypeOf<'CH'>().toMatchTypeOf<KnownCountryCode>();
  expectTypeOf<'INVALID'>().not.toMatchTypeOf<KnownCountryCode>();
});

test('CountryCode accepts known codes and arbitrary strings', () => {
  expectTypeOf<'US'>().toMatchTypeOf<CountryCode>();
  expectTypeOf<'custom_region'>().toMatchTypeOf<CountryCode>();
});

test('KnownCurrencyCode is a strict union', () => {
  expectTypeOf<'usd'>().toMatchTypeOf<KnownCurrencyCode>();
  expectTypeOf<'chf'>().toMatchTypeOf<KnownCurrencyCode>();
  expectTypeOf<'INVALID'>().not.toMatchTypeOf<KnownCurrencyCode>();
});

test('CurrencyCode accepts known codes and arbitrary strings', () => {
  expectTypeOf<'usd'>().toMatchTypeOf<CurrencyCode>();
  expectTypeOf<'custom_coin'>().toMatchTypeOf<CurrencyCode>();
});
