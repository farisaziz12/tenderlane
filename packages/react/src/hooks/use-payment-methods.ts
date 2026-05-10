import { useSyncExternalStore } from 'react';
import type { PaymentMethodDescriptor } from '@tenderlane/core';
import { useTenderlane } from './use-tenderlane.js';

/**
 * Returns the list of available payment methods for the current route.
 *
 * This is a convenience hook that extracts just the `paymentMethods` array
 * from the client state. For full checkout state, use {@link useTenderlaneCheckout}.
 *
 * The returned array updates reactively when the route changes (e.g. after
 * a context update selects a different provider).
 *
 * @example
 * ```tsx
 * import { usePaymentMethods } from '@tenderlane/react';
 *
 * function PaymentMethodList() {
 *   const paymentMethods = usePaymentMethods();
 *
 *   return (
 *     <ul>
 *       {paymentMethods.map((method) => (
 *         <li key={method.id}>{method.label}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function usePaymentMethods(): PaymentMethodDescriptor[] {
  const client = useTenderlane();

  const state = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );

  return state.paymentMethods;
}
