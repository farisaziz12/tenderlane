import { createInlineCatalog, defineCatalog } from '@tenderlane/core';
import type { ResolvedCatalogItem } from '@tenderlane/core';

// Prices in code. `pricing` may also be a function of the context.
export const catalog = createInlineCatalog({
  'pro-plan': { name: 'Pro plan', pricing: { amount: 2900, currency: 'usd' } },
});

// Prices from anywhere else: a database, a CMS, a pricing service.
declare function findPrice(sku: string, country?: string): Promise<ResolvedCatalogItem>;

export const fromDatabase = defineCatalog({
  async resolve(items, context) {
    return Promise.all(
      items.map(async (item) => ({
        ...(await findPrice(item.sku, context.country)),
        quantity: item.quantity,
      })),
    );
  },
});
