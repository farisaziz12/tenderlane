import { describe, it, expect } from 'vitest';
import { resolvePath, matchConditionValue, matchRuleConditions } from '../../src/routing/evaluate.js';

describe('resolvePath', () => {
  it('resolves top-level keys', () => {
    expect(resolvePath({ country: 'CH' }, 'country')).toBe('CH');
  });

  it('resolves nested dot-paths', () => {
    const obj = { experiment: { checkoutRouting: 'stripe-first' } };
    expect(resolvePath(obj, 'experiment.checkoutRouting')).toBe('stripe-first');
  });

  it('returns undefined for missing paths', () => {
    expect(resolvePath({ country: 'CH' }, 'currency')).toBeUndefined();
  });

  it('returns undefined for deep missing paths', () => {
    expect(resolvePath({ a: { b: 1 } }, 'a.c.d')).toBeUndefined();
  });

  it('handles null values in path', () => {
    expect(resolvePath({ a: null }, 'a.b')).toBeUndefined();
  });
});

describe('matchConditionValue', () => {
  it('exact match with strings', () => {
    expect(matchConditionValue('CH', 'CH')).toBe(true);
    expect(matchConditionValue('CH', 'DE')).toBe(false);
  });

  it('exact match with numbers', () => {
    expect(matchConditionValue(100, 100)).toBe(true);
    expect(matchConditionValue(100, 200)).toBe(false);
  });

  it('exact match with booleans', () => {
    expect(matchConditionValue(true, true)).toBe(true);
    expect(matchConditionValue(true, false)).toBe(false);
  });

  it('null/undefined condition always matches', () => {
    expect(matchConditionValue('anything', null)).toBe(true);
    expect(matchConditionValue('anything', undefined)).toBe(true);
  });

  it('{ in: [...] } operator', () => {
    expect(matchConditionValue('CH', { in: ['CH', 'DE', 'AT'] })).toBe(true);
    expect(matchConditionValue('US', { in: ['CH', 'DE', 'AT'] })).toBe(false);
  });

  it('{ notIn: [...] } operator', () => {
    expect(matchConditionValue('US', { notIn: ['CH', 'DE'] })).toBe(true);
    expect(matchConditionValue('CH', { notIn: ['CH', 'DE'] })).toBe(false);
  });

  it('{ gt } operator', () => {
    expect(matchConditionValue(100, { gt: 50 })).toBe(true);
    expect(matchConditionValue(50, { gt: 50 })).toBe(false);
  });

  it('{ gte } operator', () => {
    expect(matchConditionValue(50, { gte: 50 })).toBe(true);
    expect(matchConditionValue(49, { gte: 50 })).toBe(false);
  });

  it('{ lt } operator', () => {
    expect(matchConditionValue(49, { lt: 50 })).toBe(true);
    expect(matchConditionValue(50, { lt: 50 })).toBe(false);
  });

  it('{ lte } operator', () => {
    expect(matchConditionValue(50, { lte: 50 })).toBe(true);
    expect(matchConditionValue(51, { lte: 50 })).toBe(false);
  });

  it('combined comparison operators', () => {
    expect(matchConditionValue(50, { gte: 10, lte: 100 })).toBe(true);
    expect(matchConditionValue(5, { gte: 10, lte: 100 })).toBe(false);
    expect(matchConditionValue(101, { gte: 10, lte: 100 })).toBe(false);
  });

  it('comparison operator with non-number returns false', () => {
    expect(matchConditionValue('abc', { gt: 50 })).toBe(false);
  });

  it('nested object matching', () => {
    const ctx = { variant: 'a', enabled: true };
    expect(matchConditionValue(ctx, { variant: 'a' })).toBe(true);
    expect(matchConditionValue(ctx, { variant: 'b' })).toBe(false);
    expect(matchConditionValue(ctx, { variant: 'a', enabled: true })).toBe(true);
  });
});

describe('matchRuleConditions', () => {
  it('matches when all conditions pass', () => {
    const context = { country: 'CH', currency: 'chf', amount: 500 };
    const conditions = { country: 'CH', currency: 'chf' };
    expect(matchRuleConditions(context, conditions)).toBe(true);
  });

  it('fails when any condition fails', () => {
    const context = { country: 'CH', currency: 'eur' };
    const conditions = { country: 'CH', currency: 'chf' };
    expect(matchRuleConditions(context, conditions)).toBe(false);
  });

  it('skips undefined conditions', () => {
    const context = { country: 'CH' };
    const conditions = { country: 'CH', currency: undefined };
    expect(matchRuleConditions(context, conditions)).toBe(true);
  });

  it('matches nested experiment conditions', () => {
    const context = {
      country: 'CH',
      experiment: { checkoutRouting: 'stripe-first' },
    };
    const conditions = {
      country: 'CH',
      experiment: { checkoutRouting: 'stripe-first' },
    };
    expect(matchRuleConditions(context, conditions)).toBe(true);
  });

  it('matches with operators', () => {
    const context = { country: 'CH', amount: 5000 };
    const conditions = {
      country: { in: ['CH', 'DE', 'AT'] } as const,
      amount: { gte: 1000 },
    };
    expect(matchRuleConditions(context, conditions)).toBe(true);
  });
});
