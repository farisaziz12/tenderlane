# @tenderlane/vue

Vue bindings for [Tenderlane](https://www.tenderlane.dev): a plugin and composables over the headless `@tenderlane/client`. No business logic lives here.

```ts
import { createApp } from 'vue';
import { createTenderlane } from '@tenderlane/vue';

createApp(App).use(createTenderlane({ context, providers, routing })).mount('#app');
```

```vue
<script setup lang="ts">
import { useTenderlaneCheckout, useTenderlaneContext } from '@tenderlane/vue';

const props = defineProps<{ country: string }>();
useTenderlaneContext(() => ({ country: props.country }));

const checkout = useTenderlaneCheckout();
const input = { items: [{ sku: 'pro-plan', quantity: 1 }], successUrl, cancelUrl };
</script>

<template>
  <button :disabled="!checkout.canSubmit.value" @click="checkout.submit(input)">
    Pay with {{ checkout.selectedProvider.value }}
  </button>
</template>
```

Composables: `useTenderlane`, `useTenderlaneState`, `useTenderlaneCheckout`, `useTenderlaneContext`. Use `provideTenderlane` to scope a client to a subtree.

Inline payment elements (Stripe Payment Element) have no Vue component yet; redirect flows work today.
