import type { ProviderId } from './capabilities.js';
import type { CatalogRequest, ResolvedCatalogItem } from './catalog.js';
import type { TenderlaneContext } from './context.js';

/**
 * What the browser sends to start a checkout. It says *what* is being bought
 * (`sku` and `quantity`), never for how much: there is no amount field, and
 * the server handler strips any `unitAmount` it finds before resolving prices
 * from its own catalog.
 *
 * @example
 * const input: CheckoutInput = {
 *   items: [{ sku: 'pro-plan', quantity: 1 }],
 *   successUrl: 'https://example.com/success',
 *   cancelUrl: 'https://example.com/cancel',
 * };
 */
export interface CheckoutInput {
  readonly items: readonly CatalogRequest[];
  /**
   * Context forwarded to the server. It comes from the browser and is
   * untrusted there: use the handler's `resolveContext` hook when pricing or
   * routing depends on it.
   */
  readonly context?: TenderlaneContext;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly customerEmail?: string;
  readonly clientReferenceId?: string;
  readonly metadata?: Record<string, string>;
  readonly idempotencyKey?: string;
}

/**
 * What a {@link ServerProviderAdapter} receives: the checkout input after the
 * server handler resolved the catalog. `items` carries the server's prices
 * and is the only place an adapter may read money from.
 */
export interface ResolvedCheckoutInput extends Omit<CheckoutInput, 'items' | 'context'> {
  readonly items: readonly ResolvedCatalogItem[];
  /** The context the server believes (after `resolveContext`). */
  readonly context: TenderlaneContext;
  /** Server-configured PSP options. Never taken from the request body. */
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}

/**
 * Provider-neutral checkout status.
 *
 * - `'open'`: created, waiting on the customer or still processing.
 * - `'complete'`: the provider reported the payment complete.
 * - `'expired'`: the session expired or was cancelled.
 * - `'failed'`: the payment attempt failed.
 */
export type CheckoutStatus = 'open' | 'complete' | 'expired' | 'failed';

/**
 * What a provider action returns, and the exact shape that crosses the wire
 * from the server handler to the browser. Nothing else from the PSP response
 * is forwarded.
 */
export interface CheckoutResult {
  readonly provider: ProviderId;
  /** The provider's id for the session or payment. */
  readonly id: string;
  readonly status: CheckoutStatus;
  /** Hosted flows: the provider page to send the customer to. */
  readonly url?: string;
  /** Inline flows: the secret the provider's browser SDK confirms with. */
  readonly clientSecret?: string;
}
