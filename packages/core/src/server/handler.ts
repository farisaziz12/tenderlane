import type { ServerProviderAdapter } from '../types/provider.js';
import type { CheckoutInput, ResolvedCheckoutInput } from '../types/checkout.js';
import type { Catalog, ResolvedCatalogItem } from '../types/catalog.js';
import type { TenderlaneContext } from '../types/context.js';
import type { TenderlaneMiddleware } from '../types/middleware.js';
import { resolveCatalogItems, wrapLegacyLineItems } from '../catalog/runner.js';
import { runMiddlewareHook } from '../middleware/runner.js';
import { CatalogError } from '../errors/errors.js';

interface ServerHandlerConfig {
  readonly providers: readonly ServerProviderAdapter[];
  /**
   * Optional default catalog used to resolve `CheckoutInput.items[]`
   * server-side when no per-provider catalog is configured. The `/resolve`
   * route always uses this catalog (it has no provider context).
   *
   * If both `catalog` and `catalogs` are omitted, requests carrying
   * `items[]` are rejected and only the legacy `lineItems[]` shim path
   * remains available.
   */
  readonly catalog?: Catalog;
  /**
   * Per-provider catalogs. When the wire payload's `provider` matches a key
   * here, that catalog is used for resolution instead of the default
   * `catalog`. Lets each PSP pull pricing from its own source of truth
   * (e.g., `createStripeCatalog` calls `stripe.prices.retrieve(...)`,
   * `createPolarCatalog` calls `polar.products.get(...)`).
   */
  readonly catalogs?: Readonly<Record<string, Catalog>>;
  /** Middleware invoked at lifecycle points (currently `onCatalogResolved`). */
  readonly middleware?: readonly TenderlaneMiddleware[];
}

interface TenderlaneRequest {
  readonly provider: string;
  readonly action: string;
  readonly payload: CheckoutInput;
  readonly paymentMethods?: string[];
}

interface TenderlaneResolveRequest {
  readonly items?: readonly { sku: string; quantity: number }[];
  readonly context?: TenderlaneContext;
}

/**
 * Recursively strip any client-supplied `unitAmount` from the catalog-driven
 * `items[]` subtree of a payload. Returns a defensive copy — the original
 * object is never mutated — so forged amounts cannot reach the catalog, the
 * middleware, or the adapter.
 *
 * This is the load-bearing piece of the price-integrity contract: when a
 * caller passes the new `items[]` shape, anything resembling an amount they
 * sneak in is dropped. The legacy `lineItems[]` subtree is left untouched
 * because there is no catalog to override it — `unitAmount` is intentional
 * and the only signal for legacy callers. The legacy shim is opt-in (no
 * catalog configured) and explicitly carries no integrity guarantee.
 */
function stripClientAmounts<T>(payload: T): T {
  if (payload === null || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) {
    return payload.map((entry) => stripClientAmounts(entry)) as unknown as T;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (key === 'unitAmount') continue;
    if (key === 'lineItems') {
      sanitized[key] = value;
      continue;
    }
    sanitized[key] = stripClientAmounts(value);
  }
  return sanitized as T;
}

/**
 * Resolve the items on a CheckoutInput using the configured catalog (when
 * `items[]` is present) or the legacy lineItems shim (when only `lineItems[]`
 * is present). Returns the canonical `ResolvedCatalogItem[]`.
 *
 * Throws `CatalogError` if neither path is satisfiable.
 */
async function resolvePayloadItems(
  payload: CheckoutInput,
  catalog: Catalog | undefined,
): Promise<readonly ResolvedCatalogItem[]> {
  const context = payload.context ?? {};
  if (payload.items && payload.items.length > 0) {
    return await resolveCatalogItems(catalog, payload.items, context);
  }
  if (payload.lineItems && payload.lineItems.length > 0) {
    if (catalog) {
      throw new CatalogError(
        'CheckoutInput.lineItems is deprecated. With a catalog configured, callers must send `items: [{ sku, quantity }]` instead.',
      );
    }
    return wrapLegacyLineItems(payload.lineItems, context);
  }
  throw new CatalogError(
    'CheckoutInput must contain either `items[]` (preferred) or legacy `lineItems[]`.',
  );
}

