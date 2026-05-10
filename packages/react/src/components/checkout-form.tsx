import React, { useEffect, useRef, useCallback } from 'react';
import type { CheckoutInput, BrowserPaymentProvider } from '@tenderlane/core';
import type { TenderlaneClientState } from '@tenderlane/client';
import { useTenderlaneCheckout } from '../hooks/use-tenderlane-checkout.js';
import { useTenderlane } from '../hooks/use-tenderlane.js';

/** Flows that require inline provider UI (session creation + element mounting) */
const INLINE_FLOWS = new Set(['payment-intent', 'embedded-checkout']);

/**
 * Props for inline payment element components registered via the `elements` prop.
 * Any provider can implement a component matching this interface.
 */
export interface InlinePaymentElementProps {
  provider: BrowserPaymentProvider;
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
}

export interface TenderlaneCheckoutFormProps {
  /**
   * The checkout input (line items, URLs) used for both prepare() and submit().
   */
  input: CheckoutInput;

  /**
   * Map of provider IDs to their inline payment element components.
   * Only needed for flows that require inline UI (payment-intent, embedded-checkout).
   * Components are only rendered when the route selects the matching provider + flow.
   */
  elements?: Record<string, React.ComponentType<InlinePaymentElementProps>>;

  /**
   * Render prop for customizing the pay button, error display, and layout.
   * The inline payment element (if any) is rendered automatically above the children.
   */
  children: (state: CheckoutFormRenderState) => React.ReactNode;
}

/**
 * Provider-agnostic checkout form container.
 *
 * - Auto-calls `prepare()` when the route selects an inline flow (payment-intent)
 * - Re-prepares when input changes (e.g., currency switch creates a new PaymentIntent)
 * - Auto-renders the matching element component from the `elements` map
 * - Delegates pay button and error display to the children render prop
 * - For redirect flows, renders only children (no inline element)
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
  const routeFlow = checkout.selectedRoute?.flow;
  const routeRuleId = checkout.selectedRoute?.ruleId ?? checkout.selectedRoute?.source;

  const isInlineFlow = routeFlow ? INLINE_FLOWS.has(routeFlow) : false;

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
  useEffect(() => {
    if (!isInlineFlow || prepareKey === null) {
      return;
    }

    if (prepareKey === lastPrepareKey.current) {
      return;
    }

    if (status !== 'ready' && status !== 'prepared') {
      return;
    }

    lastPrepareKey.current = prepareKey;

    const timeout = setTimeout(() => {
      // Read fresh state — parent effects have now run and route is current
      const snapshot = client.getSnapshot();
      const currentFlow = snapshot.route?.flow;
      const currentIsInline = currentFlow ? INLINE_FLOWS.has(currentFlow) : false;

      if (!currentIsInline) {
        // Route changed to redirect flow after parent context sync — skip
        return;
      }

      if (snapshot.status !== 'ready' && snapshot.status !== 'prepared') {
        // Route is still evaluating — the subscription will trigger a
        // re-render and this effect will run again when status settles
        return;
      }

      client.prepare(inputRef.current).catch(() => {
        // Error is captured in client state (status: 'error', error: ...)
      });
    }, 0);

    return () => clearTimeout(timeout);
  }, [status, isInlineFlow, prepareKey, client]);

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
