'use client';

import { useMemo, useState } from 'react';
import {
  TenderlaneCheckoutForm,
  TenderlaneProvider,
  useTenderlaneCheckout,
} from '@tenderlane/react';
import { StripePaymentElement } from '@tenderlane/stripe/react';
import type { CheckoutInput } from '@tenderlane/core';
import { formatAmount, priceFor } from './catalog';
import { COUNTRIES, type Country } from './countries';
import { providers } from './providers';
import { routing } from './routing';

/** Which real PSPs have keys on the server. The demo PSP always works. */
export interface Configured {
  readonly stripe: boolean;
  readonly polar: boolean;
}

function providerFor(country: Country): string {
  return routing.evaluate({ country }).provider;
}

function isAvailable(country: Country, configured: Configured): boolean {
  const provider = providerFor(country);
  if (provider === 'stripe') return configured.stripe;
  if (provider === 'polar') return configured.polar;
  return true;
}

/** What the router decided, read from the checkout state. */
function RoutePanel() {
  const checkout = useTenderlaneCheckout();
  return (
    <section className="panel">
      <h2>2. Selected route</h2>
      <dl>
        <dt>rule</dt>
        <dd className="mono">{checkout.route?.ruleId ?? checkout.route?.source ?? 'none'}</dd>
        <dt>provider</dt>
        <dd className="mono">{checkout.route?.provider ?? 'none'}</dd>
        <dt>flow</dt>
        <dd className="mono">{checkout.route?.flow ?? 'none'}</dd>
        <dt>status</dt>
        <dd className="mono" data-testid="status">
          {checkout.status}
        </dd>
      </dl>
      <p className="hint">{checkout.route?.reason}</p>
    </section>
  );
}

function statusMessage(status: string, provider: string | null): string | null {
  switch (status) {
    case 'preparing':
      return 'Creating the payment session on the server…';
    case 'redirecting':
      return `Redirecting to ${provider}…`;
    case 'pending':
      return 'The provider accepted the payment but has not completed it yet.';
    case 'success':
      return 'The provider reported the payment complete. A real app fulfils the order from the provider’s webhook, not from this message.';
    default:
      return null;
  }
}

export function Checkout({ configured }: { configured: Configured }) {
  const [country, setCountry] = useState<Country>('GB');

  // App state the router reads. Changing it re-routes the checkout.
  const context = useMemo(() => ({ country }), [country]);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  // What is being bought. There is no price in it: the server decides that.
  const input: CheckoutInput = useMemo(
    () => ({
      items: [{ sku: 'pro-plan', quantity: 1 }],
      context,
      // The provider replaces {CHECKOUT_ID} with its id for this checkout.
      successUrl: `${origin}/success?checkout={CHECKOUT_ID}`,
      cancelUrl: `${origin}/cancel`,
    }),
    [context, origin],
  );

  // Display only. Polar charges the price of its own product, which this
  // page does not know; the server's Polar catalog reads it at checkout.
  const price = priceFor(context);
  const pricedByProvider = providerFor(country) === 'polar';
  const displayPrice = pricedByProvider
    ? 'set by Polar'
    : formatAmount(price.amount, price.currency);

  return (
    <TenderlaneProvider config={{ context, providers, routing }}>
      <div className="grid">
        <section className="panel">
          <h2>1. App state</h2>
          <label className="label" htmlFor="country">
            customer country
          </label>
          <select
            id="country"
            value={country}
            onChange={(event) => setCountry(event.target.value as Country)}
          >
            {COUNTRIES.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <p className="hint">
            The router reads this value. Nothing else in the page decides which provider is used.
          </p>
        </section>

        <RoutePanel />

        <section className="panel">
          <h2>3. Checkout</h2>
          <p>Pro plan</p>
          <p className="price">{displayPrice}</p>

          {isAvailable(country, configured) ? (
            <TenderlaneCheckoutForm input={input} elements={{ stripe: StripePaymentElement }}>
              {({ status, selectedProvider, canSubmit, error, submit, retry }) => (
                <>
                  <button className="button" type="button" disabled={!canSubmit} onClick={submit}>
                    {status === 'submitting'
                      ? 'Processing…'
                      : pricedByProvider
                      ? 'Pay'
                      : `Pay ${displayPrice}`}
                  </button>
                  {statusMessage(status, selectedProvider) && (
                    <p className="hint" role="status">
                      {statusMessage(status, selectedProvider)}
                    </p>
                  )}
                  {error && (
                    <p className="error" role="alert">
                      {error.message}{' '}
                      {!canSubmit && (
                        <button className="link" type="button" onClick={retry}>
                          Try again
                        </button>
                      )}
                    </p>
                  )}
                </>
              )}
            </TenderlaneCheckoutForm>
          ) : (
            <p className="hint" role="status">
              This route uses {providerFor(country)}, and its test keys are not set, so it cannot be
              paid here. Add them to <span className="mono">.env.local</span> (see{' '}
              <span className="mono">.env.example</span>) and restart.
            </p>
          )}
        </section>
      </div>
    </TenderlaneProvider>
  );
}
