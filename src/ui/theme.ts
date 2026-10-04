// Colour theme of the viewer: light or dark. A per-browser convenience, not app data:
// kept apart from the state and not reset with it.
export type Theme = 'light' | 'dark';

const KEY = 'freight-board-prototype/theme';

/** The stored choice; before the first choice — the system setting. */
export function initialTheme(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // storage blocked (e.g. some embedded previews)
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Sets data-theme on <html>; tokens.css switches the colour tokens on it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function chooseTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // the choice still applies until the page is reloaded
  }
}
