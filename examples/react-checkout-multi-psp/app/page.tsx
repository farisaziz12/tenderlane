import { Checkout } from './checkout/checkout';

// Read the environment per request, so adding keys needs no rebuild.
export const dynamic = 'force-dynamic';

export default function Home() {
  const configured = {
    stripe: Boolean(
      process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    ),
    polar: Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_PRODUCT_ID),
  };

  return (
    <main className="page">
      <h1>Tenderlane example checkout</h1>
      <p className="lede">
        One checkout form. The customer&apos;s country decides which payment provider and flow it
        uses. Change the country and watch the route change.
      </p>
      {!configured.stripe && !configured.polar && (
        <p className="banner">
          No provider keys are set, so only the built-in demo provider is available. It runs the whole flow
          (routing, server-side pricing, redirect, return) but is not a payment provider and moves
          no money. Add Stripe test keys to <span className="mono">.env.local</span> to try a real
          one.
        </p>
      )}
      <Checkout configured={configured} />
    </main>
  );
}
