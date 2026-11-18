import { createTenderlaneClient } from '@tenderlane/client';
import { stripeProvider } from '@tenderlane/stripe';
import { routing } from './routing';

const client = createTenderlaneClient({
  context: { country: 'DE' },
  providers: [stripeProvider({ publishableKey: 'pk_test_...', serverEndpoint: '/api/payments' })],
  routing,
});

client.subscribe(() => {
  const state = client.getSnapshot();

  switch (state.status) {
    case 'ready':
      console.log(`route: ${state.route.provider} / ${state.route.flow}`);
      break;
    case 'prepared':
      console.log('mount the payment element with', state.providerSession.clientSecret);
      break;
    case 'redirecting':
      console.log('leaving for', state.checkoutResult.url);
      break;
    case 'error':
      console.error(state.error.code, state.error.message);
      break;
  }
});

// App state changed: the next checkout uses the route for Switzerland.
client.updateContext({ country: 'CH' });
