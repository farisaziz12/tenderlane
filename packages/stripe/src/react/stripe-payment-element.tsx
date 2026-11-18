import React, { useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import type { AnyBrowserProvider } from '@tenderlane/core';
import type { StripeBrowserProvider } from '../browser/provider.js';

/**
 * Props of {@link StripePaymentElement}. The same shape as
 * `InlinePaymentElementProps` from `@tenderlane/react`, so the component can
 * be passed to `TenderlaneCheckoutForm`'s `elements` map as is.
 */
export interface StripePaymentElementProps {
  /** The provider returned by `stripeProvider()`. */
  provider: AnyBrowserProvider;
  /** `providerSession.clientSecret` from the checkout state. */
  clientSecret: string;
  onReady?: () => void;
  onChange?: (event: { complete: boolean }) => void;
}

function isStripeProvider(provider: AnyBrowserProvider): provider is StripeBrowserProvider {
  return provider.id === 'stripe' && 'getStripeInstance' in provider && 'setElements' in provider;
}

/** Hands the mounted Elements instance to the provider, which confirms with it. */
function ElementsBridge({
  provider,
  onReady,
  onChange,
}: Pick<StripePaymentElementProps, 'onReady' | 'onChange'> & { provider: StripeBrowserProvider }) {
  const elements = useElements();

  useEffect(() => {
    provider.setElements(elements);
    return () => provider.setElements(null);
  }, [elements, provider]);

  return <PaymentElement onReady={onReady} onChange={onChange} />;
}

/**
 * Stripe's Payment Element for the `inline` flow. Card details are entered
 * into Stripe's iframe and never touch the app or Tenderlane.
 *
 * Import it from `@tenderlane/stripe/react`. To keep `@stripe/react-stripe-js`
 * out of the initial bundle, load this module with your framework's lazy
 * import (`React.lazy`, `next/dynamic`).
 *
 * @example
 * <TenderlaneCheckoutForm input={input} elements={{ stripe: StripePaymentElement }}>
 *   {({ submit, canSubmit }) => <button disabled={!canSubmit} onClick={submit}>Pay</button>}
 * </TenderlaneCheckoutForm>
 */
export function StripePaymentElement({
  provider,
  clientSecret,
  onReady,
  onChange,
}: StripePaymentElementProps) {
  if (!isStripeProvider(provider)) {
    throw new Error(
      `StripePaymentElement was rendered for provider "${provider.id}". Register it under the "stripe" key of \`elements\`.`,
    );
  }

  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);

  useEffect(() => {
    let cancelled = false;
    provider.getStripeInstance().then(
      (instance) => {
        if (!cancelled) setStripeInstance(instance);
      },
      (error: unknown) => {
        console.error('[tenderlane] Stripe.js failed to load:', error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [provider]);

  if (!stripeInstance) return null;

  return (
    <Elements stripe={stripeInstance} options={{ clientSecret }}>
      <ElementsBridge provider={provider} onReady={onReady} onChange={onChange} />
    </Elements>
  );
}
