import { describe, it, expect } from 'vitest';
import { createInlineCatalog } from '../../src/catalog/inline.js';
import { CatalogError } from '../../src/errors/errors.js';

describe('createInlineCatalog', () => {
  it('resolves a static-pricing product to a canonical ResolvedCatalogItem', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': {
        name: 'Pro Plan',
        description: 'Everything in Basic, plus collaboration features.',
        pricing: { amount: 2900, currency: 'usd' },
      },
    });

    const resolved = await catalog.resolve(
      [{ sku: 'pro-plan', quantity: 2 }],
      { currency: 'usd' },
    );

    expect(resolved).toEqual([
      {
        sku: 'pro-plan',
        quantity: 2,
        name: 'Pro Plan',
        description: 'Everything in Basic, plus collaboration features.',
        unitAmount: 2900,
        currency: 'usd',
        providerRefs: undefined,
        metadata: undefined,
      },
    ]);
  });

  it('runs a pricing function against the supplied context (reactive pricing)', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': {
        name: 'Pro Plan',
        pricing: (context) => ({
          amount: context.currency === 'eur' ? 2700 : 2900,
          currency: context.currency ?? 'usd',
        }),
      },
    });

    const usd = await catalog.resolve(
      [{ sku: 'pro-plan', quantity: 1 }],
      { currency: 'usd' },
    );
    const eur = await catalog.resolve(
      [{ sku: 'pro-plan', quantity: 1 }],
      { currency: 'eur' },
    );

    expect(usd[0]?.unitAmount).toBe(2900);
    expect(usd[0]?.currency).toBe('usd');
    expect(eur[0]?.unitAmount).toBe(2700);
    expect(eur[0]?.currency).toBe('eur');
  });

  it('passes through providerRefs unchanged so adapters can prefer native IDs', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': {
        name: 'Pro Plan',
        pricing: { amount: 2900, currency: 'usd' },
        providerRefs: {
          stripe: { priceId: 'price_123' },
          polar: { productId: 'polar_prod_abc' },
        },
      },
    });

    const [item] = await catalog.resolve(
      [{ sku: 'pro-plan', quantity: 1 }],
      {},
    );

    expect(item?.providerRefs?.stripe).toEqual({ priceId: 'price_123' });
    expect(item?.providerRefs?.polar).toEqual({ productId: 'polar_prod_abc' });
  });

  it('throws CatalogError with the offending sku when a SKU is not in the catalog', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': {
        name: 'Pro Plan',
        pricing: { amount: 2900, currency: 'usd' },
      },
    });

    await expect(
      catalog.resolve([{ sku: 'enterprise-plan', quantity: 1 }], {}),
    ).rejects.toThrow(CatalogError);

    try {
      await catalog.resolve([{ sku: 'enterprise-plan', quantity: 1 }], {});
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError);
      expect((error as CatalogError).sku).toBe('enterprise-plan');
      expect((error as CatalogError).code).toBe('CATALOG_ERROR');
    }
  });

  it('resolves multiple items in the order they were requested', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': { name: 'Pro', pricing: { amount: 2900, currency: 'usd' } },
      seat: { name: 'Seat', pricing: { amount: 500, currency: 'usd' } },
    });

    const resolved = await catalog.resolve(
      [
        { sku: 'seat', quantity: 3 },
        { sku: 'pro-plan', quantity: 1 },
      ],
      {},
    );

    expect(resolved.map((item) => item.sku)).toEqual(['seat', 'pro-plan']);
    expect(resolved[0]?.quantity).toBe(3);
    expect(resolved[1]?.quantity).toBe(1);
  });
});
