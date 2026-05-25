import { describe, it, expect, vi } from 'vitest';
import { createTenderlaneHandler } from '../../src/server/handler.js';
import { createInlineCatalog } from '../../src/catalog/inline.js';
import type {
  CheckoutResult,
  ResolvedCheckoutInput,
  ServerProviderAdapter,
  TenderlaneMiddleware,
} from '../../src/index.js';

function captureAdapter(): {
  adapter: ServerProviderAdapter<'mock'>;
  received: {
    action: string | null;
    payload: ResolvedCheckoutInput | null;
    options: unknown;
  };
} {
  const received = {
    action: null as string | null,
    payload: null as ResolvedCheckoutInput | null,
    options: undefined as unknown,
  };
  const adapter: ServerProviderAdapter<'mock'> = {
    id: 'mock',
    actions: ['checkout'] as const,
    async handle(
      action: string,
      payload: ResolvedCheckoutInput,
      options?: Record<string, unknown>,
    ): Promise<CheckoutResult> {
      received.action = action;
      received.payload = payload;
      received.options = options;
      return {
        provider: 'mock',
        id: 'session_123',
        status: 'created',
        url: 'https://example.com/c',
      };
    },
  };
  return { adapter, received };
}

describe('createTenderlaneHandler — catalog resolution', () => {
  it('resolves items[] via the configured catalog and forwards them to the adapter', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': {
        name: 'Pro Plan',
        pricing: { amount: 2900, currency: 'usd' },
      },
    });
    const { adapter, received } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'mock',
        action: 'checkout',
        payload: {
          items: [{ sku: 'pro-plan', quantity: 2 }],
          context: { currency: 'usd' },
          successUrl: '/s',
          cancelUrl: '/c',
        },
      }),
    });

    const res = await handler.POST(req);
    expect(res.status).toBe(200);

    expect(received.payload?.items).toEqual([
      expect.objectContaining({
        sku: 'pro-plan',
        name: 'Pro Plan',
        quantity: 2,
        unitAmount: 2900,
        currency: 'usd',
      }),
    ]);
  });

  it('DISCARDS client-supplied unitAmount — price integrity contract', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': {
        name: 'Pro Plan',
        pricing: { amount: 2900, currency: 'usd' },
      },
    });
    const { adapter, received } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'mock',
        action: 'checkout',
        payload: {
          items: [{ sku: 'pro-plan', quantity: 1, unitAmount: 1 }],
          successUrl: '/s',
          cancelUrl: '/c',
        },
      }),
    });

    const res = await handler.POST(req);
    expect(res.status).toBe(200);
    expect(received.payload?.items?.[0]?.unitAmount).toBe(2900);
  });

  it('fires onCatalogResolved middleware with the resolved items', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': {
        name: 'Pro Plan',
        pricing: { amount: 2900, currency: 'usd' },
      },
    });
    const onCatalogResolved = vi.fn();
    const middleware: TenderlaneMiddleware = { name: 'audit', onCatalogResolved };
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog,
      middleware: [middleware],
    });

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'mock',
        action: 'checkout',
        payload: {
          items: [{ sku: 'pro-plan', quantity: 1 }],
          context: { currency: 'usd' },
          successUrl: '/s',
          cancelUrl: '/c',
        },
      }),
    });
    await handler.POST(req);

    expect(onCatalogResolved).toHaveBeenCalledTimes(1);
    const event = onCatalogResolved.mock.calls[0]?.[0];
    expect(event.resolved[0]?.unitAmount).toBe(2900);
    expect(event.context.currency).toBe('usd');
  });

  it('still accepts legacy lineItems[] when no catalog is configured', async () => {
    const { adapter, received } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter] });

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'mock',
        action: 'checkout',
        payload: {
          lineItems: [{ name: 'Legacy Item', quantity: 1, unitAmount: 1500 }],
          successUrl: '/s',
          cancelUrl: '/c',
        },
      }),
    });
    const res = await handler.POST(req);

    expect(res.status).toBe(200);
    expect(received.payload?.items?.[0]?.unitAmount).toBe(1500);
  });

  it('rejects lineItems[] when a catalog is configured (forces migration)', async () => {
    const catalog = createInlineCatalog({});
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'mock',
        action: 'checkout',
        payload: {
          lineItems: [{ name: 'Legacy Item', quantity: 1, unitAmount: 1500 }],
          successUrl: '/s',
          cancelUrl: '/c',
        },
      }),
    });
    const res = await handler.POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('deprecated');
  });
});

