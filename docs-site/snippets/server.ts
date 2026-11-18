// app/api/payments/route.ts
import { createInlineCatalog } from '@tenderlane/core';
import { createTenderlaneHandler } from '@tenderlane/core/server';
import { stripeServerAdapter } from '@tenderlane/stripe/server';
import { routing } from './routing';

const catalog = createInlineCatalog({
  'pro-plan': { name: 'Pro plan', pricing: { amount: 2900, currency: 'chf' } },
});

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');

const handler = createTenderlaneHandler({
  providers: [stripeServerAdapter({ secretKey })],
  catalog, // the only source of prices
  routing, // rejects a request for a provider the rules would not select
  resolveContext: (request) => ({
    country: request.headers.get('x-vercel-ip-country') ?? undefined,
  }),
});

export const POST = handler.POST;
