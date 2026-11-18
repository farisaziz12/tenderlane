import { createRulesRouter } from '@tenderlane/core';

const routing = createRulesRouter({
  rules: [{ id: 'weekend', when: {}, use: { provider: 'stripe', flow: 'hosted' } }],
  fallback: { provider: 'stripe', flow: 'inline' },
  // Replaces the `when` of the rule with the same id.
  predicates: { weekend: () => [0, 6].includes(new Date().getDay()) },
});

const route = routing.evaluate({ country: 'CH' });
route.provider; // 'stripe'
route.source; // 'rule' | 'fallback'
route.ruleId; // 'weekend' on a weekend, otherwise undefined
