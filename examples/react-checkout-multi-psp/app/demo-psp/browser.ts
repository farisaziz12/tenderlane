import { defineBrowserProvider, requestProviderAction } from '@tenderlane/core/adapters';

/**
 * Browser half of the demo PSP: a complete provider adapter written with
 * `@tenderlane/core/adapters`, the same entry point the Stripe and Polar
 * adapters use. It is not a payment provider and moves no money.
 */
export function demoProvider(options: { serverEndpoint: string }) {
  return defineBrowserProvider({
    id: 'demo',
    capabilities: { flows: ['hosted'], paymentMethods: ['card'] },
    getAvailablePaymentMethods: () => [
      { id: 'card', label: 'Demo card', type: 'card', provider: 'demo' },
    ],
    async submit(input, route) {
      const result = await requestProviderAction({
        endpoint: options.serverEndpoint,
        provider: 'demo',
        action: 'checkout',
        input,
        route,
      });
      if (result.url) window.location.href = result.url;
      return result;
    },
  });
}
