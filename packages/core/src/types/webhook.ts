import type { ProviderId } from './capabilities.js';

/**
 * What a provider's webhook said, in provider-neutral terms.
 *
 * - `payment.processing`: the customer did their part; the money has not
 *   arrived and the payment can still fail.
 * - `payment.succeeded`: the provider reports the payment complete.
 * - `payment.failed`: the payment attempt failed, possibly days after it
 *   was `processing`.
 * - `checkout.expired`: the checkout expired or was cancelled unpaid.
 * - `unhandled`: a verified event that is none of the above. It is passed
 *   on, not dropped, so an app can see what it is subscribed to.
 *
 * An event is a notification, not a record: providers deliver at least once
 * and in no guaranteed order. Use `eventId` to ignore repeats, and when the
 * order matters ask for the current state with the handler's `retrieve()`.
 */
export type PaymentEvent<TProviderId extends string = ProviderId> =
  | {
      readonly type:
        | 'payment.processing'
        | 'payment.succeeded'
        | 'payment.failed'
        | 'checkout.expired';
      readonly provider: TProviderId;
      /** The provider's id for this delivery's event. Stable across retries. */
      readonly eventId: string;
      /** The provider's own event name, for example `checkout.session.completed`. */
      readonly providerEventType: string;
      /**
       * The id of the checkout or payment the event is about: the same kind
       * of id `onCheckoutCreated` and `retrieve()` use. It may be one this app
       * never recorded (a provider also reports objects it created itself).
       */
      readonly checkoutId: string;
    }
  | {
      readonly type: 'unhandled';
      readonly provider: TProviderId;
      readonly eventId: string;
      readonly providerEventType: string;
    };

export type PaymentEventType = PaymentEvent['type'];
