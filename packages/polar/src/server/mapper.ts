import type {
  CheckoutResult,
  ResolvedCatalogItem,
  ResolvedCheckoutInput,
} from '@tenderlane/core';
import { CatalogError } from '@tenderlane/core';

/**
 * Body shape sent to Polar's `POST /v1/checkouts/` endpoint. We type just the
 * fields we send so this file doesn't pull a runtime dependency on
 * `@polar-sh/sdk` — the SDK is consumed only in adapter.ts.
 */
export interface PolarCheckoutCreateParams {
  /** Polar product IDs being purchased. Min 1; first is default-selected. */
  readonly products: string[];
  /** Optional ad-hoc price overrides keyed by product ID. */
  readonly prices?: Record<string, { amount: number; price_currency: string }>;
  readonly success_url?: string;
  readonly customer_email?: string;
  readonly customer_name?: string;
  readonly metadata?: Record<string, string | number | boolean>;
  readonly embed_origin?: string;
}

/**
 * The subset of Polar's Checkout response we depend on. Typed locally so the
 * mapper has no SDK dependency.
 */
export interface PolarCheckoutResponse {
  readonly id: string;
  readonly url: string;
  readonly status?: 'open' | 'expired' | 'confirmed' | 'succeeded' | 'failed';
}

/**
 * Extract the Polar product ID for a resolved item. Throws a typed
 * `CatalogError` (mapped to HTTP 400 by the server handler) when the
 * required `providerRefs.polar.productId` is missing — Polar is product-first
 * and has no inline `price_data` fallback.
 */
function requirePolarProductId(item: ResolvedCatalogItem): string {
  const polarRef = item.providerRefs?.polar;
  if (!polarRef || !polarRef.productId) {
    throw new CatalogError(
      `Polar requires providerRefs.polar.productId for SKU '${item.sku}'. Polar is product-first — declare the productId on the catalog entry.`,
      { sku: item.sku, provider: 'polar' },
    );
  }
  return polarRef.productId;
}

/**
 * Map a Tenderlane {@link ResolvedCheckoutInput} into Polar's checkout-create
 * body. Pure function; the adapter calls this then hands the result to
 * `@polar-sh/sdk`'s `polar.checkouts.create()`.
 *
 * Behavior notes:
 * - Each resolved item must carry `providerRefs.polar.productId`.
 * - When a resolved item's `unitAmount` differs from the Polar product's
 *   default price, we emit an entry in `prices` to override at checkout time
 *   (Polar's ad-hoc-price escape hatch).
 * - `cancelUrl` is not represented in Polar's API — the customer cancels by
 *   closing the hosted page or letting the session expire.
 */
export function mapToPolarCheckoutParams(
  input: ResolvedCheckoutInput,
): PolarCheckoutCreateParams {
  const productIds = input.items.map(requirePolarProductId);

  const prices: Record<string, { amount: number; price_currency: string }> = {};
  for (const item of input.items) {
    const productId = item.providerRefs!.polar!.productId;
    // Only emit a price override when the catalog supplied a non-zero
    // unitAmount — otherwise let Polar use the product's default price.
    if (item.unitAmount > 0) {
      prices[productId] = {
        amount: item.unitAmount,
        price_currency: item.currency,
      };
    }
  }

  const params: PolarCheckoutCreateParams = {
    products: productIds,
    ...(Object.keys(prices).length > 0 ? { prices } : {}),
    ...(input.successUrl ? { success_url: input.successUrl } : {}),
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
  };

  if (input.metadata) {
    const polarMetadata: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(input.metadata)) {
      polarMetadata[key] = value;
    }
    return { ...params, metadata: polarMetadata };
  }

  return params;
}

/**
 * Map a Polar checkout response into a normalized {@link CheckoutResult}.
 */
export function mapFromPolarCheckout(checkout: PolarCheckoutResponse): CheckoutResult {
  return {
    provider: 'polar',
    id: checkout.id,
    status: mapPolarStatus(checkout.status),
    url: checkout.url,
    raw: checkout,
  };
}

export function mapPolarStatus(
  status: PolarCheckoutResponse['status'],
): CheckoutResult['status'] {
  switch (status) {
    case 'open':
      return 'open';
    case 'succeeded':
    case 'confirmed':
      return 'complete';
    case 'expired':
      return 'expired';
    case 'failed':
      return 'failed';
    default:
      return 'created';
  }
}
