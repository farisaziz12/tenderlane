import { createInlineCatalog } from '@tenderlane/core';
import type { CurrencyCode, TenderlaneContext } from '@tenderlane/core';

/** Amounts are integers in the currency's minor unit (cents, Rappen). */
export function priceFor(context: TenderlaneContext): { amount: number; currency: CurrencyCode } {
  switch (context.country) {
    case 'CH':
      return { amount: 2900, currency: 'chf' };
    case 'DE':
    case 'FR':
    case 'NL':
      return { amount: 2700, currency: 'eur' };
    default:
      return { amount: 2900, currency: 'usd' };
  }
}

/**
 * The price list. The server handler prices every checkout from it. The
 * browser imports the same module only to display the price: no amount is
 * ever sent to the server.
 */
export const catalog = createInlineCatalog({
  'pro-plan': {
    name: 'Pro plan',
    description: 'One-time purchase',
    pricing: priceFor,
  },
});

export function formatAmount(amount: number, currency: string): string {
  return (amount / 100).toLocaleString('en', { style: 'currency', currency: currency.toUpperCase() });
}
