import { findDemoSession } from '../sessions';

/** The demo PSP "takes the payment": it marks the checkout paid and sends the customer back. */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const sessionId = form.get('session');
  const session = findDemoSession(typeof sessionId === 'string' ? sessionId : undefined);
  if (!session) return new Response('Unknown checkout.', { status: 404 });

  session.paid = true;
  // The URL was validated by the Tenderlane handler when the checkout was created.
  return Response.redirect(session.successUrl, 303);
}
