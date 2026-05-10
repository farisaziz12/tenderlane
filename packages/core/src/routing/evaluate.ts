import type { RuleConditions } from '../types/routing.js';

/**
 * Resolves a dot-separated path against a nested object, returning the value
 * at that path or `undefined` if any segment is missing.
 *
 * @param obj - The object to resolve the path against.
 * @param path - A dot-separated key path (e.g. `"experiment.variant"`).
 * @returns The value at the resolved path, or `undefined` if not found.
 *
 * @example
 * const context = { experiment: { variant: "a" } };
 * resolvePath(context, "experiment.variant"); // => "a"
 * resolvePath(context, "experiment.missing"); // => undefined
 */
export function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/**
 * Check if a value is a comparison operator object ({ gt, gte, lt, lte }).
 */
function isComparisonOperator(
  value: unknown,
): value is { gt?: number; gte?: number; lt?: number; lte?: number } {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length > 0 &&
    keys.every((k) => k === 'gt' || k === 'gte' || k === 'lt' || k === 'lte')
  );
}

function isInOperator(value: unknown): value is { in: unknown[] } {
  return (
    value != null &&
    typeof value === 'object' &&
    'in' in value &&
    Array.isArray((value as { in: unknown[] }).in)
  );
}

function isNotInOperator(value: unknown): value is { notIn: unknown[] } {
  return (
    value != null &&
    typeof value === 'object' &&
    'notIn' in value &&
    Array.isArray((value as { notIn: unknown[] }).notIn)
  );
}

/**
 * Matches a single context value against a routing condition. Supports
 * exact primitive equality, set operators (`in`, `notIn`), numeric range
 * operators (`gt`, `gte`, `lt`, `lte`), and recursive nested object matching.
 *
 * A `null` or `undefined` condition value is treated as "no constraint" and
 * always matches.
 *
 * @param contextValue - The actual value from the payment context.
 * @param conditionValue - The condition to match against (literal, operator object, or nested object).
 * @returns `true` if the context value satisfies the condition.
 *
 * @example
 * matchConditionValue("CH", "CH");                    // true  (exact match)
 * matchConditionValue("CH", { in: ["CH", "DE"] });    // true  (set inclusion)
 * matchConditionValue(1500, { gte: 1000, lt: 5000 }); // true  (range match)
 */
export function matchConditionValue(contextValue: unknown, conditionValue: unknown): boolean {
  if (conditionValue == null) return true;

  // Comparison operators for numbers
  if (isComparisonOperator(conditionValue)) {
    if (typeof contextValue !== 'number') return false;
    if (conditionValue.gt !== undefined && !(contextValue > conditionValue.gt)) return false;
    if (conditionValue.gte !== undefined && !(contextValue >= conditionValue.gte)) return false;
    if (conditionValue.lt !== undefined && !(contextValue < conditionValue.lt)) return false;
    if (conditionValue.lte !== undefined && !(contextValue <= conditionValue.lte)) return false;
    return true;
  }

  // { in: [...] } operator
  if (isInOperator(conditionValue)) {
    return conditionValue.in.includes(contextValue);
  }

  // { notIn: [...] } operator
  if (isNotInOperator(conditionValue)) {
    return !conditionValue.notIn.includes(contextValue);
  }

  // Nested object matching (e.g. experiment: { variant: "a" })
  if (
    typeof conditionValue === 'object' &&
    !Array.isArray(conditionValue) &&
    typeof contextValue === 'object' &&
    contextValue != null
  ) {
    const condObj = conditionValue as Record<string, unknown>;
    const ctxObj = contextValue as Record<string, unknown>;
    return Object.entries(condObj).every(([key, val]) => matchConditionValue(ctxObj[key], val));
  }

  // Exact match (primitive equality)
  return contextValue === conditionValue;
}

/**
 * Evaluates all conditions in a rule's `when` clause against the given context.
 * All conditions must match for the rule to fire (AND semantics). Conditions
 * with `undefined` values are skipped.
 *
 * Uses {@link resolvePath} for dot-path key resolution and
 * {@link matchConditionValue} for individual condition evaluation.
 *
 * @param context - The payment context to evaluate against.
 * @param conditions - The rule's `when` clause containing all conditions.
 * @returns `true` if every specified condition matches the context.
 *
 * @example
 * const context = { country: "CH", amount: 5000, currency: "CHF" };
 * const conditions: RuleConditions = { country: "CH", amount: { gte: 1000 } };
 * matchRuleConditions(context, conditions); // true
 */
export function matchRuleConditions(
  context: Record<string, unknown>,
  conditions: RuleConditions,
): boolean {
  for (const [key, conditionValue] of Object.entries(conditions)) {
    if (conditionValue === undefined) continue;
    const contextValue = resolvePath(context, key);
    if (!matchConditionValue(contextValue, conditionValue)) {
      return false;
    }
  }
  return true;
}
