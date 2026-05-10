/**
 * Base error class for all Tenderlane errors. Provides a typed `code` field
 * for programmatic error handling and an optional `provider` field indicating
 * which PSP was involved.
 *
 * All specific error classes in Tenderlane extend this base class. Use the
 * `code` field to distinguish error types in catch blocks.
 *
 * @example
 * try {
 *   await client.startCheckout(input);
 * } catch (error) {
 *   if (error instanceof TenderlaneError) {
 *     console.error(`[${error.code}] ${error.message}`);
 *   }
 * }
 */
export class TenderlaneError extends Error {
  readonly code: string;
  readonly provider?: string;
  override readonly cause?: unknown;

  constructor(message: string, code: string, options?: { provider?: string; cause?: unknown }) {
    super(message);
    this.name = 'TenderlaneError';
    this.code = code;
    this.provider = options?.provider;
    this.cause = options?.cause;
  }
}

/**
 * Thrown when provider or routing configuration is invalid. For example,
 * when a router is created with an empty rules array or a provider adapter
 * is missing required fields.
 *
 * Error code: `'CONFIGURATION_ERROR'`
 */
export class ConfigurationError extends TenderlaneError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'CONFIGURATION_ERROR', options);
    this.name = 'ConfigurationError';
  }
}

/**
 * Thrown when no routing rule matches the current context and no fallback
 * route is configured. This typically indicates that the routing rules do
 * not cover all possible context combinations.
 *
 * Error code: `'ROUTING_ERROR'`
 */
export class RoutingError extends TenderlaneError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'ROUTING_ERROR', options);
    this.name = 'RoutingError';
  }
}

/**
 * Thrown when a PSP operation fails (e.g., creating a checkout session).
 * Includes the `provider` field from the base class and an optional
 * `providerCode` for the PSP-specific error code.
 *
 * Error code: `'PROVIDER_ERROR'`
 *
 * @example
 * try {
 *   await adapter.handle("createCheckout", input);
 * } catch (error) {
 *   if (error instanceof ProviderError) {
 *     console.error(`Provider ${error.provider} failed: ${error.providerCode}`);
 *   }
 * }
 */
export class ProviderError extends TenderlaneError {
  readonly providerCode?: string;

  constructor(
    message: string,
    provider: string,
    options?: { providerCode?: string; cause?: unknown },
  ) {
    super(message, 'PROVIDER_ERROR', { provider, cause: options?.cause });
    this.name = 'ProviderError';
    this.providerCode = options?.providerCode;
  }
}

/**
 * Thrown when input validation fails, such as missing required fields or
 * invalid field values in a {@link CheckoutInput}. The `field` property
 * indicates which specific field caused the validation failure.
 *
 * Error code: `'VALIDATION_ERROR'`
 *
 * @example
 * try {
 *   await client.startCheckout(input);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error(`Invalid field: ${error.field}`);
 *   }
 * }
 */
export class ValidationError extends TenderlaneError {
  readonly field?: string;

  constructor(message: string, options?: { field?: string; cause?: unknown }) {
    super(message, 'VALIDATION_ERROR', options);
    this.name = 'ValidationError';
    this.field = options?.field;
  }
}

/**
 * Thrown when a routing rule selects a capability (e.g., a payment method
 * or flow) that the resolved provider does not support. For example,
 * routing to a provider that does not implement the `"elements"` flow.
 *
 * Error code: `'UNSUPPORTED_CAPABILITY'`
 */
export class UnsupportedCapabilityError extends TenderlaneError {
  constructor(message: string, provider: string, options?: { cause?: unknown }) {
    super(message, 'UNSUPPORTED_CAPABILITY', { provider, cause: options?.cause });
    this.name = 'UnsupportedCapabilityError';
  }
}
