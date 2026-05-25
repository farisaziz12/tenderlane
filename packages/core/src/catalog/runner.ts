import type {
  Catalog,
  CatalogRequest,
  ResolvedCatalogItem,
} from '../types/catalog.js';
import type { CheckoutLineItem } from '../types/checkout.js';
import type { TenderlaneContext } from '../types/context.js';
import { CatalogError } from '../errors/errors.js';

/**
 * Resolve a list of `{ sku, quantity }` requests via the supplied catalog.
 * This is the single entry point all higher-level code (server handler,
 * client preview) goes through, so the price-integrity contract is
 * enforced in exactly one place.
 *
 * Throws `CatalogError` if `catalog` is not configured.
 */
export async function resolveCatalogItems(
  catalog: Catalog | undefined,
  items: readonly CatalogRequest[],
  context: TenderlaneContext,
): Promise<readonly ResolvedCatalogItem[]> {
  if (!catalog) {
    throw new CatalogError(
      'No catalog configured. Provide one via createTenderlaneHandler({ catalog }) or TenderlaneProvider config.catalog.',
    );
  }
  return await catalog.resolve(items, context);
}

/**
 * Legacy auto-wrap for `CheckoutInput.lineItems`. When a caller submits a
 * checkout using the pre-catalog shape, the server handler runs this to
 * produce `ResolvedCatalogItem[]` without going through any user-configured
 * catalog.
 *
 * This is a transitional shim — every line item is treated as a single SKU
 * with the client-supplied amount. It exists ONLY to preserve behavior for
 * existing alpha users; new code should use `items[]` plus a real catalog.
 *
 * **Price integrity caveat**: because the lineItems shape is pre-catalog, the
 * amount comes from the wire payload — the very thing the catalog primitive
 * was designed to prevent. The handler enables this shim only when no
 * catalog is configured at all. If a catalog is configured, the shim is
 * disabled and `lineItems`-only payloads are rejected.
 */
export function wrapLegacyLineItems(
  lineItems: readonly CheckoutLineItem[],
  context: TenderlaneContext,
): readonly ResolvedCatalogItem[] {
  return lineItems.map((item, index) => {
    const fallbackCurrency = context.currency ?? 'usd';
    return {
      sku: item.id ?? `legacy-${index}`,
      quantity: item.quantity,
      name: item.name,
      description: item.description,
      unitAmount: item.unitAmount,
      currency: item.currency ?? fallbackCurrency,
      metadata: item.metadata,
    };
  });
}
