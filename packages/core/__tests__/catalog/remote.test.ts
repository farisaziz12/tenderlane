import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRemoteCatalog } from '../../src/catalog/remote.js';
import { CatalogError } from '../../src/errors/errors.js';

describe('createRemoteCatalog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs { items, context } to the configured endpoint and returns parsed items', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              sku: 'pro-plan',
              quantity: 1,
              name: 'Pro Plan',
              unitAmount: 2900,
              currency: 'usd',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const catalog = createRemoteCatalog({ endpoint: '/api/resolve' });
    const resolved = await catalog.resolve(
      [{ sku: 'pro-plan', quantity: 1 }],
      { currency: 'usd' },
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/resolve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [{ sku: 'pro-plan', quantity: 1 }],
          context: { currency: 'usd' },
        }),
      }),
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.unitAmount).toBe(2900);
  });

  it('NEVER posts unitAmount on the wire — price integrity contract', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );

    const catalog = createRemoteCatalog({ endpoint: '/api/resolve' });
    await catalog.resolve([{ sku: 'pro-plan', quantity: 1 }], {});

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(typeof init?.body).toBe('string');
    expect(init?.body as string).not.toMatch(/unitAmount/);
    expect(init?.body as string).not.toMatch(/amount/);
  });

  it('throws CatalogError when the server returns a non-OK status', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('boom', { status: 500, statusText: 'Internal Server Error' }),
    );

    const catalog = createRemoteCatalog({ endpoint: '/api/resolve' });
    await expect(
      catalog.resolve([{ sku: 'pro-plan', quantity: 1 }], {}),
    ).rejects.toThrow(CatalogError);
  });

  it('throws CatalogError when the response is missing the items array', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const catalog = createRemoteCatalog({ endpoint: '/api/resolve' });
    await expect(
      catalog.resolve([{ sku: 'pro-plan', quantity: 1 }], {}),
    ).rejects.toThrow(/items/);
  });

  it('uses the injected fetch override when provided', async () => {
    const customFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );

    const catalog = createRemoteCatalog({
      endpoint: '/api/resolve',
      fetch: customFetch as unknown as typeof fetch,
      headers: { 'x-tenant': 'acme' },
    });
    await catalog.resolve([{ sku: 'pro-plan', quantity: 1 }], {});

    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    const init = customFetch.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-tenant']).toBe('acme');
  });
});
