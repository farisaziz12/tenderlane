import type { ProviderCapabilities, PaymentMethodDescriptor, PaymentFlow } from './capabilities.js';
import type {
  CheckoutDetails,
  CheckoutInput,
  CheckoutResult,
  ResolvedCheckoutInput,
} from './checkout.js';
import type { TenderlaneContext } from './context.js';
import type { ProviderPhantomTypes } from './phantom.js';
import type { SelectedPaymentRoute } from './routing.js';

/**
 * What `createSession()` returns for an inline flow: the data the provider's
 * payment element needs to mount.
 */
export interface ProviderSession {
  readonly flow: PaymentFlow;
  readonly clientSecret: string;
  readonly sessionId: string;
}

/**
 * Browser half of a provider adapter. Holds no secrets. Carries phantom type
 * metadata via `~types` so the provider id stays a string literal.
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
  /**
   * Hosted flow: ask the server for a checkout and redirect to it.
   * Inline flow: confirm the session created by `createSession()`.
   */
  submit(input: CheckoutInput, route: SelectedPaymentRoute): Promise<CheckoutResult>;
  /** Inline flow only: create the provider session the payment element mounts with. */
  createSession?(input: CheckoutInput, route: SelectedPaymentRoute): Promise<ProviderSession>;
}

/** Options the server handler passes to an adapter alongside the payload. */
export interface ServerActionOptions {
  /** Payment methods allowed by the route. Empty or absent means no restriction. */
  readonly paymentMethods?: readonly string[];
}

/**
 * Server half of a provider adapter: the PSP calls that need a secret key.
 *
 * `payload.items` is already resolved by the server's catalog. Adapters read
 * prices only from there.
 */
export interface ServerProviderAdapter<TProviderId extends string = string> {
  readonly id: TProviderId;
  readonly actions: readonly string[];
  handle(
    action: string,
    payload: ResolvedCheckoutInput,
    options?: ServerActionOptions,
  ): Promise<CheckoutResult>;
  /**
   * Read the current state of a checkout from the provider. `id` is the
   * `CheckoutResult.id` that `handle` returned. Optional: a provider that
   * cannot look a checkout up omits it.
   */
  retrieve?(id: string): Promise<CheckoutDetails>;
}

/** Any browser provider, for use in generic constraints. */
export type AnyBrowserProvider = BrowserPaymentProvider<string, ProviderCapabilities, unknown>;
