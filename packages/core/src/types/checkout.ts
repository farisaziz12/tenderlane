import type { CurrencyCode, ProviderId } from './capabilities.js';

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
 * @example
 * const checkoutInput: CheckoutInput = {
 *   lineItems: [
 *     { name: "Widget", quantity: 1, unitAmount: 2500 },
 *   ],
 *   successUrl: "https://example.com/success",
 *   cancelUrl: "https://example.com/cancel",
 *   customerEmail: "customer@example.com",
 *   idempotencyKey: "order_abc123",
 * };
 */
export interface CheckoutInput {
  readonly lineItems: readonly CheckoutLineItem[];
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly customerEmail?: string;
  readonly clientReferenceId?: string;
  readonly metadata?: Record<string, string>;
  readonly idempotencyKey?: string;
  readonly providerOptions?: Record<string, unknown>;
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
