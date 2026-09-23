// jest.setup.js
// Mock expo-secure-store with an in-memory Map so tests don't need native modules.

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: (k) => Promise.resolve(store.has(k) ? store.get(k) : null),
    setItemAsync: (k, v) => { store.set(k, String(v)); return Promise.resolve(); },
    deleteItemAsync: (k) => { store.delete(k); return Promise.resolve(); },
    __store: store,
  };
});
