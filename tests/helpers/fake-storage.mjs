// tests/helpers/fake-storage.mjs
export function installFakeLocalStorage() {
    const map = new Map();
    globalThis.localStorage = {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        clear: () => map.clear(),
        key: (i) => [...map.keys()][i] ?? null,
        get length() { return map.size; },
    };
    return globalThis.localStorage;
}
