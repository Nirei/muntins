import type { FocusScope } from "./FocusManager.ts";
export interface RuntimeContext {
    app: import("./App.ts").App;
    currentScope: FocusScope;
}
export declare function getActiveContext(): RuntimeContext | null;
export declare function getContext(): RuntimeContext;
export declare function withContext<T>(ctx: RuntimeContext, fn: () => T): T;
export declare function _setActiveContext(ctx: RuntimeContext | null): void;
//# sourceMappingURL=context.d.ts.map