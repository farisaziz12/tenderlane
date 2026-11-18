import { formatAmount } from '../../checkout/catalog';

/** Only same-site paths are followed, so the page cannot be used as an open redirect. */
function localPath(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value, 'http://localhost');
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export default async function DemoPspCheckout({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const amount = Number(query.amount);
  const success = `${localPath(query.success, '/success')}?provider=demo&session=${encodeURIComponent(query.session ?? '')}`;
  const cancel = localPath(query.cancel, '/cancel');

  return (
    <main className="page narrow">
      <p className="banner">
        Demo PSP. This page stands in for a provider&apos;s hosted checkout. It is not a payment
        provider and no money moves.
      </p>
      <section className="panel">
        <p className="label">session</p>
        <p className="mono">{query.session}</p>
        <p className="label">order</p>
        <p>{query.item}</p>
        <p className="price">
          {Number.isFinite(amount) ? formatAmount(amount, query.currency ?? 'usd') : 'unknown'}
        </p>
        <p className="hint">Priced by the example&apos;s server from its catalog.</p>
        <div className="actions">
          <a className="button" href={success}>
            Pay
          </a>
          <a className="button secondary" href={cancel}>
            Cancel
          </a>
        </div>
      </section>
    </main>
  );
}
