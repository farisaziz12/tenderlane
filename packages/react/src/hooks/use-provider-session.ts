import { useSyncExternalStore } from 'react';
import type { ProviderSession } from '@tenderlane/core';
import { useTenderlane } from './use-tenderlane.js';

/**
 * Returns the provider session for inline payment flows, or `null` for redirect flows.
 *
 * The provider session is populated after calling {@link TenderlaneClient.prepare}
 * and contains flow-specific data such as the `clientSecret` needed to render
 * an inline payment element (e.g. Stripe's PaymentElement).
 *
 * @example
 * ```tsx
 * import { useProviderSession } from '@tenderlane/react';
 *
 * function InlinePaymentForm() {
 *   const providerSession = useProviderSession();
 *
 *   if (!providerSession) return null;
 *
 *   return <StripePaymentElement clientSecret={providerSession.clientSecret} />;
 * }
 * ```
 */
export function useProviderSession(): ProviderSession | null {
  const client = useTenderlane();

  const state = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );

  return state.providerSession;
}
