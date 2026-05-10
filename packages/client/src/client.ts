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

    setState({
      status: 'ready',
      route,
      selectedProvider: route.provider,
      paymentMethods: methods,
      selectedPaymentMethod: methods[0]?.id ?? null,
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

    setState({
      status: 'error',
      error: tenderlaneError,
      canSubmit: false,
    });

    runMiddlewareHook(middleware, 'onCheckoutError', {
      context,
      error: tenderlaneError,
    });
  }

  function evaluate(context: TenderlaneContext) {
    const version = ++evaluationVersion;
    setState({ status: 'evaluating', error: null, providerSession: null });

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
      setState({ context });

      runMiddlewareHook(middleware, 'onContextChange', {
        previousContext,
        nextContext: context,
      });

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
      if (
        (state.status !== 'ready' && state.status !== 'prepared') ||
        !state.route ||
        !state.selectedProvider
      ) {
        throw new TenderlaneError(
          `Cannot prepare in status "${state.status}". Wait for route evaluation to complete.`,
          'INVALID_STATE',
        );
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

      setState({ status: 'preparing', error: null });

      try {
        const session = await provider.createSession(input, route);

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
                state.selectedProvider,
                { cause: error },
              );

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
      if (
        (state.status !== 'ready' && state.status !== 'prepared') ||
        !state.route ||
        !state.selectedProvider
      ) {
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

      setState({ status: 'submitting', error: null });

      await runMiddlewareHook(middleware, 'onCheckoutStart', {
        context,
        route,
        input,
      });

      try {
        const result = await provider.submit(input, route);

        setState({
          status: 'success',
          checkoutResult: result,
        });

        await runMiddlewareHook(middleware, 'onCheckoutSuccess', {
          context,
          route,
          result,
        });

        return result;
      } catch (error) {
        const tenderlaneError =
          error instanceof TenderlaneError
            ? error
            : new ProviderError(
                error instanceof Error ? error.message : 'Checkout failed',
                state.selectedProvider,
                { cause: error },
              );

        setState({
          status: 'error',
          error: tenderlaneError,
          canSubmit: true,
        });

        await runMiddlewareHook(middleware, 'onCheckoutError', {
          context,
          route,
          error: tenderlaneError,
        });

        throw tenderlaneError;
      }
    },

    reset() {
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
    },
  };
}
