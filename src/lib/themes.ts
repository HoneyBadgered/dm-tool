/** Theme ids must match the [data-theme] blocks in src/styles/themes.css. */
export const THEMES = [
  { id: "midnight", label: "Midnight" },
  { id: "forest", label: "Forest (light)" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "midnight";
export const THEME_STORAGE_KEY = "dmtool-theme";

export const isThemeId = (v: unknown): v is ThemeId =>
  THEMES.some((t) => t.id === v);

/** Runs before first paint so a saved theme never flashes the default. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t&&${JSON.stringify(THEMES.map((x) => x.id))}.indexOf(t)>-1)document.documentElement.dataset.theme=t}catch(e){}`;
