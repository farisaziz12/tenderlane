import { useContext } from 'react';
import type { TenderlaneClient } from '@tenderlane/client';
import { TenderlaneContext } from '../context.js';

/**
 * Returns the raw {@link TenderlaneClient} from context.
 *
 * Use this hook when you need direct access to the client instance
 * (e.g. to call `reset()` or `getProvider()`). For checkout UI state,
 * prefer {@link useTenderlaneCheckout} which provides reactive derived state.
 *
 * @throws {Error} If called outside of a `<TenderlaneProvider>`.
 *
 * @example
 * ```tsx
 * import { useTenderlane } from '@tenderlane/react';
 *
 * function ResetButton() {
 *   const client = useTenderlane();
 *   return <button onClick={() => client.reset()}>Start over</button>;
 * }
 * ```
 */
export function useTenderlane(): TenderlaneClient {
  const client = useContext(TenderlaneContext);
  if (!client) {
    throw new Error(
      'useTenderlane must be used within a <TenderlaneProvider>. ' +
        'Wrap your component tree with <TenderlaneProvider config={...}>.',
    );
  }
  return client;
}
