module.exports = [
"[project]/packages/core/dist/index.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// src/errors/errors.ts
__turbopack_context__.s([
    "ConfigurationError",
    ()=>ConfigurationError,
    "ProviderError",
    ()=>ProviderError,
    "RoutingError",
    ()=>RoutingError,
    "TenderlaneError",
    ()=>TenderlaneError,
    "UnsupportedCapabilityError",
    ()=>UnsupportedCapabilityError,
    "ValidationError",
    ()=>ValidationError,
    "createAutoRouter",
    ()=>createAutoRouter,
    "createRulesRouter",
    ()=>createRulesRouter,
    "matchConditionValue",
    ()=>matchConditionValue,
    "matchRuleConditions",
    ()=>matchRuleConditions,
    "resolvePath",
    ()=>resolvePath,
    "runMiddlewareHook",
    ()=>runMiddlewareHook
]);
var TenderlaneError = class extends Error {
    code;
    provider;
    cause;
    constructor(message, code, options){
        super(message);
        this.name = "TenderlaneError";
        this.code = code;
        this.provider = options?.provider;
        this.cause = options?.cause;
    }
};
var ConfigurationError = class extends TenderlaneError {
    constructor(message, options){
        super(message, "CONFIGURATION_ERROR", options);
        this.name = "ConfigurationError";
    }
};
var RoutingError = class extends TenderlaneError {
    constructor(message, options){
        super(message, "ROUTING_ERROR", options);
        this.name = "RoutingError";
    }
};
var ProviderError = class extends TenderlaneError {
    providerCode;
    constructor(message, provider, options){
        super(message, "PROVIDER_ERROR", {
            provider,
            cause: options?.cause
        });
        this.name = "ProviderError";
        this.providerCode = options?.providerCode;
    }
};
var ValidationError = class extends TenderlaneError {
    field;
    constructor(message, options){
        super(message, "VALIDATION_ERROR", options);
        this.name = "ValidationError";
        this.field = options?.field;
    }
};
var UnsupportedCapabilityError = class extends TenderlaneError {
    constructor(message, provider, options){
        super(message, "UNSUPPORTED_CAPABILITY", {
            provider,
            cause: options?.cause
        });
        this.name = "UnsupportedCapabilityError";
    }
};
// src/routing/evaluate.ts
function resolvePath(obj, path) {
    const segments = path.split(".");
    let current = obj;
    for (const seg of segments){
        if (current == null || typeof current !== "object") return void 0;
        current = current[seg];
    }
    return current;
}
function isComparisonOperator(value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((k)=>k === "gt" || k === "gte" || k === "lt" || k === "lte");
}
function isInOperator(value) {
    return value != null && typeof value === "object" && "in" in value && Array.isArray(value.in);
}
function isNotInOperator(value) {
    return value != null && typeof value === "object" && "notIn" in value && Array.isArray(value.notIn);
}
function matchConditionValue(contextValue, conditionValue) {
    if (conditionValue == null) return true;
    if (isComparisonOperator(conditionValue)) {
        if (typeof contextValue !== "number") return false;
        if (conditionValue.gt !== void 0 && !(contextValue > conditionValue.gt)) return false;
        if (conditionValue.gte !== void 0 && !(contextValue >= conditionValue.gte)) return false;
        if (conditionValue.lt !== void 0 && !(contextValue < conditionValue.lt)) return false;
        if (conditionValue.lte !== void 0 && !(contextValue <= conditionValue.lte)) return false;
        return true;
    }
    if (isInOperator(conditionValue)) {
        return conditionValue.in.includes(contextValue);
    }
    if (isNotInOperator(conditionValue)) {
        return !conditionValue.notIn.includes(contextValue);
    }
    if (typeof conditionValue === "object" && !Array.isArray(conditionValue) && typeof contextValue === "object" && contextValue != null) {
        const condObj = conditionValue;
        const ctxObj = contextValue;
        return Object.entries(condObj).every(([key, val])=>matchConditionValue(ctxObj[key], val));
    }
    return contextValue === conditionValue;
}
function matchRuleConditions(context, conditions) {
    for (const [key, conditionValue] of Object.entries(conditions)){
        if (conditionValue === void 0) continue;
        const contextValue = resolvePath(context, key);
        if (!matchConditionValue(contextValue, conditionValue)) {
            return false;
        }
    }
    return true;
}
// src/routing/rules-router.ts
function createRulesRouter(config) {
    const { rules, fallback, predicates } = config;
    return {
        evaluate (context) {
            for (const rule of rules){
                const predicate = predicates?.[rule.id];
                if (predicate) {
                    if (predicate(context)) {
                        return {
                            provider: rule.use.provider,
                            flow: rule.use.flow,
                            paymentMethods: rule.use.paymentMethods ?? [],
                            providerOptions: rule.use.providerOptions,
                            reason: `Matched predicate for rule "${rule.id}"`,
                            ruleId: rule.id,
                            source: "rule"
                        };
                    }
                    continue;
                }
                if (matchRuleConditions(context, rule.when)) {
                    return {
                        provider: rule.use.provider,
                        flow: rule.use.flow,
                        paymentMethods: rule.use.paymentMethods ?? [],
                        providerOptions: rule.use.providerOptions,
                        reason: rule.description ?? `Matched rule "${rule.id}"`,
                        ruleId: rule.id,
                        source: "rule"
                    };
                }
            }
            if (!fallback) {
                throw new RoutingError("No payment route matched the current context and no fallback route was configured.");
            }
            return {
                provider: fallback.provider,
                flow: fallback.flow,
                paymentMethods: fallback.paymentMethods ?? [],
                providerOptions: fallback.providerOptions,
                reason: "No rule matched; using fallback route",
                source: "fallback"
            };
        }
    };
}
// src/routing/auto-router.ts
function createAutoRouter(config) {
    const { endpoint, fallback, timeoutMs = 3e3, headers } = config;
    return {
        async evaluate (context) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(()=>controller.abort(), timeoutMs);
                const request = {
                    version: "1",
                    context,
                    timestamp: /* @__PURE__ */ new Date().toISOString()
                };
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...headers
                    },
                    body: JSON.stringify(request),
                    signal: controller.signal
                });
                clearTimeout(timer);
                if (!response.ok) {
                    throw new Error(`Auto router responded with status ${response.status}`);
                }
                const data = await response.json();
                return {
                    provider: data.provider,
                    flow: data.flow,
                    paymentMethods: data.paymentMethods,
                    reason: data.reason ?? "Auto-routed",
                    source: "auto"
                };
            } catch  {
                return {
                    provider: fallback.provider,
                    flow: fallback.flow,
                    paymentMethods: fallback.paymentMethods ?? [],
                    providerOptions: fallback.providerOptions,
                    reason: "Auto router failed; using fallback route",
                    source: "auto-fallback"
                };
            }
        }
    };
}
// src/middleware/runner.ts
async function runMiddlewareHook(middlewares, hook, event) {
    for (const mw of middlewares){
        const fn = mw[hook];
        if (!fn) continue;
        try {
            await fn(event);
        } catch (err) {
            console.error(`[tenderlane] Middleware "${mw.name ?? "unnamed"}" error in ${hook}:`, err);
        }
    }
}
;
 //# sourceMappingURL=index.js.map
 //# sourceMappingURL=index.js.map
}),
"[project]/packages/client/dist/index.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createTenderlaneClient",
    ()=>createTenderlaneClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/core/dist/index.js [app-ssr] (ecmascript)");
