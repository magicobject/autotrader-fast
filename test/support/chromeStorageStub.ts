// An in-memory stand-in for chrome.storage.local (with change events), for tests that run
// interface code in jsdom.
import { vi } from 'vitest';

type ChangeListener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void;

export function installChromeStorageStub(): Map<string, unknown> {
  const stored = new Map<string, unknown>();
  const listeners = new Set<ChangeListener>();
  const announce = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>): void => {
    for (const listener of listeners) listener(changes, 'local');
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string | null) => (key === null ? Object.fromEntries(stored) : stored.has(key) ? { [key]: stored.get(key) } : {}),
        set: async (items: Record<string, unknown>) => {
          const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: stored.get(key), newValue: structuredClone(value) };
            stored.set(key, structuredClone(value));
          }
          announce(changes);
        },
        remove: async (keys: string | readonly string[]) => {
          const changes: Record<string, { oldValue?: unknown }> = {};
          for (const key of typeof keys === 'string' ? [keys] : keys) {
            changes[key] = { oldValue: stored.get(key) };
            stored.delete(key);
          }
          announce(changes);
        },
      },
      onChanged: {
        addListener: (listener: ChangeListener) => listeners.add(listener),
        removeListener: (listener: ChangeListener) => listeners.delete(listener),
      },
    },
  });
  return stored;
}
