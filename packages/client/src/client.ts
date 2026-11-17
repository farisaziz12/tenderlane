import {
  runMiddlewareHook,
  TenderlaneError,
  ProviderError,
  ConfigurationError,
  UnsupportedCapabilityError,
} from '@tenderlane/core';
import type {
  TenderlaneContext,
  BrowserPaymentProvider,
  CheckoutInput,
  CheckoutResult,
  PaymentMethodDescriptor,
} from '@tenderlane/core';
import type {
  TenderlaneClientConfig,
  TenderlaneClientState,
  TenderlaneClient,
} from './types.js';

/** Flows whose submit confirms a provider session created by prepare(). */
const INLINE_FLOWS: ReadonlySet<string> = new Set(['payment-intent', 'embedded-checkout']);

/**
 * Create a headless Tenderlane checkout client.
 * Framework-agnostic; exposes subscribe/getSnapshot for useSyncExternalStore.
 *
 * The client immediately evaluates the router with the provided context.
 * For synchronous routers (e.g. rules router), the initial state is `ready`
 * rather than `evaluating`, which avoids SSR/hydration mismatches.
 *
 * @example
 * ```ts
 * import { createTenderlaneClient } from '@tenderlane/client';
 * import { createRulesRouter } from '@tenderlane/core';
 * import { stripeProvider } from '@tenderlane/stripe';
 *
 * const client = createTenderlaneClient({
 *   context: { country: 'CH', currency: 'chf', amount: 2500 },
 *   providers: [
 *     stripeProvider({
 *       publishableKey: 'pk_test_...',
 *       serverEndpoint: '/api/checkout',
 *     }),
 *   ],
 *   routing: createRulesRouter({
 *     rules: [
 *       {
 *         match: { country: 'CH' },
 *         route: { provider: 'stripe', flow: 'checkout-session' },
 *       },
 *     ],
 *     fallback: { provider: 'stripe', flow: 'checkout-session' },
 *   }),
 * });
 *
 * // Subscribe to state changes (useSyncExternalStore compatible)
 * const unsubscribe = client.subscribe(() => {
 *   const state = client.getSnapshot();
 *   console.log(state.status, state.paymentMethods);
 * });
 * ```
 */
