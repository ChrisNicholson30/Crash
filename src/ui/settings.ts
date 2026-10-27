import { useSyncExternalStore } from 'react';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** Win chances on hands while building, betting and playing. */
  odds: boolean;
  /** Card pool sorted by suit (else by rank). */
  bySuit: boolean;
}

const KEY = 'crash:settings';
const DEFAULTS: Settings = { sound: true, haptics: true, odds: true, bySuit: true };

function read(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: settings last for this visit */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Vibrates if the device can and the player hasn't turned it off. */
export function buzz(pattern: number | number[]) {
  if (current.haptics) navigator.vibrate?.(pattern);
}
