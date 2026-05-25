import type {
  CheckoutResult,
  ResolvedCatalogItem,
  ResolvedCheckoutInput,
} from '@tenderlane/core';
import type Stripe from 'stripe';

/**
 * Map Tenderlane payment method IDs to Stripe payment_method_types.
 * Some IDs map 1:1, others need translation.
 */
const STRIPE_METHOD_TYPE_MAP: Record<string, string> = {
  card: 'card',
  paypal: 'paypal',
  link: 'link',
  sepa_debit: 'sepa_debit',
  ideal: 'ideal',
  bancontact: 'bancontact',
  giropay: 'giropay',
  sofort: 'sofort',
  eps: 'eps',
  p24: 'p24',
  twint: 'twint',
  klarna: 'klarna',
  afterpay_clearpay: 'afterpay_clearpay',
  affirm: 'affirm',
  alipay: 'alipay',
  wechat_pay: 'wechat_pay',
  cash_app: 'cashapp',
  apple_pay: 'card', // Apple Pay is handled via card with wallet detection
  google_pay: 'card', // Google Pay is handled via card with wallet detection
};

/**
 * Translate a resolved catalog item into a Stripe Checkout Session line item.
 *
 * Preference order, per the price-integrity contract:
 * 1. If `providerRefs.stripe.priceId` is present, emit `{ price: priceId, quantity }`
 *    (uses a pre-created Stripe Price object — the canonical source of truth).
 * 2. Otherwise, fall back to inline `price_data` from the server-resolved
 *    `unitAmount` / `currency` / `name` (the values the server's catalog
 *    produced, never anything the client supplied).
 */
function resolvedItemToStripeLineItem(
  item: ResolvedCatalogItem,
): Stripe.Checkout.SessionCreateParams.LineItem {
  const stripeRef = item.providerRefs?.stripe;
  if (stripeRef?.priceId) {
    return { price: stripeRef.priceId, quantity: item.quantity };
  }
  return {
    quantity: item.quantity,
    price_data: {
      currency: item.currency,
      unit_amount: item.unitAmount,
      product_data: {
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
      },
    },
  };
}

/**
 * Map a Tenderlane resolved checkout input into Stripe Checkout Session create
 * params. When `paymentMethods` are provided from the routing rule, they are
 * mapped to Stripe's `payment_method_types` to restrict the Checkout page.
 */
export function mapToStripeSessionParams(
  input: ResolvedCheckoutInput,
  paymentMethods?: string[],
): Stripe.Checkout.SessionCreateParams {
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: input.items.map(resolvedItemToStripeLineItem),
  };

  if (paymentMethods && paymentMethods.length > 0) {
    const stripeTypes = [
      ...new Set(
        paymentMethods
          .map((m) => STRIPE_METHOD_TYPE_MAP[m])
          .filter((t): t is string => t != null),
      ),
    ];
    if (stripeTypes.length > 0) {
      params.payment_method_types = stripeTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
    }
  }

  if (input.customerEmail) {
    params.customer_email = input.customerEmail;
  }

  if (input.clientReferenceId) {
    params.client_reference_id = input.clientReferenceId;
  }

  if (input.metadata) {
    params.metadata = input.metadata;
  }

  // Merge provider-specific Stripe options (escape hatch)
  if (input.providerOptions && typeof input.providerOptions === 'object') {
    const stripeOptions = input.providerOptions as Record<string, unknown>;
    Object.assign(params, stripeOptions);
  }

  return params;
}

/**
 * Map a Stripe Checkout Session into a normalized CheckoutResult.
 */
export function mapFromStripeSession(session: Stripe.Checkout.Session): CheckoutResult {
  return {
    provider: 'stripe',
    id: session.id,
    status: mapStripeStatus(session.status),
    url: session.url ?? undefined,
    raw: session,
  };
}

function mapStripeStatus(
  status: Stripe.Checkout.Session.Status | null,
): CheckoutResult['status'] {
  switch (status) {
    case 'open':
      return 'open';
    case 'complete':
      return 'complete';
    case 'expired':
      return 'expired';
    default:
      return 'created';
  }
}

/**
 * Map a Tenderlane resolved checkout input into Stripe PaymentIntent create
 * params. Calculates the total amount from server-resolved items only.
 */
export function mapToStripePaymentIntentParams(
  input: ResolvedCheckoutInput,
  paymentMethods?: string[],
): Stripe.PaymentIntentCreateParams {
  const amount = input.items.reduce(
    (total, item) => total + item.unitAmount * item.quantity,
    0,
  );

  const currency = input.items[0]?.currency ?? 'usd';

  const params: Stripe.PaymentIntentCreateParams = {
    amount,
    currency,
    automatic_payment_methods: { enabled: true },
  };

  if (paymentMethods && paymentMethods.length > 0) {
    const stripeTypes = [
      ...new Set(
        paymentMethods
          .map((method) => STRIPE_METHOD_TYPE_MAP[method])
          .filter((type): type is string => type != null),
      ),
    ];
    if (stripeTypes.length > 0) {
      delete params.automatic_payment_methods;
      params.payment_method_types = stripeTypes;
    }
  }

  if (input.customerEmail) {
    params.receipt_email = input.customerEmail;
  }

  if (input.metadata) {
    params.metadata = input.metadata;
  }

  if (input.providerOptions && typeof input.providerOptions === 'object') {
    const stripeOptions = input.providerOptions as Record<string, unknown>;
    Object.assign(params, stripeOptions);
  }

  return params;
}

/**
 * Map a Stripe PaymentIntent into a normalized CheckoutResult.
 * Includes clientSecret in raw for the browser provider to extract.
 */
export function mapFromStripePaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): CheckoutResult {
  return {
    provider: 'stripe',
    id: paymentIntent.id,
    status: mapPaymentIntentStatus(paymentIntent.status),
    raw: { clientSecret: paymentIntent.client_secret },
  };
}

function mapPaymentIntentStatus(
  status: Stripe.PaymentIntent.Status,
): CheckoutResult['status'] {
  switch (status) {
    case 'succeeded':
      return 'complete';
    case 'canceled':
      return 'expired';
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'processing':
      return 'open';
    default:
      return 'created';
  }
}
