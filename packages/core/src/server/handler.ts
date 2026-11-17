import type { ServerProviderAdapter } from '../types/provider.js';
import type { CheckoutInput, ResolvedCheckoutInput } from '../types/checkout.js';
import type { Catalog, ResolvedCatalogItem } from '../types/catalog.js';
import type { TenderlaneContext } from '../types/context.js';
import type { TenderlaneMiddleware } from '../types/middleware.js';
import type { Router } from '../types/routing.js';
import { resolveCatalogItems, wrapLegacyLineItems } from '../catalog/runner.js';
import { runMiddlewareHook } from '../middleware/runner.js';
import { CatalogError, TenderlaneError, ValidationError } from '../errors/errors.js';

const DEFAULT_MAX_ITEMS = 100;
const DEFAULT_MAX_QUANTITY = 10_000;

interface ServerHandlerConfig {
  readonly providers: readonly ServerProviderAdapter[];
  /**
   * Optional default catalog used to resolve `CheckoutInput.items[]`
   * server-side when no per-provider catalog is configured. The `/resolve`
   * route always uses this catalog (it has no provider context).
   *
   * If both `catalog` and `catalogs` are omitted, requests carrying
   * `items[]` are rejected. The legacy `lineItems[]` shim is available only
   * with `allowLegacyLineItems: true`.
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
  /**
   * The same router the browser uses. When set, the server evaluates it
   * against the resolved context and rejects a request whose `provider` is
   * not the one the route selects, and it takes the allowed payment methods
   * from the route instead of the request body. Without it, the browser
   * decides which registered provider (and so which catalog) handles the
   * checkout.
   */
  readonly routing?: Router;
  /**
   * Derive the context used for pricing on the server. The context in the
   * request body comes from the browser and can be forged, so a catalog whose
   * price depends on context (regional pricing, tiers, experiments) must not
   * trust it. Return the context the server believes: read the country from
   * a geo header, the tier from the session, and so on.
   *
   * Without this hook the client's context is passed to the catalog as sent.
   */
  readonly resolveContext?: (
    request: Request,
    clientContext: TenderlaneContext,
  ) => TenderlaneContext | Promise<TenderlaneContext>;
  /**
   * Provider-specific options merged into the PSP request, keyed by provider
   * id. These are server configuration. `providerOptions` in the request body
   * is always dropped: it could otherwise override the resolved price.
   */
  readonly providerOptions?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /**
   * Origins that `successUrl` and `cancelUrl` may point to, for example
   * `['https://shop.example.com']`. When set, a request whose URLs are
   * relative or point elsewhere is rejected with 400. When omitted, the
   * URLs are passed to the PSP as sent.
   */
  readonly allowedRedirectOrigins?: readonly string[];
  /**
   * Accept the deprecated `lineItems[]` shape, which carries `unitAmount`
   * from the browser and therefore has no price integrity. Off by default,
   * and ignored whenever any catalog is configured.
   */
  readonly allowLegacyLineItems?: boolean;
  /** Most entries accepted in `items[]`. Default 100. */
  readonly maxItems?: number;
  /** Largest `quantity` accepted for one item. Default 10 000. */
  readonly maxQuantity?: number;
  /**
   * Called with every error that produces a 5xx response. The response body
   * carries only a generic message, so log the detail here.
   */
  readonly onError?: (error: unknown) => void;
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
 * and the only signal for legacy callers. The legacy shim is opt-in
 * (`allowLegacyLineItems: true` and no catalog configured) and explicitly
 * carries no integrity guarantee.
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
  context: TenderlaneContext,
  catalog: Catalog | undefined,
  legacyLineItemsAllowed: boolean,
): Promise<readonly ResolvedCatalogItem[]> {
  if (payload.items && payload.items.length > 0) {
    return await resolveCatalogItems(catalog, payload.items, context);
  }
  if (payload.lineItems && payload.lineItems.length > 0) {
    if (!legacyLineItemsAllowed) {
      throw new CatalogError(
        'CheckoutInput.lineItems carries client-supplied amounts and is rejected. Send `items: [{ sku, quantity }]` and configure a catalog.',
      );
    }
    return wrapLegacyLineItems(payload.lineItems, context);
  }
  throw new CatalogError('CheckoutInput must contain `items: [{ sku, quantity }]`.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ValidationError('Request body is not valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new ValidationError('Request body must be a JSON object.');
  }
  return parsed;
}

function validateItems(
  items: unknown,
  limits: { maxItems: number; maxQuantity: number },
): void {
  if (!Array.isArray(items)) {
    throw new ValidationError('`items` must be an array.', { field: 'items' });
  }
  if (items.length > limits.maxItems) {
    throw new ValidationError(`\`items\` has more than ${limits.maxItems} entries.`, {
      field: 'items',
    });
  }
  for (const [index, item] of items.entries()) {
    if (!isRecord(item) || typeof item.sku !== 'string' || item.sku.length === 0) {
      throw new ValidationError(`items[${index}].sku must be a non-empty string.`, {
        field: `items[${index}].sku`,
      });
    }
    const quantity = item.quantity;
    if (
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > limits.maxQuantity
    ) {
      throw new ValidationError(
        `items[${index}].quantity must be an integer between 1 and ${limits.maxQuantity}.`,
        { field: `items[${index}].quantity` },
      );
    }
  }
}

const OPTIONAL_STRING_FIELDS = [
  'cancelUrl',
  'customerEmail',
  'clientReferenceId',
  'idempotencyKey',
] as const;

