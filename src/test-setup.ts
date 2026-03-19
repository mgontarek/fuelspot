// Node 25+ ships a built-in localStorage as a Proxy without standard
// Storage methods like .clear(), .getItem(), etc.
// Replace it with a proper in-memory Storage implementation for tests.
(function patchLocalStorage() {
  const orig = globalThis.localStorage;
  if (orig && typeof orig.clear === 'function' && typeof orig.getItem === 'function') return;

  const store = new Map<string, string>();

  const storage = {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      const keys = [...store.keys()];
      return keys[index] ?? null;
    },
    get length(): number {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
})();
