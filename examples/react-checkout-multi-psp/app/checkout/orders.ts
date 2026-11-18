import type { CheckoutStatus, ResolvedCatalogItem } from '@tenderlane/core';

/** How this shop learned an order's payment status. */
export type UpdateSource = 'webhook' | 'return';

/** What this shop knows about a checkout it started. */
export interface Order {
  readonly provider: string;
  readonly checkoutId: string;
  readonly items: readonly ResolvedCatalogItem[];
  /** The provider's last reported status for the payment. */
  status: CheckoutStatus;
  /** Every time the status was read from the provider, newest last. */
  readonly updates: { source: UpdateSource; status: CheckoutStatus; at: string }[];
}

// An in-memory stand-in for the orders table of a real app. It lives on
// `globalThis` so that the API routes and the pages share one copy in
// development, and it is lost on restart.
const store = globalThis as typeof globalThis & { __orders?: Map<string, Order> };
const orders = (store.__orders ??= new Map<string, Order>());

export function recordOrder(order: Pick<Order, 'provider' | 'checkoutId' | 'items'>): void {
  orders.set(order.checkoutId, { ...order, status: 'open', updates: [] });
}

export function findOrder(checkoutId: string): Order | undefined {
  return orders.get(checkoutId);
}

/**
 * Record what the provider says now. Safe to call any number of times and in
 * any order, because it stores the provider's current status and never a
 * transition taken from an event. A paid order stays paid.
 */
export function applyPaymentStatus(
  order: Order,
  status: CheckoutStatus,
  source: UpdateSource,
): void {
  order.updates.push({ source, status, at: new Date().toISOString() });
  if (order.status !== 'complete') order.status = status;
}
