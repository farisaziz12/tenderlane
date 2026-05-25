import type { ProviderCapabilities, PaymentMethodDescriptor, PaymentFlow } from './capabilities.js';
import type { CheckoutInput, CheckoutResult, ResolvedCheckoutInput } from './checkout.js';
import type { TenderlaneContext } from './context.js';
import type { ProviderPhantomTypes } from './phantom.js';
import type { SelectedPaymentRoute } from './routing.js';

/**
 * Provider-specific session data returned by createSession().
 * Contains information the UI layer needs to render inline payment forms
 * (e.g., Stripe Elements needs clientSecret).
 */
export interface ProviderSession {
  readonly flow: PaymentFlow;
  readonly clientSecret?: string;
  readonly sessionId?: string;
  readonly data?: Record<string, unknown>;
}

/**
 * Browser-side payment provider adapter.
 * Carries phantom type metadata via `~types` for compile-time inference.
 */
export interface BrowserPaymentProvider<
  TProviderId extends string = string,
  TCapabilities extends ProviderCapabilities = ProviderCapabilities,
  TProviderOptions = unknown,
> {
  readonly '~types': ProviderPhantomTypes<TProviderId, TCapabilities, TProviderOptions>;
  readonly id: TProviderId;
  readonly capabilities: TCapabilities;
  getAvailablePaymentMethods(context: TenderlaneContext): PaymentMethodDescriptor[];
  submit(input: CheckoutInput, route: SelectedPaymentRoute): Promise<CheckoutResult>;

  /**
   * Optional: Create a server-side session and return data needed
   * for inline payment forms. Called automatically by the client
   * when the selected route's flow requires it (e.g., payment-intent).
   * Not needed for redirect flows (checkout-session).
   */
  createSession?(
    input: CheckoutInput,
    route: SelectedPaymentRoute,
  ): Promise<ProviderSession>;
}

/**
 * Server-side payment provider adapter. Handles PSP operations that require
 * secret keys.
 *
 * The `payload` is a {@link ResolvedCheckoutInput} — the server handler has
 * already resolved the catalog, so `payload.items[]` carries canonical
 * server-authoritative pricing. Adapters MUST read pricing exclusively from
 * `payload.items[].unitAmount` / `payload.items[].providerRefs`.
 */
export interface ServerProviderAdapter<TProviderId extends string = string> {
  readonly id: TProviderId;
  readonly actions: readonly string[];
  handle(
    action: string,
    payload: ResolvedCheckoutInput,
    options?: Record<string, unknown>,
  ): Promise<CheckoutResult>;
}

/** Any browser payment provider (for use in constraints) */
export type AnyBrowserProvider = BrowserPaymentProvider<string, ProviderCapabilities, any>;
