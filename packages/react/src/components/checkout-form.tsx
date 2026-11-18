import React, { useEffect, useRef, useCallback } from 'react';
import type { CheckoutInput, AnyBrowserProvider } from '@tenderlane/core';
import type { TenderlaneClientState } from '@tenderlane/client';
import { useTenderlaneCheckout } from '../hooks/use-tenderlane-checkout.js';
import { useTenderlane } from '../hooks/use-tenderlane.js';

/**
 * Props for inline payment element components registered via the `elements` prop.
 * Any provider can implement a component matching this interface.
 */
export interface InlinePaymentElementProps {
  provider: AnyBrowserProvider;
  clientSecret: string;
  onReady?: () => void;
  onChange?: (event: { complete: boolean }) => void;
}

/**
 * State passed to the children render prop of TenderlaneCheckoutForm.
 */
export interface CheckoutFormRenderState {
  readonly status: TenderlaneClientState['status'];
  readonly selectedProvider: string | null;
  readonly canSubmit: boolean;
  readonly error: TenderlaneClientState['error'];
  readonly checkoutResult: TenderlaneClientState['checkoutResult'];
  submit(): void;
  /**
   * Create the provider session again after it failed (status `error` with
   * `canSubmit: false` on an inline flow). Does nothing when a session exists.
   */
  retry(): void;
}

export interface TenderlaneCheckoutFormProps {
  /**
   * The checkout input (items, URLs) used for both prepare() and submit().
   */
  input: CheckoutInput;

  /**
   * Inline payment element components, keyed by provider id. Rendered only
   * when the route selects that provider with the `inline` flow.
   */
  elements?: Record<string, React.ComponentType<InlinePaymentElementProps>>;

  /**
   * Render prop for customizing the pay button, error display, and layout.
   * The inline payment element (if any) is rendered automatically above the children.
   */
  children: (state: CheckoutFormRenderState) => React.ReactNode;
}

/**
 * Drives one checkout for whichever route is selected, so the app renders
 * the same form for every provider and flow.
 *
 * - Hosted flow: renders `children` only; `submit()` redirects.
 * - Inline flow: calls `prepare()` when the route or `input` changes, renders
 *   the matching component from `elements` above `children`, and `submit()`
 *   confirms the payment in place.
 *
 * It renders no markup of its own: the button, errors and layout are yours.
 */
export function TenderlaneCheckoutForm({
  input,
  elements,
  children,
}: TenderlaneCheckoutFormProps) {
  const checkout = useTenderlaneCheckout();
  const client = useTenderlane();
  const lastPrepareKey = useRef<string | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  const status = checkout.status;
  const selectedProvider = checkout.selectedProvider;
  const routeRuleId = checkout.route?.ruleId ?? checkout.route?.source;
  const isInlineFlow = checkout.route?.flow === 'inline';

  // Stable key combining route + serialized input.
  const prepareKey = isInlineFlow
    ? `${routeRuleId}:${JSON.stringify(input)}`
    : null;

  // Auto-prepare when route requires inline flow and input or route changed.
  //
  // Uses setTimeout(0) to defer prepare() until AFTER all effects in the
  // current commit have fired. This is critical because React fires child
  // effects before parent effects — without the defer, this effect would
  // call prepare() before TenderlaneProvider's effect has called
  // updateContext(), causing prepare() to use a stale route.
  const hasProviderSession = checkout.providerSession !== null;

  useEffect(() => {
    if (!isInlineFlow || prepareKey === null) {
      return;
    }

    // Already prepared for this route and input, and the session is still there.
    // A context change clears the session, so that case prepares again.
    if (prepareKey === lastPrepareKey.current && hasProviderSession) {
      return;
    }

    // After a failed prepare the status is `error`. Prepare again only for a
    // new route or input; the same key is retried by the user, through
    // `retry()`, so a failing endpoint is not called in a loop.
    const isRetryableError = status === 'error' && prepareKey !== lastPrepareKey.current;
    if (status !== 'ready' && status !== 'prepared' && !isRetryableError) {
      return;
    }

    const timeout = setTimeout(() => {
      // Read fresh state — parent effects have now run and route is current
      const snapshot = client.getSnapshot();
      if (snapshot.route?.flow !== 'inline') {
        // Route changed to redirect flow after parent context sync — skip
        return;
      }

      if (
        snapshot.status !== 'ready' &&
        snapshot.status !== 'prepared' &&
        !(snapshot.status === 'error' && snapshot.route !== null)
      ) {
        // Route is still evaluating — the subscription will trigger a
        // re-render and this effect will run again when status settles
        return;
      }

      // Recorded only once prepare() is really called. Recording it when the
      // timer is scheduled loses the prepare whenever the effect is cleaned up
      // first, which React StrictMode does on every mount.
      lastPrepareKey.current = prepareKey;

      client.prepare(inputRef.current).catch(() => {
        // Error is captured in client state (status: 'error', error: ...)
      });
    }, 0);

    return () => clearTimeout(timeout);
  }, [status, isInlineFlow, prepareKey, hasProviderSession, client]);

  // Reset tracking when route changes away from inline
  useEffect(() => {
    if (!isInlineFlow) {
      lastPrepareKey.current = null;
    }
  }, [isInlineFlow]);

  const handleSubmit = useCallback(() => {
    client.submit(inputRef.current).catch(() => {
      // Error is captured in client state
    });
  }, [client]);

  const handleRetry = useCallback(() => {
    if (client.getSnapshot().providerSession !== null) return;
    client.prepare(inputRef.current).catch(() => {
      // Error is captured in client state
    });
  }, [client]);

  // Resolve the element component for the current provider
  const ElementComponent =
    isInlineFlow && selectedProvider && elements
      ? elements[selectedProvider]
      : undefined;

  // Get the provider instance from the client
  const providerInstance = selectedProvider
    ? client.getProvider(selectedProvider)
    : undefined;

  const renderState: CheckoutFormRenderState = {
    status,
    selectedProvider,
    canSubmit: checkout.canSubmit,
    error: checkout.error,
    checkoutResult: checkout.checkoutResult,
    submit: handleSubmit,
    retry: handleRetry,
  };

  return (
    <>
      {ElementComponent &&
        providerInstance &&
        checkout.providerSession?.clientSecret && (
          <ElementComponent
            key={checkout.providerSession.clientSecret}
            provider={providerInstance}
            clientSecret={checkout.providerSession.clientSecret}
          />
        )}
      {children(renderState)}
    </>
  );
}
