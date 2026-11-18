import type { BrowserPaymentProvider } from '@tenderlane/core';
import { requestProviderAction } from '@tenderlane/core/adapters';
import { POLAR_CAPABILITIES, type PolarCapabilities } from '../shared/capabilities.js';
import type { PolarPhantomTypes } from '../shared/metadata.js';
import type { PolarProviderOptions } from './types.js';

/**
 * Create the Polar browser provider. Hosted flow only: it asks the server for
 * a Polar checkout and redirects to it. It imports no Polar SDK; the server
 * entry (`@tenderlane/polar/server`) does.
 */
export function polarProvider(
  options: PolarProviderOptions,
): BrowserPaymentProvider<'polar', PolarCapabilities, PolarProviderOptions> {
  return {
    '~types': {} as PolarPhantomTypes,
    id: 'polar',
    capabilities: POLAR_CAPABILITIES,

    getAvailablePaymentMethods() {
      return [{ id: 'card', label: 'Card', type: 'card', provider: 'polar' }];
    },

    async submit(input, route) {
      const result = await requestProviderAction({
        endpoint: options.serverEndpoint,
        provider: 'polar',
        action: 'checkout',
        input,
        route,
      });
      if (result.url && typeof window !== 'undefined') {
        window.location.href = result.url;
      }
      return result;
    },
  };
}
