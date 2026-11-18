import type { TenderlaneContext, MaybePromise } from './context.js';
import type { PaymentFlow, PaymentMethodId, ProviderId, KnownCountryCode, KnownCurrencyCode, KnownLocale } from './capabilities.js';

/**
 * Condition for matching string-valued context fields in a routing rule.
 *
 * Supports exact match with a literal string, or set-based operators.
 *
 * @example
 * // Exact match
 * const country: StringCondition = "CH";
 *
 * // Set inclusion
 * const euCountries: StringCondition = { in: ["DE", "FR", "IT", "ES"] };
 *
 * // Set exclusion
 * const nonSanctioned: StringCondition = { notIn: ["RU", "KP"] };
 */
export type StringCondition = string | { in?: string[]; notIn?: string[] };

/** Condition for matching country-valued context fields. Autocompletes with known ISO 3166-1 alpha-2 codes. */
export type CountryCondition = KnownCountryCode | { in?: KnownCountryCode[]; notIn?: KnownCountryCode[] };

/** Condition for matching currency-valued context fields. Autocompletes with known ISO 4217 codes (lowercase). */
export type CurrencyCondition = KnownCurrencyCode | { in?: KnownCurrencyCode[]; notIn?: KnownCurrencyCode[] };

/** Condition for matching locale-valued context fields. Autocompletes with known BCP 47 tags. */
export type LocaleCondition = KnownLocale | { in?: KnownLocale[]; notIn?: KnownLocale[] };

/**
 * Condition for matching numeric context fields in a routing rule.
 *
 * Supports exact match with a literal number, or range operators.
 * When multiple operators are specified, all must be satisfied (AND semantics).
 *
 * @example
 * // Exact match
 * const exactAmount: NumberCondition = 100;
 *
 * // Range: 10.00 <= amount < 500.00 (amounts in minor units)
 * const midRange: NumberCondition = { gte: 1000, lt: 50000 };
 */
export type NumberCondition =
  | number
  | { gt?: number; gte?: number; lt?: number; lte?: number };

/**
 * Condition for matching boolean context fields in a routing rule.
 *
 * @example
 * const loggedIn: BooleanCondition = true;
 */
export type BooleanCondition = boolean;

/**
 * The `when` clause of a {@link RoutingRule}. All specified conditions are
 * AND'd together -- every condition must match for the rule to fire.
 *
 * Supports top-level fields like `country`, `currency`, and `amount`, as
 * well as nested object matching for `experiment` and `customer`.
 * Additional custom fields can be added via the index signature.
 *
 * @example
 * const conditions: RuleConditions = {
 *   country: { in: ["CH", "DE", "AT"] },
 *   amount: { gte: 1000 },
 *   customer: { isLoggedIn: true },
 *   experiment: { checkoutVariant: "b" },
 * };
 */
export interface RuleConditions {
  country?: CountryCondition;
  currency?: CurrencyCondition;
  amount?: NumberCondition;
  locale?: LocaleCondition;
  experiment?: Record<string, string | boolean | number>;
  customer?: {
    isLoggedIn?: BooleanCondition;
    type?: 'individual' | 'business';
    hasActiveSubscription?: BooleanCondition;
  };
  [key: string]: unknown;
}

/**
 * One routing rule: when `when` matches the context, `use` is the route.
 * Rules are plain JSON, evaluated in order; the first match wins.
 *
 * @example
 * const rule: RoutingRule = {
 *   id: 'ch-inline',
 *   when: { country: 'CH', currency: 'chf' },
 *   use: { provider: 'stripe', flow: 'inline', paymentMethods: ['card', 'twint'] },
 * };
 */
export interface RoutingRule<TProviderId extends string = ProviderId> {
  readonly id: string;
  readonly description?: string;
  readonly when: RuleConditions;
  readonly use: RouteTarget<TProviderId>;
}

/** The provider, flow and (optionally) payment methods a rule selects. */
export interface RouteTarget<TProviderId extends string = ProviderId> {
  readonly provider: TProviderId;
  readonly flow: PaymentFlow;
  /** Restrict the checkout to these methods. Omit for the provider's default set. */
  readonly paymentMethods?: readonly PaymentMethodId[];
}

/** The output of route evaluation, with which rule produced it. */
export interface SelectedPaymentRoute<TProviderId extends string = ProviderId> {
  readonly provider: TProviderId;
  readonly flow: PaymentFlow;
  readonly paymentMethods: readonly PaymentMethodId[];
  readonly reason?: string;
  readonly ruleId?: string;
  readonly source: 'rule' | 'fallback';
}

/**
 * Configuration for {@link createRulesRouter}: ordered rules, a required
 * fallback, and optional `predicates` (functions keyed by rule id) for
 * conditions that JSON cannot express.
 */
export interface RulesRouterConfig<TProviderId extends string = ProviderId> {
  readonly rules: readonly RoutingRule<TProviderId>[];
  readonly fallback: RouteTarget<TProviderId>;
  readonly predicates?: Readonly<Record<string, (context: TenderlaneContext) => boolean>>;
}

/**
 * Selects a route for a context. `TProviderId` is the union of provider ids
 * the router can select; the client and the server handler use it to reject,
 * at compile time, a router that targets a provider they were not given.
 *
 * `createRulesRouter` is the built-in implementation. Any object with this
 * shape works, and `evaluate` may be async.
 */
export interface Router<TProviderId extends string = string> {
  evaluate(context: TenderlaneContext): MaybePromise<SelectedPaymentRoute<TProviderId>>;
}

/** A router that decides synchronously. What `createRulesRouter` returns. */
export interface RulesRouter<TProviderId extends string = string> extends Router<TProviderId> {
  evaluate(context: TenderlaneContext): SelectedPaymentRoute<TProviderId>;
}
