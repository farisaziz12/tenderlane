/**
 * Configuration for the Stripe server adapter created by {@link stripeServerAdapter}.
 *
 * @property secretKey - Your Stripe secret key (e.g. `sk_test_...` or `sk_live_...`).
 *   This is used to authenticate all Stripe API calls.
 * @property apiVersion - Optional Stripe API version override (e.g. `"2024-12-18.acacia"`).
 *   When omitted, the version bundled with the `stripe` npm package is used.
 */
export interface StripeServerConfig {
  readonly secretKey: string;
  readonly apiVersion?: string;
}
