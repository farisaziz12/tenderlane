export interface PolarProviderOptions {
  /**
   * The Polar organization ID this client targets. Used to scope checkouts to
   * the correct merchant; passed through to the server which uses it alongside
   * the server-side access token.
   */
  readonly organizationId: string;

  /**
   * URL of the server endpoint that handles Polar checkout actions. The
   * browser provider POSTs `{ provider: 'polar', action, payload }` here and
   * expects the standard `CheckoutResult` JSON back.
   */
  readonly serverEndpoint: string;
}
