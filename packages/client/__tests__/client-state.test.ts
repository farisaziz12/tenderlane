import { describe, it, expect, vi } from 'vitest';
import { createTenderlaneClient } from '../src/client.js';
import type {
  BrowserPaymentProvider,
  CheckoutInput,
  CheckoutResult,
  PaymentMethodDescriptor,
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
    capabilities: { flows: ['hosted', 'inline'], paymentMethods: ['card', 'twint'] },
    getAvailablePaymentMethods: () => methods,
    createSession: vi.fn(async () => ({
      flow: 'inline' as const,
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
  flow: 'inline',
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
    await client.prepare(input);
    await client.submit(input).catch(() => undefined);

    client.reset();

    expect(client.getSnapshot().status).toBe('ready');
    expect(client.getSnapshot().error).toBeNull();
    // An inline route is submittable only once its session exists.
    expect(client.getSnapshot().canSubmit).toBe(false);
    await client.prepare(input);
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
    await client.prepare(input);

    const first = client.submit(input);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    // A context change mid-submit is recorded but not evaluated until the
    // submit settles: the session (and a mounted payment element) stays.
    client.updateContext({ country: 'DE' });
    expect(client.getSnapshot().status).toBe('submitting');
    expect(client.getSnapshot().providerSession).not.toBeNull();
    await expect(client.submit(input)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(client.prepare(input)).rejects.toMatchObject({ code: 'INVALID_STATE' });

    release({ provider: 'mock', id: 'pi_123', status: 'complete' });
    await first;
    expect(submit).toHaveBeenCalledTimes(1);
    // The completed payment is not overwritten by a late re-evaluation.
    expect(client.getSnapshot().status).toBe('success');
    expect(client.getSnapshot().canSubmit).toBe(false);
    expect(client.getSnapshot().context).toEqual({ country: 'DE' });
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
    await client.prepare(input);

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
    await client.prepare(input);

    await client.submit(input);

    expect(client.getSnapshot().status).toBe('pending');
    expect(onCheckoutSuccess).not.toHaveBeenCalled();
  });

  it('reports success only for a completed payment', async () => {
    const onCheckoutSuccess = vi.fn();
    const client = createClient(createProvider(), { onCheckoutSuccess });
    await client.prepare(input);

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
        new Promise<{ flow: 'inline'; clientSecret: string; sessionId: string }>(
          (resolve) => {
            release = () =>
              resolve({ flow: 'inline', clientSecret: 'stale', sessionId: 'pi_stale' });
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

describe('races found in review', () => {
  function deferredSubmit() {
    let release!: (result: CheckoutResult) => void;
    let fail!: (error: Error) => void;
    const submit = vi.fn(
      () =>
        new Promise<CheckoutResult>((resolve, reject) => {
          release = resolve;
          fail = reject;
        }),
    );
    return { submit, release: (result: CheckoutResult) => release(result), fail: (error: Error) => fail(error) };
  }

  it('a failed re-prepare does not leave the previous session payable', async () => {
    const createSession = vi
      .fn()
      .mockResolvedValueOnce({ flow: 'inline', clientSecret: 'old', sessionId: 'pi_old' })
      .mockRejectedValueOnce(new Error('503'));
    const provider = createProvider({ createSession });
    const client = createClient(provider);
    await client.prepare(input);

    // The cart changed, so the form prepares again, and that fails.
    await client.prepare({ ...input, items: [{ sku: 'pro', quantity: 2 }] });

    expect(client.getSnapshot().status).toBe('error');
    expect(client.getSnapshot().providerSession).toBeNull();
    expect(client.getSnapshot().canSubmit).toBe(false);
    await expect(client.submit(input)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(provider.submit).not.toHaveBeenCalled();
    // The rejected submit did not make the button look usable.
    expect(client.getSnapshot().canSubmit).toBe(false);
  });

  it('a failed prepare can be retried', async () => {
    const createSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ flow: 'inline', clientSecret: 'ok', sessionId: 'pi_ok' });
    const client = createClient(createProvider({ createSession }));

    await client.prepare(input);
    expect(client.getSnapshot().status).toBe('error');
    await client.prepare(input);

    expect(client.getSnapshot().status).toBe('prepared');
    expect(client.getSnapshot().canSubmit).toBe(true);
  });

  it('an async router resolving after a completed submit does not reopen the checkout', async () => {
    let resolveRoute!: (value: SelectedPaymentRoute) => void;
    let calls = 0;
    const asyncRouter: Router = {
      evaluate: () => {
        calls += 1;
        return calls === 1
          ? route
          : new Promise<SelectedPaymentRoute>((resolve) => {
              resolveRoute = resolve;
            });
      },
    };
    const { submit, release } = deferredSubmit();
    const client = createTenderlaneClient({
      context: { country: 'CH' },
      providers: [createProvider({ submit })],
      routing: asyncRouter,
    });
    await client.prepare(input);

    const first = client.submit(input);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    client.updateContext({ country: 'DE' });
    release({ provider: 'mock', id: 'pi_123', status: 'complete' });
    await first;
    resolveRoute?.(route);
    await Promise.resolve();

    expect(calls).toBe(1);
    expect(client.getSnapshot().status).toBe('success');
    expect(client.getSnapshot().canSubmit).toBe(false);
  });

  it('a context change during a submit that then fails is evaluated afterwards', async () => {
    const evaluate = vi.fn(() => route);
    const { submit, fail } = deferredSubmit();
    const client = createTenderlaneClient({
      context: { country: 'CH' },
      providers: [createProvider({ submit })],
      routing: { evaluate },
    });
    await client.prepare(input);

    const first = client.submit(input);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    client.updateContext({ country: 'DE' });
    expect(evaluate).toHaveBeenCalledTimes(1);
    fail(new Error('declined'));
    await expect(first).rejects.toThrow('declined');

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(evaluate).toHaveBeenLastCalledWith({ country: 'DE' });
    expect(client.getSnapshot().status).toBe('ready');
  });

  it('reset() during a submit waits for it, then resets', async () => {
    const { submit, release } = deferredSubmit();
    const client = createClient(createProvider({ submit }));
    await client.prepare(input);

    const first = client.submit(input);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    client.reset();
    expect(client.getSnapshot().status).toBe('submitting');
    release({ provider: 'mock', id: 'pi_123', status: 'complete' });
    await first;

    expect(client.getSnapshot().status).toBe('ready');
    expect(client.getSnapshot().checkoutResult).toBeNull();
  });

  it.each(['failed', 'expired'] as const)('treats a %s result as an error', async (status) => {
    const provider = createProvider({
      submit: vi.fn(async () => ({ provider: 'mock', id: 'x', status, url: 'https://x.example' })),
    });
    const client = createClient(provider);
    await client.prepare(input);

    await expect(client.submit(input)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(client.getSnapshot().status).toBe('error');
  });

  it('canSubmit is false while evaluating and preparing', async () => {
    let resolveRoute!: (value: SelectedPaymentRoute) => void;
    const asyncRouter: Router = {
      evaluate: () =>
        new Promise<SelectedPaymentRoute>((resolve) => {
          resolveRoute = resolve;
        }),
    };
    let releaseSession!: () => void;
    const createSession = vi.fn(
      () =>
        new Promise<{ flow: 'inline'; clientSecret: string }>((resolve) => {
          releaseSession = () => resolve({ flow: 'inline', clientSecret: 'secret' });
        }),
    );
    const client = createTenderlaneClient({
      context: {},
      providers: [createProvider({ createSession })],
      routing: asyncRouter,
    });

    expect(client.getSnapshot().status).toBe('evaluating');
    expect(client.getSnapshot().canSubmit).toBe(false);
    resolveRoute(route);
    await vi.waitFor(() => expect(client.getSnapshot().status).toBe('ready'));

    const preparing = client.prepare(input);
    expect(client.getSnapshot().status).toBe('preparing');
    expect(client.getSnapshot().canSubmit).toBe(false);
    releaseSession();
    await preparing;
    expect(client.getSnapshot().canSubmit).toBe(true);
  });
});

describe('review regressions', () => {
  it('reports a route whose flow the provider does not support, instead of a dead checkout', () => {
    const hostedOnly = createProvider({
      capabilities: { flows: ['hosted'], paymentMethods: ['card'] },
      createSession: undefined,
    });
    const client = createTenderlaneClient({
      context: {},
      providers: [hostedOnly],
      routing: {
        evaluate: () => ({ provider: 'mock', flow: 'inline', paymentMethods: [], source: 'fallback' }),
      },
    });

    const state = client.getSnapshot();
    expect(state.status).toBe('error');
    expect(state.error?.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(state.canSubmit).toBe(false);
  });

  it('keeps a settled checkout settled when the context changes', async () => {
    const provider = createProvider();
    const client = createTenderlaneClient({
      context: { country: 'CH' },
      providers: [provider],
      routing: {
        evaluate: () => ({ provider: 'mock', flow: 'inline', paymentMethods: [], source: 'fallback' }),
      },
    });
    await client.prepare(input);
    await client.submit(input);
    expect(client.getSnapshot().status).toBe('success');

    client.updateContext({ country: 'DE' });

    expect(client.getSnapshot()).toMatchObject({
      status: 'success',
      canSubmit: false,
      context: { country: 'DE' },
    });
    expect(client.getSnapshot().checkoutResult).not.toBeNull();

    client.reset();
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', checkoutResult: null });
  });

  it('treats a processing payment as pending, not as success', async () => {
    const provider = createProvider({
      submit: vi.fn(
        async (): Promise<CheckoutResult> => ({ provider: 'mock', id: 'pi_123', status: 'processing' }),
      ),
    });
    const client = createTenderlaneClient({
      context: {},
      providers: [provider],
      routing: {
        evaluate: () => ({ provider: 'mock', flow: 'inline', paymentMethods: [], source: 'fallback' }),
      },
    });
    await client.prepare(input);
    await client.submit(input);

    expect(client.getSnapshot()).toMatchObject({
      status: 'pending',
      canSubmit: false,
      checkoutResult: { status: 'processing' },
    });
  });
});
