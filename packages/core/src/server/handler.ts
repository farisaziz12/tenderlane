import type { ServerProviderAdapter } from '../types/provider.js';
import type { CheckoutInput } from '../types/checkout.js';

interface ServerHandlerConfig {
  readonly providers: readonly ServerProviderAdapter[];
}

interface TenderlaneRequest {
  readonly provider: string;
  readonly action: string;
  readonly payload: CheckoutInput;
  readonly paymentMethods?: string[];
}

/**
 * Creates a framework-agnostic request handler using the Web `Request`/`Response`
 * API. Works in any runtime that supports the Web standards: Next.js App Router,
 * Deno, Bun, Cloudflare Workers, etc.
 *
 * The returned object exposes a `POST` method that parses the request body,
 * dispatches to the correct provider adapter based on `{ provider, action, payload }`,
 * and returns a JSON `Response`.
 *
 * @param config - Server handler configuration containing registered provider adapters.
 * @returns An object with a `POST(req: Request): Promise<Response>` method.
 *
 * @example
 * // Next.js App Router: app/api/tenderlane/route.ts
 * import { createTenderlaneHandler } from "@tenderlane/core/server";
 * import { createStripeServerAdapter } from "@tenderlane/stripe/server";
 *
 * const stripeAdapter = createStripeServerAdapter({ secretKey: process.env.STRIPE_SECRET_KEY! });
 *
 * const handler = createTenderlaneHandler({
 *   providers: [stripeAdapter],
 * });
 *
 * export const POST = handler.POST;
 */
export function createTenderlaneHandler(config: ServerHandlerConfig) {
  const providerMap = new Map<string, ServerProviderAdapter>();
  for (const p of config.providers) {
    providerMap.set(p.id, p);
  }

  return {
    async POST(req: Request): Promise<Response> {
      try {
        const body = (await req.json()) as TenderlaneRequest;

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

        const options = body.paymentMethods
          ? { paymentMethods: body.paymentMethods }
          : undefined;

        const result = await adapter.handle(body.action, body.payload, options);

        return Response.json(result, { status: 200 });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return Response.json({ error: message }, { status: 500 });
      }
    },
  };
}
