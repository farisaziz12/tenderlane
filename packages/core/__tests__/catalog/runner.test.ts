import { describe, it, expect } from 'vitest';
import {
  resolveCatalogItems,
  wrapLegacyLineItems,
} from '../../src/catalog/runner.js';
import { createInlineCatalog } from '../../src/catalog/inline.js';
import { defineCatalog } from '../../src/catalog/define.js';
import { CatalogError } from '../../src/errors/errors.js';

describe('resolveCatalogItems', () => {
  it('delegates to the supplied catalog', async () => {
    const catalog = createInlineCatalog({
      'pro-plan': { name: 'Pro', pricing: { amount: 2900, currency: 'usd' } },
    });
    const resolved = await resolveCatalogItems(
      catalog,
      [{ sku: 'pro-plan', quantity: 1 }],
      {},
    );
    expect(resolved[0]?.unitAmount).toBe(2900);
  });

  it('throws CatalogError if no catalog is configured', async () => {
    await expect(
      resolveCatalogItems(undefined, [{ sku: 'pro-plan', quantity: 1 }], {}),
    ).rejects.toThrow(CatalogError);
  });
});

describe('defineCatalog', () => {
  it('forwards items + context to the user-supplied resolver', async () => {
    const catalog = defineCatalog({
      async resolve(items, context) {
        return items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          name: `Custom ${item.sku}`,
          unitAmount: context.currency === 'eur' ? 1000 : 1200,
          currency: context.currency ?? 'usd',
        }));
      },
    });

    const resolved = await catalog.resolve(
      [{ sku: 'foo', quantity: 2 }],
      { currency: 'eur' },
    );

    expect(resolved[0]?.name).toBe('Custom foo');
    expect(resolved[0]?.unitAmount).toBe(1000);
    expect(resolved[0]?.currency).toBe('eur');
  });
});

describe('wrapLegacyLineItems', () => {
  it('produces ResolvedCatalogItem[] from legacy lineItems without going through a catalog', () => {
    const wrapped = wrapLegacyLineItems(
      [
        {
          id: 'item-a',
          name: 'Item A',
          quantity: 2,
          unitAmount: 1500,
          currency: 'usd',
          description: 'desc',
        },
        { name: 'Item B', quantity: 1, unitAmount: 500 },
      ],
      { currency: 'eur' },
    );

    expect(wrapped[0]).toEqual({
      sku: 'item-a',
      quantity: 2,
      name: 'Item A',
      description: 'desc',
      unitAmount: 1500,
      currency: 'usd',
      metadata: undefined,
    });
    expect(wrapped[1]?.sku).toMatch(/^legacy-/);
    expect(wrapped[1]?.currency).toBe('eur');
  });
});
