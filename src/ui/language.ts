// Interface language of the viewer: English or Russian. A per-browser convenience, not app data:
// kept apart from the state and not reset with it (like the theme, see ui/theme.ts).
import { setLanguage, t, type Language } from './i18n';

const KEY = 'freight-board-prototype/language';

/** The stored choice; before the first choice — Russian for a Russian browser, otherwise English. */
export function initialLanguage(): Language {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'en' || v === 'ru') return v;
  } catch {
    // storage blocked (e.g. some embedded previews)
  }
  return (window.navigator?.language ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

/** Switches t() and the document language and title. */
export function applyLanguage(language: Language): void {
  setLanguage(language);
  document.documentElement.lang = language;
  document.title = t('app.documentTitle');
}

export function chooseLanguage(language: Language): void {
  applyLanguage(language);
  try {
    window.localStorage.setItem(KEY, language);
  } catch {
    // the choice still applies until the page is reloaded
  }
}
