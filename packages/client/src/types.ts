import type {
  AnyBrowserProvider,
  BrowserPaymentProvider,
  CheckoutInput,
  CheckoutResult,
  InferProviderIds,
  PaymentMethodDescriptor,
  ProviderSession,
  Router,
  SelectedPaymentRoute,
  TenderlaneContext,
  TenderlaneError,
  TenderlaneMiddleware,
} from '@tenderlane/core';

/** Fields every state carries. */
interface StateBase {
  /**
   * The latest context. The route was selected for it, except after a context
   * change during a submit or on a settled checkout, which is recorded here
   * but not routed until the submit fails or `reset()` is called.
   */
  readonly context: TenderlaneContext;
  /** Payment methods offered by the selected route. Empty without a route. */
  readonly paymentMethods: readonly PaymentMethodDescriptor[];
  readonly selectedPaymentMethod: string | null;
  /** `route.provider`, or `null` without a route. */
  readonly selectedProvider: string | null;
  /**
   * Whether `submit()` can be called now: a route is selected, nothing is in
   * flight or settled, and an inline flow has its provider session.
   */
  readonly canSubmit: boolean;
}

/**
 * The checkout state machine. `status` is the discriminant: narrowing on it
 * tells you which of `route`, `providerSession`, `checkoutResult` and `error`
 * are present.
 *
 * ```
 * idle → evaluating → ready ─(inline: preparing → prepared)→ submitting → success
 *            ↘ error                    ↘ error                 ├→ redirecting
 *                                                               ├→ pending
 *                                                               └→ error (submit again)
 * ```
 *
 * - `idle`: before the first evaluation. Observable only inside `reset()`.
 * - `evaluating`: an async router is deciding. Sync routers skip this.
 * - `ready`: a route is selected.
 * - `preparing` / `prepared`: inline flows only. The provider session is
 *   being created / is ready for the payment element.
 * - `submitting`: `submit()` is in flight.
 * - `redirecting`: a hosted checkout was created and the browser is leaving
 *   for it. Nothing has been paid yet.
 * - `pending`: the provider accepted the submission but the payment is not
 *   complete (processing, or waiting on the customer).
 * - `success`: the provider's browser SDK reported the payment complete. This
 *   is a client-side signal for the UI. Fulfil orders from the provider's
 *   webhook, not from this state.
 * - `error`: evaluation, preparation or submission failed. With a `route`,
 *   `submit()` (or `prepare()`) can be called again.
 */
export type TenderlaneClientState = StateBase &
  (
    | {
        readonly status: 'idle';
        readonly route: null;
        readonly providerSession: null;
        readonly checkoutResult: null;
        readonly error: null;
      }
    | {
        readonly status: 'evaluating';
        /** The previously selected route, until the new one arrives. */
        readonly route: SelectedPaymentRoute | null;
        readonly providerSession: null;
        readonly checkoutResult: null;
        readonly error: null;
      }
    | {
        readonly status: 'ready' | 'preparing';
        readonly route: SelectedPaymentRoute;
        readonly providerSession: null;
        readonly checkoutResult: null;
        readonly error: null;
      }
    | {
        readonly status: 'prepared';
        readonly route: SelectedPaymentRoute;
        readonly providerSession: ProviderSession;
        readonly checkoutResult: null;
        readonly error: null;
      }
    | {
        readonly status: 'submitting';
        readonly route: SelectedPaymentRoute;
        readonly providerSession: ProviderSession | null;
        readonly checkoutResult: null;
        readonly error: null;
      }
    | {
        readonly status: 'redirecting' | 'pending' | 'success';
        readonly route: SelectedPaymentRoute;
        readonly providerSession: ProviderSession | null;
        readonly checkoutResult: CheckoutResult;
        readonly error: null;
      }
    | {
        readonly status: 'error';
        /** `null` when route evaluation itself failed. */
        readonly route: SelectedPaymentRoute | null;
        readonly providerSession: ProviderSession | null;
        readonly checkoutResult: null;
        readonly error: TenderlaneError;
      }
  );

export type ClientStatus = TenderlaneClientState['status'];

/**
 * Configuration for {@link createTenderlaneClient}.
 *
 * `routing` is checked against `providers`: a router that can select a
 * provider id that is not in `providers` is a type error.
 */
export interface TenderlaneClientConfig<
  TProviders extends readonly AnyBrowserProvider[] = readonly AnyBrowserProvider[],
> {
  /** The initial context. Update it with {@link TenderlaneClient.updateContext}. */
  readonly context: TenderlaneContext;
  /** Browser provider adapters, for example `stripeProvider()`. */
  readonly providers: TProviders;
  /** Selects a provider and flow for a context. Usually `createRulesRouter()`. */
  readonly routing: Router<InferProviderIds<TProviders>>;
  /** Observers for lifecycle events (analytics, logging). They cannot change the outcome. */
  readonly middleware?: readonly TenderlaneMiddleware[];
}

/**
 * The headless checkout client. `subscribe` and `getSnapshot` follow the
 * external-store contract (`useSyncExternalStore`), which is all a framework
 * binding needs.
 */
export interface TenderlaneClient {
  /** Register a listener for state changes. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;

  /** The current state. The same reference until the next transition. */
  getSnapshot(): TenderlaneClientState;

  /** Look up a registered browser provider by id. */
  getProvider(providerId: string): BrowserPaymentProvider | undefined;

  /**
   * Replace the context and select a route for it. A structurally equal
   * context is ignored. During a submit, and once a checkout has settled
   * (`success`, `redirecting`, `pending`), the context is recorded but the
   * route is left alone; call `reset()` to start a new checkout.
   */
  updateContext(context: TenderlaneContext): void;

  /**
   * Select one of `paymentMethods`.
   * @throws {ConfigurationError} If the method is not offered by the route.
   */
  selectPaymentMethod(methodId: string): void;

  /**
   * Inline flows: create the provider session (`ready → preparing → prepared`).
   * A failure is recorded in the state (`status: 'error'`), not thrown.
   *
   * @throws {TenderlaneError} `INVALID_STATE` if no route is selected or a submit is in flight.
   * @throws {UnsupportedCapabilityError} If the provider cannot create sessions.
   */
  prepare(input: CheckoutInput): Promise<void>;

  /**
   * Submit the checkout to the selected provider. One submit runs at a time.
   * Hosted flows redirect the browser; inline flows confirm the prepared
   * session. A failure is recorded in the state and also thrown.
   *
   * @throws {TenderlaneError} `INVALID_STATE` if `canSubmit` is false.
   * @throws {ProviderError} If the provider rejects the submission.
   */
  submit(input: CheckoutInput): Promise<CheckoutResult>;

  /** Clear the error, result and session, then select a route again. */
  reset(): void;
}
