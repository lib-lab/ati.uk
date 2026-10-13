import { useState } from 'react';
import { t } from '../i18n';
import { chooseTheme, initialTheme, type Theme } from '../theme';

/** Light / dark toggle: sun — track with a knob — moon. The whole control is one switch button. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      id="theme"
      className="toggle theme-switch"
      role="switch"
      aria-checked={dark}
      aria-label={t('theme.dark')}
      title={dark ? t('theme.toLight') : t('theme.toDark')}
      onClick={() => {
        const next: Theme = dark ? 'light' : 'dark';
        setTheme(next);
        chooseTheme(next);
      }}
    >
      <SunIcon />
      <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
      <MoonIcon />
    </button>
  );
}

// Icon geometry is in the 24-unit viewBox; the size comes from styles (--icon-size).
function SunIcon() {
  return (
    <svg className="theme-switch-icon theme-switch-sun" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="theme-switch-icon theme-switch-moon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  );
}
