import type { PaymentFlow, PaymentMethodId, KnownPaymentMethodId, ProviderId, KnownProviderId } from './capabilities.js';

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
  country?: StringCondition;
  currency?: StringCondition;
  amount?: NumberCondition;
  locale?: StringCondition;
  experiment?: Record<string, string | boolean | number>;
  customer?: {
    isLoggedIn?: BooleanCondition;
    type?: 'individual' | 'business';
    hasActiveSubscription?: BooleanCondition;
  };
  [key: string]: unknown;
}

/**
 * A single routing rule with a unique identifier, match conditions, and a
 * target route. Rules are evaluated in order and the first matching rule wins.
 *
 * Rules are fully serializable (plain JSON) -- no functions. Use the
 * `predicates` escape hatch in {@link RulesRouterConfig} for function-based
 * conditions keyed by rule ID.
 *
 * @example
 * const swissHighValueRule: RoutingRule = {
 *   id: "swiss-high-value",
 *   description: "Route Swiss high-value orders to Stripe checkout",
 *   when: { country: "CH", amount: { gte: 10000 } },
 *   use: { provider: "stripe", flow: "checkout" },
 * };
 */
export interface RoutingRule {
  readonly id: string;
  readonly description?: string;
  readonly when: RuleConditions;
  readonly use: RouteTarget;
}

/**
 * The `use` clause of a {@link RoutingRule}: specifies which provider, payment
 * flow, and (optionally) which payment methods to select when the rule matches.
 *
 * @example
 * const target: RouteTarget = {
 *   provider: "stripe",
 *   flow: "checkout",
 *   paymentMethods: ["card"],
 *   providerOptions: { locale: "de" },
 * };
 */
export interface RouteTarget {
  readonly provider: KnownProviderId;
  readonly flow: PaymentFlow;
  readonly paymentMethods?: KnownPaymentMethodId[];
  readonly providerOptions?: Record<string, unknown>;
}

/**
 * The output of route evaluation. Contains the selected provider, flow, and
 * payment methods, along with metadata about which rule matched and why.
 *
 * Returned by {@link Router.evaluate}.
 *
 * @example
 * const route: SelectedPaymentRoute = {
 *   provider: "stripe",
 *   flow: "checkout",
 *   paymentMethods: ["card"],
 *   ruleId: "swiss-high-value",
 *   reason: "Matched rule: swiss-high-value",
 *   source: "rule",
 * };
 */
export interface SelectedPaymentRoute {
  readonly provider: ProviderId;
  readonly flow: PaymentFlow;
  readonly paymentMethods: PaymentMethodId[];
  readonly providerOptions?: Record<string, unknown>;
  readonly reason?: string;
  readonly ruleId?: string;
  readonly source: 'rule' | 'fallback' | 'auto' | 'auto-fallback';
}

/**
 * Configuration for {@link createRulesRouter}. Defines an ordered array of
 * routing rules, a required fallback route, and an optional `predicates`
 * escape hatch for function-based conditions.
 *
 * @example
 * const routerConfig: RulesRouterConfig = {
 *   rules: [
 *     {
 *       id: "eu-card",
 *       when: { country: { in: ["DE", "FR"] }, currency: "EUR" },
 *       use: { provider: "stripe", flow: "checkout" },
 *     },
 *   ],
 *   fallback: { provider: "stripe", flow: "checkout" },
 *   predicates: {
 *     "eu-card": (context) => context.amount !== undefined && context.amount > 0,
 *   },
 * };
 */
export interface RulesRouterConfig {
  readonly rules: readonly RoutingRule[];
  readonly fallback: RouteTarget;
  readonly predicates?: Record<string, (context: Record<string, unknown>) => boolean>;
}

/**
 * Configuration for {@link createAutoRouter}. Fetches routing decisions from
 * a remote endpoint with a configurable timeout and a local fallback route
 * used when the endpoint is unreachable or times out.
 *
 * @example
 * const autoConfig: AutoRouterConfig = {
 *   endpoint: "https://routing.example.com/evaluate",
 *   fallback: { provider: "stripe", flow: "checkout" },
 *   timeoutMs: 3000,
 *   headers: { "x-api-key": "sk_live_..." },
 * };
 */
export interface AutoRouterConfig {
  readonly endpoint: string;
  readonly fallback: RouteTarget;
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
}

/**
 * Interface that all routers implement. A router evaluates payment context
 * and returns a {@link SelectedPaymentRoute} indicating which provider,
 * flow, and payment methods to use.
 *
 * @example
 * const router: Router = createRulesRouter(config);
 * const route = await router.evaluate({ country: "CH", currency: "CHF", amount: 5000 });
 */
export interface Router {
  evaluate(context: Record<string, unknown>): MaybePromise<SelectedPaymentRoute>;
}

type MaybePromise<T> = T | Promise<T>;
