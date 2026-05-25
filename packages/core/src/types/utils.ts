import type { ProviderCapabilities, PaymentMethodId } from './capabilities.js';

/** Extract the literal provider ID from an adapter's phantom types */
export type InferProviderId<T> = T extends {
  '~types': { providerId: infer P extends string };
}
  ? P
  : never;

/** Extract capabilities from an adapter's phantom types */
export type InferCapabilities<T> = T extends {
  '~types': { capabilities: infer C extends ProviderCapabilities };
}
  ? C
  : never;

/** Extract provider options from an adapter's phantom types */
export type InferProviderOptions<T> = T extends {
  '~types': { providerOptions: infer O };
}
  ? O
  : never;

/** Extract a union of provider IDs from a tuple/array of adapters */
export type InferProviderIds<T extends readonly any[]> =
  T[number] extends infer A
    ? A extends { '~types': { providerId: infer P extends string } }
      ? P
      : never
    : never;

/**
 * Extract the literal payment method IDs supported by a provider.
 * Works on both adapter instances and capability objects.
 *
 * ```ts
 * type StripeMethods = InferPaymentMethods<typeof stripe>; // "card"
 * ```
 */
export type InferPaymentMethods<T> = T extends {
  '~types': { capabilities: { paymentMethods: readonly (infer M extends PaymentMethodId)[] } };
}
  ? M
  : T extends { paymentMethods: readonly (infer M extends PaymentMethodId)[] }
    ? M
    : never;

/**
 * Extract the literal union of SKUs declared by a Catalog. Works on any
 * Catalog implementation that carries the `~types` phantom metadata.
 *
 * ```ts
 * const catalog = createInlineCatalog({ 'pro-plan': { ... }, 'team-plan': { ... } });
 * type SKU = InferCatalogSkus<typeof catalog>; // "pro-plan" | "team-plan"
 * ```
 */
export type InferCatalogSkus<T> = T extends {
  '~types': { skus: infer S extends string };
}
  ? S
  : never;

/**
 * Utility type that flattens intersection types into a single object type
 * for better IDE display and hover tooltips. Without this, intersections like
 * `{ a: string } & { b: number }` show as-is in IDE tooltips; with `Expand`,
 * they display as `{ a: string; b: number }`.
 *
 * Function types are passed through unchanged.
 *
 * @typeParam T - The type to expand.
 *
 * @example
 * type Combined = { provider: string } & { flow: string };
 * type Expanded = Expand<Combined>;
 * // Displays as: { provider: string; flow: string }
 */
export type Expand<T> = T extends object
  ? T extends (...args: any[]) => any
    ? T
    : { [K in keyof T]: T[K] }
  : T;
