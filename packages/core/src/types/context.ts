/**
 * The reactive payment context that routing decisions depend on. Changes to
 * this context trigger re-evaluation of routing rules, allowing the selected
 * PSP, payment method, and checkout UI to update automatically.
 *
 * Includes country, currency, amount, customer info, cart contents, experiment
 * flags, and risk signals. All fields are optional to support incremental
 * context building as user data becomes available.
 *
 * @example
 * const context: TenderlaneContext = {
 *   country: "CH",
 *   currency: "CHF",
 *   amount: 4999,
 *   locale: "de-CH",
 *   customer: {
 *     id: "cust_123",
 *     email: "user@example.com",
 *     isLoggedIn: true,
 *     type: "individual",
 *   },
 *   experiment: { checkoutVariant: "b" },
 *   risk: { score: 0.2, level: "low" },
 * };
 */
export interface TenderlaneContext {
  country?: string;
  currency?: string;
  amount?: number;
  locale?: string;
  customer?: {
    id?: string;
    email?: string;
    isLoggedIn?: boolean;
    hasActiveSubscription?: boolean;
    type?: 'individual' | 'business';
  };
  cart?: {
    items?: Array<{
      id: string;
      type?: 'digital' | 'physical' | 'subscription';
      amount: number;
      quantity: number;
    }>;
  };
  experiment?: Record<string, string | boolean | number>;
  risk?: {
    score?: number;
    level?: 'low' | 'medium' | 'high';
  };
  metadata?: Record<string, unknown>;
}

/**
 * Utility type for values that may be synchronous or asynchronous.
 * Used throughout Tenderlane to allow router implementations and middleware
 * hooks to be either sync or async.
 *
 * @typeParam T - The resolved value type.
 */
export type MaybePromise<T> = T | Promise<T>;
