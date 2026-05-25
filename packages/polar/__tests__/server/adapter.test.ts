import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderError } from '@tenderlane/core';
import type { ResolvedCheckoutInput } from '@tenderlane/core';

const checkoutsCreate = vi.fn();

// Mock @polar-sh/sdk before importing the adapter so its `new Polar()` call
// uses the mock instead of hitting the network.
vi.mock('@polar-sh/sdk', () => ({
  Polar: vi.fn().mockImplementation(() => ({
    checkouts: { create: checkoutsCreate },
  })),
}));

const baseInput: ResolvedCheckoutInput = {
  items: [
    {
      sku: 'pro-plan',
      name: 'Pro Plan',
      quantity: 1,
      unitAmount: 2900,
      currency: 'usd',
      providerRefs: { polar: { productId: 'polar_prod_pro' } },
    },
  ],
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
};

describe('polarServerAdapter', () => {
  beforeEach(() => {
    checkoutsCreate.mockReset();
  });

  it('declares id "polar" and the checkout action', async () => {
    const { polarServerAdapter } = await import('../../src/server/adapter.js');
    const adapter = polarServerAdapter({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
      server: 'sandbox',
    });

    expect(adapter.id).toBe('polar');
    expect(adapter.actions).toEqual(['checkout']);
  });

  it('calls polar.checkouts.create with the mapped params and returns the normalized result', async () => {
    checkoutsCreate.mockResolvedValue({
      id: 'polar_co_abc',
      url: 'https://buy.polar.sh/c/abc',
      status: 'open',
    });

    const { polarServerAdapter } = await import('../../src/server/adapter.js');
    const adapter = polarServerAdapter({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
    });

    const result = await adapter.handle('checkout', baseInput);

    expect(checkoutsCreate).toHaveBeenCalledTimes(1);
    const call = checkoutsCreate.mock.calls[0]![0];
    expect(call.products).toEqual(['polar_prod_pro']);
    expect(call.prices).toEqual({
      polar_prod_pro: { amount: 2900, price_currency: 'usd' },
    });

    expect(result).toMatchObject({
      provider: 'polar',
      id: 'polar_co_abc',
      url: 'https://buy.polar.sh/c/abc',
      status: 'open',
    });
  });

  it('throws ProviderError for unsupported actions', async () => {
    const { polarServerAdapter } = await import('../../src/server/adapter.js');
    const adapter = polarServerAdapter({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
    });

    await expect(adapter.handle('refund', baseInput)).rejects.toThrow(ProviderError);
    await expect(adapter.handle('refund', baseInput)).rejects.toThrow(
      /does not support action "refund"/,
    );
  });

  it('propagates CatalogError (missing productId) unchanged so handler maps to 400', async () => {
    const { polarServerAdapter } = await import('../../src/server/adapter.js');
    const { CatalogError } = await import('@tenderlane/core');
    const adapter = polarServerAdapter({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
    });

    const inputWithoutRefs: ResolvedCheckoutInput = {
      ...baseInput,
      items: [
        {
          sku: 'pro-plan',
          name: 'Pro Plan',
          quantity: 1,
          unitAmount: 2900,
          currency: 'usd',
        },
      ],
    };

    await expect(adapter.handle('checkout', inputWithoutRefs)).rejects.toBeInstanceOf(
      CatalogError,
    );
  });

  it('wraps unexpected SDK errors in ProviderError', async () => {
    checkoutsCreate.mockRejectedValue(new Error('Polar API down'));

    const { polarServerAdapter } = await import('../../src/server/adapter.js');
    const adapter = polarServerAdapter({
      accessToken: 'polar_oat_test',
      organizationId: 'org_test',
    });

    await expect(adapter.handle('checkout', baseInput)).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(adapter.handle('checkout', baseInput)).rejects.toThrow('Polar API down');
  });
});
