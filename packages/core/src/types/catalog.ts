import type { CurrencyCode } from './capabilities.js';
import type { MaybePromise, TenderlaneContext } from './context.js';

/**
 * Phantom type metadata carried by Catalog implementations. Never instantiated
 * at runtime — exists purely for TypeScript inference of known SKUs.
 *
 * Follows the same `~types` convention used by provider adapters.
 */
export interface CatalogPhantomTypes<TSku extends string = string> {
  readonly skus: TSku;
}

/**
 * What the client (or server) tells the catalog: a SKU and a quantity. The
 * wire payload between browser and server carries this shape — never a price.
 */
export interface CatalogRequest {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * Per-provider native references. A single resolved item can declare native
 * IDs for multiple providers so the same SKU works across PSPs. Open-ended
 * via the index signature so user-defined providers can extend it.
 */
export interface ResolvedProviderRefs {
  readonly stripe?: {
    readonly priceId?: string;
    readonly productId?: string;
  };
  readonly polar?: {
    readonly productId: string;
    readonly priceId?: string;
  };
  readonly [providerId: string]: unknown;
}

/**
 * What a catalog returns after resolving a CatalogRequest. Carries the
 * canonical pricing, the human-presentable name, and optional per-provider
 * native references that adapters prefer over inline pricing when available.
 *
 * Server-side resolution is the source of truth. Client-side resolution
 * exists for preview UX only.
 */
export interface ResolvedCatalogItem {
  readonly sku: string;
  readonly quantity: number;
  readonly name: string;
  readonly description?: string;
  readonly unitAmount: number;
  readonly currency: CurrencyCode;
  readonly providerRefs?: ResolvedProviderRefs;
  readonly metadata?: Record<string, string>;
}

/**
 * Provider-agnostic product/pricing primitive. A Catalog resolves
 * `{ sku, quantity }[]` (plus reactive context) into provider-ready
 * `ResolvedCatalogItem[]`.
 *
 * Implementations ship in core (`createInlineCatalog`, `createRemoteCatalog`,
 * `defineCatalog`) and in provider packages (`createStripeCatalog`,
 * `createPolarCatalog`).
 *
 * **Price integrity**: client-side resolution is preview-only. The server
 * MUST re-resolve at submit time using its own configured catalog. Client-
 * supplied amounts are never trusted.
 */
export interface Catalog<TSku extends string = string> {
  readonly '~types': CatalogPhantomTypes<TSku>;
  resolve(
    items: readonly CatalogRequest[],
    context: TenderlaneContext,
  ): MaybePromise<readonly ResolvedCatalogItem[]>;
}
