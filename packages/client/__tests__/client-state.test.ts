import { describe, it, expect, vi } from 'vitest';
import { createTenderlaneClient } from '../src/client.js';
import type {
  BrowserPaymentProvider,
  CheckoutInput,
  CheckoutResult,
  PaymentMethodDescriptor,
  ProviderCapabilities,
  Router,
  SelectedPaymentRoute,
} from '@tenderlane/core';

const input: CheckoutInput = {
  items: [{ sku: 'pro', quantity: 1 }],
  successUrl: '/success',
  cancelUrl: '/cancel',
};

const methods: PaymentMethodDescriptor[] = [
  { id: 'card', label: 'Card', type: 'card', provider: 'mock' },
  { id: 'twint', label: 'TWINT', type: 'wallet', provider: 'mock' },
];

function createProvider(overrides: Partial<BrowserPaymentProvider> = {}): BrowserPaymentProvider {
  return {
    '~types': {} as never,
    id: 'mock',
    capabilities: {
      provider: 'mock',
      flows: ['checkout-session', 'payment-intent'],
      paymentMethods: ['card', 'twint'],
      supports: { redirect: true },
    } as ProviderCapabilities,
    getAvailablePaymentMethods: () => methods,
    createSession: vi.fn(async () => ({
      flow: 'payment-intent' as const,
      clientSecret: 'secret_123',
      sessionId: 'pi_123',
    })),
    submit: vi.fn(
      async (): Promise<CheckoutResult> => ({ provider: 'mock', id: 'pi_123', status: 'complete' }),
    ),
    ...overrides,
  };
}

const route: SelectedPaymentRoute = {
  provider: 'mock',
  flow: 'payment-intent',
  paymentMethods: [],
  source: 'rule',
};
const router: Router = { evaluate: () => route };

function createClient(provider: BrowserPaymentProvider, middleware = {}) {
  return createTenderlaneClient({
    context: { country: 'CH' },
    providers: [provider],
    routing: router,
    middleware: [{ name: 'test', ...middleware }],
  });
}

