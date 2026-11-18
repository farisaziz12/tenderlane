import { describe, it, expect, vi } from 'vitest';
import { createApp, effectScope, nextTick, ref } from 'vue';
import type { BrowserPaymentProvider, ProviderCapabilities, Router } from '@tenderlane/core';
import type { TenderlaneClientConfig } from '@tenderlane/client';
import {
  createTenderlane,
  useTenderlane,
  useTenderlaneCheckout,
  useTenderlaneContext,
} from '../src/index.js';

function createProvider(id: string): BrowserPaymentProvider {
  return {
    '~types': {} as never,
    id,
    capabilities: {
      provider: id,
      flows: ['hosted'],
      paymentMethods: ['card'],
    } as ProviderCapabilities,
    getAvailablePaymentMethods: () => [{ id: 'card', label: 'Card', type: 'card', provider: id }],
    submit: vi.fn(async () => ({
      provider: id,
      id: 'session_1',
      status: 'open' as const,
      url: 'https://checkout.example/session_1',
    })),
  };
}

const routing: Router = {
  evaluate: (context) => ({
    provider: context.country === 'CH' ? 'alpha' : 'beta',
    flow: 'hosted',
    paymentMethods: [],
    source: 'rule',
  }),
};

function createConfig(): TenderlaneClientConfig {
  return {
    context: { country: 'CH' },
    providers: [createProvider('alpha'), createProvider('beta')],
    routing,
  };
}

/** Run composables the way a component's setup() would, inside an app. */
function withApp<T>(config: TenderlaneClientConfig, setup: () => T) {
  const app = createApp({ render: () => null });
  const plugin = createTenderlane(config);
  app.use(plugin);
  const scope = effectScope();
  const result = app.runWithContext(() => scope.run(setup)!);
  return { result, scope, client: plugin.client };
}

const input = { items: [{ sku: 'pro', quantity: 1 }], successUrl: '/s', cancelUrl: '/c' };

describe('@tenderlane/vue', () => {
  it('exposes the client state reactively', async () => {
    const { result: checkout, client } = withApp(createConfig(), () => useTenderlaneCheckout());

    expect(checkout.status.value).toBe('ready');
    expect(checkout.selectedProvider.value).toBe('alpha');
    expect(checkout.canSubmit.value).toBe(true);

    client.updateContext({ country: 'DE' });
    expect(checkout.selectedProvider.value).toBe('beta');

    await checkout.submit(input);
    expect(checkout.status.value).toBe('redirecting');
    expect(checkout.checkoutResult.value?.id).toBe('session_1');
  });

  it('re-routes when reactive application state changes', async () => {
    const country = ref<'CH' | 'DE'>('CH');
    const { result: checkout } = withApp(createConfig(), () => {
      useTenderlaneContext(() => ({ country: country.value }));
      return useTenderlaneCheckout();
    });
    expect(checkout.selectedProvider.value).toBe('alpha');

    country.value = 'DE';
    await nextTick();

    expect(checkout.selectedProvider.value).toBe('beta');
  });

  it('stops listening when the scope is disposed', () => {
    const { result: checkout, scope, client } = withApp(createConfig(), () =>
      useTenderlaneCheckout(),
    );

    scope.stop();
    client.updateContext({ country: 'DE' });

    expect(checkout.state.value.selectedProvider).toBe('alpha');
  });

  it('throws a helpful error without a provided client', () => {
    const app = createApp({ render: () => null });
    expect(() => app.runWithContext(() => useTenderlane())).toThrow(/createTenderlane/);
  });
});
