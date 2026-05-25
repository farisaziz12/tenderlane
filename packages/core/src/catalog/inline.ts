import type {
  Catalog,
  CatalogPhantomTypes,
  ResolvedCatalogItem,
  ResolvedProviderRefs,
} from '../types/catalog.js';
import type { CurrencyCode } from '../types/capabilities.js';
import type { TenderlaneContext } from '../types/context.js';
import { CatalogError } from '../errors/errors.js';

/**
 * Pricing declaration on an inline catalog product. Can be a static
 * `{ amount, currency }` value, or a function of the reactive context for
 * currency-switcher / regional-pricing / tier-based UX.
 *
 * The function form runs identically on client and server. The server's
 * call is canonical; the client's is preview-only.
 */
export type InlineCatalogPricing =
  | { readonly amount: number; readonly currency: CurrencyCode }
  | ((context: TenderlaneContext) => {
      amount: number;
      currency: CurrencyCode;
    });

export interface InlineCatalogProduct {
  readonly name: string;
  readonly description?: string;
  readonly pricing: InlineCatalogPricing;
  readonly providerRefs?: ResolvedProviderRefs;
  readonly metadata?: Record<string, string>;
}

export type InlineCatalogProducts<TSku extends string> = {
  readonly [K in TSku]: InlineCatalogProduct;
};

/**
 * Pure, declarative catalog whose data lives in code. Suitable for
 * shared-monorepo apps where the same catalog module is deployed to both
 * client and server bundles — both sides call `resolve()` locally; the
 * server's result is canonical.
 *
 * Not suitable when pricing logic depends on secrets, a database, or an
 * external API — use `createRemoteCatalog` on the client + `defineCatalog`
 * (or a backend-sourced catalog) on the server in those cases.
 *
 * @example
 * const catalog = createInlineCatalog({
 *   'pro-plan': {
 *     name: 'Pro Plan',
 *     pricing: (context) => ({
 *       amount: context.currency === 'eur' ? 2700 : 2900,
 *       currency: context.currency ?? 'usd',
 *     }),
 *     providerRefs: {
 *       stripe: { priceId: 'price_xxx' },
 *       polar:  { productId: 'prod_yyy' },
 *     },
 *   },
 * });
 */
export function createInlineCatalog<TSku extends string>(
  products: InlineCatalogProducts<TSku>,
): Catalog<TSku> {
  return {
    '~types': {} as CatalogPhantomTypes<TSku>,
    async resolve(items, context) {
      const resolved: ResolvedCatalogItem[] = [];
      for (const item of items) {
        const product = products[item.sku as TSku];
        if (!product) {
          throw new CatalogError(
            `SKU not found in inline catalog: '${item.sku}'`,
            { sku: item.sku },
          );
        }
        const pricing =
          typeof product.pricing === 'function'
            ? product.pricing(context)
            : product.pricing;
        resolved.push({
          sku: item.sku,
          quantity: item.quantity,
          name: product.name,
          description: product.description,
          unitAmount: pricing.amount,
          currency: pricing.currency,
          providerRefs: product.providerRefs,
          metadata: product.metadata,
        });
      }
      return resolved;
    },
  };
}
