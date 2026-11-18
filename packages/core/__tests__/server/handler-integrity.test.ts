import { describe, it, expect, vi } from 'vitest';
import { createTenderlaneHandler } from '../../src/server/handler.js';
import { createInlineCatalog } from '../../src/catalog/inline.js';
import type {
  CheckoutResult,
  ResolvedCheckoutInput,
  ServerProviderAdapter,
} from '../../src/index.js';

const catalog = createInlineCatalog({
  pro: {
    name: 'Pro',
    pricing: (context) => ({
      amount: context.country === 'IN' ? 500 : 2900,
      currency: 'usd',
    }),
  },
});

function captureAdapter(id = 'mock') {
  const handle = vi.fn(
    async (_action: string, _payload: ResolvedCheckoutInput): Promise<CheckoutResult> => ({
      provider: id,
      id: 'session_123',
      status: 'open',
    }),
  );
  const adapter: ServerProviderAdapter = { id, actions: ['checkout'], handle };
  return { adapter, handle };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://shop.example/api/payments', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function checkout(payload: Record<string, unknown>, provider = 'mock') {
  return {
    provider,
    action: 'checkout',
    payload: { successUrl: 'https://shop.example/s', cancelUrl: 'https://shop.example/c', ...payload },
  };
}

describe('price integrity', () => {
  it('drops providerOptions sent by the client', async () => {
    const { adapter, handle } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const response = await handler.POST(
      post(
        checkout({
          items: [{ sku: 'pro', quantity: 1 }],
          providerOptions: {
            line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 1 } }],
            amount: 1,
          },
        }),
      ),
    );

    expect(response.status).toBe(200);
    const payload = handle.mock.calls[0]![1];
    expect(payload.providerOptions).toBeUndefined();
    expect(payload.items[0]?.unitAmount).toBe(2900);
  });

  it('passes only server-configured providerOptions for the selected provider', async () => {
    const { adapter, handle } = captureAdapter();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog,
      providerOptions: { mock: { allow_promotion_codes: true }, other: { ignored: true } },
    });

    await handler.POST(
      post(checkout({ items: [{ sku: 'pro', quantity: 1 }], providerOptions: { amount: 1 } })),
    );

    expect(handle.mock.calls[0]![1].providerOptions).toEqual({ allow_promotion_codes: true });
  });

  it('prices from the server-derived context, not the context the client sent', async () => {
    const { adapter, handle } = captureAdapter();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog,
      resolveContext: (request, clientContext) => ({
        ...clientContext,
        country: (request.headers.get('x-country') ?? 'US') as 'US',
      }),
    });

    await handler.POST(
      post(checkout({ items: [{ sku: 'pro', quantity: 1 }], context: { country: 'IN' } }), {
        'x-country': 'US',
      }),
    );

    const payload = handle.mock.calls[0]![1];
    expect(payload.items[0]?.unitAmount).toBe(2900);
    expect(payload.context?.country).toBe('US');
  });

  it('applies resolveContext on the /resolve preview route too', async () => {
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog,
      resolveContext: () => ({ country: 'US' }),
    });

    const response = await handler.resolve(
      post({ items: [{ sku: 'pro', quantity: 1 }], context: { country: 'IN' } }),
    );
    const body = await response.json();
    expect(body.items[0].unitAmount).toBe(2900);
  });

  it('rejects legacy lineItems for a provider that has no catalog of its own', async () => {
    const stripe = captureAdapter('stripe');
    const polar = captureAdapter('polar');
    const handler = createTenderlaneHandler({
      providers: [stripe.adapter, polar.adapter],
      catalogs: { stripe: catalog },
      // Even when asked for, the shim is off once any catalog exists.
      allowLegacyLineItems: true,
    });

    const response = await handler.POST(
      post(checkout({ lineItems: [{ name: 'Pro', quantity: 1, unitAmount: 1 }] }, 'polar')),
    );

    expect(response.status).toBe(400);
    expect(polar.handle).not.toHaveBeenCalled();
  });

  it('rejects legacy lineItems by default when no catalog is configured', async () => {
    const { adapter, handle } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter] });

    const response = await handler.POST(
      post(checkout({ lineItems: [{ name: 'Pro', quantity: 1, unitAmount: 1 }] })),
    );

    expect(response.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe('request validation', () => {
  it.each([-3, 0, 0.5, '2', 1e12, null, Number.NaN])(
    'rejects quantity %s with 400',
    async (quantity) => {
      const { adapter, handle } = captureAdapter();
      const handler = createTenderlaneHandler({ providers: [adapter], catalog });

      const response = await handler.POST(post(checkout({ items: [{ sku: 'pro', quantity }] })));

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('VALIDATION_ERROR');
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it('honours maxQuantity and maxItems', async () => {
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog,
      maxQuantity: 5,
      maxItems: 1,
    });

    const overQuantity = await handler.POST(
      post(checkout({ items: [{ sku: 'pro', quantity: 6 }] })),
    );
    const overItems = await handler.POST(
      post(
        checkout({
          items: [
            { sku: 'pro', quantity: 1 },
            { sku: 'pro', quantity: 1 },
          ],
        }),
      ),
    );

    expect(overQuantity.status).toBe(400);
    expect(overItems.status).toBe(400);
  });

  it.each(['constructor', '__proto__', 'toString'])(
    'treats the inherited property name %s as an unknown SKU',
    async (sku) => {
      const { adapter } = captureAdapter();
      const handler = createTenderlaneHandler({ providers: [adapter], catalog });

      const response = await handler.POST(post(checkout({ items: [{ sku, quantity: 1 }] })));

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('CATALOG_ERROR');
    },
  );

  it.each(['{not json', 'null', '[]', '"text"'])('answers 400 for the body %s', async (body) => {
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    expect((await handler.POST(post(body))).status).toBe(400);
    expect((await handler.resolve(post(body))).status).toBe(400);
  });

  it('rejects redirect URLs outside allowedRedirectOrigins', async () => {
    const { adapter, handle } = captureAdapter();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog,
      allowedRedirectOrigins: ['https://shop.example'],
    });
    const items = [{ sku: 'pro', quantity: 1 }];

    const allowed = await handler.POST(post(checkout({ items })));
    const foreign = await handler.POST(
      post(checkout({ items, successUrl: 'https://evil.example/s' })),
    );
    const relative = await handler.POST(post(checkout({ items, cancelUrl: 'http://localhost/cancel' })));

    expect(allowed.status).toBe(200);
    expect(foreign.status).toBe(400);
    expect(relative.status).toBe(400);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('keeps provider error text out of a 500 and reports it to onError', async () => {
    const onError = vi.fn();
    const adapter: ServerProviderAdapter = {
      id: 'mock',
      actions: ['checkout'],
      async handle() {
        throw new Error('sk_live_secret rejected by api.internal');
      },
    };
    const handler = createTenderlaneHandler({ providers: [adapter], catalog, onError });

    const response = await handler.POST(post(checkout({ items: [{ sku: 'pro', quantity: 1 }] })));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('sk_live_secret');
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('server-side routing', () => {
  const routing = {
    evaluate: (context: Record<string, unknown>) => ({
      provider: context.country === 'CH' ? 'stripe' : 'polar',
      flow: 'hosted' as const,
      paymentMethods: ['card'],
      source: 'rule' as const,
    }),
  };

  function makeHandler() {
    const stripe = captureAdapter('stripe');
    const polar = captureAdapter('polar');
    const cheap = createInlineCatalog({
      pro: { name: 'Pro', pricing: { amount: 100, currency: 'usd' } },
    });
    const handler = createTenderlaneHandler({
      providers: [stripe.adapter, polar.adapter],
      catalogs: { stripe: catalog, polar: cheap },
      routing,
      resolveContext: () => ({ country: 'CH' }),
    });
    return { handler, stripe, polar };
  }

  it('rejects a provider the route does not select, so the cheaper catalog cannot be picked', async () => {
    const { handler, polar } = makeHandler();

    const response = await handler.POST(
      post(checkout({ items: [{ sku: 'pro', quantity: 1 }] }, 'polar')),
    );

    expect(response.status).toBe(400);
    expect(polar.handle).not.toHaveBeenCalled();
  });

  it('takes payment methods from the route, not from the body', async () => {
    const { handler, stripe } = makeHandler();

    const response = await handler.POST(
      post({
        ...checkout({ items: [{ sku: 'pro', quantity: 1 }] }, 'stripe'),
        paymentMethods: ['klarna', 'twint'],
      }),
    );

    expect(response.status).toBe(200);
    expect(stripe.handle.mock.calls[0]![2]).toEqual({ paymentMethods: ['card'] });
  });
});

describe('pass-through field validation', () => {
  it.each([
    ['metadata with a non-string value', { metadata: { userId: 42 } }],
    ['metadata that is not an object', { metadata: 'x' }],
    ['a missing successUrl', { successUrl: undefined }],
    ['a non-string customerEmail', { customerEmail: { $ne: '' } }],
    ['a non-string idempotencyKey', { idempotencyKey: 7 }],
  ])('answers 400 for %s', async (_label, fields) => {
    const { adapter, handle } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const response = await handler.POST(
      post(checkout({ items: [{ sku: 'pro', quantity: 1 }], ...fields })),
    );

    expect(response.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe('errors from another copy of core', () => {
  it('answers 400 for a catalog error that is not an instance of this CatalogError', async () => {
    // What an adapter package throws when it resolved a different copy of core.
    class ForeignCatalogError extends Error {
      readonly code = 'CATALOG_ERROR';
    }
    const adapter: ServerProviderAdapter = {
      id: 'mock',
      actions: ['checkout'],
      async handle() {
        throw new ForeignCatalogError('A Polar checkout has no quantity.');
      },
    };
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const response = await handler.POST(post(checkout({ items: [{ sku: 'pro', quantity: 1 }] })));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('no quantity');
  });
});

describe('defaults that protect an unconfigured handler', () => {
  it('rejects a redirect URL on another origin when allowedRedirectOrigins is not set', async () => {
    const { adapter, handle } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });
    const items = [{ sku: 'pro', quantity: 1 }];

    const sameOrigin = await handler.POST(post(checkout({ items })));
    const foreign = await handler.POST(
      post(checkout({ items, successUrl: 'https://evil.example/thanks' })),
    );

    expect(sameOrigin.status).toBe(200);
    expect(foreign.status).toBe(400);
    expect((await foreign.json()).error).toContain('https://shop.example');
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('does not let a __proto__ key supply fields the body does not own', async () => {
    const { adapter, handle } = captureAdapter();
    const resolveContext = vi.fn((_request: Request, context: Record<string, unknown>) => context);
    const handler = createTenderlaneHandler({ providers: [adapter], catalog, resolveContext });

    // Written as text: an object literal would set the prototype instead of
    // creating the own "__proto__" key that JSON.parse produces.
    const smuggledContext = await handler.POST(
      post(
        `{"provider":"mock","action":"checkout","payload":{"items":[{"sku":"pro","quantity":1}],
          "successUrl":"https://shop.example/s","cancelUrl":"https://shop.example/c",
          "context":{"__proto__":{"country":"IN"}}}}`,
      ),
    );
    const smuggledPayload = await handler.POST(
      post(
        `{"provider":"mock","action":"checkout","payload":{"__proto__":{"items":[{"sku":"pro","quantity":1}],
          "successUrl":"https://shop.example/s","cancelUrl":"https://shop.example/c"}}}`,
      ),
    );

    expect(smuggledContext.status).toBe(200);
    expect(resolveContext.mock.calls[0]?.[1].country).toBeUndefined();
    expect(handle.mock.calls[0]?.[1].items[0]?.unitAmount).toBe(2900);
    expect(smuggledPayload.status).toBe(400);
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

describe('onCheckoutCreated', () => {
  it('receives the provider id and the server prices, not what the browser sent', async () => {
    const { adapter } = captureAdapter();
    const onCheckoutCreated = vi.fn();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog,
      resolveContext: () => ({ country: 'CH' }),
      onCheckoutCreated,
    });

    const response = await handler.POST(
      post(
        checkout({
          items: [{ sku: 'pro', quantity: 2, unitAmount: 1 }],
          context: { country: 'IN' },
          clientReferenceId: 'order-chosen-by-the-browser',
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(onCheckoutCreated).toHaveBeenCalledOnce();
    const event = onCheckoutCreated.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      provider: 'mock',
      action: 'checkout',
      result: { provider: 'mock', id: 'session_123', status: 'open' },
      context: { country: 'CH' },
    });
    expect(event.items).toMatchObject([{ sku: 'pro', quantity: 2, unitAmount: 2900 }]);
  });

  it('does not hand out a checkout the app failed to record', async () => {
    const { adapter } = captureAdapter();
    const onError = vi.fn();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog,
      onCheckoutCreated: () => {
        throw new Error('database is down');
      },
      onError,
    });

    const response = await handler.POST(post(checkout({ items: [{ sku: 'pro', quantity: 1 }] })));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Checkout request failed.', code: 'INTERNAL_ERROR' });
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('retrieve', () => {
  it("returns the adapter's details reduced to the known fields", async () => {
    const { adapter } = captureAdapter();
    const retrieve = vi.fn(async (id: string) => ({
      provider: 'mock',
      id,
      status: 'complete' as const,
      amountTotal: 3132,
      currency: 'USD',
      customer: { email: 'someone@example.com' },
    }));
    const handler = createTenderlaneHandler({ providers: [{ ...adapter, retrieve }], catalog });

    expect(await handler.retrieve('mock', 'session_123')).toEqual({
      provider: 'mock',
      id: 'session_123',
      status: 'complete',
      amountTotal: 3132,
      currency: 'usd',
    });
  });

  it('fails clearly for an unknown provider and for an adapter that cannot look up', async () => {
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    await expect(handler.retrieve('nope', 'x')).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    await expect(handler.retrieve('mock', 'x')).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
    });
  });
});

