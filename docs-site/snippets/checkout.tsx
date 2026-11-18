import { TenderlaneCheckoutForm, TenderlaneProvider } from '@tenderlane/react';
import { stripeProvider } from '@tenderlane/stripe';
import { StripePaymentElement } from '@tenderlane/stripe/react';
import { routing } from './routing';

const stripe = stripeProvider({
  publishableKey: 'pk_test_...',
  serverEndpoint: '/api/payments',
});

export function Checkout({ country }: { country: string }) {
  return (
    <TenderlaneProvider config={{ context: { country }, providers: [stripe], routing }}>
      <TenderlaneCheckoutForm
        input={{
          items: [{ sku: 'pro-plan', quantity: 1 }],
          successUrl: 'https://shop.example/success',
          cancelUrl: 'https://shop.example/cancel',
        }}
        elements={{ stripe: StripePaymentElement }}
      >
        {({ submit, canSubmit, error }) => (
          <>
            <button disabled={!canSubmit} onClick={submit}>
              Pay
            </button>
            {error && <p role="alert">{error.message}</p>}
          </>
        )}
      </TenderlaneCheckoutForm>
    </TenderlaneProvider>
  );
}
