import type { ProviderCapabilities } from './capabilities.js';

/**
 * Phantom type metadata carried by provider adapters.
 * Never instantiated at runtime - exists purely for TypeScript inference.
 * Follows the TanStack `~types` convention.
 */
export interface ProviderPhantomTypes<
  TProviderId extends string = string,
  TCapabilities extends ProviderCapabilities = ProviderCapabilities,
  TProviderOptions = unknown,
> {
  readonly providerId: TProviderId;
  readonly capabilities: TCapabilities;
  readonly providerOptions: TProviderOptions;
}
