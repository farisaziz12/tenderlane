import type { CurrencyCode, ProviderId } from './capabilities.js';
import type { CatalogRequest, ResolvedCatalogItem } from './catalog.js';
import type { TenderlaneContext } from './context.js';

/**
 * A single line item in a checkout session. Represents one product or service
 * with a name, quantity, and unit amount in the smallest currency unit
 * (e.g. cents for USD).
 *
 * @example
 * const lineItem: CheckoutLineItem = {
 *   name: "Premium Widget",
 *   description: "A high-quality widget",
 *   quantity: 2,
 *   unitAmount: 1999, // $19.99 in cents
 *   currency: "USD",
 * };
 */
export interface CheckoutLineItem {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly currency?: CurrencyCode;
  readonly metadata?: Record<string, string>;
}

/**
 * Everything needed to initiate a checkout session. Provider-agnostic input
 * that gets translated to the selected PSP's native format by the server
 * adapter.
 *
 * Two ways to declare what's being purchased:
 *
 * - **`items`** (preferred) — pairs of `{ sku, quantity }` resolved against a
 *   configured {@link Catalog}. The server is the source of truth for pricing.
 *   Client-supplied `unitAmount` (anywhere on the payload) is stripped before
 *   resolution. This is the price-integrity contract.
 *
 * - **`lineItems`** (deprecated) — pre-catalog shape carrying `unitAmount` on
 *   the wire. Kept for backwards compatibility; auto-wrapped by the server
 *   handler when no catalog is configured.
 *
 * Provide one or the other; if both are present, `items` wins.
 *
 * @example Using items + a catalog
 * const checkoutInput: CheckoutInput = {
 *   items: [{ sku: 'pro-plan', quantity: 1 }],
 *   context: { country: 'US', currency: 'usd' },
 *   successUrl: 'https://example.com/success',
 *   cancelUrl: 'https://example.com/cancel',
 * };
 *
 * @example Legacy lineItems shape
 * const checkoutInput: CheckoutInput = {
 *   lineItems: [{ name: 'Widget', quantity: 1, unitAmount: 2500 }],
 *   successUrl: 'https://example.com/success',
 *   cancelUrl: 'https://example.com/cancel',
 * };
 */
export interface CheckoutInput {
  /** Catalog-driven items. Server resolves these against the configured Catalog. */
  readonly items?: readonly CatalogRequest[];

  /**
   * @deprecated Use {@link items} with a {@link Catalog}. Kept as a backwards-
   * compatible shim; the server handler auto-wraps these into resolved items
   * when no catalog is configured. Carries `unitAmount` on the wire and
   * therefore does not benefit from server-authoritative price integrity.
   */
  readonly lineItems?: readonly CheckoutLineItem[];

  /**
   * Reactive payment context. Forwarded to the configured Catalog at resolve
   * time and to routing decisions. Server-side resolution always uses the
   * server's interpretation of this context.
   */
  readonly context?: TenderlaneContext;

  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly customerEmail?: string;
  readonly clientReferenceId?: string;
  readonly metadata?: Record<string, string>;
  readonly idempotencyKey?: string;
  readonly providerOptions?: Record<string, unknown>;
}

/**
 * What a {@link ServerProviderAdapter} receives — a {@link CheckoutInput}
 * after the server handler has run catalog resolution. The `items` field is
 * the canonical, server-authoritative resolved cart contents. Adapters read
 * pricing exclusively from here.
 *
 * `lineItems` from the wire shape is dropped: the server handler consumed it
 * via the legacy shim, and downstream code should never branch on it.
 */
export interface ResolvedCheckoutInput
  extends Omit<CheckoutInput, 'items' | 'lineItems'> {
  readonly items: readonly ResolvedCatalogItem[];
}

/**
 * The possible statuses of a checkout result, normalized across all providers.
 *
 * - `'created'` - Session created but not yet visited by the customer.
 * - `'open'` - Customer is actively on the checkout page.
 * - `'complete'` - Payment was successfully completed.
 * - `'expired'` - Session expired before completion.
 * - `'failed'` - Payment attempt failed.
 * - `'unknown'` - Status could not be determined from the provider response.
 */
export type CheckoutStatus =
  | 'created'
  | 'open'
  | 'complete'
  | 'expired'
  | 'failed'
  | 'unknown';

/**
 * Normalized checkout result returned by any provider's server adapter.
 * Contains the provider-assigned session ID, current status, an optional
 * redirect URL for hosted checkout flows, and the raw provider response
 * for debugging or advanced use cases.
 *
 * @example
 * const result: CheckoutResult = {
 *   provider: "stripe",
 *   id: "cs_live_abc123",
 *   status: "created",
 *   url: "https://checkout.stripe.com/c/pay/cs_live_abc123",
 * };
 */
export interface CheckoutResult {
  readonly provider: ProviderId;
  readonly id: string;
  readonly status: CheckoutStatus;
  readonly url?: string;
  readonly raw?: unknown;
}
