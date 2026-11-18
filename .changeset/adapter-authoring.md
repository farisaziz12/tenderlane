---
'@tenderlane/core': minor
---

Add `@tenderlane/core/adapters`, the entry point for writing a provider adapter: `defineBrowserProvider`, `defineServerAdapter`, `requestProviderAction`, and the adapter contracts.

- Routing rules can target any provider id and payment method id. `RouteTarget.provider` was limited to a built-in list, so a rule could not select a community or in-house adapter without a cast.
- `@tenderlane/core` and `@tenderlane/core/server` now share one copy of the error classes. They were bundled separately, so a `CatalogError` thrown by `@tenderlane/stripe` or `@tenderlane/polar` was not recognised by the handler and came back as a 500 instead of a 400. The handler also matches errors by `code`, and `hasErrorCode(error, code)` is exported for the same purpose.