/**
 * Creates a framework-agnostic request handler using the Web `Request`/`Response`
 * API. Works in any runtime that supports the Web standards: Next.js App Router,
 * Deno, Bun, Cloudflare Workers, etc.
 *
 * The returned object exposes:
 * - `POST(req)` — main dispatch. Parses `{ provider, action, payload }`,
 *   resolves the catalog, fires `onCatalogResolved`, and routes to the
 *   correct provider adapter.
 * - `resolve(req)` — preview-only endpoint. Parses `{ items, context }` and
 *   returns the resolved items as `{ items: ResolvedCatalogItem[] }`. This
 *   is the target for {@link createRemoteCatalog} on the client.
 *
 * Both routes strip client-supplied `unitAmount` defensively before any
 * downstream code runs — the server's catalog is always the source of truth
 * for pricing.
 *
 * @example
 * // app/api/tenderlane/route.ts
 * const handler = createTenderlaneHandler({
 *   providers: [stripeServerAdapter({ secretKey })],
 *   catalog: defineCatalog({ async resolve(items, context) { ... } }),
 * });
 * export const POST = handler.POST;
 *
 * // app/api/tenderlane/resolve/route.ts — for createRemoteCatalog
 * export const POST = handler.resolve;
 */
export function createTenderlaneHandler(config: ServerHandlerConfig) {
  const providerMap = new Map<string, ServerProviderAdapter>();
  for (const provider of config.providers) {
    providerMap.set(provider.id, provider);
  }
  const defaultCatalog = config.catalog;
  const perProviderCatalogs = config.catalogs ?? {};
  const middleware = config.middleware ?? [];

  function catalogForProvider(providerId: string): Catalog | undefined {
    return perProviderCatalogs[providerId] ?? defaultCatalog;
  }

  async function POST(req: Request): Promise<Response> {
    try {
      const rawBody = (await req.json()) as TenderlaneRequest;
      const body = stripClientAmounts(rawBody);

      if (!body.provider || !body.action || !body.payload) {
        return Response.json(
          { error: 'Missing required fields: provider, action, payload' },
          { status: 400 },
        );
      }

      const adapter = providerMap.get(body.provider);
      if (!adapter) {
        return Response.json(
          {
            error: `Unknown provider: "${body.provider}". Available: ${[...providerMap.keys()].join(', ')}`,
          },
          { status: 400 },
        );
      }

      if (!adapter.actions.includes(body.action)) {
        return Response.json(
          {
            error: `Provider "${body.provider}" does not support action "${body.action}". Supported: ${adapter.actions.join(', ')}`,
          },
          { status: 400 },
        );
      }

      const resolved = await resolvePayloadItems(
        body.payload,
        catalogForProvider(body.provider),
      );

      await runMiddlewareHook(middleware, 'onCatalogResolved', {
        context: body.payload.context ?? {},
        resolved,
      });

      const { items: _droppedItems, lineItems: _droppedLineItems, ...rest } = body.payload;
      const adapterPayload: ResolvedCheckoutInput = {
        ...rest,
        items: resolved,
      };

      const options = body.paymentMethods
        ? { paymentMethods: body.paymentMethods }
        : undefined;

      const result = await adapter.handle(body.action, adapterPayload, options);

      return Response.json(result, { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      const status = err instanceof CatalogError ? 400 : 500;
      return Response.json({ error: message }, { status });
    }
  }

  async function resolve(req: Request): Promise<Response> {
    try {
      const rawBody = (await req.json()) as TenderlaneResolveRequest;
      const body = stripClientAmounts(rawBody);

      if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
        return Response.json(
          { error: 'Missing required field: items[]' },
          { status: 400 },
        );
      }

      if (!defaultCatalog) {
        return Response.json(
          {
            error:
              'No default catalog configured on the handler. The /resolve route uses the top-level `catalog` field (per-provider `catalogs` are only used when a provider is known from the wire payload).',
          },
          { status: 400 },
        );
      }

      const items = await resolveCatalogItems(defaultCatalog, body.items, body.context ?? {});

      return Response.json({ items }, { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      const status = err instanceof CatalogError ? 400 : 500;
      return Response.json({ error: message }, { status });
    }
  }

  return { POST, resolve };
}
