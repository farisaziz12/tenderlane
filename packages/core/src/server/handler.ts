import type { ServerProviderAdapter } from '../types/provider.js';
import type { ResolvedCheckoutInput } from '../types/checkout.js';
import type { Catalog, CatalogRequest } from '../types/catalog.js';
import type { TenderlaneContext } from '../types/context.js';
import type { TenderlaneMiddleware } from '../types/middleware.js';
import type { Router } from '../types/routing.js';
import { resolveCatalogItems } from '../catalog/runner.js';
import { parseCheckoutResult } from '../adapters/index.js';
import { runMiddlewareHook } from '../middleware/runner.js';
import { CatalogError, ValidationError, hasErrorCode } from '../errors/errors.js';

const DEFAULT_MAX_ITEMS = 100;
const DEFAULT_MAX_QUANTITY = 10_000;

/** The provider ids of a tuple of server adapters, as a literal union. */
type AdapterIds<TAdapters extends readonly ServerProviderAdapter[]> = TAdapters[number]['id'];

export interface TenderlaneHandlerConfig<
  TAdapters extends readonly ServerProviderAdapter[] = readonly ServerProviderAdapter[],
> {
  readonly providers: TAdapters;
  /**
   * Catalog that prices `items[]` when no per-provider catalog is configured,
   * and the catalog behind the `resolve` route. A request for a provider with
   * no catalog is rejected.
   */
  readonly catalog?: Catalog;
  /**
   * Per-provider catalogs, keyed by provider id. Lets each PSP price from its
   * own source of truth (`createStripeCatalog`, `createPolarCatalog`).
   */
  readonly catalogs?: Readonly<Partial<Record<AdapterIds<TAdapters>, Catalog>>>;
  /** Server middleware. Only `onCatalogResolved` fires here. */
  readonly middleware?: readonly TenderlaneMiddleware[];
  /**
   * The same router the browser uses. When set, the server evaluates it
   * against the resolved context, rejects a request whose `provider` is not
   * the one the route selects, and takes the allowed payment methods from the
   * route instead of the request body. Without it, the browser decides which
   * registered provider (and so which catalog) handles the checkout.
   */
  readonly routing?: Router<AdapterIds<TAdapters>>;
  /**
   * Derive the context used for pricing and routing on the server. The
   * context in the request body comes from the browser and can be forged, so
   * return the context the server believes: the country from a geo header,
   * the tier from the session, and so on.
   *
   * Without this hook the client's context is used as sent.
   */
  readonly resolveContext?: (
    request: Request,
    clientContext: TenderlaneContext,
  ) => TenderlaneContext | Promise<TenderlaneContext>;
  /**
   * PSP-specific options merged into the PSP request, keyed by provider id.
   * Server configuration only: nothing in the request body can set them.
   */
  readonly providerOptions?: Readonly<
    Partial<Record<AdapterIds<TAdapters>, Readonly<Record<string, unknown>>>>
  >;
  /**
   * Origins that `successUrl` and `cancelUrl` may point to, for example
   * `['https://shop.example.com']`. When set, a request whose URLs are
   * relative or point elsewhere is rejected with 400. When omitted, the URLs
   * are passed to the PSP as sent.
   */
  readonly allowedRedirectOrigins?: readonly string[];
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

export interface TenderlaneHandler {
  /** Dispatch `{ provider, action, payload }` to a provider adapter. */
  POST(request: Request): Promise<Response>;
  /** Price `{ items, context }` with the default catalog, for display. */
  resolve(request: Request): Promise<Response>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Copy a parsed request body without any `unitAmount` key, at any depth. The
 * wire format has no amount field; this makes sure a forged one cannot reach
 * the catalog, the middleware or an adapter.
 */
function stripClientAmounts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripClientAmounts);
  if (typeof value !== 'object' || value === null) return value;
  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'unitAmount') continue;
    sanitized[key] = stripClientAmounts(nested);
  }
  return sanitized;
}