;
// src/client.ts
function createTenderlaneClient(config) {
    const { providers, routing, middleware = [] } = config;
    const providerMap = /* @__PURE__ */ new Map();
    for (const provider of providers){
        providerMap.set(provider.id, provider);
    }
    let state = {
        status: "idle",
        context: config.context,
        route: null,
        selectedProvider: null,
        paymentMethods: [],
        selectedPaymentMethod: null,
        canSubmit: false,
        error: null,
        checkoutResult: null,
        providerSession: null
    };
    const listeners = /* @__PURE__ */ new Set();
    let evaluationVersion = 0;
    function setState(partial) {
        state = {
            ...state,
            ...partial
        };
        for (const listener of listeners){
            listener();
        }
    }
    function getPaymentMethods(provider, context, routeMethods) {
        const available = provider.getAvailablePaymentMethods(context);
        if (routeMethods.length === 0) return available;
        return available.filter((method)=>routeMethods.includes(method.id));
    }
    function applyRoute(context, route) {
        const provider = providerMap.get(route.provider);
        if (!provider) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ConfigurationError"](`Provider "${route.provider}" was selected by routing rules, but no provider adapter with id "${route.provider}" was registered. Available: ${[
                ...providerMap.keys()
            ].join(", ")}`);
        }
        const methods = getPaymentMethods(provider, context, route.paymentMethods);
        setState({
            status: "ready",
            route,
            selectedProvider: route.provider,
            paymentMethods: methods,
            selectedPaymentMethod: methods[0]?.id ?? null,
            canSubmit: true
        });
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runMiddlewareHook"])(middleware, "onRouteEvaluated", {
            context,
            route
        });
    }
    function handleEvaluationError(context, error) {
        const tenderlaneError = error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TenderlaneError"] ? error : new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TenderlaneError"](error instanceof Error ? error.message : "Route evaluation failed", "ROUTING_ERROR", {
            cause: error
        });
        setState({
            status: "error",
            error: tenderlaneError,
            canSubmit: false
        });
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runMiddlewareHook"])(middleware, "onCheckoutError", {
            context,
            error: tenderlaneError
        });
    }
    function evaluate(context) {
        const version = ++evaluationVersion;
        setState({
            status: "evaluating",
            error: null,
            providerSession: null
        });
        try {
            const result = routing.evaluate(context);
            if (result instanceof Promise) {
                result.then((route)=>{
                    if (version !== evaluationVersion) return;
                    applyRoute(context, route);
                }).catch((error)=>{
                    if (version !== evaluationVersion) return;
                    handleEvaluationError(context, error);
                });
            } else {
                applyRoute(context, result);
            }
        } catch (error) {
            handleEvaluationError(context, error);
        }
    }
    evaluate(config.context);
    return {
        subscribe (listener) {
            listeners.add(listener);
            return ()=>{
                listeners.delete(listener);
            };
        },
        getSnapshot () {
            return state;
        },
        getProvider (providerId) {
            return providerMap.get(providerId);
        },
        updateContext (context) {
            const previousContext = state.context;
            setState({
                context
            });
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runMiddlewareHook"])(middleware, "onContextChange", {
                previousContext,
                nextContext: context
            });
            evaluate(context);
        },
        selectPaymentMethod (methodId) {
            const method = state.paymentMethods.find((method2)=>method2.id === methodId);
            if (!method) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ConfigurationError"](`Payment method "${methodId}" is not available. Available: ${state.paymentMethods.map((method2)=>method2.id).join(", ")}`);
            }
            setState({
                selectedPaymentMethod: methodId
            });
        },
        async prepare (input) {
            if (state.status !== "ready" && state.status !== "prepared" || !state.route || !state.selectedProvider) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TenderlaneError"](`Cannot prepare in status "${state.status}". Wait for route evaluation to complete.`, "INVALID_STATE");
            }
            const provider = providerMap.get(state.selectedProvider);
            if (!provider) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ConfigurationError"](`Provider "${state.selectedProvider}" not found`);
            }
            if (!provider.createSession) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["UnsupportedCapabilityError"](`Provider "${state.selectedProvider}" does not support session creation for flow "${state.route.flow}". Use a redirect flow instead.`, state.selectedProvider);
            }
            const route = state.route;
            const context = state.context;
            setState({
                status: "preparing",
                error: null
            });
            try {
                const session = await provider.createSession(input, route);
                setState({
                    status: "prepared",
                    providerSession: session,
                    canSubmit: true
                });
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runMiddlewareHook"])(middleware, "onSessionCreated", {
                    context,
                    route,
                    session
                });
            } catch (error) {
                const tenderlaneError = error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TenderlaneError"] ? error : new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProviderError"](error instanceof Error ? error.message : "Session creation failed", state.selectedProvider, {
                    cause: error
                });
                setState({
                    status: "error",
                    error: tenderlaneError,
                    canSubmit: false
                });
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runMiddlewareHook"])(middleware, "onCheckoutError", {
                    context,
                    route,
                    error: tenderlaneError
                });
            }
        },
        async submit (input) {
            if (state.status !== "ready" && state.status !== "prepared" || !state.route || !state.selectedProvider) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TenderlaneError"](`Cannot submit in status "${state.status}". Wait for route evaluation or preparation to complete.`, "INVALID_STATE");
            }
            const provider = providerMap.get(state.selectedProvider);
            if (!provider) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ConfigurationError"](`Provider "${state.selectedProvider}" not found`);
            }
            const route = state.route;
            const context = state.context;
            setState({
                status: "submitting",
                error: null
            });
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runMiddlewareHook"])(middleware, "onCheckoutStart", {
                context,
                route,
                input
            });
            try {
                const result = await provider.submit(input, route);
                setState({
                    status: "success",
                    checkoutResult: result
                });
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runMiddlewareHook"])(middleware, "onCheckoutSuccess", {
                    context,
                    route,
                    result
                });
                return result;
            } catch (error) {
                const tenderlaneError = error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TenderlaneError"] ? error : new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProviderError"](error instanceof Error ? error.message : "Checkout failed", state.selectedProvider, {
                    cause: error
                });
                setState({
                    status: "error",
                    error: tenderlaneError,
                    canSubmit: true
                });
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["runMiddlewareHook"])(middleware, "onCheckoutError", {
                    context,
                    route,
                    error: tenderlaneError
                });
                throw tenderlaneError;
            }
        },
        reset () {
            evaluationVersion++;
            setState({
                status: "idle",
                route: null,
                selectedProvider: null,
                paymentMethods: [],
                selectedPaymentMethod: null,
                canSubmit: false,
                error: null,
                checkoutResult: null,
                providerSession: null
            });
        }
    };
}
;
 //# sourceMappingURL=index.js.map
 //# sourceMappingURL=index.js.map
}),
"[project]/packages/react/dist/index.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TenderlaneCheckoutForm",
    ()=>TenderlaneCheckoutForm,
    "TenderlaneProvider",
    ()=>TenderlaneProvider,
    "usePaymentMethods",
    ()=>usePaymentMethods,
    "useProviderSession",
    ()=>useProviderSession,
    "useTenderlane",
    ()=>useTenderlane,
    "useTenderlaneCheckout",
    ()=>useTenderlaneCheckout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@15.5.18_react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$client$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/client/dist/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@15.5.18_react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
;
;
;
// src/provider.tsx
var TenderlaneContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createContext"])(null);
function TenderlaneProvider({ config, children }) {
    const clientRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    if (clientRef.current === null) {
        clientRef.current = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$client$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createTenderlaneClient"])(config);
    }
    const contextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(config.context);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (contextRef.current !== config.context && clientRef.current) {
            contextRef.current = config.context;
            clientRef.current.updateContext(config.context);
        }
    }, [
        config.context
    ]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsx"])(TenderlaneContext.Provider, {
        value: clientRef.current,
        children
    });
}
function useTenderlane() {
    const client = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useContext"])(TenderlaneContext);
    if (!client) {
        throw new Error("useTenderlane must be used within a <TenderlaneProvider>. Wrap your component tree with <TenderlaneProvider config={...}>.");
    }
    return client;
}
function useTenderlaneCheckout() {
    const client = useTenderlane();
    const state = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(client.subscribe, client.getSnapshot, client.getSnapshot);
    const selectPaymentMethod = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((methodId)=>client.selectPaymentMethod(methodId), [
        client
    ]);
    const prepare = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((input)=>client.prepare(input), [
        client
    ]);
    const submit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((input)=>client.submit(input), [
        client
    ]);
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            status: state.status,
            selectedProvider: state.selectedProvider,
            selectedRoute: state.route,
            paymentMethods: state.paymentMethods,
            selectedPaymentMethod: state.selectedPaymentMethod,
            canSubmit: state.canSubmit,
            error: state.error,
            checkoutResult: state.checkoutResult,
            providerSession: state.providerSession,
            selectPaymentMethod,
            prepare,
            submit
        }), [
        state,
        selectPaymentMethod,
        prepare,
        submit
    ]);
}
function usePaymentMethods() {
    const client = useTenderlane();
    const state = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(client.subscribe, client.getSnapshot, client.getSnapshot);
    return state.paymentMethods;
}
function useProviderSession() {
    const client = useTenderlane();
    const state = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(client.subscribe, client.getSnapshot, client.getSnapshot);
    return state.providerSession;
}
var INLINE_FLOWS = /* @__PURE__ */ new Set([
    "payment-intent",
    "embedded-checkout"
]);
function TenderlaneCheckoutForm({ input, elements, children }) {
    const checkout = useTenderlaneCheckout();
    const client = useTenderlane();
    const lastPrepareKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(input);
    inputRef.current = input;
    const status = checkout.status;
    const selectedProvider = checkout.selectedProvider;
    const routeFlow = checkout.selectedRoute?.flow;
    const routeRuleId = checkout.selectedRoute?.ruleId ?? checkout.selectedRoute?.source;
    const isInlineFlow = routeFlow ? INLINE_FLOWS.has(routeFlow) : false;
    const prepareKey = isInlineFlow ? `${routeRuleId}:${JSON.stringify(input)}` : null;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!isInlineFlow || prepareKey === null) {
            return;
        }
        if (prepareKey === lastPrepareKey.current) {
            return;
        }
        if (status !== "ready" && status !== "prepared") {
            return;
        }
        lastPrepareKey.current = prepareKey;
        const timeout = setTimeout(()=>{
            const snapshot = client.getSnapshot();
            const currentFlow = snapshot.route?.flow;
            const currentIsInline = currentFlow ? INLINE_FLOWS.has(currentFlow) : false;
            if (!currentIsInline) {
                return;
            }
            if (snapshot.status !== "ready" && snapshot.status !== "prepared") {
                return;
            }
            client.prepare(inputRef.current).catch(()=>{});
        }, 0);
        return ()=>clearTimeout(timeout);
    }, [
        status,
        isInlineFlow,
        prepareKey,
        client
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!isInlineFlow) {
            lastPrepareKey.current = null;
        }
    }, [
        isInlineFlow
    ]);
    const handleSubmit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        client.submit(inputRef.current).catch(()=>{});
    }, [
        client
    ]);
    const ElementComponent = isInlineFlow && selectedProvider && elements ? elements[selectedProvider] : void 0;
    const providerInstance = selectedProvider ? client.getProvider(selectedProvider) : void 0;
    const renderState = {
        status,
        selectedProvider,
        canSubmit: checkout.canSubmit,
        error: checkout.error,
        checkoutResult: checkout.checkoutResult,
        submit: handleSubmit
    };
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            ElementComponent && providerInstance && checkout.providerSession?.clientSecret && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsx"])(ElementComponent, {
                provider: providerInstance,
                clientSecret: checkout.providerSession.clientSecret
            }, checkout.providerSession.clientSecret),
            children(renderState)
        ]
    });
}
;
 //# sourceMappingURL=index.js.map
 //# sourceMappingURL=index.js.map
}),
"[project]/packages/stripe/dist/index.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "STRIPE_CAPABILITIES",
    ()=>STRIPE_CAPABILITIES,
    "STRIPE_FLOWS",
    ()=>STRIPE_FLOWS,
    "STRIPE_PAYMENT_METHODS",
    ()=>STRIPE_PAYMENT_METHODS,
    "stripeProvider",
    ()=>stripeProvider
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/core/dist/index.js [app-ssr] (ecmascript)");
;
// src/browser/provider.ts
// src/shared/capabilities.ts
var STRIPE_PAYMENT_METHODS = [
    "card",
    "paypal",
    "link",
    "sepa_debit",
    "ideal",
    "bancontact",
    "giropay",
    "sofort",
    "eps",
    "p24",
    "twint",
    "klarna",
    "afterpay_clearpay",
    "affirm",
    "alipay",
    "wechat_pay",
    "cash_app",
    "apple_pay",
    "google_pay"
];
var STRIPE_FLOWS = [
    "checkout-session",
    "payment-intent"
];
var STRIPE_METHOD_DESCRIPTORS = {
    card: {
        id: "card",
        label: "Credit or debit card",
        type: "card",
        provider: "stripe"
    },
    paypal: {
        id: "paypal",
        label: "PayPal",
        type: "wallet",
        provider: "stripe"
    },
    link: {
        id: "link",
        label: "Link",
        type: "wallet",
        provider: "stripe"
    },
    sepa_debit: {
        id: "sepa_debit",
        label: "SEPA Direct Debit",
        type: "bank",
        provider: "stripe"
    },
    ideal: {
        id: "ideal",
        label: "iDEAL",
        type: "redirect",
        provider: "stripe"
    },
    bancontact: {
        id: "bancontact",
        label: "Bancontact",
        type: "redirect",
        provider: "stripe"
    },
    giropay: {
        id: "giropay",
        label: "giropay",
        type: "redirect",
        provider: "stripe"
    },
    sofort: {
        id: "sofort",
        label: "Sofort",
        type: "redirect",
        provider: "stripe"
    },
    eps: {
        id: "eps",
        label: "EPS",
        type: "redirect",
        provider: "stripe"
    },
    p24: {
        id: "p24",
        label: "Przelewy24",
        type: "redirect",
        provider: "stripe"
    },
    twint: {
        id: "twint",
        label: "TWINT",
        type: "local",
        provider: "stripe"
    },
    klarna: {
        id: "klarna",
        label: "Klarna",
        type: "redirect",
        provider: "stripe"
    },
    afterpay_clearpay: {
        id: "afterpay_clearpay",
        label: "Afterpay / Clearpay",
        type: "redirect",
        provider: "stripe"
    },
    affirm: {
        id: "affirm",
        label: "Affirm",
        type: "redirect",
        provider: "stripe"
    },
    alipay: {
        id: "alipay",
        label: "Alipay",
        type: "wallet",
        provider: "stripe"
    },
    wechat_pay: {
        id: "wechat_pay",
        label: "WeChat Pay",
        type: "wallet",
        provider: "stripe"
    },
    cash_app: {
        id: "cash_app",
        label: "Cash App Pay",
        type: "wallet",
        provider: "stripe"
    },
    apple_pay: {
        id: "apple_pay",
        label: "Apple Pay",
        type: "wallet",
        provider: "stripe"
    },
    google_pay: {
        id: "google_pay",
        label: "Google Pay",
        type: "wallet",
        provider: "stripe"
    }
};
var STRIPE_CAPABILITIES = {
    provider: "stripe",
    flows: STRIPE_FLOWS,
    paymentMethods: STRIPE_PAYMENT_METHODS,
    currencies: [
        "usd",
        "eur",
        "gbp",
        "chf",
        "jpy",
        "cad",
        "aud"
    ],
    countries: [
        "US",
        "GB",
        "DE",
        "FR",
        "CH",
        "JP",
        "CA",
        "AU"
    ],
    supports: {
        redirect: true,
        embedded: true,
        subscriptions: false,
        refunds: false,
        webhooks: true
    }
};
// src/browser/provider.ts
function stripeProvider(options) {
    const { publishableKey, serverEndpoint, stripeAccount, locale } = options;
    let stripeInstance = null;
    let elementsInstance = null;
    async function getStripeInstance() {
        if (!stripeInstance) {
            const { loadStripe } = await __turbopack_context__.A("[project]/node_modules/.pnpm/@stripe+stripe-js@4.10.0/node_modules/@stripe/stripe-js/lib/index.mjs [app-ssr] (ecmascript, async loader)");
            const instance = await loadStripe(publishableKey, {
                stripeAccount,
                locale
            });
            if (!instance) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProviderError"]("Failed to load Stripe.js", "stripe");
            }
            stripeInstance = instance;
        }
        return stripeInstance;
    }
    function setElements(elements) {
        elementsInstance = elements;
    }
    async function submitCheckoutSession(input, route) {
        const response = await fetch(serverEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                provider: "stripe",
                action: "checkout",
                payload: input,
                paymentMethods: route.paymentMethods
            })
        });
        if (!response.ok) {
            const body = await response.text().catch(()=>"");
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProviderError"](`Stripe checkout failed (${response.status}): ${body}`, "stripe", {
                cause: new Error(body)
            });
        }
        const result = await response.json();
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        return result;
    }
    async function submitPaymentIntent(input) {
        if (!elementsInstance) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProviderError"]("Stripe Elements not mounted. Render the payment element before calling submit().", "stripe");
        }
        const stripe = await getStripeInstance();
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements: elementsInstance,
            confirmParams: {
                return_url: input.successUrl
            },
            redirect: "if_required"
        });
        if (error) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProviderError"](error.message ?? "Payment confirmation failed", "stripe", {
                providerCode: error.code
            });
        }
        return {
            provider: "stripe",
            id: paymentIntent.id,
            status: paymentIntent.status === "succeeded" ? "complete" : "open",
            raw: paymentIntent
        };
    }
    return {
        "~types": {},
        id: "stripe",
        capabilities: STRIPE_CAPABILITIES,
        getStripeInstance,
        setElements,
        getAvailablePaymentMethods (_context) {
            return Object.values(STRIPE_METHOD_DESCRIPTORS);
        },
        async createSession (input, route) {
            const response = await fetch(serverEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    provider: "stripe",
                    action: "create-payment-intent",
                    payload: input,
                    paymentMethods: route.paymentMethods
                })
            });
            if (!response.ok) {
                const body = await response.text().catch(()=>"");
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProviderError"](`Stripe session creation failed (${response.status}): ${body}`, "stripe", {
                    cause: new Error(body)
                });
            }
            const result = await response.json();
            const clientSecret = result.raw?.clientSecret;
            if (!clientSecret) {
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ProviderError"]("Stripe server did not return a clientSecret for the PaymentIntent", "stripe");
            }
            return {
                flow: route.flow,
                clientSecret,
                sessionId: result.id
            };
        },
        async submit (input, route) {
            if (route.flow === "payment-intent") {
                return submitPaymentIntent(input);
            }
            return submitCheckoutSession(input, route);
        }
    };
}
;
 //# sourceMappingURL=index.js.map
 //# sourceMappingURL=index.js.map
}),
"[project]/packages/stripe/dist/react/index.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "StripePaymentElement",
    ()=>StripePaymentElement
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@15.5.18_react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@15.5.18_react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-runtime.js [app-ssr] (ecmascript)");
;
;
// src/react/stripe-payment-element.tsx
var StripeElementsInner = /*#__PURE__*/ __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].lazy(async ()=>{
    const stripeReact = await __turbopack_context__.A("[project]/node_modules/.pnpm/@stripe+react-stripe-js@2.9.0_@stripe+stripe-js@4.10.0_react-dom@19.2.6_react@18.3.1__react@18.3.1/node_modules/@stripe/react-stripe-js/dist/react-stripe.esm.mjs [app-ssr] (ecmascript, async loader)");
    function ElementsBridge({ provider, onReady, onChange }) {
        const elements = stripeReact.useElements();
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
            provider.setElements(elements);
            return ()=>provider.setElements(null);
        }, [
            elements,
            provider
        ]);
        const PaymentElementComponent = stripeReact.PaymentElement;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createElement"])(PaymentElementComponent, {
            onReady,
            onChange
        });
    }
    function StripeElementsWrapper({ stripeInstance, clientSecret, provider, onReady, onChange }) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createElement"])(stripeReact.Elements, {
            stripe: stripeInstance,
            options: {
                clientSecret
            }
        }, /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createElement"])(ElementsBridge, {
            provider,
            onReady,
            onChange
        }));
    }
    return {
        default: StripeElementsWrapper
    };
});
function StripePaymentElement({ provider, clientSecret, onReady, onChange }) {
    const [stripeInstance, setStripeInstance] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let cancelled = false;
        provider.getStripeInstance().then((instance)=>{
            if (!cancelled) setStripeInstance(instance);
        });
        return ()=>{
            cancelled = true;
        };
    }, [
        provider
    ]);
    if (!stripeInstance) return null;
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Suspense"], {
        fallback: null,
        children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsx"])(StripeElementsInner, {
            stripeInstance,
            clientSecret,
            provider,
            onReady,
            onChange
        })
    });
}
;
 //# sourceMappingURL=index.js.map
 //# sourceMappingURL=index.js.map
}),
"[project]/examples/react-stripe-checkout/app/checkout.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CheckoutPage",
    ()=>CheckoutPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@15.5.18_react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@15.5.18_react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$react$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/react/dist/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$stripe$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/stripe/dist/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$stripe$2f$dist$2f$react$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/stripe/dist/react/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/core/dist/index.js [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
const stripe = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$stripe$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["stripeProvider"])({
    publishableKey: ("TURBOPACK compile-time value", "pk_test_51R2fqoGxQziVA7FsaZTTfG2ZK90Iuuk4HxLfBIEIDgbjUpBh0zaCmWJh7TVWpXM5PfhHLFE0TDwSXuUDGsXTbZll00fyLaTTqY") ?? 'pk_test_placeholder',
    serverEndpoint: '/api/payments/stripe'
});
function RouteDebug() {
    const checkout = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$react$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTenderlaneCheckout"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            marginBottom: 24,
            padding: 16,
            background: '#f8f9fa',
            borderRadius: 12,
            border: '1px solid #e9ecef'
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                fontSize: 14
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                            children: "Provider:"
                        }, void 0, false, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 35,
                            columnNumber: 11
                        }, this),
                        " ",
                        checkout.selectedProvider ?? 'Selecting...'
                    ]
                }, void 0, true, {
                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                    lineNumber: 34,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                            children: "Status:"
                        }, void 0, false, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 38,
                            columnNumber: 11
                        }, this),
                        ' ',
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            style: {
                                color: checkout.status === 'ready' || checkout.status === 'prepared' ? '#28a745' : checkout.status === 'error' ? '#dc3545' : '#6c757d'
                            },
                            children: checkout.status
                        }, void 0, false, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 39,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                    lineNumber: 37,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                            children: "Route:"
                        }, void 0, false, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 53,
                            columnNumber: 11
                        }, this),
                        ' ',
                        checkout.selectedRoute?.ruleId ?? checkout.selectedRoute?.source ?? '...'
                    ]
                }, void 0, true, {
                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                    lineNumber: 52,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                            children: "Flow:"
                        }, void 0, false, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 57,
                            columnNumber: 11
                        }, this),
                        " ",
                        checkout.selectedRoute?.flow ?? '...'
                    ]
                }, void 0, true, {
                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                    lineNumber: 56,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
            lineNumber: 33,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
        lineNumber: 24,
        columnNumber: 5
    }, this);
}
function CheckoutPage() {
    const [country, setCountry] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('CH');
    const [currency, setCurrency] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('chf');
    const [variant, setVariant] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('stripe-first');
    const checkoutInput = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            lineItems: [
                {
                    name: 'Premium Plan',
                    description: 'Monthly access to all features',
                    quantity: 1,
                    unitAmount: 2900,
                    currency
                }
            ],
            successUrl: `${("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : ''}/success`,
            cancelUrl: `${("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : ''}/cancel`
        }), [
        currency
    ]);
    const config = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>({
            context: {
                country,
                currency,
                amount: 2900,
                experiment: {
                    checkoutRouting: variant
                }
            },
            providers: [
                stripe
            ],
            routing: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createRulesRouter"])({
                rules: [
                    {
                        id: 'ch-elements',
                        description: 'Swiss inline card payments via Stripe Elements',
                        when: {
                            country: 'CH',
                            currency: 'chf',
                            experiment: {
                                checkoutRouting: 'stripe-first'
                            }
                        },
                        use: {
                            provider: 'stripe',
                            flow: 'payment-intent',
                            paymentMethods: [
                                'card',
                                'twint'
                            ]
                        }
                    },
                    {
                        id: 'dach-redirect',
                        description: 'DACH region redirect via Stripe Checkout',
                        when: {
                            country: {
                                in: [
                                    'CH',
                                    'DE',
                                    'AT'
                                ]
                            }
                        },
                        use: {
                            provider: 'stripe',
                            flow: 'payment-intent',
                            paymentMethods: [
                                'card'
                            ]
                        }
                    },
                    {
                        id: 'high-value',
                        description: 'High-value orders via Stripe with promo codes',
                        when: {
                            amount: {
                                gte: 10000
                            }
                        },
                        use: {
                            provider: 'stripe',
                            flow: 'payment-intent',
                            paymentMethods: [
                                'card'
                            ],
                            providerOptions: {
                                allow_promotion_codes: true
                            }
                        }
                    }
                ],
                fallback: {
                    provider: 'stripe',
                    flow: 'checkout-session',
                    paymentMethods: [
                        'card'
                    ]
                }
            }),
            middleware: [
                {
                    name: 'debug',
                    onRouteEvaluated ({ context, route }) {
                        console.log('[tenderlane] Route evaluated:', {
                            context: {
                                country: context.country,
                                currency: context.currency
                            },
                            provider: route.provider,
                            flow: route.flow,
                            ruleId: route.ruleId,
                            source: route.source
                        });
                    },
                    onSessionCreated ({ session }) {
                        console.log('[tenderlane] Session created:', {
                            flow: session.flow,
                            hasClientSecret: !!session.clientSecret
                        });
                    },
                    onCheckoutStart ({ route }) {
                        console.log('[tenderlane] Checkout starting:', {
                            provider: route.provider,
                            flow: route.flow
                        });
                    },
                    onCheckoutError ({ error }) {
                        console.error('[tenderlane] Checkout error:', error.message);
                    }
                }
            ]
        }), [
        country,
        currency,
        variant
    ]);
    const formattedPrice = (2900 / 100).toLocaleString(undefined, {
        style: 'currency',
        currency: currency.toUpperCase()
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            padding: 24
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            style: {
                maxWidth: 520,
                margin: '0 auto'
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                    style: {
                        fontSize: 28,
                        marginBottom: 8
                    },
                    children: "Tenderlane Checkout"
                }, void 0, false, {
                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                    lineNumber: 184,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    style: {
                        color: '#6c757d',
                        marginBottom: 24,
                        fontSize: 14
                    },
                    children: "Change the controls below to see reactive routing. Switzerland + CHF + Stripe First uses inline Elements. Other combinations use redirect checkout."
                }, void 0, false, {
                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                    lineNumber: 185,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    style: {
                        display: 'flex',
                        gap: 16,
                        marginBottom: 32,
                        padding: 16,
                        background: '#fff3cd',
                        border: '1px solid #ffc107',
                        borderRadius: 10,
                        fontSize: 14
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4
                            },
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    style: {
                                        fontWeight: 600
                                    },
                                    children: "Country"
                                }, void 0, false, {
                                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                    lineNumber: 203,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    value: country,
                                    onChange: (event)=>setCountry(event.target.value),
                                    style: {
                                        padding: '6px 8px',
                                        borderRadius: 6,
                                        border: '1px solid #ced4da'
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "CH",
                                            children: "Switzerland"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 209,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "DE",
                                            children: "Germany"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 210,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "AT",
                                            children: "Austria"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 211,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "US",
                                            children: "United States"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 212,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "GB",
                                            children: "United Kingdom"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 213,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "JP",
                                            children: "Japan"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 214,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                    lineNumber: 204,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 202,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4
                            },
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    style: {
                                        fontWeight: 600
                                    },
                                    children: "Currency"
                                }, void 0, false, {
                                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                    lineNumber: 219,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    value: currency,
                                    onChange: (event)=>setCurrency(event.target.value),
                                    style: {
                                        padding: '6px 8px',
                                        borderRadius: 6,
                                        border: '1px solid #ced4da'
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "chf",
                                            children: "CHF"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 225,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "eur",
                                            children: "EUR"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 226,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "usd",
                                            children: "USD"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 227,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "gbp",
                                            children: "GBP"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 228,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "jpy",
                                            children: "JPY"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 229,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                    lineNumber: 220,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 218,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4
                            },
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    style: {
                                        fontWeight: 600
                                    },
                                    children: "Experiment"
                                }, void 0, false, {
                                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                    lineNumber: 234,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    value: variant,
                                    onChange: (event)=>setVariant(event.target.value),
                                    style: {
                                        padding: '6px 8px',
                                        borderRadius: 6,
                                        border: '1px solid #ced4da'
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "stripe-first",
                                            children: "Stripe First"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 240,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: "control",
                                            children: "Control"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 241,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                    lineNumber: 235,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 233,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                    lineNumber: 190,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$react$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TenderlaneProvider"], {
                    config: config,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(RouteDebug, {}, void 0, false, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 247,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            style: {
                                padding: 16,
                                background: '#f8f9fa',
                                borderRadius: 12,
                                border: '1px solid #e9ecef',
                                marginBottom: 24
                            },
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    style: {
                                        fontSize: 14,
                                        color: '#495057',
                                        marginBottom: 8
                                    },
                                    children: "Order summary"
                                }, void 0, false, {
                                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                    lineNumber: 258,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    style: {
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            children: "Premium Plan (monthly)"
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 262,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            style: {
                                                fontWeight: 700,
                                                fontSize: 18
                                            },
                                            children: formattedPrice
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 263,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                    lineNumber: 259,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 249,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$react$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TenderlaneCheckoutForm"], {
                            input: checkoutInput,
                            elements: {
                                stripe: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$stripe$2f$dist$2f$react$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["StripePaymentElement"]
                            },
                            children: ({ status, canSubmit, submit, error })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                    children: [
                                        error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            style: {
                                                padding: 12,
                                                background: '#f8d7da',
                                                border: '1px solid #f5c6cb',
                                                borderRadius: 8,
                                                color: '#721c24',
                                                marginBottom: 16,
                                                marginTop: 16,
                                                fontSize: 14
                                            },
                                            children: error.message
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 274,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$15$2e$5$2e$18_react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            disabled: !canSubmit || status === 'submitting',
                                            onClick: submit,
                                            style: {
                                                width: '100%',
                                                marginTop: 16,
                                                padding: '14px 24px',
                                                background: canSubmit && status !== 'submitting' ? '#0070f3' : '#adb5bd',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: 10,
                                                fontSize: 16,
                                                fontWeight: 600,
                                                cursor: canSubmit && status !== 'submitting' ? 'pointer' : 'not-allowed',
                                                transition: 'background 0.2s'
                                            },
                                            children: status === 'submitting' ? 'Processing...' : status === 'preparing' ? 'Loading payment form...' : `Pay ${formattedPrice}`
                                        }, void 0, false, {
                                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                                            lineNumber: 289,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true)
                        }, void 0, false, {
                            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                            lineNumber: 267,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
                    lineNumber: 246,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
            lineNumber: 183,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/examples/react-stripe-checkout/app/checkout.tsx",
        lineNumber: 182,
        columnNumber: 5
    }, this);
}
}),
"[project]/node_modules/.pnpm/next@15.5.18_react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

module.exports = __turbopack_context__.r("[project]/node_modules/.pnpm/next@15.5.18_react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/server/route-modules/app-page/module.compiled.js [app-ssr] (ecmascript)").vendored['react-ssr'].ReactJsxDevRuntime; //# sourceMappingURL=react-jsx-dev-runtime.js.map
}),
];

//# sourceMappingURL=_04dc4c9c._.js.map