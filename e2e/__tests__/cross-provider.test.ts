/**
 * One checkout, three providers, no keys and no network.
 *
 * Everything between the app and the PSP is real: the headless client, the
 * rules router, the browser providers, the wire format, the server handler,
 * the catalog and the server adapters. Only the PSP SDKs are replaced, and
 * `fetch` is wired straight to the handler.
 *
 * `acme` is a third-party adapter written against `@tenderlane/core/adapters`
 * alone, to keep that entry point sufficient for a community package.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTenderlaneClient } from '@tenderlane/client';
import { createInlineCatalog, createRulesRouter } from '@tenderlane/core';
import {
  defineBrowserProvider,
  defineServerAdapter,
  requestProviderAction,
} from '@tenderlane/core/adapters';
import { createTenderlaneHandler } from '@tenderlane/core/server';
import { polarProvider } from '@tenderlane/polar';
import { polarServerAdapter } from '@tenderlane/polar/server';
import { stripeProvider } from '@tenderlane/stripe';
import { stripeServerAdapter } from '@tenderlane/stripe/server';

const psp = vi.hoisted(() => ({
  stripeSessions: vi.fn(),
  polarCheckouts: vi.fn(),
  acmeSessions: vi.fn(),
}));

vi.mock('stripe', () => {
  class StripeError extends Error {}
  class Stripe {
    static errors = { StripeError };
    checkout = { sessions: { create: psp.stripeSessions } };
    paymentIntents = { create: vi.fn() };
  }
  return { default: Stripe };
});

vi.mock('@polar-sh/sdk', () => ({
  Polar: class {
    checkouts = { create: psp.polarCheckouts };
  },
}));

const ENDPOINT = 'https://shop.example/api/payments';

// ---- A community adapter, from the public entry point only -----------------

const ACME_CAPABILITIES = {
  provider: 'acme',
  flows: ['checkout-session'],
  paymentMethods: ['card'],
  supports: { redirect: true },
} as const;

function acmeProvider(options: { serverEndpoint: string }) {
  return defineBrowserProvider({
    id: 'acme',
    capabilities: ACME_CAPABILITIES,
    getAvailablePaymentMethods: () => [
      { id: 'card', label: 'Card', type: 'card' as const, provider: 'acme' },
    ],
    submit: (input, route) =>
      requestProviderAction({
        endpoint: options.serverEndpoint,
        provider: 'acme',
        action: 'checkout',
        input,
        route,
      }),
  });
}

function acmeServerAdapter() {
  return defineServerAdapter({
    id: 'acme',
    actions: ['checkout'],
    async handle(_action, payload) {
      const total = payload.items.reduce(
        (sum, item) => sum + item.unitAmount * item.quantity,
        0,
      );
      const session = await psp.acmeSessions({ total, currency: payload.items[0]?.currency });
      return { provider: 'acme', id: session.id, status: 'open', url: session.url };
    },
  });
}

// ---- The app ----------------------------------------------------------------

const routing = createRulesRouter({
  rules: [
    {
      id: 'ch-stripe',
      when: { country: 'CH' },
      use: { provider: 'stripe', flow: 'checkout-session', paymentMethods: ['card', 'twint'] },
    },
    {
      id: 'us-polar',
      when: { country: 'US' },
      use: { provider: 'polar', flow: 'checkout-session' },
    },
  ],
  fallback: { provider: 'acme', flow: 'checkout-session' },
});

const catalog = createInlineCatalog({
  'pro-plan': {
    name: 'Pro Plan',
    pricing: (context) => ({ amount: context.country === 'CH' ? 2900 : 2500, currency: 'usd' }),
    providerRefs: { polar: { productId: 'polar_prod_pro' } },
  },
});

/** The country the "edge" reports for the current request. */
let geoCountry = 'CH';

const handler = createTenderlaneHandler({
  providers: [
    stripeServerAdapter({ secretKey: 'sk_test_x' }),
    polarServerAdapter({ accessToken: 'polar_oat_x', organizationId: 'org_x' }),
    acmeServerAdapter(),
  ],
  catalog,
  routing,
  resolveContext: (request) => ({ country: request.headers.get('x-geo-country') as 'CH' }),
  allowedRedirectOrigins: ['https://shop.example'],
});

function createClient(country: string) {
  return createTenderlaneClient({
    context: { country: country as 'CH' },
    providers: [
      stripeProvider({ publishableKey: 'pk_test_x', serverEndpoint: ENDPOINT }),
      polarProvider({ organizationId: 'org_x', serverEndpoint: ENDPOINT }),
      acmeProvider({ serverEndpoint: ENDPOINT }),
    ],
    routing,
  });
}

const input = {
  items: [{ sku: 'pro-plan', quantity: 1 }],
  successUrl: 'https://shop.example/success',
  cancelUrl: 'https://shop.example/cancel',
};

