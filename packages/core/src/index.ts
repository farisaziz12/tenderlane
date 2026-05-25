// Types
export type {
  TenderlaneContext,
  MaybePromise,
  PaymentFlow,
  KnownPaymentMethodId,
  PaymentMethodId,
  KnownProviderId,
  ProviderId,
  KnownCountryCode,
  CountryCode,
  KnownCurrencyCode,
  CurrencyCode,
  KnownLocale,
  Locale,
  ProviderCapabilities,
  PaymentMethodDescriptor,
  ProviderPhantomTypes,
  CheckoutLineItem,
  CheckoutInput,
  ResolvedCheckoutInput,
  CheckoutStatus,
  CheckoutResult,
  Catalog,
  CatalogPhantomTypes,
  CatalogRequest,
  ResolvedCatalogItem,
  ResolvedProviderRefs,
  StringCondition,
  CountryCondition,
  CurrencyCondition,
  LocaleCondition,
  NumberCondition,
  BooleanCondition,
  RuleConditions,
  RoutingRule,
  RouteTarget,
  SelectedPaymentRoute,
  RulesRouterConfig,
  AutoRouterConfig,
  Router,
  ProviderSession,
  BrowserPaymentProvider,
  ServerProviderAdapter,
  AnyBrowserProvider,
  TenderlaneMiddleware,
  InferProviderId,
  InferCapabilities,
  InferProviderOptions,
  InferProviderIds,
  InferPaymentMethods,
  InferCatalogSkus,
  Expand,
} from './types/index.js';

// Routing
export { createRulesRouter } from './routing/rules-router.js';
export { createAutoRouter } from './routing/auto-router.js';
export type { AutoRouterRequest, AutoRouterResponse } from './routing/auto-router.js';
export { resolvePath, matchConditionValue, matchRuleConditions } from './routing/evaluate.js';

// Catalog
export {
  createInlineCatalog,
  createRemoteCatalog,
  defineCatalog,
  resolveCatalogItems,
  wrapLegacyLineItems,
} from './catalog/index.js';
export type {
  InlineCatalogPricing,
  InlineCatalogProduct,
  InlineCatalogProducts,
  RemoteCatalogConfig,
  DefineCatalogConfig,
} from './catalog/index.js';

// Middleware
export { runMiddlewareHook } from './middleware/runner.js';
export type { MiddlewareHook } from './middleware/runner.js';

// Errors
export {
  TenderlaneError,
  ConfigurationError,
  RoutingError,
  ProviderError,
  ValidationError,
  UnsupportedCapabilityError,
  CatalogError,
} from './errors/errors.js';
