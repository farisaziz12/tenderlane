import { describe, it, expect } from 'vitest';
import { mapToStripeSessionParams } from '../../src/server/mapper.js';
import type { ResolvedCheckoutInput } from '@tenderlane/core';

const baseInput: ResolvedCheckoutInput = {
  items: [
    {
      sku: 'pro-plan',
      name: 'Premium Plan',
      description: 'Monthly subscription',
      quantity: 1,
      unitAmount: 2900,
      currency: 'usd',
    },
  ],
  successUrl: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://example.com/cancel',
};

describe('mapToStripeSessionParams (resolved items)', () => {
  it('maps basic resolved item to inline price_data when no providerRefs are present', () => {
    const params = mapToStripeSessionParams(baseInput);

    expect(params.mode).toBe('payment');
    expect(params.success_url).toBe(baseInput.successUrl);
    expect(params.cancel_url).toBe(baseInput.cancelUrl);
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items![0]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: 2900,
        product_data: {
          name: 'Premium Plan',
          description: 'Monthly subscription',
        },
      },
    });
  });

  it('prefers providerRefs.stripe.priceId over inline pricing', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      items: [
        {
          sku: 'pro-plan',
          name: 'Premium Plan',
          quantity: 2,
          unitAmount: 2900,
          currency: 'usd',
          providerRefs: { stripe: { priceId: 'price_pro_monthly_xyz' } },
        },
      ],
    };

    const params = mapToStripeSessionParams(input);

    expect(params.line_items).toHaveLength(1);
    expect(params.line_items![0]).toEqual({
      price: 'price_pro_monthly_xyz',
      quantity: 2,
    });
    expect(params.line_items![0]).not.toHaveProperty('price_data');
  });

  it('falls back to inline price_data when only non-Stripe providerRefs are present', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      items: [
        {
          sku: 'pro-plan',
          name: 'Premium Plan',
          quantity: 1,
          unitAmount: 2900,
          currency: 'usd',
          providerRefs: { polar: { productId: 'polar_prod_abc' } },
        },
      ],
    };

    const params = mapToStripeSessionParams(input);
    expect(params.line_items![0]).toMatchObject({
      price_data: { currency: 'usd', unit_amount: 2900 },
    });
  });

  it('mixes priceId items and inline items in the same session', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      items: [
        {
          sku: 'pro-plan',
          name: 'Premium Plan',
          quantity: 1,
          unitAmount: 2900,
          currency: 'usd',
          providerRefs: { stripe: { priceId: 'price_xyz' } },
        },
        {
          sku: 'addon',
          name: 'Add-on',
          quantity: 2,
          unitAmount: 500,
          currency: 'usd',
        },
      ],
    };

    const params = mapToStripeSessionParams(input);
    expect(params.line_items).toHaveLength(2);
    expect(params.line_items![0]).toEqual({ price: 'price_xyz', quantity: 1 });
    expect(params.line_items![1]).toMatchObject({
      quantity: 2,
      price_data: { unit_amount: 500 },
    });
  });

  it('maps multiple line items', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      items: [
        { sku: 'a', name: 'Item 1', quantity: 2, unitAmount: 1000, currency: 'usd' },
        { sku: 'b', name: 'Item 2', quantity: 1, unitAmount: 500, currency: 'usd' },
      ],
    };

    const params = mapToStripeSessionParams(input);
    expect(params.line_items).toHaveLength(2);
    expect(params.line_items![0]!.quantity).toBe(2);
    expect(params.line_items![1]!.quantity).toBe(1);
  });

  it('maps customer email', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      customerEmail: 'test@example.com',
    };

    const params = mapToStripeSessionParams(input);
    expect(params.customer_email).toBe('test@example.com');
  });

  it('maps metadata', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      metadata: { orderId: 'order_123', source: 'checkout' },
    };

    const params = mapToStripeSessionParams(input);
    expect(params.metadata).toEqual({ orderId: 'order_123', source: 'checkout' });
  });

  it('maps client reference ID', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      clientReferenceId: 'ref_abc',
    };

    const params = mapToStripeSessionParams(input);
    expect(params.client_reference_id).toBe('ref_abc');
  });

  it('omits description when not provided on the resolved item', () => {
    const input: ResolvedCheckoutInput = {
      items: [
        { sku: 'a', name: 'Simple Item', quantity: 1, unitAmount: 500, currency: 'usd' },
      ],
      successUrl: '/success',
      cancelUrl: '/cancel',
    };

    const params = mapToStripeSessionParams(input);
    const productData = params.line_items![0]!.price_data!.product_data;
    expect(productData).not.toHaveProperty('description');
  });

  it('merges providerOptions into params', () => {
    const input: ResolvedCheckoutInput = {
      ...baseInput,
      providerOptions: {
        payment_method_types: ['card', 'ideal'],
        allow_promotion_codes: true,
      },
    };

    const params = mapToStripeSessionParams(input);
    expect((params as any).payment_method_types).toEqual(['card', 'ideal']);
    expect((params as any).allow_promotion_codes).toBe(true);
  });

  it('maps paymentMethods to payment_method_types', () => {
    const params = mapToStripeSessionParams(baseInput, ['card', 'twint']);
    expect(params.payment_method_types).toEqual(['card', 'twint']);
  });

  it('deduplicates payment_method_types (apple_pay + google_pay → card)', () => {
    const params = mapToStripeSessionParams(baseInput, ['card', 'apple_pay', 'google_pay']);
    expect(params.payment_method_types).toEqual(['card']);
  });

  it('omits payment_method_types when no paymentMethods provided', () => {
    const params = mapToStripeSessionParams(baseInput);
    expect(params.payment_method_types).toBeUndefined();
  });

  it('maps cash_app to Stripe cashapp type', () => {
    const params = mapToStripeSessionParams(baseInput, ['cash_app']);
    expect(params.payment_method_types).toEqual(['cashapp']);
  });
});
