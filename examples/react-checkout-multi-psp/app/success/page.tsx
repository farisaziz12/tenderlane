import { formatAmount } from '../checkout/catalog';
import { findOrder } from '../checkout/orders';
import { handler } from '../checkout/server';

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

  const details = await handler.retrieve(order.provider, order.checkoutId).catch(() => null);
  const paid = details?.status === 'complete';

  return (
    <main className="page narrow">
      <h1>{paid ? 'Payment confirmed' : 'Payment not confirmed yet'}</h1>
      <p className="lede">
        {paid
          ? `${order.provider} reports this checkout as paid. The page asked the provider from the server; it did not take the browser's word for it.`
          : `${order.provider} does not report this checkout as paid${details ? ` (status: ${details.status})` : ''}. Some payment methods take time to settle.`}
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
          <dd data-testid="provider-status">{details?.status ?? 'lookup failed'}</dd>
          {details?.amountTotal !== undefined && details.currency && (
            <>
              <dt>charged</dt>
              <dd>{formatAmount(details.amountTotal, details.currency)}</dd>
            </>
          )}
        </dl>
      </section>
      <p className="hint">
        This lookup only runs if the customer comes back. A real app also handles the
        provider&apos;s webhook, which Tenderlane does not do yet.
      </p>
      <a className="button" href="/">
        Back to the checkout
      </a>
    </main>
  );
}
