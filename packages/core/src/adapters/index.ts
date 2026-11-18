/**
 * Building blocks for writing a provider adapter, first-party or community.
 *
 * An adapter package depends on `@tenderlane/core` as a peer and imports
 * from `@tenderlane/core/adapters`. Core never imports an adapter and never
 * names a provider: everything a PSP needs goes through these contracts.
 *
 * @packageDocumentation
 */
import type { ProviderCapabilities } from '../types/capabilities.js';
import type {
  CheckoutInput,
  CheckoutResult,
  CheckoutStatus,
  ResolvedCheckoutInput,
} from '../types/checkout.js';
import type { ProviderPhantomTypes } from '../types/phantom.js';
import type {
  BrowserPaymentProvider,
  ServerActionOptions,
  ServerProviderAdapter,
} from '../types/provider.js';
import type { SelectedPaymentRoute } from '../types/routing.js';
import { ProviderError } from '../errors/errors.js';

export type {
  BrowserPaymentProvider,
  ServerProviderAdapter,
  ServerActionOptions,
  ProviderSession,
} from '../types/provider.js';
export type {
  ProviderCapabilities,
  PaymentMethodDescriptor,
  PaymentFlow,
} from '../types/capabilities.js';
export type { ProviderPhantomTypes } from '../types/phantom.js';
export type {
  CheckoutInput,
  CheckoutResult,
  CheckoutStatus,
  ResolvedCheckoutInput,
} from '../types/checkout.js';
export type { ResolvedCatalogItem, ResolvedProviderRefs } from '../types/catalog.js';
export type { SelectedPaymentRoute } from '../types/routing.js';
export { ProviderError, CatalogError, UnsupportedCapabilityError } from '../errors/errors.js';

/**
 * Define a browser provider. An identity function: it adds the `~types`
 * phantom property and keeps the provider id as a string literal, so
 * `InferProviderId` and typed routing rules work for your adapter the same
 * way they do for the first-party ones.
 *
 * @example
 * export function acmeProvider(options: { serverEndpoint: string }) {
 *   return defineBrowserProvider({
 *     id: 'acme',
 *     capabilities: ACME_CAPABILITIES,
 *     getAvailablePaymentMethods: () => ACME_METHODS,
 *     submit: (input, route) =>
 *       requestProviderAction({
 *         endpoint: options.serverEndpoint,
 *         provider: 'acme',
 *         action: 'checkout',
 *         input,
 *         route,
 *       }),
 *   });
 * }
 */
export function defineBrowserProvider<
  const TProviderId extends string,
  const TCapabilities extends ProviderCapabilities,
  TProviderOptions = unknown,
>(
  provider: Omit<BrowserPaymentProvider<TProviderId, TCapabilities, TProviderOptions>, '~types'>,
): BrowserPaymentProvider<TProviderId, TCapabilities, TProviderOptions> {
  return {
    ...provider,
    '~types': {} as ProviderPhantomTypes<TProviderId, TCapabilities, TProviderOptions>,
  };
}

/**
 * Define a server adapter. An identity function that keeps the provider id
 * and the action names as literals and types `handle`'s `action` parameter
 * as their union.
 *
 * `payload.items` is already resolved by the server's catalog. Read prices
 * only from there.
 *
 * @example
 * export function acmeServerAdapter(config: { secretKey: string }) {
 *   return defineServerAdapter({
 *     id: 'acme',
 *     actions: ['checkout'],
 *     async handle(action, payload) {
 *       const session = await createAcmeSession(config.secretKey, payload.items);
 *       return { provider: 'acme', id: session.id, status: 'open', url: session.url };
 *     },
 *   });
 * }
 */
export function defineServerAdapter<
  const TProviderId extends string,
  const TActions extends readonly string[],
>(adapter: {
  readonly id: TProviderId;
  readonly actions: TActions;
  handle(
    action: TActions[number],
    payload: ResolvedCheckoutInput,
    options?: ServerActionOptions,
  ): Promise<CheckoutResult>;
}): ServerProviderAdapter<TProviderId> {
  return adapter as ServerProviderAdapter<TProviderId>;
}

const CHECKOUT_STATUSES: readonly CheckoutStatus[] = ['open', 'complete', 'expired', 'failed'];

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Validate a value that claims to be a {@link CheckoutResult} and return only
 * its known fields. Used on both sides of the wire: the server handler passes
 * every adapter result through it, so nothing else from a PSP response reaches
 * the browser, and the browser checks the response before acting on it. A
 * `url` must be an absolute http(s) URL, because the browser navigates to it.
 *
 * @throws {ProviderError} When the value does not have the expected shape.
 */
export function parseCheckoutResult(value: unknown, provider: string): CheckoutResult {
  const invalid = (detail: string) =>
    new ProviderError(`Invalid checkout result from "${provider}": ${detail}.`, provider);

  if (typeof value !== 'object' || value === null) throw invalid('not an object');
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.provider !== 'string') throw invalid('`provider` is not a string');
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw invalid('`id` is not a non-empty string');
  }
  const status = CHECKOUT_STATUSES.find((known) => known === candidate.status);
  if (!status) throw invalid('`status` is not a known checkout status');
  if (candidate.url !== undefined && (typeof candidate.url !== 'string' || !isHttpUrl(candidate.url))) {
    throw invalid('`url` is not an absolute http(s) URL');
  }
  if (candidate.clientSecret !== undefined && typeof candidate.clientSecret !== 'string') {
    throw invalid('`clientSecret` is not a string');
  }

  return {
    provider: candidate.provider,
    id: candidate.id,
    status,
    ...(candidate.url !== undefined ? { url: candidate.url } : {}),
    ...(candidate.clientSecret !== undefined ? { clientSecret: candidate.clientSecret } : {}),
  };
}

/** The handler answers errors as `{ error, code }`; show the message, not the JSON. */
function readErrorMessage(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const message = parsed.error;
      if (typeof message === 'string') return message;
    }
  } catch {
    // Not JSON: fall through to the raw text.
  }
  return body;
}

export interface ProviderActionRequest {
  /** URL of the app's Tenderlane handler (`createTenderlaneHandler().POST`). */
  readonly endpoint: string;
  readonly provider: string;
  readonly action: string;
  readonly input: CheckoutInput;
  readonly route: SelectedPaymentRoute;
  /** Fetch override, for tests or custom transports. */
  readonly fetch?: typeof globalThis.fetch;
  /** Extra headers, for example a CSRF token. */
  readonly headers?: Record<string, string>;
}

/**
 * POST one provider action to the app's Tenderlane handler, in the wire
 * format the handler expects, and return the validated result. Throws a
 * `ProviderError` when the handler answers non-2xx or with an unexpected body.
 *
 * Browser providers use this for hosted checkouts and for session creation.
 * It does not navigate: redirecting to `result.url` is the provider's call.
 */
export async function requestProviderAction(
  request: ProviderActionRequest,
): Promise<CheckoutResult> {
  const fetchImplementation = request.fetch ?? globalThis.fetch;
  const response = await fetchImplementation(request.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...request.headers },
    body: JSON.stringify({
      provider: request.provider,
      action: request.action,
      payload: request.input,
      paymentMethods: request.route.paymentMethods,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(
      `${request.provider} ${request.action} failed (${response.status}): ${readErrorMessage(body)}`,
      request.provider,
      { cause: new Error(body) },
    );
  }

  const body: unknown = await response.json().catch(() => undefined);
  return parseCheckoutResult(body, request.provider);
}
