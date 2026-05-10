import type { ProviderPhantomTypes } from '@tenderlane/core';
import type { StripeCapabilities } from './capabilities.js';
import type { StripeProviderOptions } from '../browser/types.js';

export type StripePhantomTypes = ProviderPhantomTypes<
  'stripe',
  StripeCapabilities,
  StripeProviderOptions
>;
