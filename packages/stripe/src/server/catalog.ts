import Stripe from 'stripe';
import type {
  Catalog,
  CatalogPhantomTypes,
  ResolvedCatalogItem,
} from '@tenderlane/core';
import { CatalogError } from '@tenderlane/core';

/**
 * Per-SKU declaration for the Stripe catalog. Today we accept a pre-created
 * Stripe Price ID; future versions may also accept a `lookup_key`.
 */
export interface StripeCatalogSkuConfig {
  /** A pre-created Stripe Price ID (`price_xxx`). */
  readonly priceId: string;
}

export interface StripeCatalogConfig<TSku extends string = string> {
  /** Stripe secret key (server-only). */
  readonly secretKey: string;
  /** Optional Stripe API version override. */
  readonly apiVersion?: string;
  /**
   * SKU → Stripe Price mapping. Each entry declares the pre-created Stripe
   * Price the catalog will look up at resolve time. Pricing is read from
   * Stripe — your code never declares an amount.
   */
  readonly skus: Record<TSku, StripeCatalogSkuConfig>;
  /**
   * Optional pre-instantiated Stripe client (for tests, or to share the same
   * client between the catalog and the server adapter). If omitted, the
   * catalog creates its own.
   */
  readonly client?: Stripe;
}

/**
 * Create a Stripe-sourced catalog. At resolve time, each requested SKU is
 * mapped to its declared Stripe Price ID, and the catalog calls
 * `stripe.prices.retrieve(priceId, { expand: ['product'] })` to pull the
 * canonical name, amount, and currency.
 *
 * The Stripe dashboard becomes the single source of truth for pricing — your
 * code never declares an amount, and the price-integrity contract is enforced
 * at the strongest possible boundary (the PSP itself).
 *
 * Resolved items carry `providerRefs.stripe.priceId`, so the Stripe adapter's
 * mapper emits `{ price: priceId }` against the session — Stripe looks up the
 * canonical amount internally and the wire amount is irrelevant.
 *
 * @example
 * const catalog = createStripeCatalog({
 *   secretKey: process.env.STRIPE_SECRET_KEY!,
 *   skus: {
 *     'premium-plan': { priceId: 'price_1ABC' },
 *     'team-plan':    { priceId: 'price_2DEF' },
 *   },
 * });
 */
export function createStripeCatalog<TSku extends string>(
  config: StripeCatalogConfig<TSku>,
): Catalog<TSku> {
  const stripe =
    config.client ??
    new Stripe(
      config.secretKey,
      config.apiVersion
        ? ({ apiVersion: config.apiVersion } as ConstructorParameters<typeof Stripe>[1])
        : undefined,
    );

  return {
    '~types': {} as CatalogPhantomTypes<TSku>,
    async resolve(items) {
      const resolved: ResolvedCatalogItem[] = [];
      for (const item of items) {
        const skuConfig = config.skus[item.sku as TSku];
        if (!skuConfig) {
          throw new CatalogError(
            `SKU not registered in Stripe catalog: '${item.sku}'`,
            { sku: item.sku, provider: 'stripe' },
          );
        }

        let price: Stripe.Price;
        try {
          price = await stripe.prices.retrieve(skuConfig.priceId, {
            expand: ['product'],
          });
        } catch (error) {
          throw new CatalogError(
            `Stripe price lookup failed for SKU '${item.sku}' (priceId=${skuConfig.priceId})`,
            { sku: item.sku, provider: 'stripe', cause: error },
          );
        }

        if (typeof price.unit_amount !== 'number') {
          throw new CatalogError(
            `Stripe price ${skuConfig.priceId} has no unit_amount; tiered or custom-amount prices are not supported by the catalog.`,
            { sku: item.sku, provider: 'stripe' },
          );
        }

        const product = price.product;
        const productId =
          typeof product === 'string' ? product : (product as Stripe.Product).id;
        const productName =
          typeof product === 'object' && product !== null && 'name' in product
            ? (product as Stripe.Product).name
            : item.sku;

        resolved.push({
          sku: item.sku,
          quantity: item.quantity,
          name: productName,
          unitAmount: price.unit_amount,
          currency: price.currency,
          providerRefs: {
            stripe: {
              priceId: skuConfig.priceId,
              productId,
            },
          },
        });
      }
      return resolved;
    },
  };
}