beforeEach(() => {
  vi.clearAllMocks();
  geoCountry = 'CH';
  psp.stripeSessions.mockResolvedValue({
    id: 'cs_test_1',
    status: 'open',
    url: 'https://checkout.stripe.example/cs_test_1',
  });
  psp.polarCheckouts.mockResolvedValue({
    id: 'polar_co_1',
    status: 'open',
    url: 'https://buy.polar.example/polar_co_1',
  });
  psp.acmeSessions.mockResolvedValue({ id: 'acme_1', url: 'https://pay.acme.example/acme_1' });

  // The browser's fetch, delivered to the handler with the edge's geo header.
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) =>
      handler.POST(
        new Request(url, { ...init, headers: { ...init.headers, 'x-geo-country': geoCountry } }),
      ),
    ),
  );
});

describe('the same checkout through each provider', () => {
  it('CH routes to Stripe, priced by the server, restricted to the route methods', async () => {
    const client = createClient('CH');
    expect(client.getSnapshot().selectedProvider).toBe('stripe');

    const result = await client.submit(input);

    expect(result).toMatchObject({ provider: 'stripe', id: 'cs_test_1' });
    expect(client.getSnapshot().status).toBe('redirecting');
    const parameters = psp.stripeSessions.mock.calls[0]![0];
    expect(parameters.line_items).toEqual([
      {
        quantity: 1,
        price_data: { currency: 'usd', unit_amount: 2900, product_data: { name: 'Pro Plan' } },
      },
    ]);
    expect(parameters.payment_method_types).toEqual(['card', 'twint']);
    expect(psp.polarCheckouts).not.toHaveBeenCalled();
  });

  it('US routes to Polar with the product reference', async () => {
    geoCountry = 'US';
    const client = createClient('US');
    expect(client.getSnapshot().selectedProvider).toBe('polar');

    const result = await client.submit(input);

    expect(result).toMatchObject({ provider: 'polar', id: 'polar_co_1' });
    expect(psp.polarCheckouts.mock.calls[0]![0]).toEqual({
      products: ['polar_prod_pro'],
      success_url: 'https://shop.example/success',
    });
    expect(psp.stripeSessions).not.toHaveBeenCalled();
  });

  it('anywhere else falls back to the community adapter', async () => {
    geoCountry = 'BR';
    const client = createClient('BR');
    expect(client.getSnapshot().selectedProvider).toBe('acme');

    const result = await client.submit(input);

    expect(result).toMatchObject({ provider: 'acme', id: 'acme_1' });
    expect(psp.acmeSessions).toHaveBeenCalledWith({ total: 2500, currency: 'usd' });
  });

  it('changing the context re-routes the next checkout', async () => {
    const client = createClient('CH');
    geoCountry = 'US';
    client.updateContext({ country: 'US' });

    await client.submit(input);

    expect(psp.polarCheckouts).toHaveBeenCalledTimes(1);
    expect(psp.stripeSessions).not.toHaveBeenCalled();
  });
});

describe('a tampering browser', () => {
  it('cannot pick a provider the server would not route to', async () => {
    // The browser claims US (cheaper, Polar); the edge says CH.
    const client = createClient('US');

    await expect(client.submit(input)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });

    expect(psp.polarCheckouts).not.toHaveBeenCalled();
    expect(psp.stripeSessions).not.toHaveBeenCalled();
    expect(client.getSnapshot().status).toBe('error');
  });

  it('cannot lower the price with a forged context, unitAmount or providerOptions', async () => {
    const client = createClient('CH');

    await client.submit({
      ...input,
      items: [{ sku: 'pro-plan', quantity: 1, unitAmount: 1 } as never],
      context: { country: 'US' },
      providerOptions: { line_items: [{ quantity: 1, price: 'price_free' }] },
    });

    const parameters = psp.stripeSessions.mock.calls[0]![0];
    expect(parameters.line_items[0].price_data.unit_amount).toBe(2900);
    expect(parameters.line_items).toHaveLength(1);
  });

  it('cannot redirect the customer to another origin after payment', async () => {
    const client = createClient('CH');

    await expect(
      client.submit({ ...input, successUrl: 'https://evil.example/thanks' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });

    expect(psp.stripeSessions).not.toHaveBeenCalled();
  });
});

describe('a provider that cannot represent the cart', () => {
  it('Polar rejects quantity 2 instead of charging for one', async () => {
    geoCountry = 'US';
    const client = createClient('US');

    await expect(
      client.submit({ ...input, items: [{ sku: 'pro-plan', quantity: 2 }] }),
    ).rejects.toThrow(/no quantity/);

    expect(psp.polarCheckouts).not.toHaveBeenCalled();
  });
});
