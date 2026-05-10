import { createTenderlaneHandler } from 'tenderlane/server';
import { stripeServerAdapter } from 'tenderlane/stripe/server';

function getHandler() {
  return createTenderlaneHandler({
    providers: [
      stripeServerAdapter({
        secretKey: process.env.STRIPE_SECRET_KEY!,
      }),
    ],
  });
}

export async function POST(request: Request) {
  const handler = getHandler();
  return handler.POST(request);
}
