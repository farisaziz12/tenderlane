import React, { useRef, useEffect } from 'react';
import { createTenderlaneClient } from '@tenderlane/client';
import type { TenderlaneClientConfig, TenderlaneClient } from '@tenderlane/client';
import type { AnyBrowserProvider } from '@tenderlane/core';
import { TenderlaneContext } from './context.js';

export interface TenderlaneProviderProps<
  TProviders extends readonly AnyBrowserProvider[] = readonly AnyBrowserProvider[],
> {
  /**
   * Client configuration. `providers`, `routing` and `middleware` are read
   * once, when the client is created. `context` is watched: pass a new value
   * and the client selects a route for it.
   */
  config: TenderlaneClientConfig<TProviders>;
  children: React.ReactNode;
}

/**
 * Creates one {@link TenderlaneClient} for the subtree and keeps its context
 * in sync with `config.context`. All Tenderlane hooks read from it.
 *
 * @example
 * <TenderlaneProvider config={{ context: { country }, providers: [stripe], routing }}>
 *   <Checkout />
 * </TenderlaneProvider>
 */
export function TenderlaneProvider<const TProviders extends readonly AnyBrowserProvider[]>({
  config,
  children,
}: TenderlaneProviderProps<TProviders>) {
  const clientRef = useRef<TenderlaneClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = createTenderlaneClient(config);
  }
  const client = clientRef.current;

  useEffect(() => {
    // A no-op when the new object is structurally equal to the current context.
    client.updateContext(config.context);
  }, [client, config.context]);

  // Coming back from a hosted checkout with the browser's back button restores
  // this page from the back/forward cache still in `redirecting`.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && client.getSnapshot().status === 'redirecting') {
        client.reset();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [client]);

  return <TenderlaneContext.Provider value={client}>{children}</TenderlaneContext.Provider>;
}
