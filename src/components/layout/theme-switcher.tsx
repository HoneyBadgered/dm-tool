"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from "@/lib/themes";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const current = (): ThemeId => {
  const t = document.documentElement.dataset.theme;
  return isThemeId(t) ? t : DEFAULT_THEME;
};

export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, current, () => DEFAULT_THEME);
  return (
    <label className="block px-4 pb-3 pt-2 text-xs text-muted">
      Theme
      <select
        value={theme}
        onChange={(e) => {
          const next = e.target.value;
          if (!isThemeId(next)) return;
          document.documentElement.dataset.theme = next;
          try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
          } catch {}
          listeners.forEach((cb) => cb());
        }}
        className="mt-1 block w-full rounded border border-border bg-input px-2 py-1 text-sm text-foreground"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
