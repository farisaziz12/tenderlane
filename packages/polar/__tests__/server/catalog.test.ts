import { describe, it, expect, vi } from 'vitest';
import { CatalogError } from '@tenderlane/core';
import { createPolarCatalog } from '../../src/server/catalog.js';

function mockPolarClient(
  get: (productId: string) => unknown,
): { products: { get: ReturnType<typeof vi.fn> } } {
  return {
    products: {
      get: vi.fn(async ({ id }: { id: string }) => get(id)),
    },
  };
}

describe('createPolarCatalog', () => {
  it('resolves a SKU by looking up the declared Polar product and reading its first fixed price', async () => {
    const client = mockPolarClient((id) => ({
      id,
      name: 'Premium Plan',
      prices: [
        {
          id: 'polar_price_1',
          amountType: 'fixed',
          priceAmount: 2900,
          priceCurrency: 'usd',
        },
      ],
    }));

    const catalog = createPolarCatalog({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
      client: client as never,
      skus: { 'premium-plan': { productId: 'polar_prod_abc' } },
    });

    const resolved = await catalog.resolve(
      [{ sku: 'premium-plan', quantity: 3 }],
      {},
    );

    expect(client.products.get).toHaveBeenCalledWith({ id: 'polar_prod_abc' });
    expect(resolved[0]).toEqual({
      sku: 'premium-plan',
      quantity: 3,
      name: 'Premium Plan',
      unitAmount: 2900,
      currency: 'usd',
      providerRefs: {
        polar: { productId: 'polar_prod_abc', priceId: 'polar_price_1' },
      },
    });
  });

  it('selects a specific priceId when one is declared on the SKU config', async () => {
    const client = mockPolarClient(() => ({
      id: 'polar_prod_abc',
      name: 'Premium Plan',
      prices: [
        { id: 'price_monthly', amountType: 'fixed', priceAmount: 2900, priceCurrency: 'usd' },
        { id: 'price_annual', amountType: 'fixed', priceAmount: 29000, priceCurrency: 'usd' },
      ],
    }));

    const catalog = createPolarCatalog({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
      client: client as never,
      skus: {
        'premium-annual': {
          productId: 'polar_prod_abc',
          priceId: 'price_annual',
        },
      },
    });

    const [item] = await catalog.resolve(
      [{ sku: 'premium-annual', quantity: 1 }],
      {},
    );
    expect(item?.unitAmount).toBe(29000);
    expect(item?.providerRefs?.polar?.priceId).toBe('price_annual');
  });

  it('throws CatalogError with sku + provider when SKU is unregistered', async () => {
    const client = mockPolarClient(() => ({}));
    const catalog = createPolarCatalog({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
      client: client as never,
      skus: { known: { productId: 'p_known' } },
    });

    try {
      await catalog.resolve([{ sku: 'unknown', quantity: 1 }], {});
      expect.fail('expected CatalogError');
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError);
      expect((error as CatalogError).sku).toBe('unknown');
      expect((error as CatalogError).provider).toBe('polar');
    }
    expect(client.products.get).not.toHaveBeenCalled();
  });

  it('throws CatalogError when the product has no fixed-amount price', async () => {
    const client = mockPolarClient(() => ({
      id: 'polar_prod_custom',
      name: 'Pay-what-you-want',
      prices: [{ id: 'price_custom', amountType: 'custom' }],
    }));
    const catalog = createPolarCatalog({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
      client: client as never,
      skus: { 'pay-what': { productId: 'polar_prod_custom' } },
    });

    await expect(
      catalog.resolve([{ sku: 'pay-what', quantity: 1 }], {}),
    ).rejects.toBeInstanceOf(CatalogError);
  });

  it('wraps Polar lookup failures in CatalogError', async () => {
    const client = {
      products: {
        get: vi.fn(async () => {
          throw new Error('Product not found');
        }),
      },
    };

    const catalog = createPolarCatalog({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
      client: client as never,
      skus: { 'pro-plan': { productId: 'missing' } },
    });

    await expect(
      catalog.resolve([{ sku: 'pro-plan', quantity: 1 }], {}),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});
