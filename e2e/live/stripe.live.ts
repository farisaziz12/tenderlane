/**
 * The Stripe adapter against Stripe's real API, in test mode.
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_... pnpm test:live
 *
 * Everything else in this repository mocks the `stripe` package, which
 * proves the adapter does what its author believed Stripe does. These cases
 * prove what Stripe actually does. Each row drives one payment method to one
 * outcome with Stripe's documented test data and checks the status Tenderlane
 * reports for it.
 *
 * No browser is involved: a PaymentIntent created by the adapter is confirmed
 * server-side with a test payment method, which is what the Payment Element
 * does on the customer's behalf. Hosted Checkout cannot be completed without
 * a browser, so only its creation, lookup and expiry are covered.
 *
 * Adding a payment method is adding a row. Take the test data from
 * https://docs.stripe.com/testing and the method's own page, and enable the
 * method in the test-mode dashboard first.
 */
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import type { CheckoutStatus, ResolvedCheckoutInput } from '@tenderlane/core';
import { stripeServerAdapter } from '@tenderlane/stripe/server';

const secretKey = process.env.STRIPE_TEST_SECRET_KEY ?? '';
// Refuse anything but a test-mode key: these cases create payments.
const enabled = secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_');

const RETURN_URL = 'https://example.com/return';

interface PaymentCase {
  readonly name: string;
  readonly currency: string;
  /** Tenderlane payment method ids the route allows. */
  readonly paymentMethods: readonly string[];
  /** Server-configured Stripe options, as `createTenderlaneHandler({ providerOptions })` passes them. */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  /** How the customer "pays": the confirm call the Payment Element would make. */
  readonly confirm: Stripe.PaymentIntentConfirmParams;
  /** Whether Stripe rejects the confirmation itself (a decline). */
  readonly confirmFails?: boolean;
  /** The status right after confirmation. */
  readonly expected: CheckoutStatus;
  /** A status the payment moves to on its own in test mode, if any. */
  readonly settlesTo?: CheckoutStatus;
  readonly paymentMethod?: string;
}

const sepaDebit = (iban: string): Stripe.PaymentIntentConfirmParams => ({
  payment_method_data: {
    type: 'sepa_debit',
    sepa_debit: { iban },
    billing_details: { name: 'Jenny Rosen', email: 'jenny@example.com' },
  },
  mandate_data: {
    customer_acceptance: {
      type: 'online',
      online: { ip_address: '127.0.0.1', user_agent: 'tenderlane-live-test' },
    },
  },
});

// Test payment methods and IBANs are Stripe's published test data. They were
// written from memory of the docs; a row that fails on the confirm call,
// rather than on the status assertion, most likely has stale test data.
const CASES: readonly PaymentCase[] = [
  {
    name: 'card, paid at once',
    currency: 'eur',
    paymentMethods: ['card'],
    confirm: { payment_method: 'pm_card_visa' },
    expected: 'complete',
    paymentMethod: 'card',
  },
  {
    name: 'card, declined',
    currency: 'eur',
    paymentMethods: ['card'],
    confirm: { payment_method: 'pm_card_chargeDeclined' },
    confirmFails: true,
    expected: 'failed',
  },
  {
    name: 'card, 3D Secure required: waiting on the customer',
    currency: 'eur',
    paymentMethods: ['card'],
    confirm: { payment_method: 'pm_card_threeDSecure2Required', return_url: RETURN_URL },
    expected: 'open',
  },
  {
    name: 'card, authorised with manual capture: customer is done, money is not taken',
    currency: 'eur',
    paymentMethods: ['card'],
    providerOptions: { capture_method: 'manual' },
    confirm: { payment_method: 'pm_card_visa' },
    expected: 'processing',
    paymentMethod: 'card',
  },
  {
    name: 'SEPA debit that will succeed: processing first',
    currency: 'eur',
    paymentMethods: ['sepa_debit'],
    confirm: sepaDebit('DE89370400440532013000'),
    expected: 'processing',
    settlesTo: 'complete',
    paymentMethod: 'sepa_debit',
  },
  {
    name: 'SEPA debit that will bounce: processing, then failed',
    currency: 'eur',
    paymentMethods: ['sepa_debit'],
    confirm: sepaDebit('DE62370400440532013001'),
    expected: 'processing',
    settlesTo: 'failed',
  },
];

