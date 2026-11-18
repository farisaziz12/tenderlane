import { useTenderlaneCheckout } from '@tenderlane/react';

export function CheckoutStatus() {
  const checkout = useTenderlaneCheckout();

  switch (checkout.status) {
    case 'idle':
    case 'evaluating':
      return <p>Finding a payment route…</p>;
    case 'ready':
    case 'preparing':
    case 'prepared':
      return <p>Paying with {checkout.route.provider}.</p>;
    case 'submitting':
      return <p>Processing…</p>;
    case 'redirecting':
      return <p>Taking you to {checkout.checkoutResult.url}</p>;
    case 'pending':
      return <p>Payment {checkout.checkoutResult.id} is processing.</p>;
    case 'success':
      return <p>Payment {checkout.checkoutResult.id} went through.</p>;
    case 'error':
      // `route` is null when routing itself failed; then there is nothing to retry.
      return (
        <p role="alert">
          {checkout.error.message}
          {checkout.route && <button onClick={checkout.reset}>Start over</button>}
        </p>
      );
  }
}