export function createTenderlaneClient(config: TenderlaneClientConfig): TenderlaneClient {
  const { providers, routing, middleware = [] } = config;

  const providerMap = new Map<string, BrowserPaymentProvider>();
  for (const provider of providers) {
    providerMap.set(provider.id, provider);
  }

  let state: TenderlaneClientState = {
    status: 'idle',
    context: config.context,
    route: null,
    selectedProvider: null,
    paymentMethods: [],
    selectedPaymentMethod: null,
    canSubmit: false,
    error: null,
    checkoutResult: null,
    providerSession: null,
  };

  const listeners = new Set<() => void>();
  let evaluationVersion = 0;
  // One submit at a time. Tracked apart from `status`, which a context change
  // during a submit moves back to `ready`.
  let submitInFlight = false;
  // A context change or reset() that arrived during a submit. Applied once the
  // submit settles, so its result cannot be overwritten or land on a reset
  // client, and an inline payment element is not unmounted mid-confirmation.
  let deferredEvaluation = false;
  let deferredReset = false;

  /** A route is selected and nothing terminal has happened. `error` is retryable. */
  function canAct(): boolean {
    return (
      (state.status === 'ready' || state.status === 'prepared' || state.status === 'error') &&
      state.route !== null &&
      state.selectedProvider !== null
    );
  }

  function setState(partial: Partial<TenderlaneClientState>) {
    state = { ...state, ...partial };
    for (const listener of listeners) {
      listener();
    }
  }

  function getPaymentMethods(
    provider: BrowserPaymentProvider,
    context: TenderlaneContext,
    routeMethods: string[],
  ): PaymentMethodDescriptor[] {
    const available = provider.getAvailablePaymentMethods(context);
    if (routeMethods.length === 0) return available;
    return available.filter((method) => routeMethods.includes(method.id));
  }

  function applyRoute(
    context: TenderlaneContext,
    route: import('@tenderlane/core').SelectedPaymentRoute,
  ) {
    const provider = providerMap.get(route.provider);
    if (!provider) {
      throw new ConfigurationError(
        `Provider "${route.provider}" was selected by routing rules, but no provider adapter with id "${route.provider}" was registered. Available: ${[...providerMap.keys()].join(', ')}`,
      );
    }

    const methods = getPaymentMethods(provider, context, route.paymentMethods);
    // Keep the user's choice when the new route still offers it.
    const previousMethod = state.selectedPaymentMethod;
    const selectedPaymentMethod =
      previousMethod !== null && methods.some((method) => method.id === previousMethod)
        ? previousMethod
        : (methods[0]?.id ?? null);

    setState({
      status: 'ready',
      route,
      selectedProvider: route.provider,
      paymentMethods: methods,
      selectedPaymentMethod,
      canSubmit: true,
    });

    runMiddlewareHook(middleware, 'onRouteEvaluated', { context, route });
  }

  function handleEvaluationError(context: TenderlaneContext, error: unknown) {
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
      error: tenderlaneError,
      route: null,
      selectedProvider: null,
      paymentMethods: [],
      selectedPaymentMethod: null,
      canSubmit: false,
    });

    runMiddlewareHook(middleware, 'onCheckoutError', {
      context,
      error: tenderlaneError,
    });
  }

  function resetNow() {
    evaluationVersion++;
    setState({
      status: 'idle',
      route: null,
      selectedProvider: null,
      paymentMethods: [],
      selectedPaymentMethod: null,
      canSubmit: false,
      error: null,
      checkoutResult: null,
      providerSession: null,
    });
    // Select a route again so the client is usable; `idle` is only ever
    // observed by a listener between these two updates.
    evaluate(state.context);
  }

  function evaluate(context: TenderlaneContext) {
    const version = ++evaluationVersion;
    setState({ status: 'evaluating', error: null, providerSession: null, canSubmit: false });

    try {
      const result = routing.evaluate(context as unknown as Record<string, unknown>);

      // Handle synchronous routers (rules router) without going through
      // a microtask. This ensures the state is 'ready' immediately,
      // which prevents SSR/hydration mismatches.
      if (result instanceof Promise) {
        result
          .then((route) => {
            if (version !== evaluationVersion) return;
            applyRoute(context, route);
          })
          .catch((error) => {
            if (version !== evaluationVersion) return;
            handleEvaluationError(context, error);
          });
      } else {
        applyRoute(context, result);
      }
    } catch (error) {
      handleEvaluationError(context, error);
    }
  }

  // Initial evaluation — runs synchronously for rules router,
  // so the initial state is 'ready' (not 'evaluating').
  evaluate(config.context);

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): TenderlaneClientState {
      return state;
    },

    getProvider(providerId: string): BrowserPaymentProvider | undefined {
      return providerMap.get(providerId);
    },

    updateContext(context: TenderlaneContext) {
      const previousContext = state.context;
      // A structurally equal context is not a change: re-evaluating would
      // drop the provider session for nothing (an inline `context={{...}}`
      // prop is a new object on every render).
      if (isDeepEqual(previousContext, context)) return;
      setState({ context });

      runMiddlewareHook(middleware, 'onContextChange', {
        previousContext,
        nextContext: context,
      });

      if (submitInFlight) {
        deferredEvaluation = true;
        return;
      }
      evaluate(context);
    },

    selectPaymentMethod(methodId: string) {
      const method = state.paymentMethods.find((method) => method.id === methodId);
      if (!method) {
        throw new ConfigurationError(
          `Payment method "${methodId}" is not available. Available: ${state.paymentMethods.map((method) => method.id).join(', ')}`,
        );
      }
      setState({ selectedPaymentMethod: methodId });
    },

    async prepare(input: CheckoutInput): Promise<void> {
      if (!canAct() || !state.route || !state.selectedProvider) {
        throw new TenderlaneError(
          `Cannot prepare in status "${state.status}". Wait for route evaluation to complete.`,
          'INVALID_STATE',
        );
      }
      if (submitInFlight) {
        throw new TenderlaneError('Cannot prepare while a submit is in flight.', 'INVALID_STATE');
      }

      const provider = providerMap.get(state.selectedProvider);
      if (!provider) {
        throw new ConfigurationError(
          `Provider "${state.selectedProvider}" not found`,
        );
      }

      if (!provider.createSession) {
        throw new UnsupportedCapabilityError(
          `Provider "${state.selectedProvider}" does not support session creation for flow "${state.route.flow}". Use a redirect flow instead.`,
          state.selectedProvider,
        );
      }

      const route = state.route;
      const context = state.context;
      const providerId = state.selectedProvider;
      const version = evaluationVersion;

      // The previous session was created for other input. Dropping it here
      // means a failed re-prepare cannot leave it mounted and payable.
      setState({ status: 'preparing', error: null, providerSession: null, canSubmit: false });

      try {
        const session = await provider.createSession(input, route);

        // The context changed while the session was being created: it belongs
        // to a route that is no longer selected.
        if (version !== evaluationVersion) return;

        setState({
          status: 'prepared',
          providerSession: session,
          canSubmit: true,
        });

        await runMiddlewareHook(middleware, 'onSessionCreated', {
          context,
          route,
          session,
        });
      } catch (error) {
        const tenderlaneError =
          error instanceof TenderlaneError
            ? error
            : new ProviderError(
                error instanceof Error ? error.message : 'Session creation failed',
                providerId,
                { cause: error },
              );

        if (version !== evaluationVersion) return;

        setState({
          status: 'error',
          error: tenderlaneError,
          canSubmit: false,
        });

        await runMiddlewareHook(middleware, 'onCheckoutError', {
          context,
          route,
          error: tenderlaneError,
        });
      }
    },

    async submit(input: CheckoutInput): Promise<CheckoutResult> {
      if (submitInFlight) {
        throw new TenderlaneError('A submit is already in flight.', 'INVALID_STATE');
      }
      if (!canAct() || !state.route || !state.selectedProvider) {
        throw new TenderlaneError(
          `Cannot submit in status "${state.status}". Wait for route evaluation or preparation to complete.`,
          'INVALID_STATE',
        );
      }

      const provider = providerMap.get(state.selectedProvider);
      if (!provider) {
        throw new ConfigurationError(
          `Provider "${state.selectedProvider}" not found`,
        );
      }

      const route = state.route;
      const context = state.context;
      const providerId = state.selectedProvider;

      if (INLINE_FLOWS.has(route.flow) && provider.createSession && !state.providerSession) {
        throw new TenderlaneError(
          `Flow "${route.flow}" needs a provider session. Call prepare() before submit().`,
          'INVALID_STATE',
        );
      }

      submitInFlight = true;
      setState({ status: 'submitting', error: null, canSubmit: false });

      try {
        await runMiddlewareHook(middleware, 'onCheckoutStart', {
          context,
          route,
          input,
        });

        const result = await provider.submit(input, route);

        if (result.status === 'failed' || result.status === 'expired') {
          throw new ProviderError(`Checkout ${result.status}.`, providerId);
        }

        // Only a completed payment is a success. A hosted checkout has merely
        // been created at this point, and an inline payment may still be
        // processing or waiting on the customer.
        if (result.status === 'complete') {
          setState({ status: 'success', checkoutResult: result, canSubmit: false });
          await runMiddlewareHook(middleware, 'onCheckoutSuccess', { context, route, result });
        } else {
          setState({
            status: result.url ? 'redirecting' : 'pending',
            checkoutResult: result,
            canSubmit: false,
          });
          await runMiddlewareHook(middleware, 'onCheckoutPending', { context, route, result });
        }

        return result;
      } catch (error) {
        const tenderlaneError =
          error instanceof TenderlaneError
            ? error
            : new ProviderError(
                error instanceof Error ? error.message : 'Checkout failed',
                providerId,
                { cause: error },
              );

        // The route is kept, so the customer can correct the payment details
        // and submit again.
        setState({
          status: 'error',
          error: tenderlaneError,
          canSubmit: state.route !== null,
        });

        await runMiddlewareHook(middleware, 'onCheckoutError', {
          context,
          route,
          error: tenderlaneError,
        });

        throw tenderlaneError;
      } finally {
        submitInFlight = false;
        const settled =
          state.status === 'success' || state.status === 'redirecting' || state.status === 'pending';
        const resetRequested = deferredReset;
        const evaluationRequested = deferredEvaluation;
        deferredReset = false;
        deferredEvaluation = false;
        if (resetRequested) {
          resetNow();
        } else if (evaluationRequested && !settled) {
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
  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      isDeepEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
  );
}
