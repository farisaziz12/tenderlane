export default function CancelPage() {
  return (
    <main className="page narrow">
      <h1>Checkout cancelled</h1>
      <p className="lede">The customer left the provider&apos;s page without paying.</p>
      <a className="button" href="/">
        Back to the checkout
      </a>
    </main>
  );
}
