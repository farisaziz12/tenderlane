import type { ResolvedCatalogItem } from '@tenderlane/core';

/** What this shop knows about a checkout it started. */
export interface Order {
  readonly provider: string;
  readonly checkoutId: string;
  readonly items: readonly ResolvedCatalogItem[];
  readonly createdAt: string;
}

// An in-memory stand-in for the orders table of a real app. It lives on
// `globalThis` so that the API route and the pages share one copy in
// development, and it is lost on restart.
const store = globalThis as typeof globalThis & { __orders?: Map<string, Order> };
const orders = (store.__orders ??= new Map<string, Order>());

export function recordOrder(order: Order): void {
  orders.set(order.checkoutId, order);
}

export function findOrder(checkoutId: string): Order | undefined {
  return orders.get(checkoutId);
}
