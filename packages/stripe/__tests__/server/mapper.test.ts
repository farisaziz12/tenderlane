import { describe, it, expect } from 'vitest';
import { mapToStripeSessionParams } from '../../src/server/mapper.js';
import type { CheckoutInput } from '@tenderlane/core';

describe('mapToStripeSessionParams', () => {
  const baseInput: CheckoutInput = {
    lineItems: [
      {
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

  it('maps basic checkout input', () => {
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

  it('maps multiple line items', () => {
    const input: CheckoutInput = {
      ...baseInput,
      lineItems: [
        { name: 'Item 1', quantity: 2, unitAmount: 1000, currency: 'usd' },
        { name: 'Item 2', quantity: 1, unitAmount: 500, currency: 'usd' },
      ],
    };

    const params = mapToStripeSessionParams(input);
    expect(params.line_items).toHaveLength(2);
    expect(params.line_items![0]!.quantity).toBe(2);
    expect(params.line_items![1]!.quantity).toBe(1);
  });

  it('maps customer email', () => {
    const input: CheckoutInput = {
      ...baseInput,
      customerEmail: 'test@example.com',
    };

    const params = mapToStripeSessionParams(input);
    expect(params.customer_email).toBe('test@example.com');
  });

  it('maps metadata', () => {
    const input: CheckoutInput = {
      ...baseInput,
      metadata: { orderId: 'order_123', source: 'checkout' },
    };

    const params = mapToStripeSessionParams(input);
    expect(params.metadata).toEqual({ orderId: 'order_123', source: 'checkout' });
  });

  it('maps client reference ID', () => {
    const input: CheckoutInput = {
      ...baseInput,
      clientReferenceId: 'ref_abc',
    };

    const params = mapToStripeSessionParams(input);
    expect(params.client_reference_id).toBe('ref_abc');
  });

  it('omits description when not provided', () => {
    const input: CheckoutInput = {
      lineItems: [{ name: 'Simple Item', quantity: 1, unitAmount: 500 }],
      successUrl: '/success',
      cancelUrl: '/cancel',
    };

    const params = mapToStripeSessionParams(input);
    const productData = params.line_items![0]!.price_data!.product_data;
    expect(productData).not.toHaveProperty('description');
  });

  it('merges providerOptions into params', () => {
    const input: CheckoutInput = {
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
