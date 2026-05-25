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

const PLAN = {
  name: 'Premium',
  copy: 'Monthly access to every feature',
  features: [
    'Unlimited projects',
    'Priority support',
    'Webhooks + API access',
    'Cancel any time',
  ],
};

const METHOD_META: Record<
  string,
  { label: string; sub: string; color: string; letter: string; dark?: boolean }
> = {
  card:   { label: 'Card',        sub: 'Visa · Mastercard · Amex',   color: '#3b3f49', letter: 'C' },
  twint:  { label: 'TWINT',       sub: 'Pay with your phone (CH)',   color: '#ED1C24', letter: 'T' },
  ideal:  { label: 'iDEAL',       sub: 'Dutch bank transfer',         color: '#CC0066', letter: 'i' },
  sepa:   { label: 'SEPA Direct', sub: 'Bank debit (EU)',             color: '#0033A0', letter: 'S' },
  klarna: { label: 'Klarna',      sub: 'Pay later or in 3',           color: '#FFB3C7', letter: 'K', dark: true },
  pix:    { label: 'Pix',         sub: 'Instant transfer (BR)',       color: '#32BCAD', letter: 'P' },
};

function methodSubLabel(method: string): { label: string; sub: string } {
  const meta = METHOD_META[method];
  return meta ? { label: meta.label, sub: meta.sub } : { label: method, sub: '' };
}

function StatusDot() {
  const checkout = useTenderlaneCheckout();
  const statusClass =
    {
      idle: styles.statusDotEvaluating,
      evaluating: styles.statusDotEvaluating,
      ready: styles.statusDotReady,
      preparing: styles.statusDotPreparing,
      prepared: styles.statusDotPrepared,
      submitting: styles.statusDotSubmitting,
      success: styles.statusDotReady,
      error: styles.statusDotError,
    }[checkout.status] ?? styles.statusDot;
  return (
    <span className={styles.demoDebug}>
      <span className={`${styles.statusDot} ${statusClass}`} />
      {checkout.selectedProvider ?? 'routing'} · {checkout.status}
    </span>
  );
}

function RouteBadge() {
  const checkout = useTenderlaneCheckout();
  const routeId =
    checkout.selectedRoute?.ruleId ??
    checkout.selectedRoute?.source ??
    'resolving';
  return <div className={styles.sfRouteBadge}>route · {routeId}</div>;
}

