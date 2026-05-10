export interface StripeProviderOptions {
  readonly publishableKey: string;
  readonly serverEndpoint: string;
  readonly stripeAccount?: string;
  readonly locale?: string;
}
