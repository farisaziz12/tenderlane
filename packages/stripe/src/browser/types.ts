export interface StripeProviderOptions {
  /** Stripe publishable key (`pk_test_...` or `pk_live_...`). Safe to ship to the browser. */
  readonly publishableKey: string;
  /** URL of the app's Tenderlane handler. */
  readonly serverEndpoint: string;
  /** Connected account id, for Stripe Connect. */
  readonly stripeAccount?: string;
}
