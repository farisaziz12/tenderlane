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
import type { CheckoutInput, CheckoutResult, ResolvedCheckoutInput } from '../types/checkout.js';
import type { ProviderPhantomTypes } from '../types/phantom.js';
import type { BrowserPaymentProvider, ServerProviderAdapter } from '../types/provider.js';
import type { SelectedPaymentRoute } from '../types/routing.js';
import { ProviderError } from '../errors/errors.js';

export type {
  BrowserPaymentProvider,
  ServerProviderAdapter,
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
    options?: Record<string, unknown>,
  ): Promise<CheckoutResult>;
}): ServerProviderAdapter<TProviderId> {
  return adapter as ServerProviderAdapter<TProviderId>;
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
 * format the handler expects, and return the normalized result. Throws a
 * `ProviderError` carrying the HTTP status when the handler answers non-2xx.
 *
 * Browser providers use this for redirect flows and for session creation.
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
      `${request.provider} ${request.action} failed (${response.status}): ${body}`,
      request.provider,
      { cause: new Error(body) },
    );
  }

  return (await response.json()) as CheckoutResult;
}
