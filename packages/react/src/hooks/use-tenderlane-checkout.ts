import { useSyncExternalStore, useMemo } from 'react';
import type { TenderlaneClient, TenderlaneClientState } from '@tenderlane/client';
import { useTenderlane } from './use-tenderlane.js';

/**
 * The checkout state plus the client's actions. `status` is a discriminant:
 * after `if (checkout.status === 'error')`, `checkout.error` is non-null.
 */
export type TenderlaneCheckout = TenderlaneClientState &
  Pick<TenderlaneClient, 'selectPaymentMethod' | 'prepare' | 'submit' | 'reset'>;

/**
 * Subscribe a component to the checkout state. Re-renders on every state
 * transition; the returned object is stable between transitions.
 *
 * @example
 * function PayButton({ input }: { input: CheckoutInput }) {
 *   const checkout = useTenderlaneCheckout();
 *   return (
 *     <button disabled={!checkout.canSubmit} onClick={() => checkout.submit(input).catch(() => {})}>
 *       Pay with {checkout.selectedProvider}
 *     </button>
 *   );
 * }
 */
export function useTenderlaneCheckout(): TenderlaneCheckout {
  const client = useTenderlane();
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);

  return useMemo(
    () => ({
      ...state,
      selectPaymentMethod: client.selectPaymentMethod,
      prepare: client.prepare,
      submit: client.submit,
      reset: client.reset,
    }),
    [state, client],
  );
}