/** Types of the pass-through fields, so a bad one is a 400 and not a PSP 500. */
function validatePayloadFields(payload: Record<string, unknown>): void {
  if (typeof payload.successUrl !== 'string' || payload.successUrl.length === 0) {
    throw new ValidationError('`successUrl` must be a non-empty string.', { field: 'successUrl' });
  }
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (payload[field] !== undefined && typeof payload[field] !== 'string') {
      throw new ValidationError(`\`${field}\` must be a string.`, { field });
    }
  }
  if (payload.metadata !== undefined) {
    const metadata = payload.metadata;
    if (!isRecord(metadata) || Object.values(metadata).some((value) => typeof value !== 'string')) {
      throw new ValidationError('`metadata` must be an object of string values.', {
        field: 'metadata',
      });
    }
  }
}

function validateRedirectUrl(
  value: unknown,
  field: string,
  allowedOrigins: readonly string[] | undefined,
): void {
  if (!allowedOrigins || value === undefined) return;
  let origin: string | undefined;
  try {
    origin = typeof value === 'string' ? new URL(value).origin : undefined;
  } catch {
    origin = undefined;
  }
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new ValidationError(`\`${field}\` must be an absolute URL on an allowed origin.`, {
      field,
    });
  }
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

  const limits = {
    maxItems: config.maxItems ?? DEFAULT_MAX_ITEMS,
    maxQuantity: config.maxQuantity ?? DEFAULT_MAX_QUANTITY,
  };
  const hasAnyCatalog =
    defaultCatalog !== undefined || Object.keys(perProviderCatalogs).length > 0;
  const legacyLineItemsAllowed = config.allowLegacyLineItems === true && !hasAnyCatalog;

  async function resolveServerContext(
    request: Request,
    clientContext: unknown,
  ): Promise<TenderlaneContext> {
    const context = (isRecord(clientContext) ? clientContext : {}) as TenderlaneContext;
    return config.resolveContext ? await config.resolveContext(request, context) : context;
  }

  /**
   * 4xx responses describe what the caller got wrong. 5xx responses carry a
   * generic message: provider and runtime error text can hold internals.
   */
  function errorResponse(error: unknown): Response {
    if (error instanceof CatalogError || error instanceof ValidationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }
    config.onError?.(error);
    const code = error instanceof TenderlaneError ? error.code : 'INTERNAL_ERROR';
    return Response.json({ error: 'Checkout request failed.', code }, { status: 500 });
  }

  async function POST(request: Request): Promise<Response> {
    try {
      const body = stripClientAmounts(await readJsonBody(request)) as unknown as Partial<TenderlaneRequest>;

      if (
        typeof body.provider !== 'string' ||
        typeof body.action !== 'string' ||
        !isRecord(body.payload)
      ) {
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

      const payload = body.payload;
      validatePayloadFields(payload);
      if (payload.items !== undefined) validateItems(payload.items, limits);
      validateRedirectUrl(payload.successUrl, 'successUrl', config.allowedRedirectOrigins);
      validateRedirectUrl(payload.cancelUrl, 'cancelUrl', config.allowedRedirectOrigins);

      const context = await resolveServerContext(request, payload.context);

      // The browser names the provider; with a server router it has to be the
      // one the route selects for the context the server believes.
      const serverRoute = config.routing
        ? await config.routing.evaluate(context as unknown as Record<string, unknown>)
        : undefined;
      if (serverRoute && serverRoute.provider !== body.provider) {
        throw new ValidationError(
          `Provider "${body.provider}" is not the route selected for this context.`,
          { field: 'provider' },
        );
      }

      const resolved = await resolvePayloadItems(
        payload,
        context,
        catalogForProvider(body.provider),
        legacyLineItemsAllowed,
      );

      await runMiddlewareHook(middleware, 'onCatalogResolved', { context, resolved });

      // `providerOptions` from the browser is dropped: adapters merge it into
      // the PSP request, where it could replace the resolved line items.
      const {
        items: _droppedItems,
        lineItems: _droppedLineItems,
        providerOptions: _droppedProviderOptions,
        ...rest
      } = payload;
      const serverProviderOptions = config.providerOptions?.[body.provider];
      const adapterPayload: ResolvedCheckoutInput = {
        ...rest,
        context,
        items: resolved,
        ...(serverProviderOptions ? { providerOptions: serverProviderOptions } : {}),
      };

      const paymentMethods = serverRoute
        ? serverRoute.paymentMethods
        : Array.isArray(body.paymentMethods)
          ? body.paymentMethods.filter((method): method is string => typeof method === 'string')
          : undefined;
      const options = paymentMethods ? { paymentMethods } : undefined;

      const result = await adapter.handle(body.action, adapterPayload, options);

      return Response.json(result, { status: 200 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async function resolve(request: Request): Promise<Response> {
    try {
      const body = stripClientAmounts(await readJsonBody(request)) as TenderlaneResolveRequest;

      if (!Array.isArray(body.items) || body.items.length === 0) {
        return Response.json(
          { error: 'Missing required field: items[]' },
          { status: 400 },
        );
      }
      validateItems(body.items, limits);

      if (!defaultCatalog) {
        return Response.json(
          {
            error:
              'No default catalog configured on the handler. The /resolve route uses the top-level `catalog` field (per-provider `catalogs` are only used when a provider is known from the wire payload).',
          },
          { status: 400 },
        );
      }

      const context = await resolveServerContext(request, body.context);
      const items = await resolveCatalogItems(defaultCatalog, body.items, context);

      return Response.json({ items }, { status: 200 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return { POST, resolve };
}
