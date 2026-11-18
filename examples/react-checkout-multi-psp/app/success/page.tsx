import { findOrder } from '../checkout/orders';
import { refreshOrder } from '../checkout/server';

export const dynamic = 'force-dynamic';

/**
 * Where a hosted checkout sends the customer back to. Arriving here proves
 * nothing, so the page asks two things on the server: does this shop have an
 * order under that checkout id, and what does the provider say about it?
 */
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { checkout: checkoutId } = await searchParams;
  const order = checkoutId ? findOrder(checkoutId) : undefined;

  if (!order) {
    return (
      <main className="page narrow">
        <h1>No order found</h1>
        <p className="lede">
          This shop has no order for that checkout. Orders are kept in memory in this example, so a
          restart loses them.
        </p>
        <a className="button" href="/">
          Back to the checkout
        </a>
      </main>
    );
  }

  // Ask the provider again now that the customer is back. If its webhook
  // already arrived, this changes nothing.
  await refreshOrder(order, 'return').catch((error: unknown) => console.error('[success]', error));
  const paid = order.status === 'complete';
  const processing = order.status === 'processing';

  return (
    <main className="page narrow">
      <h1>
        {paid
          ? 'Payment confirmed'
          : processing
          ? 'Payment processing'
          : 'Payment not confirmed yet'}
      </h1>
      <p className="lede">
        {paid
          ? `${order.provider} reports this checkout as paid. The page asked the provider from the server; it did not take the browser's word for it.`
          : processing
          ? `${order.provider} has the payment and is waiting for the money. Bank debits can take several days and can still fail, so this shop would not ship yet.`
          : `${order.provider} does not report this checkout as paid (status: ${order.status}).`}
      </p>
      <section className="panel">
        <dl>
          <dt>order</dt>
          <dd>{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</dd>
          <dt>provider</dt>
          <dd>{order.provider}</dd>
          <dt>checkout</dt>
          <dd>{order.checkoutId}</dd>
          <dt>status</dt>
          <dd data-testid="provider-status">{order.status}</dd>
          <dt>learned from</dt>
          <dd data-testid="sources">
            {order.updates.map((update) => `${update.source}: ${update.status}`).join(', ')}
          </dd>
        </dl>
      </section>
      <p className="hint">
        The webhook arrives whether or not the customer comes back. The lookup on return covers a
        webhook that is late or was never delivered. Both go through the same function.
      </p>
      <a className="button" href="/">
        Back to the checkout
      </a>
    </main>
  );
}
