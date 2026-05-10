import React, { useRef, useEffect } from 'react';
import { createTenderlaneClient } from '@tenderlane/client';
import type { TenderlaneClientConfig, TenderlaneClient } from '@tenderlane/client';
import { TenderlaneContext } from './context.js';

export interface TenderlaneProviderProps {
  config: TenderlaneClientConfig;
  children: React.ReactNode;
}

/**
 * React context provider that creates and owns a {@link TenderlaneClient}.
 *
 * The client is created once on initial render via `useRef` (similar to
 * TanStack Query's `QueryClientProvider`). When `config.context` changes,
 * the provider automatically calls `client.updateContext()` to trigger
 * a new route evaluation, keeping the checkout state in sync with
 * application state.
 *
 * All Tenderlane hooks must be used within this provider.
 *
 * @example
 * ```tsx
 * import { TenderlaneProvider } from '@tenderlane/react';
 *
 * function App() {
 *   const config = {
 *     context: { country: 'US', currency: 'usd', amount: 5000 },
 *     providers: [stripeProvider({ publishableKey: 'pk_test_...', serverEndpoint: '/api/checkout' })],
 *     routing: createRulesRouter({ rules: [...], fallback: { provider: 'stripe', flow: 'checkout-session' } }),
 *   };
 *
 *   return (
 *     <TenderlaneProvider config={config}>
 *       <CheckoutPage />
 *     </TenderlaneProvider>
 *   );
 * }
 * ```
 */
export function TenderlaneProvider({ config, children }: TenderlaneProviderProps) {
  const clientRef = useRef<TenderlaneClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = createTenderlaneClient(config);
  }

  const contextRef = useRef(config.context);
  useEffect(() => {
    if (contextRef.current !== config.context && clientRef.current) {
      contextRef.current = config.context;
      clientRef.current.updateContext(config.context);
    }
  }, [config.context]);

  return (
    <TenderlaneContext.Provider value={clientRef.current}>
      {children}
    </TenderlaneContext.Provider>
  );
}
