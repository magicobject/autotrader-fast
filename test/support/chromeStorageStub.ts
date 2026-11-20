// An in-memory stand-in for chrome.storage.local, for tests that run interface code in jsdom.
import { vi } from 'vitest';

export function installChromeStorageStub(): Map<string, unknown> {
  const stored = new Map<string, unknown>();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string | null) => (key === null ? Object.fromEntries(stored) : stored.has(key) ? { [key]: stored.get(key) } : {}),
        remove: async (keys: string | readonly string[]) => {
          for (const key of typeof keys === 'string' ? [keys] : keys) stored.delete(key);
        },
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) stored.set(key, structuredClone(value));
        },
      },
    },
    runtime: { sendMessage: async () => ({ kind: 'failed', reason: 'Not available in tests.' }) },
  });
  return stored;
}
