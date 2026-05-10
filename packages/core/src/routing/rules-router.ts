import type { RulesRouterConfig, Router, SelectedPaymentRoute } from '../types/routing.js';
import { RoutingError } from '../errors/errors.js';
import { matchRuleConditions } from './evaluate.js';

/**
 * Create a deterministic rules-based router.
 * Rules are evaluated in order; first match wins.
 * Rules are serializable - no functions in the primary model.
 * Optional `predicates` escape hatch for function-based overrides keyed by rule ID.
 *
 * The `const` type parameter preserves string literal types from the config,
 * enabling TypeScript to catch typos in provider IDs, payment methods, and flows.
 */
export function createRulesRouter<const T extends RulesRouterConfig>(config: T): Router {
  const { rules, fallback, predicates } = config;

  return {
    evaluate(context: Record<string, unknown>): SelectedPaymentRoute {
      for (const rule of rules) {
        // If a predicate exists for this rule's ID, use it instead of declarative conditions
        const predicate = predicates?.[rule.id];
        if (predicate) {
          if (predicate(context)) {
            return {
              provider: rule.use.provider,
              flow: rule.use.flow,
              paymentMethods: rule.use.paymentMethods ?? [],
              providerOptions: rule.use.providerOptions,
              reason: `Matched predicate for rule "${rule.id}"`,
              ruleId: rule.id,
              source: 'rule',
            };
          }
          continue;
        }

        if (matchRuleConditions(context, rule.when)) {
          return {
            provider: rule.use.provider,
            flow: rule.use.flow,
            paymentMethods: rule.use.paymentMethods ?? [],
            providerOptions: rule.use.providerOptions,
            reason: rule.description ?? `Matched rule "${rule.id}"`,
            ruleId: rule.id,
            source: 'rule',
          };
        }
      }

      if (!fallback) {
        throw new RoutingError(
          'No payment route matched the current context and no fallback route was configured.',
        );
      }

      return {
        provider: fallback.provider,
        flow: fallback.flow,
        paymentMethods: fallback.paymentMethods ?? [],
        providerOptions: fallback.providerOptions,
        reason: 'No rule matched; using fallback route',
        source: 'fallback',
      };
    },
  };
}