function payload(testCase: PaymentCase): ResolvedCheckoutInput {
  return {
    items: [
      {
        sku: 'live-test',
        name: 'Tenderlane live test',
        quantity: 1,
        unitAmount: 2900,
        currency: testCase.currency,
      },
    ],
    context: {},
    successUrl: RETURN_URL,
    cancelUrl: RETURN_URL,
    metadata: { tenderlane_live_test: testCase.name },
    ...(testCase.providerOptions ? { providerOptions: testCase.providerOptions } : {}),
  };
}

/** Poll `retrieve` until the status is the one expected, or give up. */
async function waitForStatus(
  read: () => Promise<CheckoutStatus>,
  wanted: CheckoutStatus,
  timeoutMs: number,
): Promise<CheckoutStatus> {
  const deadline = Date.now() + timeoutMs;
  let status = await read();
  while (status !== wanted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    status = await read();
  }
  return status;
}

// Built on first use: a skipped suite must not construct a client without a key.
let clients: { stripe: Stripe; adapter: ReturnType<typeof stripeServerAdapter> } | undefined;
function live() {
  clients ??= { stripe: new Stripe(secretKey), adapter: stripeServerAdapter({ secretKey }) };
  return clients;
}

describe.skipIf(!enabled)('Stripe test mode: inline payments', () => {
  it.each(CASES)('$name', async (testCase) => {
    const { stripe, adapter } = live();
    const created = await adapter.handle('create-payment-intent', payload(testCase), {
      paymentMethods: testCase.paymentMethods,
    });
    expect(created).toMatchObject({ provider: 'stripe', status: 'open' });
    expect(created.clientSecret).toBeTruthy();

    const confirmation = stripe.paymentIntents.confirm(created.id, testCase.confirm);
    if (testCase.confirmFails) {
      await expect(confirmation).rejects.toBeInstanceOf(Stripe.errors.StripeError);
    } else {
      await confirmation;
    }

    const details = await adapter.retrieve?.(created.id);
    expect(details).toMatchObject({
      provider: 'stripe',
      id: created.id,
      status: testCase.expected,
      amountTotal: 2900,
      currency: testCase.currency,
    });
    if (testCase.paymentMethod) expect(details?.paymentMethod).toBe(testCase.paymentMethod);

    if (testCase.settlesTo) {
      const settled = await waitForStatus(
        async () => (await adapter.retrieve?.(created.id))?.status ?? 'open',
        testCase.settlesTo,
        45_000,
      );
      expect(settled).toBe(testCase.settlesTo);
    }
  });
});

describe.skipIf(!enabled)('Stripe test mode: hosted checkout', () => {
  it('creates a session at the server price, reads it back, and sees it expire', async () => {
    const { stripe, adapter } = live();
    const created = await adapter.handle(
      'checkout',
      payload({ ...CASES[0]!, name: 'hosted checkout' }),
      { paymentMethods: ['card'] },
    );
    expect(created.id).toMatch(/^cs_test_/);
    expect(created.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    expect(await adapter.retrieve?.(created.id)).toMatchObject({
      status: 'open',
      amountTotal: 2900,
      currency: 'eur',
    });

    await stripe.checkout.sessions.expire(created.id);
    expect((await adapter.retrieve?.(created.id))?.status).toBe('expired');
  });
});

describe.skipIf(enabled)('Stripe test mode', () => {
  it('is skipped: set STRIPE_TEST_SECRET_KEY to a test-mode key (sk_test_...) to run it', () => {
    expect(enabled).toBe(false);
  });
});