function PaymentMethodList() {
  const checkout = useTenderlaneCheckout();
  const methods = checkout.selectedRoute?.paymentMethods ?? ['card'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {methods.map((method, index) => {
        const { label, sub } = methodSubLabel(method);
        const meta = METHOD_META[method];
        const selected = index === 0;
        return (
          <label
            key={`${method}-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid ' + (selected ? 'var(--line-3)' : 'var(--line-1)'),
              background: selected ? 'var(--bg-1)' : 'transparent',
              cursor: 'default',
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--line-3)'),
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {selected && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                  }}
                />
              )}
            </span>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: meta?.color ?? '#888',
                color: meta?.dark ? '#000' : '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {meta?.letter ?? method.charAt(0).toUpperCase()}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
              {sub && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{sub}</span>}
            </span>
          </label>
        );
      })}
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
            when: { experiment: { providerPreference: 'polar-first' } },
            use: { provider: 'polar', flow: 'checkout-session', paymentMethods: ['card'] },
          },
          {
            id: 'ch-stripe-inline',
            description: 'Swiss inline card + Twint via Stripe Elements',
            when: { country: 'CH', currency: 'chf', experiment: { providerPreference: 'stripe-first' } },
            use: { provider: 'stripe', flow: 'payment-intent', paymentMethods: ['card', 'twint'] },
          },
          {
            id: 'dach-stripe-redirect',
            description: 'DACH region redirect via Stripe Checkout',
            when: { country: { in: ['CH', 'DE', 'AT'] }, experiment: { providerPreference: 'stripe-first' } },
            use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card'] },
          },
          {
            id: 'auto-usd-polar',
            description: 'Auto: USD purchases routed to Polar (MoR)',
            when: { currency: 'usd', experiment: { providerPreference: 'auto' } },
            use: { provider: 'polar', flow: 'checkout-session', paymentMethods: ['card'] },
          },
          {
            id: 'auto-eu-stripe',
            description: 'Auto: EU currencies via Stripe inline',
            when: { currency: { in: ['eur', 'gbp', 'chf'] }, experiment: { providerPreference: 'auto' } },
            use: { provider: 'stripe', flow: 'payment-intent', paymentMethods: ['card'] },
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
              context: { country: context.country, currency: context.currency, preference: context.experiment?.providerPreference },
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
            console.log('[tenderlane] Checkout starting:', { provider: route.provider, flow: route.flow });
          },
          onCheckoutError({ error }) {
            console.error('[tenderlane] Checkout error:', error.message);
          },
        },
      ],
    }),
    [country, currency, preference],
  );

  const previewItem = resolvedItems?.[0];
  const previewPrice = previewItem
    ? formatAmount(previewItem.unitAmount, previewItem.currency)
    : '…';

  return (
    <TenderlaneProvider config={config}>
      <div className={styles.sfRoot}>
        {/* Stitch nav */}
        <div className={styles.sfNav}>
          <span className={styles.sfBrand}>
            <span className={styles.sfGlyph}>S</span>
            <span className={styles.sfWordmark}>stitch</span>
            <span className={styles.sfTag}>example app</span>
          </span>
          <div className={styles.sfNavLinks}>
            <a href="#">Product</a>
            <a href="#">Docs</a>
            <a href="#" className={styles.sfActive}>Pricing</a>
            <button className={styles.sfSignin}>Sign in</button>
          </div>
        </div>

        {/* Live demo controls — these drive the actual Tenderlane router. */}
        <div className={styles.demoBar}>
          <span className={styles.demoLabel}>country</span>
          <select
            className={styles.demoSelect}
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            aria-label="Country"
          >
            <option value="CH">CH · Switzerland</option>
            <option value="DE">DE · Germany</option>
            <option value="AT">AT · Austria</option>
            <option value="US">US · United States</option>
            <option value="GB">GB · United Kingdom</option>
            <option value="JP">JP · Japan</option>
          </select>
          <span className={styles.demoLabel}>currency</span>
          <select
            className={styles.demoSelect}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            aria-label="Currency"
          >
            <option value="chf">CHF</option>
            <option value="eur">EUR</option>
            <option value="usd">USD</option>
            <option value="gbp">GBP</option>
            <option value="jpy">JPY</option>
          </select>
          <span className={styles.demoLabel}>preference</span>
          <select
            className={styles.demoSelect}
            value={preference}
            onChange={(event) => setPreference(event.target.value as typeof preference)}
            aria-label="Provider preference"
          >
            <option value="stripe-first">stripe-first</option>
            <option value="polar-first">polar-first</option>
            <option value="auto">auto</option>
          </select>
          <span className={styles.demoSpacer} />
          <StatusDot />
        </div>

        {/* Two-pane checkout */}
        <div className={styles.sfCheckout}>
          {/* Left: order summary */}
          <div className={styles.sfSummary}>
            <div className={styles.sfBack}>← Back to plans</div>
            <div className={styles.sfEyebrow}>UPGRADING TO</div>
            <h1 className={styles.sfPlanName}>
              {PLAN.name} <span style={{ color: 'var(--text-3)' }}>plan</span>
            </h1>
            <p className={styles.sfPlanCopy}>{PLAN.copy}</p>

            <div className={styles.sfOrder}>
              <div className={styles.sfOrderHead}>
                <div>
                  <div className={styles.sfOrderName}>{PLAN.name} · monthly</div>
                  <div className={styles.sfOrderSub}>Renews monthly · cancel anytime</div>
                </div>
                <div className={styles.sfOrderAmt}>{previewPrice}</div>
              </div>
              <div className={styles.sfOrderLine}>
                <span>Subtotal</span>
                <span>{previewPrice}</span>
              </div>
              <div className={styles.sfOrderLine}>
                <span>VAT / Tax</span>
                <span style={{ color: 'var(--text-3)' }}>calculated at confirmation</span>
              </div>
              <div className={styles.sfOrderTotal}>
                <span className={styles.sfOrderTotalLabel}>Total today</span>
                <span className={styles.sfTotalAmt}>{previewPrice}</span>
              </div>
            </div>

            <ul className={styles.sfFeatures}>
              {PLAN.features.map((feature) => (
                <li key={feature}>
                  <span className={styles.sfCheck}>✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: payment */}
          <div className={styles.sfPay}>
            <RouteBadge />
            <h2 className={styles.sfPayTitle}>How would you like to pay?</h2>

            <div className={styles.sfField}>
              <label className={styles.sfFieldLabel}>email</label>
              <div className={styles.sfInput}>you@stitch.example</div>
            </div>

            <div className={styles.sfField}>
              <label className={styles.sfFieldLabel}>payment method</label>
              <PaymentMethodList />
            </div>

            <TenderlaneCheckoutForm
              input={checkoutInput}
              elements={{ stripe: StripePaymentElement as any }}
            >
              {({ status, canSubmit, submit, error, selectedProvider }) => (
                <>
                  <button
                    type="button"
                    className={styles.sfPayBtn}
                    disabled={!canSubmit || status === 'submitting'}
                    onClick={submit}
                  >
                    {status === 'submitting'
                      ? 'Processing…'
                      : status === 'preparing'
                        ? 'Loading payment form…'
                        : `Pay ${previewPrice}`}
                  </button>
                  <p className={styles.sfFoot}>
                    Powered by {selectedProvider ?? 'tenderlane'} via tenderlane · By paying, you agree to the Terms.
                  </p>
                  {error && <div className={styles.sfError}>{error.message}</div>}
                </>
              )}
            </TenderlaneCheckoutForm>
          </div>
        </div>
      </div>
    </TenderlaneProvider>
  );
}
