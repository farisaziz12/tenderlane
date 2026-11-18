import type {
  RouteTarget,
  RulesRouterConfig,
  RulesRouter,
  SelectedPaymentRoute,
} from '../types/routing.js';
import type { TenderlaneContext } from '../types/context.js';
import { matchRuleConditions } from './evaluate.js';

function select<TProviderId extends string>(
  target: RouteTarget<TProviderId>,
  origin: Pick<SelectedPaymentRoute, 'reason' | 'ruleId' | 'source'>,
): SelectedPaymentRoute<TProviderId> {
  return {
    provider: target.provider,
    flow: target.flow,
    paymentMethods: target.paymentMethods ?? [],
    ...origin,
  };
}

/**
 * Create a synchronous, deterministic router from an ordered list of rules.
 * The first rule whose `when` matches the context wins; otherwise `fallback`.
 *
 * The provider ids used in `rules` and `fallback` are inferred as a literal
 * union, so `createTenderlaneClient` and `createTenderlaneHandler` reject a
 * router that targets a provider that was not registered.
 *
 * @example
 * const routing = createRulesRouter({
 *   rules: [
 *     { id: 'ch', when: { country: 'CH' }, use: { provider: 'stripe', flow: 'inline' } },
 *   ],
 *   fallback: { provider: 'stripe', flow: 'hosted' },
 * });
 * // RulesRouter<'stripe'>
 */
export function createRulesRouter<const TProviderId extends string>(
  config: RulesRouterConfig<TProviderId>,
): RulesRouter<TProviderId> {
  const { rules, fallback, predicates } = config;

  return {
    evaluate(context: TenderlaneContext): SelectedPaymentRoute<TProviderId> {
      for (const rule of rules) {
        // A predicate registered for the rule id replaces its `when` clause.
        const predicate = predicates?.[rule.id];
        const matched = predicate ? predicate(context) : matchRuleConditions(context, rule.when);
        if (matched) {
          return select(rule.use, {
            reason: rule.description ?? `Matched rule "${rule.id}"`,
            ruleId: rule.id,
            source: 'rule',
          });
        }
      }
      return select(fallback, { reason: 'No rule matched; using fallback', source: 'fallback' });
    },
  };
}
