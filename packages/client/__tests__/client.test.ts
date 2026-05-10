import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTenderlaneClient } from '../src/client.js';
import type { TenderlaneClientConfig } from '../src/types.js';
import type {
  BrowserPaymentProvider,
  ProviderCapabilities,
  Router,
  TenderlaneContext,
  PaymentMethodDescriptor,
  CheckoutInput,
  SelectedPaymentRoute,
} from '@tenderlane/core';

function createMockProvider(): BrowserPaymentProvider {
  return {
    '~types': {} as any,
    id: 'mock',
    capabilities: {
      provider: 'mock',
      flows: ['checkout-session'],
      paymentMethods: ['card'],
      supports: { redirect: true },
    } as ProviderCapabilities,
    getAvailablePaymentMethods(): PaymentMethodDescriptor[] {
      return [
        { id: 'card', label: 'Credit card', type: 'card', provider: 'mock' },
      ];
    },
    async submit() {
      return {
        provider: 'mock',
        id: 'session_123',
        status: 'created' as const,
        url: 'https://checkout.example.com/123',
      };
    },
  };
}

function createMockRouter(route?: Partial<SelectedPaymentRoute>): Router {
  return {
    evaluate(): SelectedPaymentRoute {
      return {
        provider: 'mock',
        flow: 'checkout-session',
        paymentMethods: ['card'],
        source: 'rule',
        ...route,
      };
    },
  };
}

function createConfig(overrides?: Partial<TenderlaneClientConfig>): TenderlaneClientConfig {
  return {
    context: { country: 'CH', currency: 'chf', amount: 1000 },
    providers: [createMockProvider()],
    routing: createMockRouter(),
    ...overrides,
  };
}

describe('createTenderlaneClient', () => {
  it('evaluates route on creation', async () => {
    const client = createTenderlaneClient(createConfig());

    // Wait for async evaluation
    await vi.waitFor(() => {
      expect(client.getSnapshot().status).toBe('ready');
    });

    const state = client.getSnapshot();
    expect(state.selectedProvider).toBe('mock');
    expect(state.paymentMethods).toHaveLength(1);
    expect(state.canSubmit).toBe(true);
  });

  it('notifies subscribers on state change', async () => {
    const client = createTenderlaneClient(createConfig());
    const listener = vi.fn();

    client.subscribe(listener);

    // Trigger a state change after subscribing
    client.updateContext({ country: 'DE', currency: 'eur', amount: 2000 });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
    });
  });

  it('unsubscribes correctly', async () => {
    const client = createTenderlaneClient(createConfig());
    const listener = vi.fn();

    const unsub = client.subscribe(listener);
    unsub();

    client.updateContext({ country: 'DE', currency: 'eur', amount: 500 });

    // Give time for async operations
    await new Promise((r) => setTimeout(r, 50));
    const callCount = listener.mock.calls.length;

    client.updateContext({ country: 'US', currency: 'usd', amount: 200 });
    await new Promise((r) => setTimeout(r, 50));

    // Should not have been called again after unsubscribe
    expect(listener.mock.calls.length).toBe(callCount);
  });

  it('re-evaluates when context changes', async () => {
    const evaluateSpy = vi.fn().mockReturnValue({
      provider: 'mock',
      flow: 'checkout-session',
      paymentMethods: ['card'],
      source: 'rule',
    });

    const router: Router = { evaluate: evaluateSpy };
    const client = createTenderlaneClient(createConfig({ routing: router }));

    await vi.waitFor(() => {
      expect(client.getSnapshot().status).toBe('ready');
    });

    client.updateContext({ country: 'DE', currency: 'eur', amount: 2000 });

    await vi.waitFor(() => {
      expect(evaluateSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('submits through the selected provider', async () => {
    const submitSpy = vi.fn().mockResolvedValue({
      provider: 'mock',
      id: 'session_456',
      status: 'created',
      url: 'https://checkout.example.com/456',
    });

    const provider = createMockProvider();
    provider.submit = submitSpy;

    const client = createTenderlaneClient(createConfig({ providers: [provider] }));

    await vi.waitFor(() => {
      expect(client.getSnapshot().status).toBe('ready');
    });

    const input: CheckoutInput = {
      lineItems: [{ name: 'Test', quantity: 1, unitAmount: 1000 }],
      successUrl: '/success',
      cancelUrl: '/cancel',
    };

    const result = await client.submit(input);
    expect(submitSpy).toHaveBeenCalled();
    expect(result.id).toBe('session_456');
  });

  it('transitions to error state on provider error', async () => {
    const provider = createMockProvider();
    provider.submit = vi.fn().mockRejectedValue(new Error('Payment failed'));

    const client = createTenderlaneClient(createConfig({ providers: [provider] }));

    await vi.waitFor(() => {
      expect(client.getSnapshot().status).toBe('ready');
    });

    await expect(
      client.submit({
        lineItems: [{ name: 'Test', quantity: 1, unitAmount: 1000 }],
        successUrl: '/success',
        cancelUrl: '/cancel',
      }),
    ).rejects.toThrow();

    expect(client.getSnapshot().status).toBe('error');
    expect(client.getSnapshot().error).toBeTruthy();
  });

  it('errors when provider is not registered', async () => {
    const router = createMockRouter({ provider: 'nonexistent' });
    const client = createTenderlaneClient(createConfig({ routing: router }));

    await vi.waitFor(() => {
      expect(client.getSnapshot().status).toBe('error');
    });

    expect(client.getSnapshot().error?.message).toContain('nonexistent');
  });

  it('selectPaymentMethod updates state', async () => {
    const provider = createMockProvider();
    provider.getAvailablePaymentMethods = () => [
      { id: 'card', label: 'Card', type: 'card', provider: 'mock' },
      { id: 'bank', label: 'Bank', type: 'bank', provider: 'mock' },
    ];

    const router = createMockRouter({ paymentMethods: ['card', 'bank'] });
    const client = createTenderlaneClient(
      createConfig({ providers: [provider], routing: router }),
    );

    await vi.waitFor(() => {
      expect(client.getSnapshot().status).toBe('ready');
    });

    client.selectPaymentMethod('bank');
    expect(client.getSnapshot().selectedPaymentMethod).toBe('bank');
  });

  it('reset returns to idle state', async () => {
    const client = createTenderlaneClient(createConfig());

    await vi.waitFor(() => {
      expect(client.getSnapshot().status).toBe('ready');
    });

    client.reset();
    expect(client.getSnapshot().status).toBe('idle');
    expect(client.getSnapshot().route).toBeNull();
    expect(client.getSnapshot().selectedProvider).toBeNull();
  });

  it('fires middleware hooks', async () => {
    const onRouteEvaluated = vi.fn();
    const onCheckoutStart = vi.fn();
    const onCheckoutSuccess = vi.fn();

    const client = createTenderlaneClient(
      createConfig({
        middleware: [{ name: 'test', onRouteEvaluated, onCheckoutStart, onCheckoutSuccess }],
      }),
    );

    await vi.waitFor(() => {
      expect(client.getSnapshot().status).toBe('ready');
    });

    expect(onRouteEvaluated).toHaveBeenCalled();

    await client.submit({
      lineItems: [{ name: 'Test', quantity: 1, unitAmount: 1000 }],
      successUrl: '/success',
      cancelUrl: '/cancel',
    });

    expect(onCheckoutStart).toHaveBeenCalled();
    expect(onCheckoutSuccess).toHaveBeenCalled();
  });
});
