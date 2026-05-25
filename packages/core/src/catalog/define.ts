import type {
  Catalog,
  CatalogPhantomTypes,
  CatalogRequest,
  ResolvedCatalogItem,
} from '../types/catalog.js';
import type { MaybePromise, TenderlaneContext } from '../types/context.js';

export interface DefineCatalogConfig<TSku extends string = string> {
  resolve(
    items: readonly CatalogRequest[],
    context: TenderlaneContext,
  ): MaybePromise<readonly ResolvedCatalogItem[]>;
}

/**
 * Escape hatch for building a custom Catalog from a user-supplied resolver.
 * Typically used server-side to pull pricing from a database, CMS, headless
 * commerce platform, or other system of record.
 *
 * Pair with `createRemoteCatalog` on the client.
 *
 * @example
 * const catalog = defineCatalog({
 *   async resolve(items, context) {
 *     const rows = await db.products.findMany({
 *       where: { sku: { in: items.map(item => item.sku) } },
 *     });
 *     return items.map(item => {
 *       const row = rows.find(r => r.sku === item.sku)!;
 *       return {
 *         sku: item.sku,
 *         quantity: item.quantity,
 *         name: row.name,
 *         unitAmount: row.prices[context.currency ?? 'usd'],
 *         currency: context.currency ?? 'usd',
 *         providerRefs: { stripe: { priceId: row.stripePriceId } },
 *       };
 *     });
 *   },
 * });
 */
export function defineCatalog<TSku extends string = string>(
  config: DefineCatalogConfig<TSku>,
): Catalog<TSku> {
  return {
    '~types': {} as CatalogPhantomTypes<TSku>,
    resolve: config.resolve,
  };
}
