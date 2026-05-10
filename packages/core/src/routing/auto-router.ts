import type { AutoRouterConfig, Router, SelectedPaymentRoute } from '../types/routing.js';

/**
 * Auto router request sent to the remote endpoint.
 */
export interface AutoRouterRequest {
  readonly version: '1';
  readonly context: Record<string, unknown>;
  readonly availableProviders?: string[];
  readonly timestamp: string;
}

/**
 * Auto router response expected from the remote endpoint.
 */
export interface AutoRouterResponse {
  readonly provider: string;
  readonly flow: string;
  readonly paymentMethods: string[];
  readonly reason?: string;
  readonly confidence?: number;
}

/**
 * Create an auto router that delegates routing decisions to a remote endpoint.
 * Falls back to the configured fallback route on any error or timeout.
 */
export function createAutoRouter<const T extends AutoRouterConfig>(config: T): Router {
  const { endpoint, fallback, timeoutMs = 3000, headers } = config;

  return {
    async evaluate(context: Record<string, unknown>): Promise<SelectedPaymentRoute> {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const request: AutoRouterRequest = {
          version: '1',
          context,
          timestamp: new Date().toISOString(),
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`Auto router responded with status ${response.status}`);
        }

        const data = (await response.json()) as AutoRouterResponse;

        return {
          provider: data.provider,
          flow: data.flow as SelectedPaymentRoute['flow'],
          paymentMethods: data.paymentMethods,
          reason: data.reason ?? 'Auto-routed',
          source: 'auto',
        };
      } catch {
        return {
          provider: fallback.provider,
          flow: fallback.flow,
          paymentMethods: fallback.paymentMethods ?? [],
          providerOptions: fallback.providerOptions,
          reason: 'Auto router failed; using fallback route',
          source: 'auto-fallback',
        };
      }
    },
  };
}
