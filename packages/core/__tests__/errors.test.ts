import { describe, it, expect } from 'vitest';
import {
  TenderlaneError,
  ConfigurationError,
  RoutingError,
  ProviderError,
  ValidationError,
  UnsupportedCapabilityError,
} from '../src/errors/errors.js';

describe('Error hierarchy', () => {
  it('TenderlaneError has code and name', () => {
    const err = new TenderlaneError('test', 'TEST_CODE');
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('TenderlaneError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TenderlaneError);
  });

  it('ConfigurationError extends TenderlaneError', () => {
    const err = new ConfigurationError('bad config');
    expect(err.code).toBe('CONFIGURATION_ERROR');
    expect(err.name).toBe('ConfigurationError');
    expect(err).toBeInstanceOf(TenderlaneError);
  });

  it('RoutingError extends TenderlaneError', () => {
    const err = new RoutingError('no route');
    expect(err.code).toBe('ROUTING_ERROR');
    expect(err.name).toBe('RoutingError');
    expect(err).toBeInstanceOf(TenderlaneError);
  });

  it('ProviderError includes provider info', () => {
    const err = new ProviderError('stripe failed', 'stripe', { providerCode: 'card_declined' });
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.provider).toBe('stripe');
    expect(err.providerCode).toBe('card_declined');
    expect(err).toBeInstanceOf(TenderlaneError);
  });

  it('ValidationError includes field info', () => {
    const err = new ValidationError('invalid email', { field: 'customerEmail' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.field).toBe('customerEmail');
    expect(err).toBeInstanceOf(TenderlaneError);
  });

  it('UnsupportedCapabilityError includes provider', () => {
    const err = new UnsupportedCapabilityError('no twint support', 'stripe');
    expect(err.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(err.provider).toBe('stripe');
    expect(err).toBeInstanceOf(TenderlaneError);
  });

  it('preserves cause', () => {
    const cause = new Error('original');
    const err = new ProviderError('wrapped', 'stripe', { cause });
    expect(err.cause).toBe(cause);
  });
});
