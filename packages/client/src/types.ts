import type {
  TenderlaneContext,
  BrowserPaymentProvider,
  Router,
  SelectedPaymentRoute,
  TenderlaneMiddleware,
  CheckoutResult,
  PaymentMethodDescriptor,
  CheckoutInput,
  ProviderSession,
} from '@tenderlane/core';
import type { TenderlaneError } from '@tenderlane/core';

/**
 * Union of all possible states in the checkout state machine.
 *
 * Transitions:
 * ```
 * idle → evaluating → ready → preparing → prepared → submitting → success
 *                   ↘ error                                      ↘ error
 * ```
 *
 * - `idle` — Initial state before the first route evaluation, or after {@link TenderlaneClient.reset}.
 * - `evaluating` — The router is evaluating the current context (may be async for auto-routers).
 * - `ready` — A route has been selected and payment methods are available. {@link TenderlaneClientState.canSubmit} is `true`.
 * - `preparing` — A provider session is being created (e.g. PaymentIntent for inline flows).
 * - `prepared` — The provider session is ready. {@link TenderlaneClientState.providerSession} is populated.
 * - `submitting` — The provider's `submit()` call is in progress.
 * - `success` — Checkout completed successfully. {@link TenderlaneClientState.checkoutResult} is populated.
 * - `error` — Any failure during evaluation, preparation, or submission. {@link TenderlaneClientState.error} is populated.
 */
export type ClientStatus =
  | 'idle'
  | 'evaluating'
  | 'ready'
  | 'preparing'
  | 'prepared'
  | 'submitting'
  | 'success'
  | 'error';

/**
 * Configuration object passed to {@link createTenderlaneClient}.
 *
 * @property context - The initial checkout context (country, currency, amount, etc.)
 *   used for the first route evaluation. Update later via {@link TenderlaneClient.updateContext}.
 * @property providers - Registered browser payment provider adapters (e.g. `stripeProvider()`).
 *   The router's selected `provider` ID must match one of these.
 * @property routing - The router that selects a provider and flow based on context.
 *   Typically created with `createRulesRouter()` from `@tenderlane/core`.
 * @property middleware - Optional middleware hooks for observability, analytics, or
 *   side effects at each lifecycle point (route evaluated, checkout start, success, error).
 */
export interface TenderlaneClientConfig {
  readonly context: TenderlaneContext;
  readonly providers: readonly BrowserPaymentProvider[];
  readonly routing: Router;
  readonly middleware?: readonly TenderlaneMiddleware[];
}

/**
 * Immutable state snapshot returned by {@link TenderlaneClient.getSnapshot}.
 *
 * Each state transition produces a new object reference, making this safe
 * for use with React's `useSyncExternalStore` and other external store patterns.
 *
 * @property status - Current position in the checkout state machine.
 * @property context - The active checkout context (country, currency, amount, etc.).
 * @property route - The selected payment route, or `null` before evaluation completes.
 * @property selectedProvider - The ID of the provider chosen by the router (e.g. `"stripe"`), or `null`.
 * @property paymentMethods - Available payment methods for the selected provider and route.
 * @property selectedPaymentMethod - The ID of the currently selected payment method, or `null`.
 * @property canSubmit - Whether the client is in a state that allows calling `submit()`.
 * @property error - The most recent error, or `null` if no error has occurred.
 * @property checkoutResult - The result of a successful checkout, or `null`.
 * @property providerSession - The provider session (e.g. clientSecret) for inline payment flows, or `null` for redirect flows.
 */
export interface TenderlaneClientState {
  readonly status: ClientStatus;
  readonly context: TenderlaneContext;
  readonly route: SelectedPaymentRoute | null;
  readonly selectedProvider: string | null;
  readonly paymentMethods: PaymentMethodDescriptor[];
  readonly selectedPaymentMethod: string | null;
  readonly canSubmit: boolean;
  readonly error: TenderlaneError | null;
  readonly checkoutResult: CheckoutResult | null;
  readonly providerSession: ProviderSession | null;
}

/**
 * The headless checkout client interface.
 *
 * Created by {@link createTenderlaneClient}. Follows the `useSyncExternalStore`
 * contract so it can be consumed directly by React, Solid, Vue, or any
 * framework that supports external stores.
 */
export interface TenderlaneClient {
  /**
   * Register a listener that is called whenever the client state changes.
   * Returns an unsubscribe function. Compatible with `useSyncExternalStore`.
   */
  subscribe(listener: () => void): () => void;

  /**
   * Return the current immutable state snapshot.
   * Returns a stable reference until the next state transition.
   */
  getSnapshot(): TenderlaneClientState;

  /**
   * Look up a registered browser payment provider by its ID.
   * Returns `undefined` if no provider with the given ID was registered.
   */
  getProvider(providerId: string): BrowserPaymentProvider | undefined;

  /**
   * Replace the checkout context and trigger a new route evaluation.
   * Any in-flight evaluation from a previous call is discarded.
   */
  updateContext(context: TenderlaneContext): void;

  /**
   * Select a payment method by ID from the available methods for the current route.
   * Throws a `ConfigurationError` if the method ID is not available.
   */
  selectPaymentMethod(methodId: string): void;

  /**
   * Create a provider session for inline payment flows (e.g. Stripe PaymentIntent).
   * Transitions the state to `preparing` then `prepared`. The resulting
   * {@link TenderlaneClientState.providerSession} contains the `clientSecret`.
   *
   * @throws {TenderlaneError} If the client is not in a submittable state.
   * @throws {UnsupportedCapabilityError} If the provider does not support session creation.
   */
  prepare(input: CheckoutInput): Promise<void>;

  /**
   * Submit the checkout to the selected provider.
   * For redirect flows, this may trigger a browser redirect.
   * For inline flows, call {@link prepare} first to create the session.
   *
   * @returns The checkout result from the provider.
   * @throws {TenderlaneError} If the client is not in a submittable state.
   * @throws {ProviderError} If the provider's submit call fails.
   */
  submit(input: CheckoutInput): Promise<CheckoutResult>;

  /**
   * Reset the client back to the `idle` state, clearing the route,
   * provider, payment methods, errors, and checkout result.
   */
  reset(): void;
}
