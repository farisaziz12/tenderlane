import type {
  Catalog,
  CatalogPhantomTypes,
  ResolvedCatalogItem,
} from '../types/catalog.js';
import { CatalogError } from '../errors/errors.js';

export interface RemoteCatalogConfig {
  /**
   * URL of the server endpoint that exposes `catalog.resolve()`. The endpoint
   * must accept `POST { items, context }` and return JSON of shape
   * `{ items: ResolvedCatalogItem[] }`. `createTenderlaneHandler()` exposes a
   * built-in `/resolve` route that satisfies this contract.
   */
  readonly endpoint: string;

  /** Optional fetch override (test injection, custom auth headers, etc.) */
  readonly fetch?: typeof globalThis.fetch;

  /** Extra headers sent with the resolve request. */
  readonly headers?: Record<string, string>;

  /** Abort the request after this many milliseconds. */
  readonly timeoutMs?: number;
}

/**
 * Client-side catalog stub that POSTs `{ items, context }` to a server
 * endpoint and returns the resolved items for display.
 *
 * This is the production default: the client carries zero pricing logic, and
 * the server (the canonical source of truth) owns resolution. Pair with any
 * server-side catalog (`defineCatalog` against a DB, `createStripeCatalog`,
 * `createPolarCatalog`, etc.).
 *
 * Price integrity is preserved either way — the server re-resolves at submit
 * time regardless of what the client previewed.
 *
 * @example
 * const catalog = createRemoteCatalog({ endpoint: '/api/tenderlane/resolve' });
 */
export function createRemoteCatalog<TSku extends string = string>(
  config: RemoteCatalogConfig,
): Catalog<TSku> {
  return {
    '~types': {} as CatalogPhantomTypes<TSku>,
    async resolve(items, context) {
      const fetchImpl = config.fetch ?? globalThis.fetch;
      if (typeof fetchImpl !== 'function') {
        throw new CatalogError(
          'createRemoteCatalog requires fetch to be available in the global scope or passed via config.fetch',
        );
      }

      const controller =
        typeof config.timeoutMs === 'number' && config.timeoutMs > 0
          ? new AbortController()
          : undefined;
      const timeout =
        controller && config.timeoutMs
          ? setTimeout(() => controller.abort(), config.timeoutMs)
          : undefined;

      try {
        const response = await fetchImpl(config.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.headers ?? {}),
          },
          body: JSON.stringify({ items, context }),
          signal: controller?.signal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => undefined);
          throw new CatalogError(
            `Remote catalog returned ${response.status} ${response.statusText}`,
            { cause: detail },
          );
        }

        const json = (await response.json()) as {
          items?: readonly ResolvedCatalogItem[];
        };

        if (!json || !Array.isArray(json.items)) {
          throw new CatalogError(
            'Remote catalog response missing `items` array',
          );
        }

        return json.items;
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    },
  };
}
