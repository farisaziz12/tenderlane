import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderError } from '@tenderlane/core';
import type { ResolvedCheckoutInput } from '@tenderlane/core';

const checkoutsCreate = vi.fn();
const checkoutsGet = vi.fn();

// Mock @polar-sh/sdk before importing the adapter so its `new Polar()` call
// uses the mock instead of hitting the network.
vi.mock('@polar-sh/sdk', () => ({
  Polar: vi.fn().mockImplementation(() => ({
    checkouts: { create: checkoutsCreate, get: checkoutsGet },
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
    });

    const result = await adapter.handle('checkout', baseInput);

    expect(checkoutsCreate).toHaveBeenCalledTimes(1);
    const call = checkoutsCreate.mock.calls[0]![0];
    expect(call.products).toEqual(['polar_prod_pro']);
    expect(call).not.toHaveProperty('prices');

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
    });

    await expect(adapter.handle('checkout', baseInput)).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(adapter.handle('checkout', baseInput)).rejects.toThrow('Polar API down');
  });
});

describe('polarServerAdapter retrieve', () => {
  it('reports a paid checkout as complete, with what Polar charged', async () => {
    const { polarServerAdapter } = await import('../../src/server/adapter.js');
    checkoutsGet.mockResolvedValue({
      id: 'polar_co_1',
      status: 'succeeded',
      totalAmount: 3132,
      currency: 'usd',
      customerEmail: 'someone@example.com',
    });

    const details = await polarServerAdapter({ accessToken: 'polar_oat_x' }).retrieve?.('polar_co_1');

    expect(checkoutsGet).toHaveBeenCalledWith({ id: 'polar_co_1' });
    expect(details).toEqual({
      provider: 'polar',
      id: 'polar_co_1',
      status: 'complete',
      amountTotal: 3132,
      currency: 'usd',
    });
  });

  it('does not report a checkout that is still processing as complete', async () => {
    const { polarServerAdapter } = await import('../../src/server/adapter.js');
    checkoutsGet.mockResolvedValue({ id: 'polar_co_1', status: 'confirmed', totalAmount: 2900, currency: 'usd' });

    const details = await polarServerAdapter({ accessToken: 'polar_oat_x' }).retrieve?.('polar_co_1');

    expect(details?.status).toBe('processing');
  });
});
