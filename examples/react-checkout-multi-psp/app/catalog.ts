import { createInlineCatalog } from 'tenderlane';

/**
 * Client-side preview catalog. Display-only — the running total shown next
 * to the pay button reads from here. The server has its own PSP-sourced
 * catalog (Stripe Price lookup, Polar Product lookup) and ALWAYS re-resolves
 * at submit time. The number that hits the PSP is the server's, not this one.
 *
 * In production you would typically replace this with `createRemoteCatalog({
 * endpoint: '/api/payments/resolve' })` so the client carries zero pricing
 * logic at all. We keep an inline catalog here only so the demo renders a
 * preview without a network round trip and the running total updates
 * synchronously when the currency switcher fires.
 */
export const previewCatalog = createInlineCatalog({
  'premium-plan': {
    name: 'Premium Plan',
    description: 'Monthly access to all features',
    pricing: (context) => {
      const currency = (context.currency ?? 'usd').toLowerCase();
      const amount =
        currency === 'eur'
          ? 2700
          : currency === 'gbp'
            ? 2400
            : currency === 'chf'
              ? 2900
              : currency === 'jpy'
                ? 3500
                : 2900;
      return { amount, currency };
    },
  },
});

/** Display helper: format an amount/currency pair for the UI. */
export function formatAmount(amount: number, currency: string): string {
  return (amount / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
}
