'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  TenderlaneProvider,
  TenderlaneCheckoutForm,
  useTenderlaneCheckout,
} from 'tenderlane/react';
import { stripeProvider } from 'tenderlane/stripe';
import { StripePaymentElement } from 'tenderlane/stripe/react';
import { polarProvider } from 'tenderlane/polar';
import { createRulesRouter } from 'tenderlane';
import type { TenderlaneClientConfig } from 'tenderlane/client';
import type { CheckoutInput, ResolvedCatalogItem } from 'tenderlane';
import { previewCatalog, formatAmount } from './catalog';
import styles from './checkout.module.css';

const stripe = stripeProvider({
  publishableKey:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder',
  serverEndpoint: '/api/payments',
});

const polar = polarProvider({
  organizationId:
    process.env.NEXT_PUBLIC_POLAR_ORGANIZATION_ID ?? 'org_placeholder',
  serverEndpoint: '/api/payments',
});

function RouteDebug({
  resolvedItems,
}: {
  resolvedItems: readonly ResolvedCatalogItem[] | null;
}) {
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

  const previewTotal = resolvedItems
    ? resolvedItems.reduce(
        (total, item) => total + item.unitAmount * item.quantity,
        0,
      )
    : null;
  const previewCurrency = resolvedItems?.[0]?.currency ?? 'usd';

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
            {checkout.selectedRoute?.ruleId ??
              checkout.selectedRoute?.source ??
              '...'}
          </span>
        </div>
        <div className={styles.debugItem}>
          <span className={styles.debugLabel}>Flow</span>
          <span className={styles.debugValue}>
            {checkout.selectedRoute?.flow ?? '...'}
          </span>
        </div>
        <div className={styles.debugItem}>
          <span className={styles.debugLabel}>Catalog preview</span>
          <span className={styles.debugValue}>
            {previewTotal !== null
              ? formatAmount(previewTotal, previewCurrency)
              : '...'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CheckoutPage() {
  const [country, setCountry] = useState('CH');
  const [currency, setCurrency] = useState('chf');
  const [preference, setPreference] = useState<
    'stripe-first' | 'polar-first' | 'auto'
  >('stripe-first');

  // Client-side catalog preview — display only, never trusted server-side.
  // The server re-resolves the same catalog at submit time and decides the
  // canonical amount; this state is purely for showing a running total.
  const [resolvedItems, setResolvedItems] = useState<
    readonly ResolvedCatalogItem[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(
      previewCatalog.resolve([{ sku: 'premium-plan', quantity: 1 }], {
        country,
        currency,
      }),
    )
      .then((items) => {
        if (!cancelled) setResolvedItems(items);
      })
      .catch(() => {
        if (!cancelled) setResolvedItems(null);
      });
    return () => {
      cancelled = true;
    };
  }, [country, currency]);

  const checkoutInput: CheckoutInput = useMemo(
    () => ({
      items: [{ sku: 'premium-plan', quantity: 1 }],
      context: { country, currency },
      successUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/success`,
      cancelUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/cancel`,
    }),
    [country, currency],
  );

  const config: TenderlaneClientConfig = useMemo(
    () => ({
      context: {
        country,
        currency,
        experiment: { providerPreference: preference },
      },
      providers: [stripe, polar],
      routing: createRulesRouter({
        rules: [
          {
            id: 'polar-preferred',
            description: 'Variant: customer routed to Polar hosted checkout',
            when: {
              experiment: { providerPreference: 'polar-first' },
            },
            use: {
              provider: 'polar',
              flow: 'checkout-session',
              paymentMethods: ['card'],
            },
          },
          {
            id: 'ch-stripe-inline',
            description: 'Swiss inline card + Twint via Stripe Elements',
            when: {
              country: 'CH',
              currency: 'chf',
              experiment: { providerPreference: 'stripe-first' },
            },
            use: {
              provider: 'stripe',
              flow: 'payment-intent',
              paymentMethods: ['card', 'twint'],
            },
          },
          {
            id: 'dach-stripe-redirect',
            description: 'DACH region redirect via Stripe Checkout',
            when: {
              country: { in: ['CH', 'DE', 'AT'] },
              experiment: { providerPreference: 'stripe-first' },
            },
            use: {
              provider: 'stripe',
              flow: 'checkout-session',
              paymentMethods: ['card'],
            },
          },
          {
            id: 'auto-usd-polar',
            description: 'Auto: USD purchases routed to Polar (MoR)',
            when: {
              currency: 'usd',
              experiment: { providerPreference: 'auto' },
            },
            use: {
              provider: 'polar',
              flow: 'checkout-session',
              paymentMethods: ['card'],
            },
          },
          {
            id: 'auto-eu-stripe',
            description: 'Auto: EU currencies via Stripe inline',
            when: {
              currency: { in: ['eur', 'gbp', 'chf'] },
              experiment: { providerPreference: 'auto' },
            },
            use: {
              provider: 'stripe',
              flow: 'payment-intent',
              paymentMethods: ['card'],
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
              context: {
                country: context.country,
                currency: context.currency,
                preference: context.experiment?.providerPreference,
              },
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
    [country, currency, preference],
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Tenderlane Checkout</h1>
        <p className={styles.subtitle}>
          One catalog, two PSPs. Change the controls to see routing pick a
          different provider, flow, and payment method. The catalog runs on
          both client (preview) and server (canonical); the wire payload
          carries only <code>{'{ sku, quantity, context }'}</code> — never
          amounts.
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
          <span className={styles.controlLabel}>Provider preference</span>
          <select
            className={styles.controlSelect}
            value={preference}
            onChange={(event) =>
              setPreference(event.target.value as typeof preference)
            }
          >
            <option value="stripe-first">Stripe first</option>
            <option value="polar-first">Polar first</option>
            <option value="auto">Auto (rules pick)</option>
          </select>
        </div>
      </div>

      <TenderlaneProvider config={config}>
        <RouteDebug resolvedItems={resolvedItems} />

        <div className={styles.orderCard}>
          <div className={styles.debugLabel}>Order summary</div>
          <div className={styles.orderRow}>
            <span className={styles.orderLabel}>Premium Plan (monthly)</span>
            <span className={styles.orderPrice}>
              {resolvedItems && resolvedItems[0]
                ? formatAmount(
                    resolvedItems[0].unitAmount,
                    resolvedItems[0].currency,
                  )
                : '...'}
            </span>
          </div>
        </div>

        <TenderlaneCheckoutForm
          input={checkoutInput}
          elements={{ stripe: StripePaymentElement as any }}
        >
          {({ status, canSubmit, submit, error, selectedProvider }) => (
            <>
              {error && <div className={styles.errorBanner}>{error.message}</div>}
              <button
                className={styles.payButton}
                disabled={!canSubmit || status === 'submitting'}
                onClick={submit}
              >
                {status === 'submitting'
                  ? 'Processing...'
                  : status === 'preparing'
                    ? 'Loading payment form...'
                    : selectedProvider
                      ? `Pay with ${selectedProvider}`
                      : 'Pay'}
              </button>
            </>
          )}
        </TenderlaneCheckoutForm>
      </TenderlaneProvider>
    </div>
  );
}
