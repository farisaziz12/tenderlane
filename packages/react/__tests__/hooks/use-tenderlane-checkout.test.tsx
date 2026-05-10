import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TenderlaneProvider } from '../../src/provider.js';
import { useTenderlaneCheckout } from '../../src/hooks/use-tenderlane-checkout.js';
import { useTenderlane } from '../../src/hooks/use-tenderlane.js';
import { usePaymentMethods } from '../../src/hooks/use-payment-methods.js';
import type { TenderlaneClientConfig } from '@tenderlane/client';
import type {
  BrowserPaymentProvider,
  ProviderCapabilities,
  PaymentMethodDescriptor,
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

function createConfig(): TenderlaneClientConfig {
  return {
    context: { country: 'CH', currency: 'chf', amount: 1000 },
    providers: [createMockProvider()],
    routing: {
      evaluate(): SelectedPaymentRoute {
        return {
          provider: 'mock',
          flow: 'checkout-session',
          paymentMethods: ['card'],
          source: 'rule',
        };
      },
    },
  };
}

function createWrapper(config?: TenderlaneClientConfig) {
  const cfg = config ?? createConfig();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <TenderlaneProvider config={cfg}>{children}</TenderlaneProvider>;
  };
}

describe('useTenderlaneCheckout', () => {
  it('returns checkout state', async () => {
    const { result } = renderHook(() => useTenderlaneCheckout(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.selectedProvider).toBe('mock');
    expect(result.current.paymentMethods).toHaveLength(1);
    expect(result.current.canSubmit).toBe(true);
  });

  it('submit triggers provider submit', async () => {
    const { result } = renderHook(() => useTenderlaneCheckout(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit({
        lineItems: [{ name: 'Test', quantity: 1, unitAmount: 1000 }],
        successUrl: '/success',
        cancelUrl: '/cancel',
      });
    });

    expect(submitResult.id).toBe('session_123');
  });
});

describe('useTenderlane', () => {
  it('throws outside provider', () => {
    expect(() => {
      renderHook(() => useTenderlane());
    }).toThrow('useTenderlane must be used within a <TenderlaneProvider>');
  });

  it('returns client inside provider', () => {
    const { result } = renderHook(() => useTenderlane(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBeDefined();
    expect(result.current.getSnapshot).toBeDefined();
    expect(result.current.subscribe).toBeDefined();
  });
});

describe('usePaymentMethods', () => {
  it('returns available payment methods', async () => {
    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });

    expect(result.current[0]).toMatchObject({
      id: 'card',
      type: 'card',
      provider: 'mock',
    });
  });
});
