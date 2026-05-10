'use client';

import { useState, useMemo } from 'react';
import {
  TenderlaneProvider,
  TenderlaneCheckoutForm,
  useTenderlaneCheckout,
} from 'tenderlane/react';
import { stripeProvider } from 'tenderlane/stripe';
import { StripePaymentElement } from 'tenderlane/stripe/react';
import { createRulesRouter } from 'tenderlane';
import type { TenderlaneClientConfig } from 'tenderlane/client';
import type { CheckoutInput } from 'tenderlane';
import styles from './checkout.module.css';

const stripe = stripeProvider({
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder',
  serverEndpoint: '/api/payments/stripe',
});

function RouteDebug() {
  const checkout = useTenderlaneCheckout();

  const statusDotClass = {
    idle: styles.statusDotEvaluating,
    evaluating: styles.statusDotEvaluating,
    ready: styles.statusDotReady,
    preparing: styles.statusDotPreparing,
    prepared: styles.statusDotPrepared,
    submitting: styles.statusDotSubmitting,
    success: styles.statusDotReady,
    error: styles.statusDotError,
  }[checkout.status];

  return (
    <div className={styles.debugCard}>
      <div className={styles.debugGrid}>
        <div className={styles.debugItem}>
          <span className={styles.debugLabel}>Provider</span>
          <span className={styles.debugValue}>
            {checkout.selectedProvider ?? 'Selecting...'}
          </span>
        </div>
        <div className={styles.debugItem}>
          <span className={styles.debugLabel}>Status</span>
          <span className={`${styles.debugValue} ${styles.statusBadge}`}>
            <span className={`${styles.statusDot} ${statusDotClass}`} />
            {checkout.status}
          </span>
        </div>
        <div className={styles.debugItem}>
          <span className={styles.debugLabel}>Route</span>
          <span className={styles.debugValue}>
            {checkout.selectedRoute?.ruleId ?? checkout.selectedRoute?.source ?? '...'}
          </span>
        </div>
        <div className={styles.debugItem}>
          <span className={styles.debugLabel}>Flow</span>
          <span className={styles.debugValue}>
            {checkout.selectedRoute?.flow ?? '...'}
          </span>
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
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Tenderlane Checkout</h1>
        <p className={styles.subtitle}>
          Change the controls below to see reactive routing. Switzerland + CHF + Stripe First uses
          inline Elements. Other combinations use redirect checkout.
        </p>
      </div>

      <div className={styles.controlPanel}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Country</span>
          <select
            className={styles.controlSelect}
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option value="CH">Switzerland</option>
            <option value="DE">Germany</option>
            <option value="AT">Austria</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="JP">Japan</option>
          </select>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Currency</span>
          <select
            className={styles.controlSelect}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            <option value="chf">CHF</option>
            <option value="eur">EUR</option>
            <option value="usd">USD</option>
            <option value="gbp">GBP</option>
            <option value="jpy">JPY</option>
          </select>
        </div>

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Experiment</span>
          <select
            className={styles.controlSelect}
            value={variant}
            onChange={(event) => setVariant(event.target.value)}
          >
            <option value="stripe-first">Stripe First</option>
            <option value="control">Control</option>
          </select>
        </div>
      </div>

      <TenderlaneProvider config={config}>
        <RouteDebug />

        <div className={styles.orderCard}>
          <div className={styles.debugLabel}>Order summary</div>
          <div className={styles.orderRow}>
            <span className={styles.orderLabel}>Premium Plan (monthly)</span>
            <span className={styles.orderPrice}>{formattedPrice}</span>
          </div>
        </div>

        <TenderlaneCheckoutForm
          input={checkoutInput}
          elements={{ stripe: StripePaymentElement as any }}
        >
          {({ status, canSubmit, submit, error }) => (
            <>
              {error && (
                <div className={styles.errorBanner}>
                  {error.message}
                </div>
              )}
              <button
                className={styles.payButton}
                disabled={!canSubmit || status === 'submitting'}
                onClick={submit}
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
  );
}
