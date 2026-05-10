import type { TenderlaneMiddleware } from '../types/middleware.js';
import type { TenderlaneContext } from '../types/context.js';
import type { SelectedPaymentRoute } from '../types/routing.js';
import type { CheckoutInput, CheckoutResult } from '../types/checkout.js';
import type { ProviderSession } from '../types/provider.js';
import type { TenderlaneError } from '../errors/errors.js';

/**
 * Union of all lifecycle hook names available on a {@link TenderlaneMiddleware}.
 * Excludes the `name` property, leaving only callable hooks such as
 * `'onContextChange'`, `'onRouteEvaluated'`, `'onCheckoutStart'`, etc.
 */
export type MiddlewareHook = keyof Omit<TenderlaneMiddleware, 'name'>;

type HookEventMap = {
  onContextChange: { previousContext: TenderlaneContext; nextContext: TenderlaneContext };
  onRouteEvaluated: { context: TenderlaneContext; route: SelectedPaymentRoute };
  onSessionCreated: {
    context: TenderlaneContext;
    route: SelectedPaymentRoute;
    session: ProviderSession;
  };
  onCheckoutStart: {
    context: TenderlaneContext;
    route: SelectedPaymentRoute;
    input: CheckoutInput;
  };
  onCheckoutSuccess: {
    context: TenderlaneContext;
    route: SelectedPaymentRoute;
    result: CheckoutResult;
  };
  onCheckoutError: {
    context: TenderlaneContext;
    route?: SelectedPaymentRoute;
    error: TenderlaneError;
  };
};

/**
 * Runs a named lifecycle hook across all registered middleware in order.
 * Each middleware's hook function is called sequentially. If a middleware
 * does not implement the specified hook, it is skipped. Errors thrown by
 * individual middleware are caught and logged to `console.error`, allowing
 * subsequent middleware to continue executing.
 *
 * @typeParam H - The specific hook name being invoked.
 * @param middlewares - The ordered array of registered middleware instances.
 * @param hook - The lifecycle hook name to invoke (e.g. `'onCheckoutStart'`).
 * @param event - The event payload corresponding to the hook.
 * @returns A promise that resolves when all middleware have been called.
 *
 * @example
 * await runMiddlewareHook(registeredMiddleware, "onCheckoutStart", {
 *   context: paymentContext,
 *   route: selectedRoute,
 *   input: checkoutInput,
 * });
 */
export async function runMiddlewareHook<H extends MiddlewareHook>(
  middlewares: readonly TenderlaneMiddleware[],
  hook: H,
  event: HookEventMap[H],
): Promise<void> {
  for (const mw of middlewares) {
    const fn = mw[hook] as ((event: HookEventMap[H]) => unknown) | undefined;
    if (!fn) continue;
    try {
      await fn(event);
    } catch (err) {
      console.error(
        `[tenderlane] Middleware "${mw.name ?? 'unnamed'}" error in ${hook}:`,
        err,
      );
    }
  }
}
