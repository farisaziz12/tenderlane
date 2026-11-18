import { handler, onPaymentEvent } from '../../../checkout/server';

type WebhookRoute = (request: Request) => Promise<Response>;
const routes = new Map<string, WebhookRoute>();

/** `/api/webhooks/stripe`, `/api/webhooks/polar`, `/api/webhooks/demo`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await params;

  let route = routes.get(provider);
  if (!route) {
    try {
      // Throws for a provider that is not registered or cannot verify webhooks.
      route = handler.webhook(provider, onPaymentEvent);
    } catch {
      return new Response('No webhook for that provider.', { status: 404 });
    }
    routes.set(provider, route);
  }
  return route(request);
}
