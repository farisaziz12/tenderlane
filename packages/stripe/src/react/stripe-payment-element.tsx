import React, { useEffect, useState, Suspense, createElement } from 'react';
import type { Stripe } from '@stripe/stripe-js';
import type { StripeBrowserProvider } from '../browser/provider.js';

/**
 * Props for the {@link StripePaymentElement} component.
 *
 * Matches the `InlinePaymentElementProps` contract from `@tenderlane/react`.
 *
 * @property provider - The Stripe browser provider instance returned by `stripeProvider()`.
 *   Used to obtain the Stripe.js instance and bind the Elements reference.
 * @property clientSecret - The client secret from the provider session
 *   (obtained via {@link TenderlaneClient.prepare}). Required to initialize Stripe Elements.
 * @property onReady - Optional callback fired when the Stripe Payment Element has fully loaded.
 * @property onChange - Optional callback fired when the payment form state changes,
 *   including whether all required fields are `complete`.
 */
export interface StripePaymentElementProps {
  provider: StripeBrowserProvider;
  clientSecret: string;
  onReady?: () => void;
  onChange?: (event: { complete: boolean }) => void;
}

/**
 * Lazy-loaded inner component that imports @stripe/react-stripe-js.
 * This ensures the heavy Stripe React library is code-split and only
 * loaded when this component actually mounts.
 */
const StripeElementsInner = React.lazy(async () => {
  const stripeReact = await import('@stripe/react-stripe-js');

  function ElementsBridge({
    provider,
    onReady,
    onChange,
  }: {
    provider: StripeBrowserProvider;
    onReady?: () => void;
    onChange?: (event: { complete: boolean }) => void;
  }) {
    const elements = stripeReact.useElements();

    useEffect(() => {
      provider.setElements(elements);
      return () => provider.setElements(null);
    }, [elements, provider]);

    // Cast to any to avoid React type version mismatch between @types/react 18 and 19
    const PaymentElementComponent = stripeReact.PaymentElement as any;
    return createElement(PaymentElementComponent, {
      onReady,
      onChange,
    });
  }

  function StripeElementsWrapper({
    stripeInstance,
    clientSecret,
    provider,
    onReady,
    onChange,
  }: {
    stripeInstance: Stripe;
    clientSecret: string;
    provider: StripeBrowserProvider;
    onReady?: () => void;
    onChange?: (event: { complete: boolean }) => void;
  }) {
    return createElement(
      stripeReact.Elements as any,
      { stripe: stripeInstance, options: { clientSecret } },
      createElement(ElementsBridge, { provider, onReady, onChange }),
    );
  }

  return { default: StripeElementsWrapper };
});

/**
 * Renders a Stripe Payment Element for inline payment collection.
 *
 * Both `@stripe/stripe-js` and `@stripe/react-stripe-js` are lazy-loaded:
 * - Stripe.js loads via dynamic `import()` when the provider's `getStripeInstance()` is called.
 * - `@stripe/react-stripe-js` loads via `React.lazy` when this component mounts.
 *
 * This means zero bundle impact when using redirect flows or non-Stripe providers.
 *
 * @example
 * ```tsx
 * import { useTenderlaneCheckout } from '@tenderlane/react';
 * import { StripePaymentElement } from '@tenderlane/stripe/react';
 *
 * function TenderlaneCheckoutForm({ provider }: { provider: StripeBrowserProvider }) {
 *   const checkout = useTenderlaneCheckout();
 *
 *   if (!checkout.providerSession) return null;
 *
 *   return (
 *     <form onSubmit={(event) => {
 *       event.preventDefault();
 *       checkout.submit({ amount: 5000, currency: 'usd', successUrl: '/success', cancelUrl: '/cancel' });
 *     }}>
 *       <StripePaymentElement
 *         provider={provider}
 *         clientSecret={checkout.providerSession.clientSecret}
 *         onReady={() => console.log('Payment element ready')}
 *         onChange={({ complete }) => console.log('Form complete:', complete)}
 *       />
 *       <button type="submit" disabled={!checkout.canSubmit}>Pay</button>
 *     </form>
 *   );
 * }
 * ```
 */
export function StripePaymentElement({
  provider,
  clientSecret,
  onReady,
  onChange,
}: StripePaymentElementProps) {
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);

  useEffect(() => {
    let cancelled = false;
    provider.getStripeInstance().then((instance) => {
      if (!cancelled) setStripeInstance(instance);
    });
    return () => { cancelled = true; };
  }, [provider]);

  if (!stripeInstance) return null;

  return (
    <Suspense fallback={null}>
      <StripeElementsInner
        stripeInstance={stripeInstance}
        clientSecret={clientSecret}
        provider={provider}
        onReady={onReady}
        onChange={onChange}
      />
    </Suspense>
  );
}
