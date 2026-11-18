import type {
  Catalog,
  CatalogRequest,
  ResolvedCatalogItem,
} from '../types/catalog.js';
import type { TenderlaneContext } from '../types/context.js';
import { ConfigurationError } from '../errors/errors.js';

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
    throw new ConfigurationError(
      'No catalog configured. Pass `catalog` or `catalogs` to createTenderlaneHandler().',
    );
  }
  return await catalog.resolve(items, context);
}