/** Parse the body as a JSON object, with client-supplied amounts removed. */
async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = stripClientAmounts(await request.json());
  } catch {
    throw new ValidationError('Request body is not valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new ValidationError('Request body must be a JSON object.');
  }
  return parsed;
}

function parseItems(
  items: unknown,
  limits: { maxItems: number; maxQuantity: number },
): CatalogRequest[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('`items` must be a non-empty array of `{ sku, quantity }`.', {
      field: 'items',
    });
  }
  if (items.length > limits.maxItems) {
    throw new ValidationError(`\`items\` has more than ${limits.maxItems} entries.`, {
      field: 'items',
    });
  }
  const parsed: CatalogRequest[] = [];
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
    parsed.push({ sku: item.sku, quantity });
  }
  return parsed;
}

function requiredString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`\`${field}\` must be a non-empty string.`, { field });
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`\`${field}\` must be a string.`, { field });
  }
  return value;
}

function parseMetadata(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const invalid = () =>
    new ValidationError('`metadata` must be an object of string values.', { field: 'metadata' });
  if (!isRecord(value)) throw invalid();
  const metadata: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw invalid();
    metadata[key] = entry;
  }
  return metadata;
}

function validateRedirectUrl(
  value: string,
  field: string,
  allowedOrigins: readonly string[] | undefined,
): void {
  if (!allowedOrigins) return;
  let origin: string | undefined;
  try {
    origin = new URL(value).origin;
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
 * Create the server endpoint the browser providers talk to. Uses the Web
 * `Request`/`Response` API, so it runs anywhere those exist (Next.js route
 * handlers, Bun, Deno, Cloudflare Workers).
 *
 * `POST` is the trust boundary of a Tenderlane checkout. For every request it:
 *
 * 1. parses the body and removes any client-supplied `unitAmount`,
 * 2. validates `items`, the redirect URLs and the pass-through fields,
 * 3. derives the server's context (`resolveContext`),
 * 4. checks the named provider against the server's `routing`, when given,
 * 5. prices the items with the server's catalog,
 * 6. calls the provider adapter with the resolved items,
 * 7. returns only the fields of a `CheckoutResult`.
 *
 * `providers`, `catalogs`, `routing` and `providerOptions` are checked against
 * each other at compile time: a key or a route for an adapter that is not in
 * `providers` is a type error.
 *
 * @example
 * // app/api/payments/route.ts
 * const handler = createTenderlaneHandler({
 *   providers: [stripeServerAdapter({ secretKey })],
 *   catalog,
 *   routing,
 * });
 * export const POST = handler.POST;
 */
export function createTenderlaneHandler<
  const TAdapters extends readonly ServerProviderAdapter[],
>(config: TenderlaneHandlerConfig<TAdapters>): TenderlaneHandler {
  const providerMap = new Map<string, ServerProviderAdapter>();
  for (const provider of config.providers) {
    providerMap.set(provider.id, provider);
  }
  const defaultCatalog = config.catalog;
  const perProviderCatalogs: Readonly<Record<string, Catalog | undefined>> = config.catalogs ?? {};
  const perProviderOptions: Readonly<
    Record<string, Readonly<Record<string, unknown>> | undefined>
  > = config.providerOptions ?? {};
  const middleware = config.middleware ?? [];
  const routing: Router | undefined = config.routing;

  const limits = {
    maxItems: config.maxItems ?? DEFAULT_MAX_ITEMS,
    maxQuantity: config.maxQuantity ?? DEFAULT_MAX_QUANTITY,
  };

  async function resolveServerContext(
    request: Request,
    clientContext: unknown,
  ): Promise<TenderlaneContext> {
    // The shape is not validated here: the context is untrusted input, read
    // only by the app's own `resolveContext`, catalog and routing rules.
    const context: TenderlaneContext = isRecord(clientContext) ? clientContext : {};
    return config.resolveContext ? await config.resolveContext(request, context) : context;
  }

  /**
   * 4xx responses describe what the caller got wrong. 5xx responses carry a
   * generic message: provider and runtime error text can hold internals.
   */
  function errorResponse(error: unknown): Response {
    // Matched by `code`, not `instanceof`: adapters may carry their own copy
    // of the error classes.
    if (hasErrorCode(error, 'CATALOG_ERROR') || hasErrorCode(error, 'VALIDATION_ERROR')) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }
    config.onError?.(error);
    const code =
      isRecord(error) && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code)
        ? error.code
        : 'INTERNAL_ERROR';
    return Response.json({ error: 'Checkout request failed.', code }, { status: 500 });
  }

  async function POST(request: Request): Promise<Response> {
    try {
      const body = await readJsonBody(request);
      const providerId = body.provider;
      const action = body.action;
      const payload = body.payload;

      if (typeof providerId !== 'string' || typeof action !== 'string' || !isRecord(payload)) {
        throw new ValidationError('Missing required fields: provider, action, payload.');
      }

      const adapter = providerMap.get(providerId);
      if (!adapter) {
        throw new ValidationError(
          `Unknown provider "${providerId}". Registered: ${[...providerMap.keys()].join(', ')}.`,
          { field: 'provider' },
        );
      }
      if (!adapter.actions.includes(action)) {
        throw new ValidationError(
          `Provider "${providerId}" does not support action "${action}". Supported: ${adapter.actions.join(', ')}.`,
          { field: 'action' },
        );
      }

      const items = parseItems(payload.items, limits);
      const successUrl = requiredString(payload, 'successUrl');
      const cancelUrl = requiredString(payload, 'cancelUrl');
      validateRedirectUrl(successUrl, 'successUrl', config.allowedRedirectOrigins);
      validateRedirectUrl(cancelUrl, 'cancelUrl', config.allowedRedirectOrigins);
      const customerEmail = optionalString(payload, 'customerEmail');
      const clientReferenceId = optionalString(payload, 'clientReferenceId');
      const idempotencyKey = optionalString(payload, 'idempotencyKey');
      const metadata = parseMetadata(payload.metadata);

      const context = await resolveServerContext(request, payload.context);

      // The browser names the provider; with a server router it has to be the
      // one the route selects for the context the server believes.
      const serverRoute = routing ? await routing.evaluate(context) : undefined;
      if (serverRoute && serverRoute.provider !== providerId) {
        throw new ValidationError(
          `Provider "${providerId}" is not the route selected for this context.`,
          { field: 'provider' },
        );
      }

      const resolved = await resolveCatalogItems(
        perProviderCatalogs[providerId] ?? defaultCatalog,
        items,
        context,
      );

      await runMiddlewareHook(middleware, 'onCatalogResolved', { context, resolved });

      // Built field by field from validated values: nothing else in the
      // request body (a `providerOptions`, say) reaches the adapter.
      const providerOptions = perProviderOptions[providerId];
      const adapterPayload: ResolvedCheckoutInput = {
        items: resolved,
        context,
        successUrl,
        cancelUrl,
        ...(customerEmail !== undefined ? { customerEmail } : {}),
        ...(clientReferenceId !== undefined ? { clientReferenceId } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        ...(providerOptions ? { providerOptions } : {}),
      };

      const paymentMethods = serverRoute
        ? serverRoute.paymentMethods
        : Array.isArray(body.paymentMethods)
          ? body.paymentMethods.filter((method): method is string => typeof method === 'string')
          : undefined;

      const result = await adapter.handle(
        action,
        adapterPayload,
        paymentMethods ? { paymentMethods } : undefined,
      );

      // Only the fields of a CheckoutResult cross the wire.
      return Response.json(parseCheckoutResult(result, providerId), { status: 200 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async function resolve(request: Request): Promise<Response> {
    try {
      const body = await readJsonBody(request);
      const items = parseItems(body.items, limits);

      if (!defaultCatalog) {
        throw new CatalogError(
          'The resolve route prices with the top-level `catalog`, and none is configured.',
        );
      }

      const context = await resolveServerContext(request, body.context);
      const resolved = await resolveCatalogItems(defaultCatalog, items, context);

      return Response.json({ items: resolved }, { status: 200 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  return { POST, resolve };
}
