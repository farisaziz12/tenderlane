import { formatAmount } from '../../checkout/catalog';
import { findDemoSession } from '../sessions';

export const dynamic = 'force-dynamic';

export default async function DemoPspCheckout({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { session: sessionId } = await searchParams;
  const session = findDemoSession(sessionId);

  return (
    <main className="page narrow">
      <p className="banner">
        Demo PSP. This page stands in for a provider&apos;s hosted checkout. It is not a payment
        provider and no money moves.
      </p>
      {session ? (
        <section className="panel">
          <p className="label">checkout</p>
          <p className="mono">{session.id}</p>
          <p className="label">order</p>
          <p>{session.description}</p>
          <p className="price">{formatAmount(session.amount, session.currency)}</p>
          <p className="hint">Priced by the example&apos;s server from its catalog.</p>
          <div className="actions">
            <form method="post" action="/demo-psp/pay">
              <input type="hidden" name="session" value={session.id} />
              <button className="button" type="submit">
                Pay
              </button>
            </form>
            <a className="button secondary" href={session.cancelUrl}>
              Cancel
            </a>
          </div>
        </section>
      ) : (
        <section className="panel">
          <p>The demo PSP has no such checkout. It keeps them in memory, so a restart loses them.</p>
          <a className="button secondary" href="/">
            Back to the checkout
          </a>
        </section>
      )}
    </main>
  );
}
