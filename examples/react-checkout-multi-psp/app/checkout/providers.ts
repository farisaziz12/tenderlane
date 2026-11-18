import { stripeProvider } from '@tenderlane/stripe';
import { polarProvider } from '@tenderlane/polar';
import { demoProvider } from '../demo-psp/browser';

const serverEndpoint = '/api/payments';

/** Browser providers. They hold no secrets; each one talks to `/api/payments`. */
export const providers = [
  stripeProvider({
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    serverEndpoint,
  }),
  polarProvider({ serverEndpoint }),
  demoProvider({ serverEndpoint }),
] as const;
