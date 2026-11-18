import type {
  BrowserPaymentProvider,
  PaymentMethodDescriptor,
  CheckoutInput,
  CheckoutResult,
  SelectedPaymentRoute,
  ProviderSession,
} from '@tenderlane/core';
import { ProviderError, requestProviderAction } from '@tenderlane/core/adapters';
import {
  STRIPE_CAPABILITIES,
  STRIPE_METHOD_DESCRIPTORS,
  type StripeCapabilities,
} from '../shared/capabilities.js';
import type { StripePhantomTypes } from '../shared/metadata.js';
import type { StripeProviderOptions } from './types.js';
// Types only: @stripe/stripe-js itself is loaded on demand.
import type { PaymentIntent, Stripe, StripeElements } from '@stripe/stripe-js';

/**
 * The Stripe browser provider, plus the two methods `StripePaymentElement`
 * uses to share the Stripe.js instance and the mounted Elements with it.
 */
export interface StripeBrowserProvider
  extends BrowserPaymentProvider<'stripe', StripeCapabilities, StripeProviderOptions> {
  getStripeInstance(): Promise<Stripe>;
  setElements(elements: StripeElements | null): void;
}

/**
 * Create the Stripe browser provider.
 *
 * - `hosted`: asks the server for a Checkout Session and redirects to it.
 * - `inline`: asks the server for a PaymentIntent, then confirms it with the
 *   Payment Element mounted by `StripePaymentElement`.
 *
 * `@stripe/stripe-js` is loaded with a dynamic `import()` the first time the
 * inline flow needs it. A hosted-only checkout never loads Stripe.js.
 */
export function stripeProvider(options: StripeProviderOptions): StripeBrowserProvider {
  const { publishableKey, serverEndpoint, stripeAccount } = options;

  let stripeInstance: Stripe | null = null;
  let elementsInstance: StripeElements | null = null;
  // The secret of the PaymentIntent the mounted element belongs to.
  let currentClientSecret: string | null = null;

  async function getStripeInstance(): Promise<Stripe> {
    if (!stripeInstance) {
      const { loadStripe } = await import('@stripe/stripe-js');
      const instance = await loadStripe(publishableKey, stripeAccount ? { stripeAccount } : undefined);
      if (!instance) {
        throw new ProviderError('Failed to load Stripe.js', 'stripe');
      }
      stripeInstance = instance;
    }
    return stripeInstance;
  }

  async function submitHosted(
    input: CheckoutInput,
    route: SelectedPaymentRoute,
  ): Promise<CheckoutResult> {
    const result = await requestProviderAction({
      endpoint: serverEndpoint,
      provider: 'stripe',
      action: 'checkout',
      input,
      route,
    });
    if (result.url && typeof window !== 'undefined') {
      window.location.href = result.url;
    }
    return result;
  }

  async function submitInline(input: CheckoutInput): Promise<CheckoutResult> {
    if (!elementsInstance) {
      throw new ProviderError(
        'Stripe Elements is not mounted. Render StripePaymentElement before calling submit().',
        'stripe',
      );
    }

    const stripe = await getStripeInstance();
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements: elementsInstance,
      confirmParams: { return_url: input.successUrl },
      redirect: 'if_required',
    });

    if (error) {
      // A card or validation error is Stripe's definite answer. Any other
      // error (a dropped connection, a timeout) leaves the outcome unknown:
      // the confirmation may have reached Stripe. Ask before reporting a
      // failure the customer would answer by paying again.
      const definite = error.type === 'card_error' || error.type === 'validation_error';
      const actual = definite ? undefined : await lookUpPaymentIntent(stripe);
      if (actual && (actual.status === 'succeeded' || actual.status === 'processing')) {
        return toResult(actual);
      }
      throw new ProviderError(error.message ?? 'Payment confirmation failed', 'stripe', {
        providerCode: error.code,
      });
    }
    if (!paymentIntent) {
      throw new ProviderError('Stripe returned neither a PaymentIntent nor an error.', 'stripe');
    }

    return toResult(paymentIntent);
  }

  function toResult(paymentIntent: PaymentIntent): CheckoutResult {
    return {
      provider: 'stripe',
      id: paymentIntent.id,
      // Anything short of `succeeded` is not a completed payment.
      status:
        paymentIntent.status === 'succeeded'
          ? 'complete'
          : paymentIntent.status === 'processing'
            ? 'processing'
            : 'open',
    };
  }

  async function lookUpPaymentIntent(stripe: Stripe): Promise<PaymentIntent | undefined> {
    if (!currentClientSecret) return undefined;
    try {
      const { paymentIntent } = await stripe.retrievePaymentIntent(currentClientSecret);
      return paymentIntent;
    } catch {
      return undefined;
    }
  }

  return {
    '~types': {} as StripePhantomTypes,
    id: 'stripe',
    capabilities: STRIPE_CAPABILITIES,
    getStripeInstance,
    setElements(elements) {
      elementsInstance = elements;
    },

    getAvailablePaymentMethods(): PaymentMethodDescriptor[] {
      return Object.values(STRIPE_METHOD_DESCRIPTORS);
    },

    async createSession(input, route): Promise<ProviderSession> {
      const result = await requestProviderAction({
        endpoint: serverEndpoint,
        provider: 'stripe',
        action: 'create-payment-intent',
        input,
        route,
      });
      if (!result.clientSecret) {
        throw new ProviderError(
          'The server did not return a clientSecret for the PaymentIntent.',
          'stripe',
        );
      }
      currentClientSecret = result.clientSecret;
      return { flow: route.flow, clientSecret: result.clientSecret, sessionId: result.id };
    },

    submit(input, route) {
      return route.flow === 'inline' ? submitInline(input) : submitHosted(input, route);
    },
  };
}
