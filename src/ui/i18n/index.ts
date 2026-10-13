import { en, type MessageKey } from './en';
import { ru } from './ru';

type Params = Record<string, string | number>;

export type Language = 'en' | 'ru';

const DICTIONARIES: Record<Language, Record<string, string>> = { en, ru };

// The interface language of this viewer (see ui/language.ts). t() reads it on every call;
// App re-renders on a change (subscribeLanguage).
let current: Language = 'en';
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  listeners.forEach((l) => l());
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Translate a key; unknown keys (e.g. from stored events) fall back to the key itself. */
export function t(key: MessageKey | string, params: Params = {}): string {
  const template: string = DICTIONARIES[current][key] ?? (en as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export type { MessageKey };
