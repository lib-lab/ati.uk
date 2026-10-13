import { useSyncExternalStore } from 'react';
import { getLanguage, subscribeLanguage, t, type Language } from '../i18n';
import { chooseLanguage } from '../language';

/** English / Russian toggle, built like the theme switch: EN — track with a knob — RU. */
export function LanguageSwitch() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const russian = language === 'ru';
  return (
    <button
      type="button"
      id="language"
      className="toggle lang-switch"
      role="switch"
      aria-checked={russian}
      aria-label={t('lang.russian')}
      title={russian ? t('lang.toEn') : t('lang.toRu')}
      onClick={() => chooseLanguage((russian ? 'en' : 'ru') satisfies Language)}
    >
      <span className="lang-switch-label lang-switch-en" aria-hidden="true">EN</span>
      <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
      <span className="lang-switch-label lang-switch-ru" aria-hidden="true">RU</span>
    </button>
  );
}
