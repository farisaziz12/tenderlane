import {
  runMiddlewareHook,
  TenderlaneError,
  ProviderError,
  ConfigurationError,
  UnsupportedCapabilityError,
} from '@tenderlane/core';
import type {
  AnyBrowserProvider,
  CheckoutInput,
  CheckoutResult,
  PaymentMethodDescriptor,
  ProviderSession,
  Router,
  SelectedPaymentRoute,
  TenderlaneContext,
} from '@tenderlane/core';
import type {
  TenderlaneClientConfig,
  TenderlaneClientState,
  TenderlaneClient,
} from './types.js';

/** A state without the fields the client derives (`selectedProvider`, `canSubmit`). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type CoreState = DistributiveOmit<TenderlaneClientState, 'selectedProvider' | 'canSubmit'>;

const NOTHING_SETTLED = { providerSession: null, checkoutResult: null, error: null } as const;

function toTenderlaneError(error: unknown, providerId: string, fallback: string): TenderlaneError {
  if (error instanceof TenderlaneError) return error;
  return new ProviderError(error instanceof Error ? error.message : fallback, providerId, {
    cause: error,
  });
}

/**
 * Create a headless checkout client: a small state machine that selects a
 * route for the current context and drives one checkout through the selected
 * provider. Framework-agnostic; bindings subscribe with
 * `subscribe`/`getSnapshot`.
 *
 * The router runs immediately. With a synchronous router (`createRulesRouter`)
 * the client is `ready` as soon as it is created, so server and first client
 * render agree.
 *
 * @example
 * const client = createTenderlaneClient({
 *   context: { country: 'CH', currency: 'chf' },
 *   providers: [stripeProvider({ publishableKey, serverEndpoint: '/api/payments' })],
 *   routing: createRulesRouter({
 *     rules: [{ id: 'ch', when: { country: 'CH' }, use: { provider: 'stripe', flow: 'inline' } }],
 *     fallback: { provider: 'stripe', flow: 'hosted' },
 *   }),
 * });
 *
 * client.getSnapshot().status; // 'ready'
 */
