import { describe, it, expect } from 'vitest';
import {
  mapToPolarCheckoutParams,
  mapFromPolarCheckout,
  mapPolarStatus,
} from '../../src/server/mapper.js';
import { CatalogError } from '@tenderlane/core';
import type { ResolvedCheckoutInput } from '@tenderlane/core';

const baseInput: ResolvedCheckoutInput = {
  items: [
    {
      sku: 'pro-plan',
      name: 'Pro Plan',
      quantity: 1,
      unitAmount: 2900,
      currency: 'usd',
      providerRefs: { polar: { productId: 'polar_prod_pro' } },
    },
  ],
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
};

describe('mapToPolarCheckoutParams', () => {
  it('builds the canonical Polar create-checkout body from resolved items', () => {
    const params = mapToPolarCheckoutParams(baseInput);

    expect(params.products).toEqual(['polar_prod_pro']);
    expect(params.success_url).toBe('https://example.com/success');
    // The Polar product's own price is charged; no amount is sent.
    expect(params).not.toHaveProperty('prices');
  });

  it('throws CatalogError with the offending SKU when providerRefs.polar.productId is missing', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      items: [
        {
          sku: 'pro-plan',
          name: 'Pro Plan',
          quantity: 1,
          unitAmount: 2900,
          currency: 'usd',
          // No providerRefs at all
        },
      ],
    };

    try {
      mapToPolarCheckoutParams(input);
      expect.fail('Expected CatalogError');
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError);
      expect((error as CatalogError).sku).toBe('pro-plan');
      expect((error as CatalogError).provider).toBe('polar');
      expect((error as CatalogError).message).toContain('productId');
    }
  });

  it('throws CatalogError when providerRefs.polar is present but productId is missing', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      items: [
        {
          sku: 'pro-plan',
          name: 'Pro Plan',
          quantity: 1,
          unitAmount: 2900,
          currency: 'usd',
          providerRefs: { polar: { productId: '' as unknown as string } },
        },
      ],
    };

    expect(() => mapToPolarCheckoutParams(input)).toThrow(CatalogError);
  });

  it('rejects a multi-item cart instead of offering the items as a choice', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      items: [
        {
          sku: 'seat',
          name: 'Seat',
          quantity: 1,
          unitAmount: 500,
          currency: 'usd',
          providerRefs: { polar: { productId: 'polar_prod_seat' } },
        },
        {
          sku: 'pro-plan',
          name: 'Pro Plan',
          quantity: 1,
          unitAmount: 2900,
          currency: 'usd',
          providerRefs: { polar: { productId: 'polar_prod_pro' } },
        },
      ],
    };

    // Polar's `products` is the list a customer picks one from, not a cart.
    expect(() => mapToPolarCheckoutParams(input)).toThrow(/sells one product/);
  });

  it('rejects a quantity above 1 instead of silently charging for one', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      items: [{ ...baseInput.items[0]!, quantity: 3 }],
    };

    expect(() => mapToPolarCheckoutParams(input)).toThrow(CatalogError);
    expect(() => mapToPolarCheckoutParams(input)).toThrow(/quantity 3/);
  });

  it('forwards customerEmail and metadata when provided', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      customerEmail: 'buyer@example.com',
      metadata: { orderId: 'order_123', region: 'us-east' },
    };

    const params = mapToPolarCheckoutParams(input);
    expect(params.customer_email).toBe('buyer@example.com');
    expect(params.metadata).toEqual({ orderId: 'order_123', region: 'us-east' });
  });
});

describe('mapFromPolarCheckout / mapPolarStatus', () => {
  it('normalizes Polar checkout response into CheckoutResult', () => {
    const result = mapFromPolarCheckout({
      id: 'polar_co_abc',
      url: 'https://buy.polar.sh/c/abc',
      status: 'open',
    });

    expect(result).toMatchObject({
      provider: 'polar',
      id: 'polar_co_abc',
      url: 'https://buy.polar.sh/c/abc',
      status: 'open',
    });
  });

  it('maps Polar statuses to the normalized Tenderlane status union', () => {
    expect(mapPolarStatus('open')).toBe('open');
    expect(mapPolarStatus('confirmed')).toBe('complete');
    expect(mapPolarStatus('succeeded')).toBe('complete');
    expect(mapPolarStatus('expired')).toBe('expired');
    expect(mapPolarStatus('failed')).toBe('failed');
    expect(mapPolarStatus(undefined)).toBe('created');
  });
});
