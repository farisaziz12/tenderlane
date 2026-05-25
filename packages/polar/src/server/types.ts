export interface PolarServerConfig {
  /**
   * Polar Organization Access Token (OAT). Scoped to a single organization;
   * passed as a Bearer token by `@polar-sh/sdk`. Must never be exposed in the
   * browser bundle — GitHub Secret Scanning auto-revokes leaked tokens.
   */
  readonly accessToken: string;

  /**
   * The Polar organization ID this adapter targets. Used to scope checkout
   * sessions to the correct merchant.
   */
  readonly organizationId: string;

  /**
   * Which Polar environment to talk to.
   *
   * - `'sandbox'` → `https://sandbox-api.polar.sh`
   * - `'production'` → `https://api.polar.sh`
   *
   * Note: sandbox and production are different hosts with separate credentials,
   * not the same host distinguished by key prefix. Default: `'production'`.
   */
  readonly server?: 'sandbox' | 'production';
}
