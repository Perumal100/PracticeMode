import '@testing-library/jest-dom/vitest';

// Node 25+ defines its own localStorage global (unusable without a file),
// which hides jsdom's. Give tests a working in-memory one when that happens.
if (typeof window.localStorage?.getItem !== 'function') {
  const data = new Map();
  const storage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}
