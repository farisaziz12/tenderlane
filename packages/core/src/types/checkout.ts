import type { PaymentMethodId, ProviderId } from './capabilities.js';
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
  /**
   * Where the provider sends the customer after a hosted checkout. Include
   * the literal `{CHECKOUT_ID}` and the provider replaces it with the checkout
   * id, which is the id to pass to the handler's `retrieve()` on return:
   * `https://shop.example/success?checkout={CHECKOUT_ID}`.
   */
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
 * - `'open'`: created and waiting on the customer (to pay, to authenticate,
 *   to choose a method). Nothing has been submitted for payment.
 * - `'processing'`: the customer did their part and the provider is waiting
 *   for the money. Seconds for some methods, days for bank debits, and it
 *   can still fail.
 * - `'complete'`: the provider reported the payment complete.
 * - `'expired'`: the session expired or was cancelled.
 * - `'failed'`: the payment attempt failed.
 */
export type CheckoutStatus = 'open' | 'processing' | 'complete' | 'expired' | 'failed';

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

/**
 * What the provider says about a checkout right now, read with the secret
 * key by the handler's `retrieve()`. Server-side only.
 *
 * `status: 'complete'` here is the provider's own record that the payment
 * went through, unlike the client state `success`, which is the browser's
 * report.
 */
export interface CheckoutDetails {
  readonly provider: ProviderId;
  readonly id: string;
  readonly status: CheckoutStatus;
  /**
   * What the provider charged or will charge, in the currency's minor unit.
   * It can differ from the catalog price: providers add tax and discounts.
   */
  readonly amountTotal?: number;
  readonly currency?: string;
  /**
   * The payment method attached to the payment, once the customer has chosen
   * one (`'card'`, `'sepa_debit'`, ...). It can be set before anything is paid. Tells an app whether `processing` will
   * last seconds or days. Absent when the provider does not report it.
   */
  readonly paymentMethod?: PaymentMethodId;
}