describe('createTenderlaneHandler — per-provider catalogs', () => {
  it('picks the catalog matching the wire payload provider', async () => {
    const stripeCatalog = createInlineCatalog({
      'pro-plan': { name: 'Pro Plan', pricing: { amount: 2900, currency: 'usd' } },
    });
    const polarCatalog = createInlineCatalog({
      'pro-plan': { name: 'Pro Plan (Polar)', pricing: { amount: 3100, currency: 'usd' } },
    });

    const stripe = captureAdapter();
    const polar: ReturnType<typeof captureAdapter> = (() => {
      const captured = captureAdapter();
      // Re-tag the captured adapter as 'polar' so the handler routes correctly.
      const adapter: typeof captured.adapter = {
        ...captured.adapter,
        id: 'polar' as unknown as 'mock',
      };
      return { adapter, received: captured.received };
    })();

    const handler = createTenderlaneHandler({
      providers: [stripe.adapter, polar.adapter],
      catalogs: {
        mock: stripeCatalog,     // 'mock' is the stripe-shaped adapter
        polar: polarCatalog,
      },
    });

    // Send to 'mock' (Stripe-shaped) → stripe catalog
    await handler.POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'mock',
          action: 'checkout',
          payload: {
            items: [{ sku: 'pro-plan', quantity: 1 }],
            successUrl: '/s',
            cancelUrl: '/c',
          },
        }),
      }),
    );
    expect(stripe.received.payload?.items?.[0]?.unitAmount).toBe(2900);

    // Send to 'polar' → polar catalog
    await handler.POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'polar',
          action: 'checkout',
          payload: {
            items: [{ sku: 'pro-plan', quantity: 1 }],
            successUrl: '/s',
            cancelUrl: '/c',
          },
        }),
      }),
    );
    expect(polar.received.payload?.items?.[0]?.unitAmount).toBe(3100);
    expect(polar.received.payload?.items?.[0]?.name).toBe('Pro Plan (Polar)');
  });

  it('falls back to the top-level catalog when no per-provider entry matches', async () => {
    const defaultCatalog = createInlineCatalog({
      'pro-plan': { name: 'Default', pricing: { amount: 999, currency: 'usd' } },
    });
    const { adapter, received } = captureAdapter();
    const handler = createTenderlaneHandler({
      providers: [adapter],
      catalog: defaultCatalog,
      catalogs: { other: createInlineCatalog({}) }, // no 'mock' entry
    });

    await handler.POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'mock',
          action: 'checkout',
          payload: {
            items: [{ sku: 'pro-plan', quantity: 1 }],
            successUrl: '/s',
            cancelUrl: '/c',
          },
        }),
      }),
    );

    expect(received.payload?.items?.[0]?.unitAmount).toBe(999);
  });
});

describe('createTenderlaneHandler — resolve route', () => {
  it('returns resolved items for { items, context }', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': {
        name: 'Pro Plan',
        pricing: (context) => ({
          amount: context.currency === 'eur' ? 2700 : 2900,
          currency: context.currency ?? 'usd',
        }),
      },
    });
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const req = new Request('http://localhost/resolve', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ sku: 'pro-plan', quantity: 1 }],
        context: { currency: 'eur' },
      }),
    });
    const res = await handler.resolve(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { unitAmount: number; currency: string }[] };
    expect(body.items[0]?.unitAmount).toBe(2700);
    expect(body.items[0]?.currency).toBe('eur');
  });

  it('also strips client-supplied unitAmount on the /resolve route', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': { name: 'Pro Plan', pricing: { amount: 2900, currency: 'usd' } },
    });
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const req = new Request('http://localhost/resolve', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ sku: 'pro-plan', quantity: 1, unitAmount: 1 }],
        context: { currency: 'usd' },
      }),
    });
    const res = await handler.resolve(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { unitAmount: number }[] };
    expect(body.items[0]?.unitAmount).toBe(2900);
  });

  it('returns 400 when no catalog is configured', async () => {
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter] });

    const req = new Request('http://localhost/resolve', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ sku: 'pro-plan', quantity: 1 }],
      }),
    });
    const res = await handler.resolve(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No default catalog configured');
  });

  it('returns 400 when items[] is missing', async () => {
    const catalog = createInlineCatalog({});
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const req = new Request('http://localhost/resolve', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await handler.resolve(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 (not 500) when a CatalogError is thrown', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': { name: 'Pro Plan', pricing: { amount: 2900, currency: 'usd' } },
    });
    const { adapter } = captureAdapter();
    const handler = createTenderlaneHandler({ providers: [adapter], catalog });

    const req = new Request('http://localhost/resolve', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ sku: 'unknown-sku', quantity: 1 }],
      }),
    });
    const res = await handler.resolve(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('unknown-sku');
  });
});
