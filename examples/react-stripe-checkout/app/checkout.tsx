'use client';

import { useState, useMemo } from 'react';
import {
  TenderlaneProvider,
  TenderlaneCheckoutForm,
  useTenderlaneCheckout,
} from '@tenderlane/react';
import { stripeProvider } from '@tenderlane/stripe';
import { StripePaymentElement } from '@tenderlane/stripe/react';
import { createRulesRouter } from '@tenderlane/core';
import type { TenderlaneClientConfig } from '@tenderlane/client';
import type { CheckoutInput } from '@tenderlane/core';

const stripe = stripeProvider({
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder',
  serverEndpoint: '/api/payments/stripe',
});

function RouteDebug() {
  const checkout = useTenderlaneCheckout();

  return (
    <div
      style={{
        marginBottom: 24,
        padding: 16,
        background: '#f8f9fa',
        borderRadius: 12,
        border: '1px solid #e9ecef',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
        <div>
          <strong>Provider:</strong> {checkout.selectedProvider ?? 'Selecting...'}
        </div>
        <div>
          <strong>Status:</strong>{' '}
          <span
            style={{
              color:
                checkout.status === 'ready' || checkout.status === 'prepared'
                  ? '#28a745'
                  : checkout.status === 'error'
                    ? '#dc3545'
                    : '#6c757d',
            }}
          >
            {checkout.status}
          </span>
        </div>
        <div>
          <strong>Route:</strong>{' '}
          {checkout.selectedRoute?.ruleId ?? checkout.selectedRoute?.source ?? '...'}
        </div>
        <div>
          <strong>Flow:</strong> {checkout.selectedRoute?.flow ?? '...'}
        </div>
      </div>
    </div>
  );
}

export function CheckoutPage() {
  const [country, setCountry] = useState('CH');
  const [currency, setCurrency] = useState('chf');
  const [variant, setVariant] = useState('stripe-first');

  const checkoutInput: CheckoutInput = useMemo(
    () => ({
      lineItems: [
        {
          name: 'Premium Plan',
          description: 'Monthly access to all features',
          quantity: 1,
          unitAmount: 2900,
          currency,
        },
      ],
      successUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/success`,
      cancelUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/cancel`,
    }),
    [currency],
  );

  const config: TenderlaneClientConfig = useMemo(
    () => ({
      context: {
        country,
        currency,
        amount: 2900,
        experiment: { checkoutRouting: variant },
      },
      providers: [stripe],
      routing: createRulesRouter({
        rules: [
          {
            id: 'ch-elements',
            description: 'Swiss inline card payments via Stripe Elements',
            when: {
              country: 'CH',
              currency: 'chf',
              experiment: { checkoutRouting: 'stripe-first' },
            },
            use: {
              provider: 'stripe',
              flow: 'payment-intent',
              paymentMethods: ['card', 'twint'],
            },
          },
          {
            id: 'dach-redirect',
            description: 'DACH region redirect via Stripe Checkout',
            when: {
              country: { in: ['CH', 'DE', 'AT'] },
            },
            use: {
              provider: 'stripe',
              flow: 'payment-intent',
              paymentMethods: ['card'],
            },
          },
          {
            id: 'high-value',
            description: 'High-value orders via Stripe with promo codes',
            when: {
              amount: { gte: 10000 },
            },
            use: {
              provider: 'stripe',
              flow: 'payment-intent',
              paymentMethods: ['card'],
              providerOptions: { allow_promotion_codes: true },
            },
          },
        ],
        fallback: {
          provider: 'stripe',
          flow: 'checkout-session',
          paymentMethods: ['card'],
        },
      }),
      middleware: [
        {
          name: 'debug',
          onRouteEvaluated({ context, route }) {
            console.log('[tenderlane] Route evaluated:', {
              context: { country: context.country, currency: context.currency },
              provider: route.provider,
              flow: route.flow,
              ruleId: route.ruleId,
              source: route.source,
            });
          },
          onSessionCreated({ session }) {
            console.log('[tenderlane] Session created:', {
              flow: session.flow,
              hasClientSecret: !!session.clientSecret,
            });
          },
          onCheckoutStart({ route }) {
            console.log('[tenderlane] Checkout starting:', {
              provider: route.provider,
              flow: route.flow,
            });
          },
          onCheckoutError({ error }) {
            console.error('[tenderlane] Checkout error:', error.message);
          },
        },
      ],
    }),
    [country, currency, variant],
  );

  const formattedPrice = (2900 / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Tenderlane Checkout</h1>
        <p style={{ color: '#6c757d', marginBottom: 24, fontSize: 14 }}>
          Change the controls below to see reactive routing. Switzerland + CHF + Stripe First uses
          inline Elements. Other combinations use redirect checkout.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 16,
            marginBottom: 32,
            padding: 16,
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 10,
            fontSize: 14,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Country</span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ced4da' }}
            >
              <option value="CH">Switzerland</option>
              <option value="DE">Germany</option>
              <option value="AT">Austria</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="JP">Japan</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Currency</span>
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ced4da' }}
            >
              <option value="chf">CHF</option>
              <option value="eur">EUR</option>
              <option value="usd">USD</option>
              <option value="gbp">GBP</option>
              <option value="jpy">JPY</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Experiment</span>
            <select
              value={variant}
              onChange={(event) => setVariant(event.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ced4da' }}
            >
              <option value="stripe-first">Stripe First</option>
              <option value="control">Control</option>
            </select>
          </label>
        </div>

        <TenderlaneProvider config={config}>
          <RouteDebug />

          <div
            style={{
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 12,
              border: '1px solid #e9ecef',
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 14, color: '#495057', marginBottom: 8 }}>Order summary</div>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>Premium Plan (monthly)</span>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{formattedPrice}</span>
            </div>
          </div>

          <TenderlaneCheckoutForm
            input={checkoutInput}
            elements={{ stripe: StripePaymentElement as any }}
          >
            {({ status, canSubmit, submit, error }) => (
              <>
                {error && (
                  <div
                    style={{
                      padding: 12,
                      background: '#f8d7da',
                      border: '1px solid #f5c6cb',
                      borderRadius: 8,
                      color: '#721c24',
                      marginBottom: 16,
                      marginTop: 16,
                      fontSize: 14,
                    }}
                  >
                    {error.message}
                  </div>
                )}
                <button
                  disabled={!canSubmit || status === 'submitting'}
                  onClick={submit}
                  style={{
                    width: '100%',
                    marginTop: 16,
                    padding: '14px 24px',
                    background:
                      canSubmit && status !== 'submitting' ? '#0070f3' : '#adb5bd',
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor:
                      canSubmit && status !== 'submitting' ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s',
                  }}
                >
                  {status === 'submitting'
                    ? 'Processing...'
                    : status === 'preparing'
                      ? 'Loading payment form...'
                      : `Pay ${formattedPrice}`}
                </button>
              </>
            )}
          </TenderlaneCheckoutForm>
        </TenderlaneProvider>
      </div>
    </div>
  );
}
