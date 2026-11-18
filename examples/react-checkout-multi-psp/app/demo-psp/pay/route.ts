import { findDemoSession } from '../sessions';
import { DEMO_SIGNATURE_HEADER, signDemoPayload } from '../signature';

/**
 * The demo PSP "takes the payment": it marks the checkout paid, notifies the
 * shop with a signed webhook, and sends the customer back.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const sessionId = form.get('session');
  const session = findDemoSession(typeof sessionId === 'string' ? sessionId : undefined);
  if (!session) return new Response('Unknown checkout.', { status: 404 });

  session.paid = true;

  // The webhook does not depend on the customer coming back. A real provider
  // sends it from its own servers and retries until it gets a 2xx.
  const body = JSON.stringify({
    id: `demo_evt_${crypto.randomUUID()}`,
    type: 'checkout.paid',
    checkout: session.id,
  });
  // A real provider retries a failed delivery. The demo only logs it.
  try {
    const delivery = await fetch(new URL('/api/webhooks/demo', request.url), {
      method: 'POST',
      headers: { [DEMO_SIGNATURE_HEADER]: await signDemoPayload(body) },
      body,
    });
    if (!delivery.ok) console.error('[demo-psp] webhook answered', delivery.status);
  } catch (error) {
    console.error('[demo-psp] webhook delivery failed', error);
  }

  // The URL was validated by the Tenderlane handler when the checkout was created.
  return Response.redirect(session.successUrl, 303);
}
