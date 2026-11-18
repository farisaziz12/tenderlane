import type {
  CheckoutDetails,
  CheckoutResult,
  ResolvedCatalogItem,
  ResolvedCheckoutInput,
} from '@tenderlane/core';
import { CatalogError } from '@tenderlane/core';
import type { Checkout } from '@polar-sh/sdk/models/components/checkout.js';
import type { CheckoutCreate } from '@polar-sh/sdk/models/components/checkoutcreate.js';

/**
 * The fields of the SDK's `CheckoutCreate` that this adapter sets. Typed
 * against the installed SDK, so a renamed field is a compile error instead
 * of a value the SDK silently drops.
 */
export type PolarCheckoutCreateParams = Pick<
  CheckoutCreate,
  'products' | 'successUrl' | 'customerEmail' | 'metadata'
>;

/** The fields of the SDK's `Checkout` that this adapter reads. */
export type PolarCheckoutResponse = Pick<Checkout, 'id' | 'url'> & {
  readonly status?: Checkout['status'];
};

/** What `retrieve()` reports. `totalAmount` includes the tax Polar added. */
export function mapPolarCheckoutDetails(
  checkout: Pick<Checkout, 'id' | 'status' | 'totalAmount' | 'currency'>,
): CheckoutDetails {
  return {
    provider: 'polar',
    id: checkout.id,
    status: mapPolarStatus(checkout.status),
    amountTotal: checkout.totalAmount,
    currency: checkout.currency,
  };
}

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
    ...(input.successUrl ? { successUrl: input.successUrl } : {}),
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
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
    // `confirmed` means the customer pressed Pay and the payment is still
    // processing. Only `succeeded` is a completed payment.
    case 'succeeded':
      return 'complete';
    case 'expired':
      return 'expired';
    case 'failed':
      return 'failed';
    default:
      return 'open';
  }
}
