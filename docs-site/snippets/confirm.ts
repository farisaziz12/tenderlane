import { createTenderlaneHandler } from '@tenderlane/core/server';
import { stripeServerAdapter } from '@tenderlane/stripe/server';
import { catalog } from './catalog';
import { routing } from './routing';

declare const secretKey: string;
// Your own persistence.
declare const orders: {
  create(order: { checkoutId: string; provider: string; totalMinor: number }): Promise<void>;
  find(checkoutId: string): Promise<{ provider: 'stripe' } | undefined>;
  markPaid(checkoutId: string): Promise<void>;
};

export const handler = createTenderlaneHandler({
  providers: [stripeServerAdapter({ secretKey })],
  catalog,
  routing,
  // 1. Record the order when the checkout is created, keyed by the provider's id.
  async onCheckoutCreated({ provider, result, items }) {
    await orders.create({
      checkoutId: result.id,
      provider,
      totalMinor: items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0),
    });
  },
});

// 2. When the customer returns to /success?checkout=cs_..., ask the provider.
// A real app also checks that the order belongs to the signed-in customer.
export async function confirmOnReturn(checkoutId: string): Promise<boolean> {
  const order = await orders.find(checkoutId);
  if (!order) return false;

  const details = await handler.retrieve(order.provider, checkoutId);
  if (details.status !== 'complete') return false;

  await orders.markPaid(checkoutId);
  return true;
}
