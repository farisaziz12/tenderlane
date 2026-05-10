import type {
  BrowserPaymentProvider,
  TenderlaneContext,
  PaymentMethodDescriptor,
  CheckoutInput,
  CheckoutResult,
  SelectedPaymentRoute,
  ProviderSession,
} from '@tenderlane/core';
import { ProviderError } from '@tenderlane/core';
import {
  STRIPE_CAPABILITIES,
  STRIPE_METHOD_DESCRIPTORS,
  type StripeCapabilities,
} from '../shared/capabilities.js';
import type { StripePhantomTypes } from '../shared/metadata.js';
import type { StripeProviderOptions } from './types.js';

// Import types only — the actual @stripe/stripe-js module is lazy-loaded at runtime
import type { Stripe, StripeElements } from '@stripe/stripe-js';

/**
 * Extended browser provider interface with Stripe-specific methods
 * needed by the StripePaymentElement React wrapper.
 */
export interface StripeBrowserProvider
  extends BrowserPaymentProvider<'stripe', StripeCapabilities, StripeProviderOptions> {
  getStripeInstance(): Promise<Stripe>;
  setElements(elements: StripeElements | null): void;
}

/**
 * Create a Stripe browser payment provider.
 * Supports both redirect (checkout-session) and inline (payment-intent) flows.
 *
 * @stripe/stripe-js is lazy-loaded via dynamic import() — importing this module
 * adds zero bytes of Stripe.js to the bundle.
 */
export function stripeProvider(
  options: StripeProviderOptions,
): StripeBrowserProvider {
  const { publishableKey, serverEndpoint, stripeAccount, locale } = options;

  let stripeInstance: Stripe | null = null;
  let elementsInstance: StripeElements | null = null;

  async function getStripeInstance(): Promise<Stripe> {
    if (!stripeInstance) {
      const { loadStripe } = await import('@stripe/stripe-js');
      const instance = await loadStripe(publishableKey, {
        stripeAccount,
        locale: locale as Parameters<typeof loadStripe>[1] extends { locale?: infer L } ? L : never,
      });
      if (!instance) {
        throw new ProviderError('Failed to load Stripe.js', 'stripe');
      }
      stripeInstance = instance;
    }
    return stripeInstance;
  }

  function setElements(elements: StripeElements | null) {
    elementsInstance = elements;
  }

  async function submitCheckoutSession(
    input: CheckoutInput,
    route: SelectedPaymentRoute,
  ): Promise<CheckoutResult> {
    const response = await fetch(serverEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'stripe',
        action: 'checkout',
        payload: input,
        paymentMethods: route.paymentMethods,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ProviderError(
        `Stripe checkout failed (${response.status}): ${body}`,
        'stripe',
        { cause: new Error(body) },
      );
    }

    const result = (await response.json()) as CheckoutResult;

    if (result.url && typeof window !== 'undefined') {
      window.location.href = result.url;
    }

    return result;
  }

  async function submitPaymentIntent(
    input: CheckoutInput,
  ): Promise<CheckoutResult> {
    if (!elementsInstance) {
      throw new ProviderError(
        'Stripe Elements not mounted. Render the payment element before calling submit().',
        'stripe',
      );
    }

    const stripe = await getStripeInstance();
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements: elementsInstance,
      confirmParams: {
        return_url: input.successUrl,
      },
      redirect: 'if_required',
    });

    if (error) {
      throw new ProviderError(
        error.message ?? 'Payment confirmation failed',
        'stripe',
        { providerCode: error.code },
      );
    }

    return {
      provider: 'stripe',
      id: paymentIntent!.id,
      status: paymentIntent!.status === 'succeeded' ? 'complete' : 'open',
      raw: paymentIntent,
    };
  }

  return {
    '~types': {} as StripePhantomTypes,
    id: 'stripe' as const,
    capabilities: STRIPE_CAPABILITIES,
    getStripeInstance,
    setElements,

    getAvailablePaymentMethods(_context: TenderlaneContext): PaymentMethodDescriptor[] {
      return Object.values(STRIPE_METHOD_DESCRIPTORS);
    },

    async createSession(
      input: CheckoutInput,
      route: SelectedPaymentRoute,
    ): Promise<ProviderSession> {
      const response = await fetch(serverEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'stripe',
          action: 'create-payment-intent',
          payload: input,
          paymentMethods: route.paymentMethods,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ProviderError(
          `Stripe session creation failed (${response.status}): ${body}`,
          'stripe',
          { cause: new Error(body) },
        );
      }

      const result = (await response.json()) as CheckoutResult;
      const clientSecret = (result.raw as { clientSecret?: string })?.clientSecret;

      if (!clientSecret) {
        throw new ProviderError(
          'Stripe server did not return a clientSecret for the PaymentIntent',
          'stripe',
        );
      }

      return {
        flow: route.flow,
        clientSecret,
        sessionId: result.id,
      };
    },

    async submit(
      input: CheckoutInput,
      route: SelectedPaymentRoute,
    ): Promise<CheckoutResult> {
      if (route.flow === 'payment-intent') {
        return submitPaymentIntent(input);
      }
      return submitCheckoutSession(input, route);
    },
  };
}
