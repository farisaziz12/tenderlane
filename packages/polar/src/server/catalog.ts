import { Polar } from '@polar-sh/sdk';
import type {
  Catalog,
  CatalogPhantomTypes,
  ResolvedCatalogItem,
} from '@tenderlane/core';
import { CatalogError } from '@tenderlane/core';

/**
 * Per-SKU declaration for the Polar catalog. Polar is product-first: every
 * SKU must map to a pre-created Polar product ID. Optionally select a
 * specific price ID on that product (otherwise the first fixed price is used).
 */
export interface PolarCatalogSkuConfig {
  /** A pre-created Polar product ID. */
  readonly productId: string;
  /**
   * Optional Polar price ID to select on the product. Useful when a product
   * has multiple prices (e.g., monthly vs annual). When omitted, the first
   * fixed-amount price is used.
   */
  readonly priceId?: string;
}

export interface PolarCatalogConfig<TSku extends string = string> {
  /** Polar Organization Access Token (server-only). */
  readonly accessToken: string;
  /** Polar organization ID. */
  readonly organizationId: string;
  /** Polar environment. Default: `'production'`. */
  readonly server?: 'sandbox' | 'production';
  /**
   * SKU → Polar Product mapping. Each entry declares the pre-created Polar
   * product the catalog will look up at resolve time.
   */
  readonly skus: Record<TSku, PolarCatalogSkuConfig>;
  /**
   * Optional pre-instantiated Polar client (for tests, or to share the same
   * client between the catalog and the server adapter). If omitted, the
   * catalog creates its own.
   */
  readonly client?: Polar;
}

interface PolarProductLike {
  readonly id: string;
  readonly name: string;
  readonly prices?: readonly PolarPriceLike[];
}

interface PolarPriceLike {
  readonly id: string;
  readonly amountType: 'fixed' | 'custom' | 'free' | string;
  readonly priceAmount?: number;
  readonly priceCurrency?: string;
}

/**
 * Create a Polar-sourced catalog. At resolve time, each requested SKU is
 * mapped to its declared Polar product ID, and the catalog calls
 * `polar.products.get({ id })` to pull the canonical name, amount, and
 * currency from Polar's API.
 *
 * Polar becomes the single source of truth for pricing — your code never
 * declares an amount. Resolved items carry `providerRefs.polar.productId`,
 * so the Polar adapter's mapper sends `products: [productId]` against the
 * checkout. Polar looks up the canonical price internally.
 *
 * @example
 * const catalog = createPolarCatalog({
 *   accessToken: process.env.POLAR_ACCESS_TOKEN!,
 *   organizationId: process.env.POLAR_ORG_ID!,
 *   server: 'sandbox',
 *   skus: {
 *     'premium-plan': { productId: 'polar_prod_abc' },
 *   },
 * });
 */
export function createPolarCatalog<TSku extends string>(
  config: PolarCatalogConfig<TSku>,
): Catalog<TSku> {
  const polar =
    config.client ??
    new Polar({
      accessToken: config.accessToken,
      server: config.server ?? 'production',
    });

  return {
    '~types': {} as CatalogPhantomTypes<TSku>,
    async resolve(items) {
      const resolved: ResolvedCatalogItem[] = [];
      for (const item of items) {
        const skuConfig = config.skus[item.sku as TSku];
        if (!skuConfig) {
          throw new CatalogError(
            `SKU not registered in Polar catalog: '${item.sku}'`,
            { sku: item.sku, provider: 'polar' },
          );
        }

        let product: PolarProductLike;
        try {
          product = (await polar.products.get({
            id: skuConfig.productId,
          })) as unknown as PolarProductLike;
        } catch (error) {
          throw new CatalogError(
            `Polar product lookup failed for SKU '${item.sku}' (productId=${skuConfig.productId})`,
            { sku: item.sku, provider: 'polar', cause: error },
          );
        }

        const price = pickPolarPrice(product.prices ?? [], skuConfig.priceId);
        if (!price) {
          throw new CatalogError(
            `Polar product ${skuConfig.productId} has no fixed-amount price${skuConfig.priceId ? ` matching priceId=${skuConfig.priceId}` : ''}.`,
            { sku: item.sku, provider: 'polar' },
          );
        }

        if (
          typeof price.priceAmount !== 'number' ||
          typeof price.priceCurrency !== 'string'
        ) {
          throw new CatalogError(
            `Polar price ${price.id} is not a fixed-amount price; tiered/custom prices are not supported by the catalog.`,
            { sku: item.sku, provider: 'polar' },
          );
        }

        resolved.push({
          sku: item.sku,
          quantity: item.quantity,
          name: product.name,
          unitAmount: price.priceAmount,
          currency: price.priceCurrency,
          providerRefs: {
            polar: {
              productId: skuConfig.productId,
              priceId: price.id,
            },
          },
        });
      }
      return resolved;
    },
  };
}

function pickPolarPrice(
  prices: readonly PolarPriceLike[],
  preferredPriceId?: string,
): PolarPriceLike | null {
  if (preferredPriceId) {
    const match = prices.find((price) => price.id === preferredPriceId);
    if (match) return match;
    return null;
  }
  return prices.find((price) => price.amountType === 'fixed') ?? null;
}
