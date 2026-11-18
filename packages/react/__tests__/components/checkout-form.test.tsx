import React, { StrictMode, useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import type {
  BrowserPaymentProvider,
  CheckoutInput,
  ProviderCapabilities,
  Router,
} from '@tenderlane/core';
import { TenderlaneProvider } from '../../src/provider.js';
import { TenderlaneCheckoutForm } from '../../src/components/checkout-form.js';
import { useTenderlaneCheckout } from '../../src/hooks/use-tenderlane-checkout.js';

const input: CheckoutInput = {
  items: [{ sku: 'pro', quantity: 1 }],
  successUrl: '/success',
  cancelUrl: '/cancel',
};

function createProvider() {
  let sessions = 0;
  const createSession = vi.fn(async () => {
    sessions += 1;
    return {
      flow: 'inline' as const,
      clientSecret: `secret_${sessions}`,
      sessionId: `pi_${sessions}`,
    };
  });
  const provider: BrowserPaymentProvider = {
    '~types': {} as never,
    id: 'mock',
    capabilities: {
      flows: ['hosted', 'inline'],
      paymentMethods: ['card', 'twint'],
    } as ProviderCapabilities,
    getAvailablePaymentMethods: () => [
      { id: 'card', label: 'Card', type: 'card', provider: 'mock' },
      { id: 'twint', label: 'TWINT', type: 'wallet', provider: 'mock' },
    ],
    createSession,
    submit: vi.fn(async () => ({ provider: 'mock', id: 'pi_1', status: 'complete' as const })),
  };
  return { provider, createSession };
}

const routing: Router = {
  evaluate: () => ({
    provider: 'mock',
    flow: 'inline',
    paymentMethods: [],
    ruleId: 'inline',
    source: 'rule',
  }),
};

function Element({ clientSecret }: { clientSecret: string }) {
  return <p data-testid="element">{clientSecret}</p>;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe('TenderlaneCheckoutForm auto-prepare', () => {
  it.each([false, true])('creates the session once (StrictMode: %s)', async (strict) => {
    const { provider, createSession } = createProvider();
    const tree = (
      <TenderlaneProvider config={{ context: { country: 'CH' }, providers: [provider], routing }}>
        <TenderlaneCheckoutForm input={input} elements={{ mock: Element }}>
          {(state) => <p data-testid="status">{state.status}</p>}
        </TenderlaneCheckoutForm>
      </TenderlaneProvider>
    );

    render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    await settle();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status').textContent).toBe('prepared');
    expect(screen.getByTestId('element').textContent).toBe('secret_1');
  });

  it('prepares again after a context change dropped the session', async () => {
    const { provider, createSession } = createProvider();
    let setCountry!: (country: 'CH' | 'DE') => void;
    function App() {
      const [country, set] = useState<'CH' | 'DE'>('CH');
      setCountry = set;
      return (
        <TenderlaneProvider config={{ context: { country }, providers: [provider], routing }}>
          <TenderlaneCheckoutForm input={input} elements={{ mock: Element }}>
            {(state) => <p data-testid="status">{state.status}</p>}
          </TenderlaneCheckoutForm>
        </TenderlaneProvider>
      );
    }

    render(<App />);
    await settle();
    act(() => setCountry('DE'));
    await settle();

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('element').textContent).toBe('secret_2');
  });
});

describe('TenderlaneProvider context sync', () => {
  it('keeps the session and selection when a parent re-renders with an equal context', async () => {
    const { provider, createSession } = createProvider();
    let checkout!: ReturnType<typeof useTenderlaneCheckout>;
    let rerender!: () => void;
    function Child() {
      checkout = useTenderlaneCheckout();
      return null;
    }
    function App() {
      const [, setTick] = useState(0);
      rerender = () => setTick((tick) => tick + 1);
      // A new context object on every render, as in the README example.
      return (
        <TenderlaneProvider config={{ context: { country: 'CH' }, providers: [provider], routing }}>
          <Child />
        </TenderlaneProvider>
      );
    }

    render(<App />);
    await act(async () => {
      checkout.selectPaymentMethod('twint');
      await checkout.prepare(input);
    });
    act(() => rerender());
    await settle();

    expect(checkout.status).toBe('prepared');
    expect(checkout.selectedPaymentMethod).toBe('twint');
    expect(checkout.providerSession?.clientSecret).toBe('secret_1');
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});

describe('TenderlaneCheckoutForm after a failed prepare', () => {
  it('does not loop on a failing endpoint, and retry() prepares again', async () => {
    const { provider } = createProvider();
    const createSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ flow: 'inline', clientSecret: 'secret_ok' });
    provider.createSession = createSession;
    let retry!: () => void;

    render(
      <TenderlaneProvider config={{ context: { country: 'CH' }, providers: [provider], routing }}>
        <TenderlaneCheckoutForm input={input} elements={{ mock: Element }}>
          {(state) => {
            retry = state.retry;
            return <p data-testid="status">{state.status}</p>;
          }}
        </TenderlaneCheckoutForm>
      </TenderlaneProvider>,
    );
    await settle();
    await settle();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status').textContent).toBe('error');

    act(() => retry());
    await settle();

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('element').textContent).toBe('secret_ok');
  });
});

describe('TenderlaneProvider back/forward cache', () => {
  it('resets a client left in redirecting when the page is restored', async () => {
    const { provider } = createProvider();
    provider.createSession = undefined;
    provider.submit = vi.fn(async () => ({
      provider: 'mock',
      id: 'cs_1',
      status: 'open' as const,
      url: 'https://checkout.example/cs_1',
    }));
    let checkout!: ReturnType<typeof useTenderlaneCheckout>;
    function Child() {
      checkout = useTenderlaneCheckout();
      return null;
    }
    const redirectRouting: Router = {
      evaluate: () => ({
        provider: 'mock',
        flow: 'hosted',
        paymentMethods: [],
        source: 'rule',
      }),
    };

    render(
      <TenderlaneProvider
        config={{ context: { country: 'CH' }, providers: [provider], routing: redirectRouting }}
      >
        <Child />
      </TenderlaneProvider>,
    );
    await act(async () => {
      await checkout.submit(input);
    });
    expect(checkout.status).toBe('redirecting');

    act(() => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
    });

    expect(checkout.status).toBe('ready');
    expect(checkout.canSubmit).toBe(true);
  });
});
