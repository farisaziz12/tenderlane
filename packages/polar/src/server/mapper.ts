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
  /** Polar product IDs offered at this checkout. Tenderlane always sends one. */
  readonly products: string[];
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
 * - A Polar checkout sells one product. `products` in Polar's API is the list
 *   the customer chooses from, not a cart, and there is no quantity. A cart
 *   with several items or a quantity above 1 is rejected with a
 *   `CatalogError` instead of being charged as something else.
 * - The amount charged is the Polar product's own price. The resolved
 *   `unitAmount` is for display; it is not sent.
 * - `cancelUrl` is not represented in Polar's API — the customer cancels by
 *   closing the hosted page or letting the session expire.
 */
export function mapToPolarCheckoutParams(
  input: ResolvedCheckoutInput,
): PolarCheckoutCreateParams {
  const [item, ...otherItems] = input.items;
  if (!item) {
    throw new CatalogError('A Polar checkout needs one resolved item.', { provider: 'polar' });
  }
  if (otherItems.length > 0) {
    throw new CatalogError(
      `A Polar checkout sells one product, but the cart has ${input.items.length} items. Route multi-item carts to a provider that supports them.`,
      { sku: item.sku, provider: 'polar' },
    );
  }
  if (item.quantity !== 1) {
    throw new CatalogError(
      `A Polar checkout has no quantity, but SKU '${item.sku}' has quantity ${item.quantity}.`,
      { sku: item.sku, provider: 'polar' },
    );
  }

  const params: PolarCheckoutCreateParams = {
    products: [requirePolarProductId(item)],
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
  };
}

export function mapPolarStatus(
  status: PolarCheckoutResponse['status'],
): CheckoutResult['status'] {
  switch (status) {
    case 'succeeded':
    case 'confirmed':
      return 'complete';
    case 'expired':
      return 'expired';
    case 'failed':
      return 'failed';
    default:
      return 'open';
  }
}
