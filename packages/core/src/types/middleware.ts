import type { TenderlaneContext, MaybePromise } from './context.js';
import type { SelectedPaymentRoute } from './routing.js';
import type { CheckoutInput, CheckoutResult } from './checkout.js';
import type { ProviderSession } from './provider.js';
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
