import { formatAmount } from '../../checkout/catalog';

const PLACEHOLDER_ORIGIN = 'http://demo-psp.invalid';

/**
 * Reduce a return URL to a path on this site, so the page cannot be used as
 * an open redirect. Anything that does not resolve to a same-site path
 * (`//evil.example`, a path that starts with a second slash) is replaced.
 */
function localPath(
  value: string | undefined,
  fallback: string,
  extra: Record<string, string> = {},
): string {
  let path = fallback;
  if (value) {
    try {
      const target = new URL(value, PLACEHOLDER_ORIGIN);
      if (!target.pathname.startsWith('//')) path = `${target.pathname}${target.search}`;
    } catch {
      // Keep the fallback.
    }
  }
  const url = new URL(path, PLACEHOLDER_ORIGIN);
  for (const [key, entry] of Object.entries(extra)) url.searchParams.set(key, entry);
  return `${url.pathname}${url.search}`;
}

export default async function DemoPspCheckout({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const amount = Number(query.amount);
  const success = localPath(query.success, '/success', {
    provider: 'demo',
    session: query.session ?? '',
  });
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
