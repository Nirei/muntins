// Generic object utilities
/**
 * Return a shallow copy of obj with all undefined-valued keys removed.
 */
export function compact(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined)
            out[k] = v;
    }
    return out;
}
//# sourceMappingURL=objects.js.map