describe('retry after a failed submit', () => {
  it('lets the customer submit again after a decline', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('card_declined'))
      .mockResolvedValueOnce({ provider: 'mock', id: 'pi_123', status: 'complete' });
    const client = createClient(createProvider({ submit }));
    await client.prepare(input);

    await expect(client.submit(input)).rejects.toThrow('card_declined');
    const afterDecline = client.getSnapshot();
    expect(afterDecline.status).toBe('error');
    expect(afterDecline.canSubmit).toBe(true);
    // The session is kept so the payment element stays mounted.
    expect(afterDecline.providerSession).not.toBeNull();

    await client.submit(input);
    expect(client.getSnapshot().status).toBe('success');
    expect(client.getSnapshot().error).toBeNull();
  });

  it('reset() leaves the client usable instead of stranded in idle', async () => {
    const client = createClient(
      createProvider({ submit: vi.fn().mockRejectedValue(new Error('declined')) }),
    );
    await client.submit(input).catch(() => undefined);

    client.reset();

    expect(client.getSnapshot().status).toBe('ready');
    expect(client.getSnapshot().error).toBeNull();
    expect(client.getSnapshot().canSubmit).toBe(true);
  });

  it('does not allow a retry when routing itself failed', async () => {
    const failingRouter: Router = {
      evaluate: () => {
        throw new Error('no route');
      },
    };
    const client = createTenderlaneClient({
      context: {},
      providers: [createProvider()],
      routing: failingRouter,
    });

    expect(client.getSnapshot().status).toBe('error');
    expect(client.getSnapshot().canSubmit).toBe(false);
    await expect(client.submit(input)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('one submit at a time', () => {
  it('rejects a second submit, even after updateContext() during the first', async () => {
    let release!: (result: CheckoutResult) => void;
    const submit = vi.fn(
      () =>
        new Promise<CheckoutResult>((resolve) => {
          release = resolve;
        }),
    );
    const client = createClient(createProvider({ submit }));

    const first = client.submit(input);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    // A context change mid-submit re-evaluates the route and moves status to `ready`.
    client.updateContext({ country: 'DE' });
    await expect(client.submit(input)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(client.prepare(input)).rejects.toMatchObject({ code: 'INVALID_STATE' });

    release({ provider: 'mock', id: 'pi_123', status: 'complete' });
    await first;
    expect(submit).toHaveBeenCalledTimes(1);
    expect(client.getSnapshot().status).toBe('success');
  });
});

describe('what counts as success', () => {
  it('reports a created hosted checkout as redirecting, not success', async () => {
    const onCheckoutSuccess = vi.fn();
    const onCheckoutPending = vi.fn();
    const provider = createProvider({
      submit: vi.fn(async () => ({
        provider: 'mock',
        id: 'cs_123',
        status: 'open' as const,
        url: 'https://checkout.example/cs_123',
      })),
    });
    const client = createClient(provider, { onCheckoutSuccess, onCheckoutPending });

    await client.submit(input);

    expect(client.getSnapshot().status).toBe('redirecting');
    expect(client.getSnapshot().canSubmit).toBe(false);
    expect(onCheckoutSuccess).not.toHaveBeenCalled();
    expect(onCheckoutPending).toHaveBeenCalledTimes(1);
  });

  it('reports an inline payment that is still processing as pending', async () => {
    const onCheckoutSuccess = vi.fn();
    const provider = createProvider({
      submit: vi.fn(async () => ({ provider: 'mock', id: 'pi_123', status: 'open' as const })),
    });
    const client = createClient(provider, { onCheckoutSuccess });

    await client.submit(input);

    expect(client.getSnapshot().status).toBe('pending');
    expect(onCheckoutSuccess).not.toHaveBeenCalled();
  });

  it('reports success only for a completed payment', async () => {
    const onCheckoutSuccess = vi.fn();
    const client = createClient(createProvider(), { onCheckoutSuccess });

    await client.submit(input);

    expect(client.getSnapshot().status).toBe('success');
    expect(onCheckoutSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('context changes', () => {
  it('ignores a structurally equal context: session and selection survive', async () => {
    const onContextChange = vi.fn();
    const client = createClient(createProvider(), { onContextChange });
    client.selectPaymentMethod('twint');
    await client.prepare(input);
    const before = client.getSnapshot();

    client.updateContext({ country: 'CH' });

    expect(client.getSnapshot()).toBe(before);
    expect(onContextChange).not.toHaveBeenCalled();
  });

  it('compares nested context values structurally', async () => {
    const client = createTenderlaneClient({
      context: { country: 'CH', experiment: { variant: 'a' } } as never,
      providers: [createProvider()],
      routing: router,
    });
    const before = client.getSnapshot();

    client.updateContext({ country: 'CH', experiment: { variant: 'a' } } as never);
    expect(client.getSnapshot()).toBe(before);

    client.updateContext({ country: 'CH', experiment: { variant: 'b' } } as never);
    expect(client.getSnapshot()).not.toBe(before);
  });

  it('keeps the selected payment method across a real context change when still offered', () => {
    const client = createClient(createProvider());
    client.selectPaymentMethod('twint');

    client.updateContext({ country: 'DE' });

    expect(client.getSnapshot().selectedPaymentMethod).toBe('twint');
    // The session priced for the old context is dropped.
    expect(client.getSnapshot().providerSession).toBeNull();
  });

  it('discards a session that resolves after the context changed', async () => {
    let release!: () => void;
    const createSession = vi.fn(
      () =>
        new Promise<{ flow: 'payment-intent'; clientSecret: string; sessionId: string }>(
          (resolve) => {
            release = () =>
              resolve({ flow: 'payment-intent', clientSecret: 'stale', sessionId: 'pi_stale' });
          },
        ),
    );
    const client = createClient(createProvider({ createSession }));

    const preparing = client.prepare(input);
    client.updateContext({ country: 'DE' });
    release();
    await preparing;

    expect(client.getSnapshot().providerSession).toBeNull();
    expect(client.getSnapshot().status).toBe('ready');
  });
});
