import type { ProviderPhantomTypes } from '@tenderlane/core';
import type { PolarCapabilities } from './capabilities.js';
import type { PolarProviderOptions } from '../browser/types.js';

export type PolarPhantomTypes = ProviderPhantomTypes<
  'polar',
  PolarCapabilities,
  PolarProviderOptions
>;
