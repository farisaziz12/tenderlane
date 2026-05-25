import { describe, it, expect, vi } from 'vitest';
import { CatalogError } from '@tenderlane/core';
import { createStripeCatalog } from '../../src/server/catalog.js';

function mockStripeClient(retrieve: (priceId: string) => unknown): {
  prices: { retrieve: ReturnType<typeof vi.fn> };
} {
  return {
    prices: {
      retrieve: vi.fn(async (priceId: string) => retrieve(priceId)),
    },
  };
}

describe('createStripeCatalog', () => {
  it('resolves a SKU by looking up its declared Stripe Price and reading unit_amount + currency', async () => {
    const client = mockStripeClient((priceId) => ({
      id: priceId,
      unit_amount: 2900,
      currency: 'usd',
      product: { id: 'prod_xxx', name: 'Premium Plan' },
    }));

    const catalog = createStripeCatalog({
      secretKey: 'sk_test_dummy',
      client: client as never,
      skus: {
        'premium-plan': { priceId: 'price_1ABC' },
      },
    });

    const resolved = await catalog.resolve(
      [{ sku: 'premium-plan', quantity: 2 }],
      {},
    );

    expect(client.prices.retrieve).toHaveBeenCalledWith('price_1ABC', {
      expand: ['product'],
    });

    expect(resolved[0]).toEqual({
      sku: 'premium-plan',
      quantity: 2,
      name: 'Premium Plan',
      unitAmount: 2900,
      currency: 'usd',
      providerRefs: {
        stripe: { priceId: 'price_1ABC', productId: 'prod_xxx' },
      },
    });
  });

  it('populates providerRefs.stripe.priceId so the adapter uses { price } and bypasses inline pricing', async () => {
    const client = mockStripeClient(() => ({
      unit_amount: 999,
      currency: 'eur',
      product: { id: 'prod_yyy', name: 'Thing' },
    }));

    const catalog = createStripeCatalog({
      secretKey: 'sk_test_dummy',
      client: client as never,
      skus: {
        widget: { priceId: 'price_widget' },
      },
    });

    const [item] = await catalog.resolve([{ sku: 'widget', quantity: 1 }], {});
    expect(item?.providerRefs?.stripe?.priceId).toBe('price_widget');
  });

  it('throws CatalogError with sku + provider when the SKU is not registered', async () => {
    const client = mockStripeClient(() => ({}));
    const catalog = createStripeCatalog({
      secretKey: 'sk_test_dummy',
      client: client as never,
      skus: { known: { priceId: 'price_known' } },
    });

    try {
      await catalog.resolve([{ sku: 'unknown', quantity: 1 }], {});
      expect.fail('expected CatalogError');
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError);
      expect((error as CatalogError).sku).toBe('unknown');
      expect((error as CatalogError).provider).toBe('stripe');
    }
    expect(client.prices.retrieve).not.toHaveBeenCalled();
  });

  it('wraps Stripe lookup failures in CatalogError', async () => {
    const client = {
      prices: {
        retrieve: vi.fn(async () => {
          throw new Error('No such price: price_missing');
        }),
      },
    };

    const catalog = createStripeCatalog({
      secretKey: 'sk_test_dummy',
      client: client as never,
      skus: { 'pro-plan': { priceId: 'price_missing' } },
    });

    await expect(
      catalog.resolve([{ sku: 'pro-plan', quantity: 1 }], {}),
    ).rejects.toBeInstanceOf(CatalogError);
  });

  it('rejects tiered/custom prices (no unit_amount)', async () => {
    const client = mockStripeClient(() => ({
      unit_amount: null,
      currency: 'usd',
      product: { id: 'prod_zzz', name: 'Tiered' },
    }));
    const catalog = createStripeCatalog({
      secretKey: 'sk_test_dummy',
      client: client as never,
      skus: { tiered: { priceId: 'price_tiered' } },
    });

    await expect(
      catalog.resolve([{ sku: 'tiered', quantity: 1 }], {}),
    ).rejects.toThrow(/unit_amount/);
  });

  it('handles a product returned as a plain ID string (not expanded)', async () => {
    const client = mockStripeClient(() => ({
      unit_amount: 1000,
      currency: 'usd',
      product: 'prod_unexpanded',
    }));
    const catalog = createStripeCatalog({
      secretKey: 'sk_test_dummy',
      client: client as never,
      skus: { 'pro-plan': { priceId: 'price_x' } },
    });

    const [item] = await catalog.resolve(
      [{ sku: 'pro-plan', quantity: 1 }],
      {},
    );
    expect(item?.providerRefs?.stripe?.productId).toBe('prod_unexpanded');
    expect(item?.name).toBe('pro-plan'); // falls back to sku when not expanded
  });
});
