import type {
  CheckoutDetails,
  CheckoutResult,
  ResolvedCatalogItem,
  ResolvedCheckoutInput,
} from '@tenderlane/core';
import { CatalogError } from '@tenderlane/core';
import { CHECKOUT_ID_PLACEHOLDER } from '@tenderlane/core/adapters';
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
  paymentMethods?: readonly string[],
): Stripe.Checkout.SessionCreateParams {
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    // Tenderlane's `{CHECKOUT_ID}` is Stripe's `{CHECKOUT_SESSION_ID}`.
    success_url: input.successUrl.replaceAll(CHECKOUT_ID_PLACEHOLDER, '{CHECKOUT_SESSION_ID}'),
    cancel_url: input.cancelUrl,
    line_items: input.items.map(resolvedItemToStripeLineItem),
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

  // Merge provider-specific Stripe options (escape hatch). These come from the
  // server handler's `providerOptions` config, never from the request body.
  if (input.providerOptions) {
    Object.assign(params, input.providerOptions);
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
    status: mapStripeStatus(session),
    ...(session.url ? { url: session.url } : {}),
  };
}

/**
 * A Checkout Session is `complete` once the customer finishes the page. That
 * is before any money moved for delayed methods (`unpaid`), and without any
 * money at all for a setup or a trial (`no_payment_required`). It counts as
 * a completed payment only when `payment_status` is `paid`.
 */
function mapStripeStatus(session: Stripe.Checkout.Session): CheckoutResult['status'] {
  if (session.status === 'expired') return 'expired';
  if (session.status !== 'complete') return 'open';
  if (session.payment_status === 'paid') return 'complete';
  // `no_payment_required`: a setup or a trial. Nothing is being charged.
  if (session.payment_status !== 'unpaid') return 'open';

  // Finished by the customer, not paid. The session itself never changes
  // again, so only the PaymentIntent can say whether the money is still on
  // its way or the debit has since failed.
  const paymentIntent = session.payment_intent;
  if (paymentIntent && typeof paymentIntent !== 'string') {
    return mapPaymentIntentStatus(paymentIntent);
  }
  return 'processing';
}

/** Stripe payment method types whose Tenderlane id is spelled differently. */
const TENDERLANE_METHOD_BY_STRIPE_TYPE: Readonly<Record<string, string>> = {
  cashapp: 'cash_app',
  us_bank_account: 'ach_debit',
  customer_balance: 'bank_transfer',
};

/**
 * The method attached to the payment, when Stripe returned it expanded. Wallets
 * such as Apple Pay are reported as `card`, which is how Stripe types them.
 */
function usedPaymentMethod(
  paymentIntent: string | Stripe.PaymentIntent | null | undefined,
): { paymentMethod: string } | Record<string, never> {
  // An id instead of an object means the field was not expanded.
  if (!paymentIntent || typeof paymentIntent === 'string') return {};
  const method = paymentIntent.payment_method;
  if (!method || typeof method === 'string') return {};
  return { paymentMethod: TENDERLANE_METHOD_BY_STRIPE_TYPE[method.type] ?? method.type };
}

/** What `retrieve()` reports for a hosted checkout. */
export function mapStripeSessionDetails(session: Stripe.Checkout.Session): CheckoutDetails {
  return {
    provider: 'stripe',
    id: session.id,
    status: mapStripeStatus(session),
    ...(session.amount_total !== null ? { amountTotal: session.amount_total } : {}),
    ...(session.currency ? { currency: session.currency } : {}),
    ...usedPaymentMethod(session.payment_intent),
  };
}

/** What `retrieve()` reports for an inline payment. */
export function mapStripePaymentIntentDetails(paymentIntent: Stripe.PaymentIntent): CheckoutDetails {
  return {
    provider: 'stripe',
    id: paymentIntent.id,
    status: mapPaymentIntentStatus(paymentIntent),
    amountTotal: paymentIntent.amount,
    currency: paymentIntent.currency,
    ...usedPaymentMethod(paymentIntent),
  };
}

/**
 * Map a Tenderlane resolved checkout input into Stripe PaymentIntent create
 * params. Calculates the total amount from server-resolved items only.
 */
export function mapToStripePaymentIntentParams(
  input: ResolvedCheckoutInput,
  paymentMethods?: readonly string[],
): Stripe.PaymentIntentCreateParams {
  const amount = input.items.reduce(
    (total, item) => total + item.unitAmount * item.quantity,
    0,
  );

  const firstItem = input.items[0];
  if (!firstItem) {
    throw new CatalogError('A PaymentIntent needs at least one resolved item.', {
      provider: 'stripe',
    });
  }
  const currency = firstItem.currency;
  const mismatched = input.items.find(
    (item) => item.currency.toLowerCase() !== currency.toLowerCase(),
  );
  if (mismatched) {
    throw new CatalogError(
      `A PaymentIntent has one currency, but SKU '${firstItem.sku}' is ${currency} and SKU '${mismatched.sku}' is ${mismatched.currency}.`,
      { sku: mismatched.sku, provider: 'stripe' },
    );
  }

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

  if (input.providerOptions) {
    Object.assign(params, input.providerOptions);
  }

  return params;
}

/**
 * Map a created Stripe PaymentIntent into a CheckoutResult. The client secret
 * is the one PSP field the browser needs to mount the Payment Element.
 */
export function mapFromStripePaymentIntent(paymentIntent: Stripe.PaymentIntent): CheckoutResult {
  return {
    provider: 'stripe',
    id: paymentIntent.id,
    status: mapPaymentIntentStatus(paymentIntent),
    ...(paymentIntent.client_secret ? { clientSecret: paymentIntent.client_secret } : {}),
  };
}

function mapPaymentIntentStatus(
  paymentIntent: Pick<Stripe.PaymentIntent, 'status' | 'last_payment_error'>,
): CheckoutResult['status'] {
  switch (paymentIntent.status) {
    case 'succeeded':
      return 'complete';
    case 'canceled':
      return 'expired';
    // `requires_capture`: the card is authorised and the customer is done;
    // the merchant has yet to capture.
    case 'processing':
    case 'requires_capture':
      return 'processing';
    // A PaymentIntent returns here after a failed attempt, with the error
    // attached. Without one it is new and nothing was tried yet.
    case 'requires_payment_method':
      return paymentIntent.last_payment_error ? 'failed' : 'open';
    // requires_confirmation, requires_action: waiting on the customer.
    default:
      return 'open';
  }
}
