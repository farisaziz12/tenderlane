// app/api/webhooks/stripe/route.ts
import { handler } from './confirm';

// Your own persistence.
declare const orders: {
  find(checkoutId: string): Promise<{ provider: 'stripe'; status: string } | undefined>;
  setStatus(checkoutId: string, status: string): Promise<void>;
};

export const POST = handler.webhook('stripe', async (event) => {
  // Verified, but not about a payment (or not one this adapter interprets).
  if (event.type === 'unhandled') return;

  // Providers also report payments this app did not start.
  const order = await orders.find(event.checkoutId);
  if (!order) return;

  // Events arrive more than once and out of order, so read the current state
  // back instead of trusting what this one says.
  const details = await handler.retrieve(order.provider, event.checkoutId);

  // Two deliveries can overlap, and the one that read the older state may
  // write last. A paid order must never be moved back by it.
  if (order.status !== 'complete') {
    await orders.setStatus(event.checkoutId, details.status);
  }
});
