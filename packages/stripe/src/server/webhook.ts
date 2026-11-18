import type Stripe from 'stripe';
import type { PaymentEvent } from '@tenderlane/core';

type Meaning = Exclude<PaymentEvent['type'], 'unhandled'>;

/**
 * What a Stripe event means for a payment, and which object it is about.
 *
 * Checkout Session events carry the session id (`cs_…`), PaymentIntent events
 * the intent id (`pi_…`). A hosted checkout produces both kinds; an app that
 * recorded the session id will not know the intent id and ignores those.
 */
function interpret(event: Stripe.Event): { type: Meaning; checkoutId: string } | undefined {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // Finished by the customer. Paid for cards; for a bank debit the money
      // is still on its way and an async_payment_* event follows.
      if (session.payment_status === 'paid') return { type: 'payment.succeeded', checkoutId: session.id };
      if (session.payment_status === 'unpaid') return { type: 'payment.processing', checkoutId: session.id };
      // `no_payment_required`: nothing was charged.
      return undefined;
    }
    case 'checkout.session.async_payment_succeeded':
      return { type: 'payment.succeeded', checkoutId: event.data.object.id };
    case 'checkout.session.async_payment_failed':
      return { type: 'payment.failed', checkoutId: event.data.object.id };
    case 'checkout.session.expired':
      return { type: 'checkout.expired', checkoutId: event.data.object.id };
    case 'payment_intent.processing':
      return { type: 'payment.processing', checkoutId: event.data.object.id };
    case 'payment_intent.succeeded':
      return { type: 'payment.succeeded', checkoutId: event.data.object.id };
    case 'payment_intent.payment_failed':
      return { type: 'payment.failed', checkoutId: event.data.object.id };
    case 'payment_intent.canceled':
      return { type: 'checkout.expired', checkoutId: event.data.object.id };
    default:
      return undefined;
  }
}

/** Reduce a verified Stripe event to a provider-neutral payment event. */
export function mapStripeEvent(event: Stripe.Event): PaymentEvent<'stripe'> {
  const base = { provider: 'stripe', eventId: event.id, providerEventType: event.type } as const;
  const meaning = interpret(event);
  return meaning ? { ...base, ...meaning } : { ...base, type: 'unhandled' };
}
