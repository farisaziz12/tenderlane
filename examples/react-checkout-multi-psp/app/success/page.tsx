export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const session = query.session ?? query.session_id ?? query.checkout_id;

  return (
    <main className="page narrow">
      <h1>Back from the provider</h1>
      <p className="lede">
        The provider sent the customer to the success URL. That alone does not prove a payment: a
        real app confirms it from the provider&apos;s webhook before fulfilling the order. Webhook
        handling is not part of Tenderlane yet.
      </p>
      {session && <p className="mono">{session}</p>}
      <a className="button" href="/">
        Back to the checkout
      </a>
    </main>
  );
}
