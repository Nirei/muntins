let activeContext = null;
export function getActiveContext() {
    return activeContext;
}
export function getContext() {
    if (!activeContext) {
        throw new Error("must be called within a mounted component");
    }
    return activeContext;
}
export function withContext(ctx, fn) {
    const prev = activeContext;
    activeContext = ctx;
    try {
        return fn();
    }
    finally {
        activeContext = prev;
    }
}
export function _setActiveContext(ctx) {
    activeContext = ctx;
}
//# sourceMappingURL=context.js.map