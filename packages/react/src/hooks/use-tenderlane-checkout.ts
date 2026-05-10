import { useSyncExternalStore, useCallback, useMemo } from 'react';
import type { TenderlaneClientState } from '@tenderlane/client';
import type { CheckoutInput, CheckoutResult, PaymentMethodDescriptor, ProviderSession } from '@tenderlane/core';
import { useTenderlane } from './use-tenderlane.js';

/**
 * Derived checkout state returned by {@link useTenderlaneCheckout}.
 *
 * Contains both the reactive state properties and the action methods
 * needed to build a complete checkout UI.
 */
export interface TenderlaneCheckout {
  /** Current position in the checkout state machine. */
  readonly status: TenderlaneClientState['status'];

  /** The ID of the provider selected by the router (e.g. `"stripe"`), or `null` before evaluation. */
  readonly selectedProvider: string | null;

  /** The full selected payment route, or `null` before evaluation completes. */
  readonly selectedRoute: TenderlaneClientState['route'];

  /** Available payment methods for the current provider and route. */
  readonly paymentMethods: PaymentMethodDescriptor[];

  /** The ID of the currently selected payment method, or `null`. */
  readonly selectedPaymentMethod: string | null;

  /** Whether the checkout is in a state that allows calling `submit()`. */
  readonly canSubmit: boolean;

  /** The most recent error, or `null`. */
  readonly error: TenderlaneClientState['error'];

  /** The result of a successful checkout, or `null`. */
  readonly checkoutResult: TenderlaneClientState['checkoutResult'];

  /** Provider session data (e.g. `clientSecret`) for inline flows, or `null` for redirect flows. */
  readonly providerSession: ProviderSession | null;

  /** Select a payment method by ID from the available methods. */
  selectPaymentMethod(methodId: string): void;

  /** Create a provider session for inline payment flows. Transitions status to `preparing` then `prepared`. */
  prepare(input: CheckoutInput): Promise<void>;

  /** Submit the checkout to the selected provider. For redirect flows, may trigger a browser redirect. */
  submit(input: CheckoutInput): Promise<CheckoutResult>;
}

/**
 * Primary hook for building checkout UI. Returns reactive checkout state
 * with action methods for payment method selection, session preparation, and submission.
 *
 * Uses `useSyncExternalStore` under the hood for correct React 18+
 * concurrent mode support. The returned object is memoized and only
 * creates a new reference when the underlying client state changes.
 *
 * @example
 * ```tsx
 * import { useTenderlaneCheckout } from '@tenderlane/react';
 *
 * function CheckoutForm() {
 *   const checkout = useTenderlaneCheckout();
 *
 *   if (checkout.status === 'evaluating') return <p>Loading...</p>;
 *   if (checkout.error) return <p>Error: {checkout.error.message}</p>;
 *
 *   return (
 *     <form onSubmit={(event) => {
 *       event.preventDefault();
 *       checkout.submit({
 *         amount: 5000,
 *         currency: 'usd',
 *         successUrl: '/success',
 *         cancelUrl: '/cancel',
 *       });
 *     }}>
 *       <button type="submit" disabled={!checkout.canSubmit}>
 *         Pay with {checkout.selectedProvider}
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useTenderlaneCheckout(): TenderlaneCheckout {
  const client = useTenderlane();

  const state = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );

  const selectPaymentMethod = useCallback(
    (methodId: string) => client.selectPaymentMethod(methodId),
    [client],
  );

  const prepare = useCallback(
    (input: CheckoutInput) => client.prepare(input),
    [client],
  );

  const submit = useCallback(
    (input: CheckoutInput) => client.submit(input),
    [client],
  );

  return useMemo(
    () => ({
      status: state.status,
      selectedProvider: state.selectedProvider,
      selectedRoute: state.route,
      paymentMethods: state.paymentMethods,
      selectedPaymentMethod: state.selectedPaymentMethod,
      canSubmit: state.canSubmit,
      error: state.error,
      checkoutResult: state.checkoutResult,
      providerSession: state.providerSession,
      selectPaymentMethod,
      prepare,
      submit,
    }),
    [state, selectPaymentMethod, prepare, submit],
  );
}
