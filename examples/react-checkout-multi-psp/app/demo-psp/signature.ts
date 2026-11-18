/**
 * The demo provider signs its webhooks with HMAC-SHA256 over the raw body, the
 * way real providers do. The secret is hard-coded because the "provider" is
 * this same app; a real one gives you a secret per endpoint.
 */
export const DEMO_WEBHOOK_SECRET = 'demo_webhook_secret';
export const DEMO_SIGNATURE_HEADER = 'demo-signature';

export async function signDemoPayload(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(DEMO_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}