export function createTenderlaneClient<const TProviders extends readonly AnyBrowserProvider[]>(
  config: TenderlaneClientConfig<TProviders>,
): TenderlaneClient {
  const middleware = config.middleware ?? [];
  const routing: Router = config.routing;

  const providerMap = new Map<string, AnyBrowserProvider>();
  for (const provider of config.providers) {
    providerMap.set(provider.id, provider);
  }

  const listeners = new Set<() => void>();
  let evaluationVersion = 0;
  // One submit at a time.
  let submitInFlight = false;
  // A context change or reset() that arrived during a submit. Applied once the
  // submit settles, so its result cannot be overwritten or land on a reset
  // client, and an inline payment element is not unmounted mid-confirmation.
  let deferredEvaluation = false;
  let deferredReset = false;

  /** Inline flows confirm a session that `prepare()` creates first. */
  function needsSession(route: SelectedPaymentRoute): boolean {
    return route.flow === 'inline';
  }

  function derive(core: CoreState): TenderlaneClientState {
    const actionable =
      core.status === 'ready' || core.status === 'prepared' || core.status === 'error';
    const canSubmit =
      actionable &&
      core.route !== null &&
      (!needsSession(core.route) || core.providerSession !== null);
    return { ...core, selectedProvider: core.route?.provider ?? null, canSubmit };
  }

  let state: TenderlaneClientState = derive({
    status: 'idle',
    context: config.context,
    route: null,
    paymentMethods: [],
    selectedPaymentMethod: null,
    ...NOTHING_SETTLED,
  });

  function setState(next: CoreState) {
    state = derive(next);
    for (const listener of listeners) {
      listener();
    }
  }

  /** The fields that survive a transition unless it replaces them. */
  function carried() {
    return {
      context: state.context,
      paymentMethods: state.paymentMethods,
      selectedPaymentMethod: state.selectedPaymentMethod,
    };
  }

  function requireProvider(providerId: string): AnyBrowserProvider {
    const provider = providerMap.get(providerId);
    if (!provider) {
      throw new ConfigurationError(
        `The router selected provider "${providerId}", but no provider with that id was registered. Registered: ${[...providerMap.keys()].join(', ')}`,
      );
    }
    return provider;
  }

  function offeredMethods(
    provider: AnyBrowserProvider,
    context: TenderlaneContext,
    route: SelectedPaymentRoute,
  ): PaymentMethodDescriptor[] {
    const available = provider.getAvailablePaymentMethods(context);
    if (route.paymentMethods.length === 0) return available;
    return available.filter((method) => route.paymentMethods.includes(method.id));
  }

  function applyRoute(context: TenderlaneContext, route: SelectedPaymentRoute) {
    const paymentMethods = offeredMethods(requireProvider(route.provider), context, route);
    // Keep the customer's choice when the new route still offers it.
    const previousMethod = state.selectedPaymentMethod;
    const selectedPaymentMethod =
      previousMethod !== null && paymentMethods.some((method) => method.id === previousMethod)
        ? previousMethod
        : (paymentMethods[0]?.id ?? null);

    setState({
      status: 'ready',
      context,
      route,
      paymentMethods,
      selectedPaymentMethod,
      ...NOTHING_SETTLED,
    });

    void runMiddlewareHook(middleware, 'onRouteEvaluated', { context, route });
  }

  function failEvaluation(context: TenderlaneContext, error: unknown) {
    const tenderlaneError =
      error instanceof TenderlaneError
        ? error
        : new TenderlaneError(
            error instanceof Error ? error.message : 'Route evaluation failed',
            'ROUTING_ERROR',
            { cause: error },
          );

    // No route was selected, so there is nothing to retry against.
    setState({
      status: 'error',
      context,
      route: null,
      paymentMethods: [],
      selectedPaymentMethod: null,
      providerSession: null,
      checkoutResult: null,
      error: tenderlaneError,
    });

    void runMiddlewareHook(middleware, 'onCheckoutError', { context, error: tenderlaneError });
  }

  function evaluate(context: TenderlaneContext) {
    const version = ++evaluationVersion;
    setState({ ...carried(), status: 'evaluating', context, route: state.route, ...NOTHING_SETTLED });

    try {
      const result = routing.evaluate(context);

      // A synchronous router is applied without a microtask, so the client is
      // `ready` by the time createTenderlaneClient() returns.
      if (result instanceof Promise) {
        result
          .then((route) => {
            if (version === evaluationVersion) applyRoute(context, route);
          })
          .catch((error: unknown) => {
            if (version === evaluationVersion) failEvaluation(context, error);
          });
      } else {
        applyRoute(context, result);
      }
    } catch (error) {
      failEvaluation(context, error);
    }
  }

  function resetNow() {
    setState({
      status: 'idle',
      context: state.context,
      route: null,
      paymentMethods: [],
      selectedPaymentMethod: null,
      ...NOTHING_SETTLED,
    });
    // Select a route again so the client is usable; `idle` is only ever
    // observed by a listener between these two updates.
    evaluate(state.context);
  }

  /** The route to act on, or a thrown INVALID_STATE naming what was attempted. */
  function requireActionableRoute(action: 'prepare' | 'submit'): SelectedPaymentRoute {
    const actionable =
      state.status === 'ready' || state.status === 'prepared' || state.status === 'error';
    if (!actionable || state.route === null) {
      throw new TenderlaneError(
        `Cannot ${action} in status "${state.status}": no route is selected or the checkout has settled.`,
        'INVALID_STATE',
      );
    }
    return state.route;
  }

  evaluate(config.context);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return state;
    },

    getProvider(providerId) {
      return providerMap.get(providerId);
    },

    updateContext(context) {
      const previousContext = state.context;
      // A structurally equal context is not a change: re-evaluating would
      // drop the provider session for nothing (an inline `context={{...}}`
      // prop is a new object on every render).
      if (isDeepEqual(previousContext, context)) return;

      void runMiddlewareHook(middleware, 'onContextChange', {
        previousContext,
        nextContext: context,
      });

      if (submitInFlight) {
        state = { ...state, context };
        for (const listener of listeners) listener();
        deferredEvaluation = true;
        return;
      }
      evaluate(context);
    },

    selectPaymentMethod(methodId) {
      if (!state.paymentMethods.some((method) => method.id === methodId)) {
        throw new ConfigurationError(
          `Payment method "${methodId}" is not offered by the current route. Offered: ${state.paymentMethods.map((method) => method.id).join(', ')}`,
        );
      }
      state = { ...state, selectedPaymentMethod: methodId };
      for (const listener of listeners) listener();
    },

    async prepare(input: CheckoutInput): Promise<void> {
      if (submitInFlight) {
        throw new TenderlaneError('Cannot prepare while a submit is in flight.', 'INVALID_STATE');
      }
      const route = requireActionableRoute('prepare');
      const provider = requireProvider(route.provider);
      if (!provider.createSession) {
        throw new UnsupportedCapabilityError(
          `Provider "${route.provider}" cannot create a session for flow "${route.flow}". Route it to a hosted flow instead.`,
          route.provider,
        );
      }

      const context = state.context;
      const version = evaluationVersion;

      // The previous session was created for other input. Dropping it here
      // means a failed re-prepare cannot leave it mounted and payable.
      setState({ ...carried(), status: 'preparing', route, ...NOTHING_SETTLED });

      let session: ProviderSession;
      try {
        session = await provider.createSession(input, route);
      } catch (error) {
        // The context changed meanwhile: this route is no longer selected.
        if (version !== evaluationVersion) return;
        const tenderlaneError = toTenderlaneError(error, route.provider, 'Session creation failed');
        setState({
          ...carried(),
          status: 'error',
          route,
          providerSession: null,
          checkoutResult: null,
          error: tenderlaneError,
        });
        await runMiddlewareHook(middleware, 'onCheckoutError', {
          context,
          route,
          error: tenderlaneError,
        });
        return;
      }

      if (version !== evaluationVersion) return;
      setState({
        ...carried(),
        status: 'prepared',
        route,
        providerSession: session,
        checkoutResult: null,
        error: null,
      });
      await runMiddlewareHook(middleware, 'onSessionCreated', { context, route, session });
    },

    async submit(input: CheckoutInput): Promise<CheckoutResult> {
      if (submitInFlight) {
        throw new TenderlaneError('A submit is already in flight.', 'INVALID_STATE');
      }
      const route = requireActionableRoute('submit');
      const provider = requireProvider(route.provider);
      const providerSession = state.providerSession;
      if (needsSession(route) && providerSession === null) {
        throw new TenderlaneError(
          `Flow "${route.flow}" needs a provider session. Call prepare() before submit().`,
          'INVALID_STATE',
        );
      }

      const context = state.context;
      submitInFlight = true;
      setState({
        ...carried(),
        status: 'submitting',
        route,
        providerSession,
        checkoutResult: null,
        error: null,
      });

      try {
        await runMiddlewareHook(middleware, 'onCheckoutStart', { context, route, input });

        const result = await provider.submit(input, route);

        if (result.status === 'failed' || result.status === 'expired') {
          throw new ProviderError(`Checkout ${result.status}.`, route.provider);
        }

        // Only a completed payment is a success. A hosted checkout has merely
        // been created at this point, and an inline payment may still be
        // processing or waiting on the customer.
        const status =
          result.status === 'complete' ? 'success' : result.url ? 'redirecting' : 'pending';
        setState({
          ...carried(),
          status,
          route,
          providerSession,
          checkoutResult: result,
          error: null,
        });
        await runMiddlewareHook(
          middleware,
          status === 'success' ? 'onCheckoutSuccess' : 'onCheckoutPending',
          { context, route, result },
        );

        return result;
      } catch (error) {
        const tenderlaneError = toTenderlaneError(error, route.provider, 'Checkout failed');

        // The route and session are kept, so the customer can correct the
        // payment details and submit again.
        setState({
          ...carried(),
          status: 'error',
          route,
          providerSession,
          checkoutResult: null,
          error: tenderlaneError,
        });
        await runMiddlewareHook(middleware, 'onCheckoutError', {
          context,
          route,
          error: tenderlaneError,
        });

        throw tenderlaneError;
      } finally {
        submitInFlight = false;
        const failed = state.status === 'error';
        const resetRequested = deferredReset;
        const evaluationRequested = deferredEvaluation;
        deferredReset = false;
        deferredEvaluation = false;
        if (resetRequested) {
          resetNow();
        } else if (evaluationRequested && failed) {
          // The submit failed and the context moved on meanwhile: select the
          // route for the current context. The error was thrown to the caller.
          evaluate(state.context);
        }
      }
    },

    reset() {
      if (submitInFlight) {
        deferredReset = true;
        return;
      }
      resetNow();
    },
  };
}

/** Structural equality for plain JSON-like context values. */
function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  return leftKeys.every(
    (key) => Object.hasOwn(rightRecord, key) && isDeepEqual(leftRecord[key], rightRecord[key]),
  );
}
