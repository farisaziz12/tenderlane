import {
  computed,
  getCurrentScope,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  watch,
} from 'vue';
import type { App, ComputedRef, InjectionKey, MaybeRefOrGetter, ShallowRef } from 'vue';
import { createTenderlaneClient } from '@tenderlane/client';
import type {
  TenderlaneClient,
  TenderlaneClientConfig,
  TenderlaneClientState,
} from '@tenderlane/client';
import type { CheckoutInput, CheckoutResult, TenderlaneContext } from '@tenderlane/core';

/** Injection key under which the {@link TenderlaneClient} is provided. */
export const tenderlaneInjectionKey: InjectionKey<TenderlaneClient> = Symbol('tenderlane');

/** A Vue plugin that owns one {@link TenderlaneClient} for the app. */
export interface TenderlanePlugin {
  readonly client: TenderlaneClient;
  install(app: App): void;
}

function isClient(value: TenderlaneClient | TenderlaneClientConfig): value is TenderlaneClient {
  return typeof (value as TenderlaneClient).getSnapshot === 'function';
}

/**
 * Create the app-level plugin. Pass a client config, or a client you created
 * yourself with `createTenderlaneClient`.
 *
 * @example
 * const app = createApp(App);
 * app.use(createTenderlane({ context, providers, routing }));
 */
export function createTenderlane(
  clientOrConfig: TenderlaneClient | TenderlaneClientConfig,
): TenderlanePlugin {
  const client = isClient(clientOrConfig) ? clientOrConfig : createTenderlaneClient(clientOrConfig);
  return {
    client,
    install(app) {
      app.provide(tenderlaneInjectionKey, client);
    },
  };
}

/**
 * Provide a client to a component subtree instead of the whole app. Call it
 * in `setup()`. Returns the client.
 */
export function provideTenderlane(
  clientOrConfig: TenderlaneClient | TenderlaneClientConfig,
): TenderlaneClient {
  const client = isClient(clientOrConfig) ? clientOrConfig : createTenderlaneClient(clientOrConfig);
  provide(tenderlaneInjectionKey, client);
  return client;
}

/**
 * The raw {@link TenderlaneClient}.
 *
 * @throws If no client was provided by `createTenderlane` or `provideTenderlane`.
 */
export function useTenderlane(): TenderlaneClient {
  const client = inject(tenderlaneInjectionKey, null);
  if (!client) {
    throw new Error(
      'useTenderlane() found no client. Install the plugin with app.use(createTenderlane(config)) or call provideTenderlane(config) in an ancestor component.',
    );
  }
  return client;
}

/**
 * The client's state as a shallow ref. The client replaces its state object
 * on every change, so a shallow ref is exact and cheap.
 */
export function useTenderlaneState(): Readonly<ShallowRef<TenderlaneClientState>> {
  const client = useTenderlane();
  const state = shallowRef(client.getSnapshot());
  const unsubscribe = client.subscribe(() => {
    state.value = client.getSnapshot();
  });
  if (getCurrentScope()) onScopeDispose(unsubscribe);
  return state;
}

/** Reactive checkout state and the actions to drive it. */
export interface TenderlaneCheckout {
  readonly state: Readonly<ShallowRef<TenderlaneClientState>>;
  readonly status: ComputedRef<TenderlaneClientState['status']>;
  readonly selectedProvider: ComputedRef<string | null>;
  readonly route: ComputedRef<TenderlaneClientState['route']>;
  readonly paymentMethods: ComputedRef<TenderlaneClientState['paymentMethods']>;
  readonly selectedPaymentMethod: ComputedRef<string | null>;
  readonly canSubmit: ComputedRef<boolean>;
  readonly error: ComputedRef<TenderlaneClientState['error']>;
  readonly checkoutResult: ComputedRef<TenderlaneClientState['checkoutResult']>;
  readonly providerSession: ComputedRef<TenderlaneClientState['providerSession']>;
  selectPaymentMethod(methodId: string): void;
  prepare(input: CheckoutInput): Promise<void>;
  submit(input: CheckoutInput): Promise<CheckoutResult>;
  reset(): void;
}

/**
 * Primary composable for building checkout UI.
 *
 * @example
 * const checkout = useTenderlaneCheckout();
 * // <button :disabled="!checkout.canSubmit.value" @click="checkout.submit(input)">
 */
export function useTenderlaneCheckout(): TenderlaneCheckout {
  const client = useTenderlane();
  const state = useTenderlaneState();
  return {
    state,
    status: computed(() => state.value.status),
    selectedProvider: computed(() => state.value.selectedProvider),
    route: computed(() => state.value.route),
    paymentMethods: computed(() => state.value.paymentMethods),
    selectedPaymentMethod: computed(() => state.value.selectedPaymentMethod),
    canSubmit: computed(() => state.value.canSubmit),
    error: computed(() => state.value.error),
    checkoutResult: computed(() => state.value.checkoutResult),
    providerSession: computed(() => state.value.providerSession),
    selectPaymentMethod: (methodId) => client.selectPaymentMethod(methodId),
    prepare: (input) => client.prepare(input),
    submit: (input) => client.submit(input),
    reset: () => client.reset(),
  };
}

/**
 * Keep the client's context in sync with reactive application state. When
 * the source changes, the route is evaluated again.
 *
 * @example
 * useTenderlaneContext(() => ({ country: country.value, currency: currency.value }));
 */
export function useTenderlaneContext(context: MaybeRefOrGetter<TenderlaneContext>): void {
  const client = useTenderlane();
  watch(
    () => toValue(context),
    (nextContext) => client.updateContext(nextContext),
    { deep: true, immediate: true, flush: 'sync' },
  );
}

export type { TenderlaneClient, TenderlaneClientConfig, TenderlaneClientState };
