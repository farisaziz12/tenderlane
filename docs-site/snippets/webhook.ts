// app/api/webhooks/stripe/route.ts
import { handler } from './confirm';

// Your own persistence.
declare const orders: {
  find(checkoutId: string): Promise<{ provider: 'stripe' } | undefined>;
  setStatus(checkoutId: string, status: string): Promise<void>;
};

export const POST = handler.webhook('stripe', async (event) => {
  // Verified, but not about a payment (or not one this adapter interprets).
  if (event.type === 'unhandled') return;

  // Providers also report payments this app did not start.
  const order = await orders.find(event.checkoutId);
  if (!order) return;

  // Events arrive more than once and out of order. Reading the current state
  // back makes this safe to run any number of times.
  const details = await handler.retrieve(order.provider, event.checkoutId);
  await orders.setStatus(event.checkoutId, details.status);
});
