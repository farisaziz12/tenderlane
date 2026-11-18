import { createRulesRouter } from '@tenderlane/core';
import type { RouteTarget, RoutingRule } from '@tenderlane/core';

// First match wins. Rules are plain data: keep them in code, a database or a feature flag.
export const rules = [
  {
    id: 'ch-inline',
    when: { country: 'CH', currency: 'chf' },
    use: { provider: 'stripe', flow: 'inline', paymentMethods: ['card', 'twint'] },
  },
  {
    id: 'nl-ideal',
    when: { country: 'NL', currency: 'eur' },
    use: { provider: 'stripe', flow: 'inline', paymentMethods: ['card', 'ideal', 'sepa_debit'] },
  },
  {
    id: 'de-klarna',
    when: { country: 'DE', currency: 'eur' },
    use: { provider: 'stripe', flow: 'inline', paymentMethods: ['card', 'sepa_debit', 'klarna'] },
  },
  {
    id: 'gb-card',
    when: { country: 'GB', currency: 'gbp' },
    use: { provider: 'stripe', flow: 'inline', paymentMethods: ['card'] },
  },
  {
    id: 'us-polar',
    when: { country: 'US' },
    use: { provider: 'polar', flow: 'hosted', paymentMethods: ['card'] },
  },
] satisfies RoutingRule[];

// Everywhere else: the provider's own hosted page.
export const fallback = {
  provider: 'stripe',
  flow: 'hosted',
  paymentMethods: ['card'],
} satisfies RouteTarget;

export const routing = createRulesRouter({ rules, fallback });
