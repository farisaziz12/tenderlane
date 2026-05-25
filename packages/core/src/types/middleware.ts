import type { TenderlaneContext, MaybePromise } from './context.js';
import type { SelectedPaymentRoute } from './routing.js';
import type { CheckoutInput, CheckoutResult } from './checkout.js';
import type { ProviderSession } from './provider.js';
import type { ResolvedCatalogItem } from './catalog.js';
import type { TenderlaneError } from '../errors/errors.js';

export interface TenderlaneMiddleware<TContext extends TenderlaneContext = TenderlaneContext> {
  readonly name?: string;

  onContextChange?(event: {
    previousContext: TContext;
    nextContext: TContext;
  }): MaybePromise<void>;

  onRouteEvaluated?(event: {
    context: TContext;
    route: SelectedPaymentRoute;
  }): MaybePromise<void>;

  /**
   * Fires after the catalog resolves items but before the provider adapter
   * runs. Use this to observe pricing, audit catalog hits, or attach
   * analytics to the resolved cart contents.
   *
   * The resolved items here are the canonical ones — what the PSP session
   * will be created from. Mutation has no effect; this hook is read-only.
   */
  onCatalogResolved?(event: {
    context: TContext;
    resolved: readonly ResolvedCatalogItem[];
  }): MaybePromise<void>;

  onSessionCreated?(event: {
    context: TContext;
    route: SelectedPaymentRoute;
    session: ProviderSession;
  }): MaybePromise<void>;

  onCheckoutStart?(event: {
    context: TContext;
    route: SelectedPaymentRoute;
    input: CheckoutInput;
  }): MaybePromise<void>;

  onCheckoutSuccess?(event: {
    context: TContext;
    route: SelectedPaymentRoute;
    result: CheckoutResult;
  }): MaybePromise<void>;

  onCheckoutError?(event: {
    context: TContext;
    route?: SelectedPaymentRoute;
    error: TenderlaneError;
  }): MaybePromise<void>;
}
